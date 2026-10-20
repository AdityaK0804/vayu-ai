"""NASA FIRMS active-fire feed (key-optional) with an explicit degraded mode.

FIRMS is the standard source for satellite thermal anomalies. It requires a
free ``FIRMS_MAP_KEY`` (registration at firms.modaps.eosdis.nasa.gov). When the
key is absent we do **not** silently replay the 2021-2025 archive as if it were
today's fires — that is exactly the kind of fake data this rebuild removes.
Instead we return an empty list plus a status the API can surface, and the UI
shows "live fire feed not configured" rather than inventing detections.

Usage::

    from airsight.live.fires import fetch_fires

    rows, status = fetch_fires([81.7, 18.8, 83.6, 23.5], days=2)
"""

from __future__ import annotations

import csv
import io
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

import httpx
import h3

log = logging.getLogger(__name__)

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
# VIIRS 375 m NRT is the most useful sensor for Indian crop-residue fires.
SENSORS: tuple[str, ...] = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _bbox_param(bbox: Sequence[float]) -> str:
    """FIRMS wants west,south,east,north."""
    west, south, east, north = (float(v) for v in bbox)
    return f"{west:.4f},{south:.4f},{east:.4f},{north:.4f}"


def _f(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_ts(acq_date: str, acq_time: str) -> str | None:
    try:
        if "T" in acq_date:
            dt = datetime.fromisoformat(acq_date.replace("Z", "+00:00"))
            return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        hours = str(acq_time or "0").zfill(4)
        dt = datetime(
            int(acq_date[:4]),
            int(acq_date[5:7]),
            int(acq_date[8:10]),
            int(hours[:2]),
            int(hours[2:4]),
            tzinfo=timezone.utc,
        )
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def _confidence(value: Any) -> float | None:
    """Normalise FIRMS confidence (VIIRS: l/n/h, MODIS: 0-100) to 0-1."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"l", "low"}:
        return 0.3
    if text in {"n", "nominal"}:
        return 0.7
    if text in {"h", "high"}:
        return 0.95
    parsed = _f(text)
    if parsed is None:
        return None
    return round(parsed / 100.0, 3) if parsed > 1 else round(parsed, 3)


def parse_csv(text: str, *, satellite: str = "VIIRS") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(io.StringIO(text))
    for raw in reader:
        lat = _f(raw.get("latitude"))
        lon = _f(raw.get("longitude"))
        if lat is None or lon is None:
            continue
        ts = _parse_ts(str(raw.get("acq_date") or ""), str(raw.get("acq_time") or ""))
        if not ts:
            continue
        rows.append(
            {
                "ts": ts,
                "lat": lat,
                "lon": lon,
                "frp": _f(raw.get("frp")),
                "confidence": _confidence(raw.get("confidence")),
                "satellite": raw.get("satellite") or satellite,
                "h3_r7": _safe_h3(lat, lon, 7),
                "h3_r8": _safe_h3(lat, lon, 8),
                "source": "firms",
            }
        )
    return rows


def _safe_h3(lat: float, lon: float, res: int) -> str | None:
    try:
        return h3.latlng_to_cell(lat, lon, res)
    except Exception:
        return None


def fetch_fires(
    bbox: Sequence[float],
    *,
    days: int = 2,
    map_key: str | None = None,
    timeout: float = 25.0,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch active fires inside *bbox*.

    Returns ``(rows, status)`` where status is always a dict so callers can show
    a reason when the list is empty.
    """
    key = (map_key or os.environ.get("FIRMS_MAP_KEY") or "").strip()
    if not key:
        return [], {
            "source": "firms",
            "status": "not_configured",
            "detail": "Set FIRMS_MAP_KEY to enable live satellite fire detections.",
            "fetched_at": _now(),
        }

    area = _bbox_param(bbox)
    window = max(1, min(int(days), 5))
    rows: list[dict[str, Any]] = []
    notes: list[str] = []
    for sensor in SENSORS:
        url = f"{FIRMS_BASE}/{key}/{sensor}/{area}/{window}"
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                response = client.get(url)
            if response.status_code in (401, 403) or "Invalid MAP_KEY" in response.text:
                return [], {
                    "source": "firms",
                    "status": "invalid_key",
                    "detail": "FIRMS rejected the MAP_KEY.",
                    "fetched_at": _now(),
                }
            if response.status_code >= 400:
                notes.append(f"{sensor}:HTTP {response.status_code}")
                continue
            parsed = parse_csv(response.text, satellite=sensor.split("_")[0])
            rows.extend(parsed)
            notes.append(f"{sensor}:{len(parsed)}")
        except Exception as exc:  # noqa: BLE001 - one sensor failing is fine
            notes.append(f"{sensor}:{type(exc).__name__}")
            log.warning("FIRMS %s failed: %s", sensor, exc)

    # Deduplicate overlapping detections from multiple sensors, then drop
    # anything older than the requested window: an archive row must never be
    # stored or shown as a live detection (DATA-03).
    deduped, n_old = drop_stale_fires(_dedupe(rows), max_age_hours=window * 24 + 6)
    if n_old:
        notes.append(f"dropped_stale:{n_old}")
    status = {
        "source": "firms",
        "status": "ok" if deduped else ("degraded" if notes else "empty"),
        "detail": "; ".join(notes) if notes else "no detections in window",
        "fetched_at": _now(),
        "n": len(deduped),
        "window_days": window,
    }
    return deduped, status


def drop_stale_fires(
    rows: list[dict[str, Any]], *, max_age_hours: float, now: datetime | None = None
) -> tuple[list[dict[str, Any]], int]:
    """Keep detections whose acquisition time is within *max_age_hours*."""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=max_age_hours)
    kept: list[dict[str, Any]] = []
    for row in rows:
        try:
            ts = datetime.fromisoformat(str(row["ts"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if cutoff <= ts <= now + timedelta(hours=1):
            kept.append(row)
    return kept, len(rows) - len(kept)


def _dedupe(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[tuple[float, float], dict[str, Any]] = {}
    for row in rows:
        key = (round(row["lat"], 3), round(row["lon"], 3))
        existing = seen.get(key)
        if existing is None:
            seen[key] = row
            continue
        if (row.get("frp") or 0) > (existing.get("frp") or 0):
            seen[key] = row
    return list(seen.values())


def expected_fire_note() -> str:
    """Short human explanation used by the API's meta block."""
    return (
        "Live fire detections come from NASA FIRMS (VIIRS 375 m NRT). "
        "They are thermal anomalies, not confirmed fires, and require FIRMS_MAP_KEY."
    )
