"""Threshold alert pipeline — Timescale row + Redis pub/sub."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger(__name__)

ALERTS_CHANNEL = "vayu:alerts"
ALERTS_LIST_KEY = "vayu:alerts:recent"


def ensure_alerts_table() -> None:
    from services.ingestor.db import connect

    stmts = [
        """
        CREATE TABLE IF NOT EXISTS alert_events (
            id              BIGSERIAL PRIMARY KEY,
            ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            city_id         TEXT,
            district        TEXT,
            station_id      TEXT,
            aqi             DOUBLE PRECISION,
            pm25            DOUBLE PRECISION,
            severity        TEXT NOT NULL DEFAULT 'warning',
            title           TEXT NOT NULL,
            detail          TEXT,
            source          TEXT NOT NULL DEFAULT 'watcher',
            meta            JSONB
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_alert_events_ts ON alert_events (ts DESC)",
    ]
    with connect() as conn:
        for s in stmts:
            conn.execute(s)


def insert_alert(row: dict[str, Any]) -> dict[str, Any]:
    ensure_alerts_table()
    from services.ingestor.db import connect

    sql = """
        INSERT INTO alert_events (ts, city_id, district, station_id, aqi, pm25, severity, title, detail, source, meta)
        VALUES (
            COALESCE(%(ts)s::timestamptz, NOW()),
            %(city_id)s, %(district)s, %(station_id)s, %(aqi)s, %(pm25)s,
            %(severity)s, %(title)s, %(detail)s, %(source)s, %(meta)s::jsonb
        )
        RETURNING id, ts, city_id, district, station_id, aqi, pm25, severity, title, detail, source
    """
    payload = {
        "ts": row.get("ts"),
        "city_id": row.get("city_id"),
        "district": row.get("district"),
        "station_id": row.get("station_id"),
        "aqi": row.get("aqi"),
        "pm25": row.get("pm25"),
        "severity": row.get("severity") or "warning",
        "title": row["title"],
        "detail": row.get("detail") or "",
        "source": row.get("source") or "watcher",
        "meta": json.dumps(row.get("meta") or {}),
    }
    with connect() as conn:
        rec = conn.execute(sql, payload).fetchone()
    out = dict(rec)
    if isinstance(out.get("ts"), datetime):
        out["ts"] = out["ts"].isoformat()
    return out


def publish_alert(alert: dict[str, Any]) -> None:
    try:
        from services.ingestor import cache

        r = cache.client()
        msg = json.dumps(alert, default=str)
        r.publish(ALERTS_CHANNEL, msg)
        r.lpush(ALERTS_LIST_KEY, msg)
        r.ltrim(ALERTS_LIST_KEY, 0, 49)
        r.set("vayu:alerts:latest", msg, ex=6 * 3600)
    except Exception as exc:
        log.warning("publish_alert failed: %s", exc)


def list_recent_alerts(limit: int = 20) -> list[dict[str, Any]]:
    try:
        from services.ingestor import cache

        raw = cache.client().lrange(ALERTS_LIST_KEY, 0, limit - 1)
        if raw:
            return [json.loads(x) for x in raw]
    except Exception:
        pass
    try:
        ensure_alerts_table()
        from services.ingestor.db import connect

        with connect() as conn:
            rows = conn.execute(
                """
                SELECT id, ts, city_id, district, station_id, aqi, pm25, severity, title, detail, source
                FROM alert_events ORDER BY ts DESC LIMIT %(n)s
                """,
                {"n": limit},
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("ts"), datetime):
                d["ts"] = d["ts"].isoformat()
            out.append(d)
        return out
    except Exception as exc:
        log.warning("list_recent_alerts db: %s", exc)
        return []


