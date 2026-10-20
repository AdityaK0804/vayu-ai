"""Persistent SQLite store for observations, weather, forecasts and models.

Why SQLite
----------
The project previously recomputed everything into JSON bake files, which meant
every deploy shipped stale numbers. A single SQLite file with WAL enabled gives
us a real, durable time-series store that survives restarts, needs no extra
service, and is fast enough for the API hot path (indexed point lookups).

Conventions
-----------
* All timestamps are stored as UTC ISO-8601 strings sorted lexicographically
  (``YYYY-MM-DDTHH:MM:SSZ``), so ``BETWEEN`` and ``ORDER BY`` both work.
* Every write is an idempotent ``INSERT ... ON CONFLICT DO UPDATE`` keyed on the
  natural key of the fact, so re-running an ingest never duplicates rows.
* Connections are opened per call and closed immediately; WAL lets readers and
  the ingester run concurrently.

Usage::

    from airsight.store import Store

    with Store.open() as s:
        s.upsert_observations(rows)
        df = s.observations(city_id="korba", hours=72)
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from airsight.config import DATA

# ---------------------------------------------------------------------------
# Location and schema
# ---------------------------------------------------------------------------

DB_PATH: Path = Path(os.environ.get("VAYU_DB_PATH", DATA / "vayu.db"))


def database_url() -> str | None:
    """Postgres DSN from ``DATABASE_URL`` (read at call time so tests can override)."""
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url.startswith(("postgres://", "postgresql://")):
        return url
    return None


def _redact(url: str) -> str:
    """postgresql://user:secret@host/db -> postgresql://host/db (never leak creds)."""
    try:
        from urllib.parse import urlsplit

        parts = urlsplit(url)
        host = parts.hostname or "?"
        return f"postgresql://{host}{parts.path}"
    except Exception:  # noqa: BLE001
        return "postgresql://<redacted>"


class _PgRow(dict):
    """dict row that also supports positional access like ``sqlite3.Row``."""

    def __init__(self, keys: Sequence[str], values: Sequence[Any]) -> None:
        super().__init__(zip(keys, values))
        self._values = tuple(values)

    def __getitem__(self, key: Any) -> Any:  # type: ignore[override]
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)

    def keys(self):  # type: ignore[override]
        return super().keys()


class _PgCursor:
    def __init__(self, cur: Any, lastrowid: int | None = None) -> None:
        self._cur = cur
        self.lastrowid = lastrowid
        self.rowcount = cur.rowcount

    def _wrap(self, row: Any) -> Any:
        if row is None:
            return None
        names = [d.name for d in (self._cur.description or [])]
        return _PgRow(names, row)

    def fetchone(self) -> Any:
        if self._cur.description is None:
            return None
        return self._wrap(self._cur.fetchone())

    def fetchall(self) -> list[Any]:
        if self._cur.description is None:
            return []
        return [self._wrap(r) for r in self._cur.fetchall()]


class _PgConnection:
    """Adapter giving a psycopg connection the sqlite3 surface the Store uses.

    The Store's SQL is deliberately portable (``ON CONFLICT ... DO UPDATE``,
    ISO text timestamps), so only placeholders and a couple of DDL tokens need
    translating.
    """

    def __init__(self, url: str) -> None:
        import psycopg  # optional dependency; only needed with DATABASE_URL

        self._conn = psycopg.connect(url, autocommit=True, connect_timeout=10)
        self._pipeline: Any = None

    @staticmethod
    def _sql(sql: str) -> str:
        out = sql.replace("%", "%%").replace("?", "%s")
        # SQLite's "x IS ?" (null-safe equality) is spelled differently in Postgres.
        return out.replace(" IS %s", " IS NOT DISTINCT FROM %s")

    def execute(self, sql: str, params: Sequence[Any] = ()) -> _PgCursor:
        stripped = sql.strip().upper()
        if stripped.startswith("PRAGMA"):
            return _PgCursor(self._conn.cursor())
        # Store.tx() brackets bulk writes with BEGIN/COMMIT. Run everything in
        # between in psycopg pipeline mode so thousands of row upserts go out
        # in a few network round trips instead of one each; against a remote
        # database (Render -> Supabase) per-row round trips made one city's
        # surface snapshot take minutes.
        if stripped == "BEGIN":
            self._conn.execute("BEGIN")
            self._pipeline = self._conn.pipeline()
            self._pipeline.__enter__()
            return _PgCursor(self._conn.cursor())
        if stripped in ("COMMIT", "ROLLBACK"):
            pipe, self._pipeline = self._pipeline, None
            if pipe is not None:
                try:
                    pipe.__exit__(None, None, None)  # flush + sync queued statements
                except Exception:
                    self._conn.execute("ROLLBACK")
                    if stripped == "COMMIT":
                        raise
                    return _PgCursor(self._conn.cursor())  # already rolling back
            self._conn.execute(stripped)
            return _PgCursor(self._conn.cursor())
        cur = self._conn.cursor()
        if stripped.startswith(("INSERT INTO INGEST_LOG", "INSERT INTO ALERTS")):
            cur.execute(self._sql(sql.rstrip().rstrip(";")) + " RETURNING id", tuple(params))
            if self._pipeline is not None:
                self._pipeline.sync()
            row = cur.fetchone()
            return _PgCursor(cur, lastrowid=int(row[0]) if row else None)
        cur.execute(self._sql(sql), tuple(params))
        if self._pipeline is not None and not stripped.startswith(
            ("INSERT", "UPDATE", "DELETE")
        ):
            self._pipeline.sync()  # reads inside a transaction need their result now
        return _PgCursor(cur)

    def executescript(self, script: str) -> None:
        script = script.replace(
            "INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY"
        ).replace(" REAL", " DOUBLE PRECISION")
        for stmt in script.split(";"):
            if stmt.strip():
                self._conn.execute(stmt)

    def close(self) -> None:
        self._conn.close()

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    state       TEXT,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    bbox_w      REAL, bbox_s REAL, bbox_e REAL, bbox_n REAL,
    role        TEXT,
    calibrated  INTEGER NOT NULL DEFAULT 0,
    source      TEXT,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
    station_id  TEXT PRIMARY KEY,
    city_id     TEXT,
    name        TEXT,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    source      TEXT NOT NULL,
    h3_r7       TEXT,
    h3_r8       TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stations_city ON stations(city_id);

