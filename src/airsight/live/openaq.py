"""OpenAQ v3 client for measured reference-grade stations (key optional).

OpenAQ aggregates CPCB/CEBC feeds, so this is the only path in the system that
returns *measured* PM2.5 rather than modelled CAMS fields. It needs a free
``OPENAQ_API_KEY``; without one the API reports ``not_configured`` and the
product falls back to the clearly-labelled CAMS surface.

Usage::

    from airsight.live.openaq import fetch_latest

    rows, status = fetch_latest((21.25, 81.63), radius_m=250_000)
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger(__name__)

BASE = "https://api.openaq.org/v3"

# OpenAQ parameter names -> our column names.
PARAM_MAP: dict[str, str] = {
    "pm25": "pm25",
    "pm2.5": "pm25",
    "pm10": "pm10",
    "no2": "no2",
    "so2": "so2",
    "o3": "o3",
    "co": "co",
    "nh3": "nh3",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _headers(key: str) -> dict[str, str]:
    return {"Accept": "application/json", "X-API-Key": key}


def _iso(value: Any) -> str | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


MAX_RADIUS_M = 25_000


def fetch_latest(
    center: tuple[float, float],
    *,
    radius_m: int = 50_000,
    limit: int = 60,
    api_key: str | None = None,
    timeout: float = 25.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return the latest measured readings per station around *center*."""
    key = (api_key or os.environ.get("OPENAQ_API_KEY") or "").strip()
    if not key:
        return [], {
            "source": "openaq",
            "status": "not_configured",
            "detail": "Set OPENAQ_API_KEY to ingest measured CPCB station data.",
            "fetched_at": _now(),
        }

    lat, lon = center
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            locations = client.get(
                f"{BASE}/locations",
                params={
                    "coordinates": f"{lat:.4f},{lon:.4f}",
                    # OpenAQ v3 rejects radius > 25 km with HTTP 422.
                    "radius": max(1, min(int(radius_m), MAX_RADIUS_M)),
                    "limit": max(1, min(limit, 1000)),
                },
                headers=_headers(key),
            )
            if locations.status_code in (401, 403):
                return [], {
                    "source": "openaq",
                    "status": "invalid_key",
                    "detail": "OpenAQ rejected OPENAQ_API_KEY.",
                    "fetched_at": _now(),
                }
            locations.raise_for_status()
            results = (locations.json() or {}).get("results") or []
            rows: list[dict[str, Any]] = []
            for loc in results:
                try:
                    row = _fetch_location_latest(client, loc, key)
                except Exception as exc:  # noqa: BLE001 - one station failing is fine
                    log.debug("openaq location %s failed: %s", loc.get("id"), exc)
                    continue
                if row:
                    rows.append(row)
    except Exception as exc:  # noqa: BLE001
        return [], {
            "source": "openaq",
            "status": "error",
            "detail": str(exc)[:300],
            "fetched_at": _now(),
        }

    return rows, {
        "source": "openaq",
        "status": "ok" if rows else "empty",
        "detail": f"{len(rows)} station(s) with fresh measurements",
        "fetched_at": _now(),
        "n": len(rows),
    }


def _fetch_location_latest(
    client: httpx.Client, loc: dict[str, Any], key: str
) -> dict[str, Any] | None:
    loc_id = loc.get("id")
    coords = loc.get("coordinates") or {}
    lat = coords.get("latitude")
    lon = coords.get("longitude")
    if loc_id is None or lat is None or lon is None:
        return None

    # sensor id -> our column name
    sensor_map: dict[int, str] = {}
    for sensor in loc.get("sensors") or []:
        name = str((sensor.get("parameter") or {}).get("name") or "").lower()
        column = PARAM_MAP.get(name)
        if column:
            sensor_map[int(sensor["id"])] = column

    response = client.get(
        f"{BASE}/locations/{loc_id}/latest", headers=_headers(key), timeout=20.0
    )
    response.raise_for_status()
    measurements = (response.json() or {}).get("results") or []

    values: dict[str, float | None] = {}
    latest_ts: str | None = None
    for measurement in measurements:
        column = sensor_map.get(int(measurement.get("sensorsId") or -1))
        if not column:
            continue
        raw = measurement.get("value")
        if raw is None:
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        # CO arrives in µg/m³; CPCB NAQI needs mg/m³.
        if column == "co" and value > 50:
            value = value / 1000.0
        values[column] = value
        ts = _iso(measurement.get("datetime") or (measurement.get("period") or {}).get("datetimeTo"))
        if ts and (latest_ts is None or ts > latest_ts):
            latest_ts = ts

    if not values or not latest_ts:
        return None

    return {
        "station_id": f"openaq:{loc_id}",
        "name": loc.get("name") or f"OpenAQ {loc_id}",
        "lat": float(lat),
        "lon": float(lon),
        "ts": latest_ts,
        "source": "openaq",
        **values,
    }
