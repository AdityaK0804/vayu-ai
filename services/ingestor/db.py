"""TimescaleDB writers (sync psycopg, called via asyncio.to_thread)."""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, Sequence

import psycopg
from psycopg.rows import dict_row

from services.ingestor.config import Settings, get_settings
from services.ingestor.models import FireEventIn, StationReadingIn

log = logging.getLogger(__name__)


@contextmanager
def connect(settings: Settings | None = None) -> Iterator[psycopg.Connection]:
    cfg = settings or get_settings()
    conn = psycopg.connect(cfg.database_url, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ping_db(settings: Settings | None = None) -> bool:
    try:
        with connect(settings) as conn:
            conn.execute("SELECT 1")
        return True
    except Exception as exc:
        log.warning("db ping failed: %s", exc)
        return False


def write_station_readings(
    rows: Sequence[StationReadingIn],
    settings: Settings | None = None,
) -> int:
    if not rows:
        return 0
    sql = """
        INSERT INTO station_readings (
            ts, station_id, city_id, source, pm25, pm10, no2, so2, o3, co,
            aqi, aqi_basis, lat, lon, quality_flag
        ) VALUES (
            %(ts)s, %(station_id)s, %(city_id)s, %(source)s, %(pm25)s, %(pm10)s,
            %(no2)s, %(so2)s, %(o3)s, %(co)s, %(aqi)s, %(aqi_basis)s,
            %(lat)s, %(lon)s, %(quality_flag)s
        )
        ON CONFLICT (ts, station_id, source) DO UPDATE SET
            pm25 = EXCLUDED.pm25,
            pm10 = EXCLUDED.pm10,
            no2 = EXCLUDED.no2,
            so2 = EXCLUDED.so2,
            o3 = EXCLUDED.o3,
            co = EXCLUDED.co,
            aqi = EXCLUDED.aqi,
            aqi_basis = EXCLUDED.aqi_basis,
            quality_flag = EXCLUDED.quality_flag,
            ingested_at = NOW()
    """
    payload = [r.model_dump() for r in rows]
    with connect(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, payload)
            return len(payload)


def write_fire_events(
    rows: Sequence[FireEventIn],
    settings: Settings | None = None,
) -> int:
    if not rows:
        return 0
    sql = """
        INSERT INTO fire_events (
            ts, lat, lon, frp, confidence, bright_ti4, source, h3_cell, city_id, raw
        ) VALUES (
            %(ts)s, %(lat)s, %(lon)s, %(frp)s, %(confidence)s, %(bright_ti4)s,
            %(source)s, %(h3_cell)s, %(city_id)s, %(raw)s::jsonb
        )
        ON CONFLICT (ts, lat, lon, source) DO UPDATE SET
            frp = EXCLUDED.frp,
            confidence = EXCLUDED.confidence,
            h3_cell = EXCLUDED.h3_cell
    """
    payload = []
    for r in rows:
        d = r.model_dump()
        d["raw"] = json.dumps(d["raw"]) if d.get("raw") is not None else None
        payload.append(d)
    with connect(settings) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, payload)
            return len(payload)


def log_ingest_run(
    source: str,
    status: str,
    rows_written: int,
    detail: str = "",
    settings: Settings | None = None,
) -> None:
    sql = """
        INSERT INTO ingest_runs (source, started_at, finished_at, status, rows_written, detail)
        VALUES (%(source)s, NOW(), NOW(), %(status)s, %(rows)s, %(detail)s)
    """
    try:
        with connect(settings) as conn:
            conn.execute(
                sql,
                {"source": source, "status": status, "rows": rows_written, "detail": detail[:2000]},
            )
    except Exception as exc:
        log.warning("ingest_runs write failed: %s", exc)


def fetch_latest_stations(limit: int = 500, settings: Settings | None = None) -> list[dict]:
    sql = """
        SELECT DISTINCT ON (station_id, source)
            ts, station_id, city_id, source,
            pm25, pm10, no2, so2, o3, co,
            aqi, aqi_basis, lat, lon, quality_flag, ingested_at
        FROM station_readings
        WHERE quality_flag = 0
        ORDER BY station_id, source, ts DESC
        LIMIT %(limit)s
    """
    with connect(settings) as conn:
        rows = conn.execute(sql, {"limit": limit}).fetchall()
        return [_serialize_row(r) for r in rows]


def fetch_recent_fires(hours: int = 48, limit: int = 500, settings: Settings | None = None) -> list[dict]:
    sql_window = """
        SELECT ts, lat, lon, frp, confidence, source, h3_cell, city_id
        FROM fire_events
        WHERE ts >= NOW() - make_interval(hours => %(hours)s)
        ORDER BY ts DESC
        LIMIT %(limit)s
    """
    sql_latest = """
        SELECT ts, lat, lon, frp, confidence, source, h3_cell, city_id
        FROM fire_events
        ORDER BY ts DESC
        LIMIT %(limit)s
    """
    with connect(settings) as conn:
        rows = conn.execute(sql_window, {"hours": int(hours), "limit": limit}).fetchall()
        if not rows:
            rows = conn.execute(sql_latest, {"limit": min(limit, 200)}).fetchall()
        return [_serialize_row(r) for r in rows]


def fetch_snapshot_bundle(settings: Settings | None = None) -> dict:
    stations = fetch_latest_stations(settings=settings)
    fires = fetch_recent_fires(settings=settings)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_stations": len(stations),
        "n_fires": len(fires),
        "stations": stations,
        "fires": fires,
    }


def _serialize_row(row: dict) -> dict:
    out = dict(row)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out