CREATE TABLE IF NOT EXISTS observations (
    station_id  TEXT NOT NULL,
    city_id     TEXT,
    ts          TEXT NOT NULL,
    source      TEXT NOT NULL,
    pm25        REAL,
    pm10        REAL,
    no2         REAL,
    so2         REAL,
    o3          REAL,
    co          REAL,
    nh3         REAL,
    aqi         REAL,
    dominant    TEXT,
    h3_r7       TEXT,
    h3_r8       TEXT,
    ingested_at TEXT NOT NULL,
    PRIMARY KEY (station_id, ts, source)
);
CREATE INDEX IF NOT EXISTS idx_obs_city_ts ON observations(city_id, ts);
CREATE INDEX IF NOT EXISTS idx_obs_h3 ON observations(h3_r8, ts);

CREATE TABLE IF NOT EXISTS met (
    city_id             TEXT NOT NULL,
    ts                  TEXT NOT NULL,
    temperature_2m      REAL,
    relative_humidity_2m REAL,
    dew_point_2m        REAL,
    surface_pressure    REAL,
    precipitation       REAL,
    wind_speed_10m      REAL,
    wind_direction_10m  REAL,
    cloud_cover         REAL,
    shortwave_radiation REAL,
    boundary_layer_height REAL,
    source              TEXT NOT NULL,
    ingested_at         TEXT NOT NULL,
    PRIMARY KEY (city_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_met_ts ON met(ts);

CREATE TABLE IF NOT EXISTS air_forecast (
    city_id     TEXT NOT NULL,
    run_ts      TEXT NOT NULL,
    ts          TEXT NOT NULL,
    pm25        REAL,
    pm10        REAL,
    no2         REAL,
    so2         REAL,
    o3          REAL,
    co          REAL,
    aqi         REAL,
    p10         REAL,
    p90         REAL,
    model_version TEXT NOT NULL,
    source      TEXT NOT NULL,
    PRIMARY KEY (city_id, run_ts, ts, source)
);
CREATE INDEX IF NOT EXISTS idx_airfc_city_ts ON air_forecast(city_id, ts);

CREATE TABLE IF NOT EXISTS fires (
    fire_key    TEXT PRIMARY KEY,
    ts          TEXT NOT NULL,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    frp         REAL,
    confidence  REAL,
    satellite   TEXT,
    city_id     TEXT,
    h3_r7       TEXT,
    h3_r8       TEXT,
    source      TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fires_ts ON fires(ts);
CREATE INDEX IF NOT EXISTS idx_fires_city ON fires(city_id, ts);

CREATE TABLE IF NOT EXISTS hex_snapshot (
    city_id    TEXT NOT NULL,
    ts         TEXT NOT NULL,
    h3         TEXT NOT NULL,
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    pm25       REAL,
    aqi        REAL,
    population REAL,
    emission_index REAL,
    detail     TEXT,
    model_version TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (city_id, ts, h3)
);
CREATE INDEX IF NOT EXISTS idx_hex_city_ts ON hex_snapshot(city_id, ts);

CREATE TABLE IF NOT EXISTS model_registry (
    version      TEXT NOT NULL,
    kind         TEXT NOT NULL,
    target       TEXT NOT NULL,
    horizon_h    INTEGER,
    path         TEXT NOT NULL,
    features     TEXT NOT NULL,
    metrics      TEXT NOT NULL,
    data_window  TEXT,
    n_train      INTEGER,
    scope        TEXT,
    trained_at   TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (version, kind, target, horizon_h)
);

CREATE TABLE IF NOT EXISTS ingest_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    status      TEXT NOT NULL,
    rows        INTEGER DEFAULT 0,
    detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingest_started ON ingest_log(started_at);
CREATE INDEX IF NOT EXISTS idx_ingest_source ON ingest_log(source, status, finished_at);

CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    city_id     TEXT,
    station_id  TEXT,
    aqi         REAL,
    pm25        REAL,
    severity    TEXT NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    source      TEXT NOT NULL,
    created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(ts);
"""

# Freshness thresholds per source (hours). The hourly job keeps each source
# well inside its limit; anything older is reported as stale.
SOURCE_STALE_HOURS: dict[str, float] = {
    "cams": 3.0,
    "openaq": 3.0,
    "met": 3.0,
    "forecast": 3.0,
    "fires": 6.0,
}


def utcnow() -> str:
    """Current UTC time as a lexicographically sortable ISO-8601 string."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_iso(value: Any) -> str | None:
    """Normalise assorted timestamp-ish values to the store's ISO format."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace(" ", "T")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


class Store:
    """Thin wrapper around the operational database.

    * ``DATABASE_URL=postgresql://...`` -> Postgres (production; needs ``psycopg``).
    * otherwise -> one SQLite file at ``VAYU_DB_PATH`` (local development).
    """

    _lock = threading.Lock()
    _initialised_paths: set[str] = set()

    def __init__(self, path: Path | str | None = None) -> None:
        url = None if path is not None else database_url()
        self.backend = "postgres" if url else "sqlite"
        self._url = url
        if url:
            self.path = Path("postgres")
            self.location = _redact(url)
        else:
            self.path = Path(path or DB_PATH)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.location = str(self.path)
        self._conn = self._connect()
        self._ensure_schema()

    # -- lifecycle ---------------------------------------------------------

    @classmethod
    def open(cls, path: Path | str | None = None) -> "Store":
        return cls(path)

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._conn.close()
        except Exception:  # noqa: BLE001
            pass

    def _connect(self) -> Any:
        if self._url:
            return _PgConnection(self._url)
        conn = sqlite3.connect(str(self.path), timeout=30.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        return conn

    def _ensure_schema(self) -> None:
        key = self.location if self._url else str(self.path.resolve())
        with self._lock:
            if key in self._initialised_paths:
                return
            conn = self._conn
            conn.executescript(_SCHEMA)
            conn.execute(
                "INSERT INTO meta(key, value) VALUES('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            self._initialised_paths.add(key)

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        """Explicit transaction; rolls back on any exception."""
        conn = self._conn
        conn.execute("BEGIN")
        try:
            yield conn
        except Exception:
            conn.execute("ROLLBACK")
            raise
        else:
            conn.execute("COMMIT")

    # -- generic helpers ---------------------------------------------------

    def execute(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Cursor:
        return self._conn.execute(sql, params)

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[sqlite3.Row]:
        return list(self._conn.execute(sql, params).fetchall())

    def scalar(self, sql: str, params: Sequence[Any] = ()) -> Any:
        row = self._conn.execute(sql, params).fetchone()
        return None if row is None else row[0]

    # -- cities / stations -------------------------------------------------

    def upsert_cities(self, rows: Iterable[dict[str, Any]]) -> int:
        n = 0
        now = utcnow()
        with self.tx() as conn:
            for r in rows:
                bbox = r.get("bbox") or [None, None, None, None]
                conn.execute(
                    """
                    INSERT INTO cities (id, name, state, lat, lon, bbox_w, bbox_s,
                                        bbox_e, bbox_n, role, calibrated, source, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name, state=excluded.state,
                        lat=excluded.lat, lon=excluded.lon,
                        bbox_w=excluded.bbox_w, bbox_s=excluded.bbox_s,
                        bbox_e=excluded.bbox_e, bbox_n=excluded.bbox_n,
                        role=excluded.role, calibrated=excluded.calibrated,
                        source=excluded.source, updated_at=excluded.updated_at
                    """,
                    (
                        str(r["id"]).lower(),
                        r.get("name") or str(r["id"]),
                        r.get("state"),
                        float(r["lat"]),
                        float(r["lon"]),
                        *(float(v) if v is not None else None for v in bbox),
                        r.get("role"),
                        1 if r.get("calibrated") else 0,
                        r.get("source") or "config",
                        now,
                    ),
                )
                n += 1
        return n

    def cities(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self.query("SELECT * FROM cities ORDER BY name")]

    def city(self, city_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM cities WHERE id = ?", (city_id.lower(),)
        ).fetchone()
        return dict(row) if row else None

    def upsert_stations(self, rows: Iterable[dict[str, Any]]) -> int:
        now = utcnow()
        n = 0
        with self.tx() as conn:
            for r in rows:
                conn.execute(
                    """
                    INSERT INTO stations (station_id, city_id, name, lat, lon, source,
                                          h3_r7, h3_r8, active, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(station_id) DO UPDATE SET
                        city_id=excluded.city_id, name=excluded.name,
                        lat=excluded.lat, lon=excluded.lon, source=excluded.source,
                        h3_r7=excluded.h3_r7, h3_r8=excluded.h3_r8,
                        active=excluded.active, updated_at=excluded.updated_at
                    """,
                    (
                        r["station_id"],
                        r.get("city_id"),
                        r.get("name") or r["station_id"],
                        float(r["lat"]),
                        float(r["lon"]),
                        r.get("source") or "unknown",
                        r.get("h3_r7"),
                        r.get("h3_r8"),
                        1 if r.get("active", True) else 0,
                        now,
                    ),
                )
                n += 1
        return n

    def stations(self, city_id: str | None = None) -> list[dict[str, Any]]:
        if city_id:
            rows = self.query(
                "SELECT * FROM stations WHERE city_id = ? AND active = 1 ORDER BY station_id",
                (city_id.lower(),),
            )
        else:
            rows = self.query("SELECT * FROM stations WHERE active = 1 ORDER BY city_id, station_id")
        return [dict(r) for r in rows]

    # -- facts -------------------------------------------------------------

    def upsert_observations(self, rows: Iterable[dict[str, Any]]) -> int:
        now = utcnow()
        n = 0
        with self.tx() as conn:
            for r in rows:
                ts = to_iso(r.get("ts"))
                if not ts or not r.get("station_id"):
                    continue
                conn.execute(
                    """
                    INSERT INTO observations (station_id, city_id, ts, source, pm25,
                        pm10, no2, so2, o3, co, nh3, aqi, dominant, h3_r7, h3_r8, ingested_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(station_id, ts, source) DO UPDATE SET
                        pm25=excluded.pm25, pm10=excluded.pm10, no2=excluded.no2,
                        so2=excluded.so2, o3=excluded.o3, co=excluded.co,
                        nh3=excluded.nh3, aqi=excluded.aqi, dominant=excluded.dominant,
                        h3_r7=excluded.h3_r7, h3_r8=excluded.h3_r8,
                        ingested_at=excluded.ingested_at
                    """,
                    (
                        r["station_id"],
                        r.get("city_id"),
                        ts,
                        r.get("source") or "unknown",
                        r.get("pm25"),
                        r.get("pm10"),
                        r.get("no2"),
                        r.get("so2"),
                        r.get("o3"),
                        r.get("co"),
                        r.get("nh3"),
                        r.get("aqi"),
                        r.get("dominant"),
                        r.get("h3_r7"),
                        r.get("h3_r8"),
                        now,
                    ),
                )
                n += 1
        return n

    def observations(
        self,
        city_id: str | None = None,
        station_id: str | None = None,
        *,
        since: str | None = None,
        until: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM observations WHERE 1=1"
        params: list[Any] = []
        if city_id:
            sql += " AND city_id = ?"
            params.append(city_id.lower())
        if station_id:
            sql += " AND station_id = ?"
            params.append(station_id)
        if since:
            sql += " AND ts >= ?"
            params.append(to_iso(since))
        if until:
            sql += " AND ts <= ?"
            params.append(to_iso(until))
        sql += " ORDER BY ts DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(int(limit))
        return [dict(r) for r in self.query(sql, params)]

    def latest_observations(self, city_id: str | None = None) -> list[dict[str, Any]]:
        """Most recent observation per (station, source)."""
        sql = """
            SELECT o.* FROM observations o
            JOIN (
                SELECT station_id, source, MAX(ts) AS ts
                FROM observations
                {where}
                GROUP BY station_id, source
            ) m ON o.station_id = m.station_id AND o.source = m.source AND o.ts = m.ts
            ORDER BY o.station_id
        """
        if city_id:
            return [
                dict(r)
                for r in self.query(
                    sql.format(where="WHERE city_id = ?"), (city_id.lower(),)
                )
            ]
        return [dict(r) for r in self.query(sql.format(where=""))]

    def delete_observations_before(self, ts: str) -> int:
        cur = self._conn.execute(
            "DELETE FROM observations WHERE ts < ?", (to_iso(ts),)
        )
        return cur.rowcount or 0

    def upsert_met(self, rows: Iterable[dict[str, Any]]) -> int:
        now = utcnow()
        n = 0
        with self.tx() as conn:
            for r in rows:
                ts = to_iso(r.get("ts"))
                if not ts or not r.get("city_id"):
                    continue
                conn.execute(
                    """
                    INSERT INTO met (city_id, ts, temperature_2m, relative_humidity_2m,
                        dew_point_2m, surface_pressure, precipitation, wind_speed_10m,
                        wind_direction_10m, cloud_cover, shortwave_radiation,
                        boundary_layer_height, source, ingested_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(city_id, ts) DO UPDATE SET
                        temperature_2m=excluded.temperature_2m,
                        relative_humidity_2m=excluded.relative_humidity_2m,
                        dew_point_2m=excluded.dew_point_2m,
                        surface_pressure=excluded.surface_pressure,
                        precipitation=excluded.precipitation,
                        wind_speed_10m=excluded.wind_speed_10m,
                        wind_direction_10m=excluded.wind_direction_10m,
                        cloud_cover=excluded.cloud_cover,
                        shortwave_radiation=excluded.shortwave_radiation,
                        boundary_layer_height=excluded.boundary_layer_height,
                        ingested_at=excluded.ingested_at
                    """,
                    (
                        r["city_id"].lower(),
                        ts,
                        r.get("temperature_2m"),
                        r.get("relative_humidity_2m"),
                        r.get("dew_point_2m"),
                        r.get("surface_pressure"),
                        r.get("precipitation"),
                        r.get("wind_speed_10m"),
                        r.get("wind_direction_10m"),
                        r.get("cloud_cover"),
                        r.get("shortwave_radiation"),
                        r.get("boundary_layer_height"),
                        r.get("source") or "open-meteo",
                        now,
                    ),
                )
                n += 1
        return n

    def met(
        self,
        city_id: str,
        *,
        since: str | None = None,
        until: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM met WHERE city_id = ?"
        params: list[Any] = [city_id.lower()]
        if since:
            sql += " AND ts >= ?"
            params.append(to_iso(since))
        if until:
            sql += " AND ts <= ?"
            params.append(to_iso(until))
        sql += " ORDER BY ts"
        if limit:
            sql += " LIMIT ?"
            params.append(int(limit))
        return [dict(r) for r in self.query(sql, params)]

    def upsert_air_forecast(self, rows: Iterable[dict[str, Any]]) -> int:
        n = 0
        with self.tx() as conn:
            for r in rows:
                ts = to_iso(r.get("ts"))
                run_ts = to_iso(r.get("run_ts")) or ts
                if not ts or not run_ts or not r.get("city_id"):
                    continue
                conn.execute(
                    """
                    INSERT INTO air_forecast (city_id, run_ts, ts, pm25, pm10, no2, so2,
                        o3, co, aqi, p10, p90, model_version, source)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(city_id, run_ts, ts, source) DO UPDATE SET
                        pm25=excluded.pm25, pm10=excluded.pm10, no2=excluded.no2,
                        so2=excluded.so2, o3=excluded.o3, co=excluded.co,
                        aqi=excluded.aqi, p10=excluded.p10, p90=excluded.p90,
                        model_version=excluded.model_version, source=excluded.source
                    """,
                    (
                        r["city_id"].lower(),
                        run_ts,
                        ts,
                        r.get("pm25"),
                        r.get("pm10"),
                        r.get("no2"),
                        r.get("so2"),
                        r.get("o3"),
                        r.get("co"),
                        r.get("aqi"),
                        r.get("p10"),
                        r.get("p90"),
                        r.get("model_version") or "unknown",
                        r.get("source") or "open-meteo",
                    ),
                )
                n += 1
        return n

    def air_forecast(
        self,
        city_id: str,
        *,
        since: str | None = None,
        limit: int | None = None,
        source: str | None = None,
    ) -> list[dict[str, Any]]:
        """Latest run per forecast timestamp for a city.

        ``source`` filters to a specific producer (``model`` or the upstream
        CAMS feed), which keeps model output and its input baseline separable.
        """
        where = "WHERE city_id = ?"
        params: list[Any] = [city_id.lower()]
        if source:
            where += " AND source = ?"
            params.append(source)
        sql = f"""
            SELECT f.* FROM air_forecast f
            JOIN (
                SELECT ts, MAX(run_ts) AS run_ts FROM air_forecast
                {where} GROUP BY ts
            ) m ON f.ts = m.ts AND f.run_ts = m.run_ts
            WHERE f.city_id = ?
        """
        params = [*params, city_id.lower()]
        if source:
            sql += " AND f.source = ?"
            params.append(source)
        if since:
            sql += " AND f.ts >= ?"
            params.append(to_iso(since))
        sql += " ORDER BY f.ts"
        if limit:
            sql += " LIMIT ?"
            params.append(int(limit))
        return [dict(r) for r in self.query(sql, params)]

    def upsert_fires(self, rows: Iterable[dict[str, Any]]) -> int:
        now = utcnow()
        n = 0
        with self.tx() as conn:
            for r in rows:
                ts = to_iso(r.get("ts"))
                if not ts:
                    continue
                key = r.get("fire_key") or (
                    f"{r.get('source', 'firms')}:{round(float(r['lat']), 4)}:"
                    f"{round(float(r['lon']), 4)}:{ts}"
                )
                conn.execute(
                    """
                    INSERT INTO fires (fire_key, ts, lat, lon, frp, confidence, satellite,
                                       city_id, h3_r7, h3_r8, source, ingested_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(fire_key) DO UPDATE SET
                        frp=excluded.frp, confidence=excluded.confidence,
                        h3_r7=excluded.h3_r7, h3_r8=excluded.h3_r8,
                        city_id=excluded.city_id, ingested_at=excluded.ingested_at
                    """,
                    (
                        key,
                        ts,
                        float(r["lat"]),
                        float(r["lon"]),
                        r.get("frp"),
                        r.get("confidence"),
                        r.get("satellite"),
                        r.get("city_id"),
                        r.get("h3_r7"),
                        r.get("h3_r8"),
                        r.get("source") or "firms",
                        now,
                    ),
                )
                n += 1
        return n

    def fires(
        self,
        *,
        hours: int = 48,
        city_id: str | None = None,
        bbox: Sequence[float] | None = None,
    ) -> list[dict[str, Any]]:
        since = datetime.now(timezone.utc).timestamp() - hours * 3600
        since_iso = datetime.fromtimestamp(since, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        sql = "SELECT * FROM fires WHERE ts >= ?"
        params: list[Any] = [since_iso]
        if city_id:
            sql += " AND city_id = ?"
            params.append(city_id.lower())
        if bbox:
            sql += " AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?"
            params.extend([bbox[0], bbox[2], bbox[1], bbox[3]])
        sql += " ORDER BY ts DESC"
        return [dict(r) for r in self.query(sql, params)]

    def upsert_hex_snapshot(self, rows: Iterable[dict[str, Any]]) -> int:
        now = utcnow()
        n = 0
        with self.tx() as conn:
            for r in rows:
                ts = to_iso(r.get("ts"))
                if not ts or not r.get("h3"):
                    continue
                detail = r.get("detail")
                conn.execute(
                    """
                    INSERT INTO hex_snapshot (city_id, ts, h3, lat, lon, pm25, aqi,
                        population, emission_index, detail, model_version, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(city_id, ts, h3) DO UPDATE SET
                        pm25=excluded.pm25, aqi=excluded.aqi,
                        population=excluded.population,
                        emission_index=excluded.emission_index,
                        detail=excluded.detail, model_version=excluded.model_version,
                        created_at=excluded.created_at
                    """,
                    (
                        (r.get("city_id") or "").lower(),
                        ts,
                        r["h3"],
                        float(r["lat"]),
                        float(r["lon"]),
                        r.get("pm25"),
                        r.get("aqi"),
                        r.get("population"),
                        r.get("emission_index"),
                        json.dumps(detail) if detail is not None else None,
                        r.get("model_version"),
                        now,
                    ),
                )
                n += 1
        return n

    def replace_hex_snapshot(
        self, city_id: str, ts: str, rows: Iterable[dict[str, Any]]
    ) -> int:
        """Atomically replace one city snapshot.

        A plain upsert is not enough: rebuilding a surface at a finer H3
        resolution writes new cell ids and leaves the previous resolution's
        rows in place, so the API ends up serving a mix of res 7 and res 8
        hexagons. Delete-then-insert inside one transaction keeps a snapshot
        internally consistent.
        """
        ts_iso = to_iso(ts)
        if not ts_iso:
            raise ValueError("snapshot needs a valid timestamp")
        now = utcnow()
        city = city_id.lower()
        payload = list(rows)
        with self.tx() as conn:
            conn.execute(
                "DELETE FROM hex_snapshot WHERE city_id = ? AND ts = ?", (city, ts_iso)
            )
            for r in payload:
                if not r.get("h3"):
                    continue
                detail = r.get("detail")
                conn.execute(
                    """
                    INSERT INTO hex_snapshot (city_id, ts, h3, lat, lon, pm25, aqi,
                        population, emission_index, detail, model_version, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    (
                        city,
                        ts_iso,
                        r["h3"],
                        float(r["lat"]),
                        float(r["lon"]),
                        r.get("pm25"),
                        r.get("aqi"),
                        r.get("population"),
                        r.get("emission_index"),
                        json.dumps(detail) if detail is not None else None,
                        r.get("model_version"),
                        now,
                    ),
                )
        return len(payload)

    def prune_hex_snapshots(self, city_id: str, keep: int = 48) -> int:
        """Drop all but the newest *keep* snapshots for a city."""
        rows = self.query(
            "SELECT DISTINCT ts FROM hex_snapshot WHERE city_id = ? ORDER BY ts DESC",
            (city_id.lower(),),
        )
        stale = [r["ts"] for r in rows[keep:]]
        if not stale:
            return 0
        placeholders = ",".join("?" for _ in stale)
        cur = self._conn.execute(
            f"DELETE FROM hex_snapshot WHERE city_id = ? AND ts IN ({placeholders})",
            (city_id.lower(), *stale),
        )
        return cur.rowcount or 0

    def hex_snapshot(
        self, city_id: str, ts: str | None = None
    ) -> tuple[str | None, list[dict[str, Any]]]:
        """Return the most recent (or requested) hex snapshot for a city."""
        city = city_id.lower()
        if ts is None:
            ts = self.scalar(
                "SELECT MAX(ts) FROM hex_snapshot WHERE city_id = ?", (city,)
            )
        if not ts:
            return None, []
        rows = self.query(
            "SELECT * FROM hex_snapshot WHERE city_id = ? AND ts = ?", (city, ts)
        )
        out = []
        for r in rows:
            d = dict(r)
            if d.get("detail"):
                try:
                    d["detail"] = json.loads(d["detail"])
                except (TypeError, ValueError):
                    pass
            out.append(d)
        return ts, out

    # -- model registry ----------------------------------------------------

    def register_model(self, record: dict[str, Any], *, make_active: bool = True) -> None:
        now = utcnow()
        with self.tx() as conn:
            if make_active:
                conn.execute(
                    "UPDATE model_registry SET is_active = 0 "
                    "WHERE kind = ? AND target = ? AND horizon_h IS ?",
                    (record["kind"], record["target"], record.get("horizon_h")),
                )
            conn.execute(
                """
                INSERT INTO model_registry (version, kind, target, horizon_h, path,
                    features, metrics, data_window, n_train, scope, trained_at, is_active)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(version, kind, target, horizon_h) DO UPDATE SET
                    path=excluded.path, features=excluded.features,
                    metrics=excluded.metrics, data_window=excluded.data_window,
                    n_train=excluded.n_train, scope=excluded.scope,
                    trained_at=excluded.trained_at, is_active=excluded.is_active
                """,
                (
                    record["version"],
                    record["kind"],
                    record["target"],
                    record.get("horizon_h"),
                    record["path"],
                    json.dumps(record.get("features") or []),
                    json.dumps(record.get("metrics") or {}),
                    record.get("data_window"),
                    record.get("n_train"),
                    record.get("scope"),
                    record.get("trained_at") or now,
                    1 if make_active else 0,
                ),
            )

    def active_model(
        self, kind: str, target: str, horizon_h: int | None
    ) -> dict[str, Any] | None:
        row = self._conn.execute(
            """
            SELECT * FROM model_registry
            WHERE kind = ? AND target = ? AND horizon_h IS ? AND is_active = 1
            ORDER BY trained_at DESC LIMIT 1
            """,
            (kind, target, horizon_h),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["features"] = json.loads(d["features"]) if d.get("features") else []
        d["metrics"] = json.loads(d["metrics"]) if d.get("metrics") else {}
        return d

    def models(self) -> list[dict[str, Any]]:
        rows = [dict(r) for r in self.query("SELECT * FROM model_registry ORDER BY trained_at DESC")]
        for d in rows:
            d["features"] = json.loads(d["features"]) if d.get("features") else []
            d["metrics"] = json.loads(d["metrics"]) if d.get("metrics") else {}
        return rows

    # -- ingest log --------------------------------------------------------

    def log_ingest(
        self,
        source: str,
        status: str,
        *,
        rows: int = 0,
        detail: str | None = None,
        started_at: str | None = None,
    ) -> int:
        cur = self._conn.execute(
            """
            INSERT INTO ingest_log (source, started_at, finished_at, status, rows, detail)
            VALUES (?,?,?,?,?,?)
            """,
            (source, started_at or utcnow(), utcnow(), status, rows, detail),
        )
        return int(cur.lastrowid or 0)

    def recent_ingests(self, limit: int = 20) -> list[dict[str, Any]]:
        return [
            dict(r)
            for r in self.query(
                "SELECT * FROM ingest_log ORDER BY id DESC LIMIT ?", (int(limit),)
            )
        ]

    # -- alerts ------------------------------------------------------------

    def insert_alert(self, row: dict[str, Any]) -> dict[str, Any]:
        rec = {
            "ts": to_iso(row.get("ts")) or utcnow(),
            "city_id": (row.get("city_id") or "").lower() or None,
            "station_id": row.get("station_id"),
            "aqi": row.get("aqi"),
            "pm25": row.get("pm25"),
            "severity": row.get("severity") or "warning",
            "title": row["title"],
            "detail": row.get("detail"),
            "source": row.get("source") or "manual",
            "created_by": row.get("created_by"),
        }
        cur = self._conn.execute(
            """
            INSERT INTO alerts (ts, city_id, station_id, aqi, pm25, severity, title, detail, source, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            tuple(rec.values()),
        )
        return {"id": int(cur.lastrowid or 0), **rec}

    def recent_alerts(self, limit: int = 20, city_id: str | None = None) -> list[dict[str, Any]]:
        sql = "SELECT * FROM alerts"
        params: list[Any] = []
        if city_id:
            sql += " WHERE city_id = ?"
            params.append(city_id.lower())
        sql += " ORDER BY ts DESC, id DESC LIMIT ?"
        params.append(int(limit))
        return [dict(r) for r in self.query(sql, params)]

    # -- freshness ---------------------------------------------------------

    def source_freshness(self, city_id: str | None = None, now: datetime | None = None) -> dict[str, Any]:
        """Per-source freshness: newest data timestamp, last successful sync,
        age in hours and a ``stale`` flag against :data:`SOURCE_STALE_HOURS`."""
        now = now or datetime.now(timezone.utc)
        where_city = " AND city_id = ?" if city_id else ""
        cp: tuple[Any, ...] = (city_id.lower(),) if city_id else ()
        now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        latest = {
            "cams": self.scalar(
                f"SELECT MAX(ts) FROM observations WHERE source = 'open-meteo-cams' AND ts <= ?{where_city}",
                (now_iso, *cp),
            ),
            "openaq": self.scalar(
                f"SELECT MAX(ts) FROM observations WHERE source = 'openaq'{where_city}", cp
            ),
            "met": self.scalar(f"SELECT MAX(ts) FROM met WHERE ts <= ?{where_city}", (now_iso, *cp)),
            "forecast": self.scalar(f"SELECT MAX(run_ts) FROM air_forecast WHERE 1=1{where_city}", cp),
            "fires": self.scalar("SELECT MAX(ts) FROM fires"),
        }
        sync_sources = {"cams": "city_batch", "openaq": "openaq", "met": "city_batch",
                        "forecast": "forecast", "fires": "firms"}
        out: dict[str, Any] = {}
        for name, data_ts in latest.items():
            last_sync = self.scalar(
                "SELECT MAX(finished_at) FROM ingest_log WHERE source = ? AND status IN ('ok', 'empty')",
                (sync_sources[name],),
            )
            # Fires: no detections is a valid state, so judge by the last sync.
            basis = last_sync if name == "fires" else data_ts
            age = _age_h(basis, now)
            limit = SOURCE_STALE_HOURS[name]
            out[name] = {
                "latest_data": data_ts,
                "last_sync": last_sync,
                "age_hours": age,
                "stale_after_hours": limit,
                "stale": age is None or age > limit,
            }
        return out

    @property
    def is_empty(self) -> bool:
        return (self.scalar("SELECT COUNT(*) FROM observations") or 0) == 0


def _age_h(ts: Any, now: datetime) -> float | None:
    iso = to_iso(ts)
    if not iso:
        return None
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return round(max(0.0, (now - dt).total_seconds()) / 3600.0, 2)


def store_stats(store: Store | None = None) -> dict[str, Any]:
    """Row counts and freshness summary for the /health endpoint.

    Never closes a caller-owned store: closing a borrowed connection is how the
    first version of this function broke later calls in the same request.
    """
    s = store or Store.open()
    try:
        counts = {
            table: s.scalar(f"SELECT COUNT(*) FROM {table}")
            for table in (
                "cities",
                "stations",
                "observations",
                "met",
                "air_forecast",
                "fires",
                "model_registry",
            )
        }
        return {
            "backend": s.backend,
            "db_path": s.location,
            "counts": counts,
            "latest_observation": s.scalar("SELECT MAX(ts) FROM observations"),
            "latest_met": s.scalar("SELECT MAX(ts) FROM met"),
            "latest_forecast_run": s.scalar("SELECT MAX(run_ts) FROM air_forecast"),
            "latest_fire": s.scalar("SELECT MAX(ts) FROM fires"),
        }
    finally:
        if store is None:
            s.close()