def inject_breach(
    *,
    city_id: str = "raipur",
    aqi: float = 320.0,
    pm25: float = 180.0,
    station_id: str = "inject:demo",
    hours: int = 3,
) -> dict[str, Any]:
    """Simulate AQI>300 sustained breach and fan-out alert."""
    title = f"AQI breach {aqi:.0f} in {city_id.title()}"
    detail = (
        f"Simulated {hours}h sustained AQI>300 (aqi={aqi:.0f}, pm25={pm25:.0f}). "
        "Agent graph should re-run; UI toast + WhatsApp preview."
    )
    alert = insert_alert(
        {
            "city_id": city_id,
            "station_id": station_id,
            "aqi": aqi,
            "pm25": pm25,
            "severity": "critical" if aqi >= 300 else "warning",
            "title": title,
            "detail": detail,
            "source": "inject",
            "meta": {"hours": hours, "threshold_aqi": 300},
        }
    )
    try:
        from services.ingestor.db import write_station_readings
        from services.ingestor.models import StationReadingIn

        now = datetime.now(timezone.utc)
        rows = [
            StationReadingIn(
                ts=now - timedelta(hours=h),
                station_id=station_id,
                city_id=city_id,
                source="alert-inject",
                pm25=pm25,
                aqi=aqi,
                aqi_basis="cpcb",
                lat=21.25,
                lon=81.63,
            )
            for h in range(hours)
        ]
        write_station_readings(rows)
    except Exception as exc:
        log.warning("inject readings: %s", exc)

    publish_alert(alert)
    try:
        from services.ingestor import cache

        cache.set_json(
            "vayu:ui:toast",
            {
                "type": "alert",
                "title": title,
                "detail": detail,
                "severity": alert.get("severity"),
                "ts": alert.get("ts"),
                "id": alert.get("id"),
            },
            ttl_s=3600,
        )
    except Exception:
        pass
    return {"alert": alert, "ui_toast": True, "channel": ALERTS_CHANNEL}


def trigger_alert_for_station(
    *,
    city_id: str,
    aqi: float,
    pm25: float,
    station_id: str,
) -> dict[str, Any]:
    """Emit and persist an AQI alert for a real detected threshold breach."""
    title = f"AQI breach {aqi:.0f} in {city_id.title()}"
    detail = f"Detected high AQI ({aqi:.0f}, PM2.5={pm25:.0f} µg/m³) at station {station_id}."
    alert = insert_alert(
        {
            "city_id": city_id,
            "station_id": station_id,
            "aqi": aqi,
            "pm25": pm25,
            "severity": "critical" if aqi >= 300 else "warning",
            "title": title,
            "detail": detail,
            "source": "watcher",
            "meta": {"threshold_aqi": 300},
        }
    )
    publish_alert(alert)
    try:
        from services.ingestor import cache

        cache.set_json(
            "vayu:ui:toast",
            {
                "type": "alert",
                "title": title,
                "detail": detail,
                "severity": alert.get("severity"),
                "ts": alert.get("ts"),
                "id": alert.get("id"),
            },
            ttl_s=3600,
        )
    except Exception:
        pass
    return {"alert": alert, "ui_toast": True, "channel": ALERTS_CHANNEL}


def run_watcher_once(aqi_threshold: float = 300.0, hours: int = 3) -> dict[str, Any]:
    """Scan latest station readings; emit alert if any AQI exceeds threshold."""
    try:
        from services.ingestor.db import fetch_latest_stations

        stations = fetch_latest_stations(limit=200)
    except Exception as exc:
        return {"status": "error", "detail": str(exc), "alerts": []}

    fired: list[dict[str, Any]] = []
    for s in stations:
        aqi = s.get("aqi")
        pm = s.get("pm25")
        if aqi is None and pm is not None:
            aqi = float(pm) * 2.0
        if aqi is None:
            continue
        if float(aqi) >= aqi_threshold:
            rec = trigger_alert_for_station(
                city_id=str(s.get("city_id") or "unknown"),
                aqi=float(aqi),
                pm25=float(pm or 0),
                station_id=str(s.get("station_id") or "unknown"),
            )
            fired.append(rec["alert"])
    return {
        "status": "ok",
        "n_scanned": len(stations),
        "alerts": fired,
        "threshold": aqi_threshold,
    }
