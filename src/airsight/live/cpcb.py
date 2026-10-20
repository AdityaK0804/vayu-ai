"""CPCB real-time station readings via the data.gov.in open API.

Feed: "Real time Air Quality Index from various locations" (CPCB CAAQMS). One
record per station x pollutant with ``min_value``/``max_value``/``avg_value``
over the trailing 24 h and a local ``last_update``. Per ``value_kind`` in
``config/live_sources.yaml`` the values are CPCB pollutant sub-indices; we
invert the CPCB breakpoints to concentrations, store the concentrations and
recompute the AQI from them with :mod:`airsight.aqi.cpcb_naqi`.

Endpoint, resource id, state and station registry come from config; the key
comes from ``DATA_GOV_IN_API_KEY``.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from airsight.aqi.cpcb_naqi import BP, compute_naqi
from airsight.live.sources_config import cpcb_station_registry, section

log = logging.getLogger(__name__)

SOURCE = "cpcb"

# data.gov.in pollutant ids -> our column names.
POLLUTANT_IDS = {
    "PM2.5": "pm25",
    "PM10": "pm10",
    "NO2": "no2",
    "SO2": "so2",
    "OZONE": "o3",
    "CO": "co",
    "NH3": "nh3",
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def concentration_from_sub_index(pollutant: str, index: float | None) -> float | None:
    """Invert the CPCB linear breakpoint formula (index -> concentration)."""
    if index is None or pollutant not in BP:
        return None
    i = float(index)
    if i < 0:
        return None
    table = BP[pollutant]
    for c_lo, c_hi, i_lo, i_hi in table:
        if i <= i_hi:
            i = max(i, i_lo)  # CPCB bands are integer: 50 -> 51 gap
            if i_hi == i_lo:
                return float(c_hi)
            return c_lo + (i - i_lo) * (c_hi - c_lo) / (i_hi - i_lo)
    return float(table[-1][1])


def _parse_local(stamp: str, tz: str) -> datetime | None:
    for fmt in ("%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(stamp.strip(), fmt).replace(tzinfo=ZoneInfo(tz)).astimezone(timezone.utc)
        except (ValueError, AttributeError):
            continue
    return None


def _num(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if v >= 0 else None


def _norm(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def parse_records(
    records: list[dict[str, Any]],
    registry: list[dict[str, Any]],
    *,
    value_kind: str = "sub_index",
    tz: str = "Asia/Kolkata",
    max_age_hours: float = 6.0,
    now: datetime | None = None,
    fetched_at: str | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Group pollutant records into one observation per station.

    Returns ``(rows, unmatched_station_names)``. Rows carry ``source`` and
    ``fetched_at``; stations are matched to the registry by CPCB name, then by
    coordinates (within ~1 km) so a renamed site is still recognised.
    """
    now = now or datetime.now(timezone.utc)
    fetched_at = fetched_at or _now()
    by_name = {_norm(r["cpcb_name"]): r for r in registry}
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    unmatched: set[str] = set()
    for rec in records:
        name = str(rec.get("station") or "")
        station = by_name.get(_norm(name))
        if station is None:
            lat, lon = _num(rec.get("latitude")), _num(rec.get("longitude"))
            if lat is not None and lon is not None:
                near = min(registry, key=lambda r: (r["lat"] - lat) ** 2 + (r["lon"] - lon) ** 2, default=None)
                if near and ((near["lat"] - lat) ** 2 + (near["lon"] - lon) ** 2) ** 0.5 < 0.01:
                    station = near
        if station is None:
            unmatched.add(name)
            continue
        pol = POLLUTANT_IDS.get(str(rec.get("pollutant_id") or "").upper())
        ts = _parse_local(str(rec.get("last_update") or ""), tz)
        if pol is None or ts is None:
            continue
        if now - ts > timedelta(hours=max_age_hours):
            continue
        raw = _num(rec.get("avg_value"))
        value = concentration_from_sub_index(pol, raw) if value_kind == "sub_index" else raw
        if value is None:
            continue
        key = (station["station_id"], ts.strftime("%Y-%m-%dT%H:%M:%SZ"))
        row = grouped.setdefault(
            key,
            {
                "station_id": station["station_id"],
                "city_id": station["city_id"],
                "name": station["cpcb_name"],
                "lat": station["lat"],
                "lon": station["lon"],
                "ts": key[1],
                "source": SOURCE,
                "fetched_at": fetched_at,
                "averaging": "24h",
            },
        )
        row[pol] = round(value, 3)

    rows = []
    for row in grouped.values():
        naqi = compute_naqi(row)
        pols = [p for p in ("pm25", "pm10", "no2", "so2", "o3", "co", "nh3") if row.get(p) is not None]
        has_pm = row.get("pm25") is not None or row.get("pm10") is not None
        # CPCB rule: >= 3 pollutants including PM2.5 or PM10.
        row["aqi"] = naqi.get("aqi") if (len(pols) >= 3 and has_pm) else None
        row["dominant"] = naqi.get("dominant_pollutant") if row["aqi"] is not None else None
        rows.append(row)
    return rows, sorted(unmatched)


def fetch_latest(*, api_key: str | None = None, timeout: float = 60.0) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch current CPCB readings for the configured state."""
    cfg = section("cpcb_datagov")
    key = (api_key or os.environ.get("DATA_GOV_IN_API_KEY") or "").strip()
    fetched_at = _now()
    if not key:
        return [], {"source": SOURCE, "status": "not_configured",
                    "detail": "Set DATA_GOV_IN_API_KEY to ingest CPCB station readings.",
                    "fetched_at": fetched_at}
    if not cfg.get("resource_id"):
        return [], {"source": SOURCE, "status": "not_configured",
                    "detail": "cpcb_datagov.resource_id missing in config/live_sources.yaml",
                    "fetched_at": fetched_at}
    registry = cpcb_station_registry()
    url = f"{cfg.get('base_url', 'https://api.data.gov.in/resource').rstrip('/')}/{cfg['resource_id']}"
    limit = int(cfg.get("page_size") or 500)
    records: list[dict[str, Any]] = []
    offset = 0
    try:
        # data.gov.in's edge stalls requests with the default python-httpx UA.
        headers = {"User-Agent": str(cfg.get("user_agent") or "vayu-ai/1.0")}
        with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
            while True:
                params = {
                    "api-key": key, "format": "json", "limit": limit, "offset": offset,
                    "filters[state]": cfg.get("state") or "",
                }
                # data.gov.in is often slow; retry timeouts with a short back-off.
                for attempt in range(3):
                    try:
                        resp = client.get(url, params=params)
                        break
                    except httpx.TimeoutException:
                        if attempt == 2:
                            raise
                        time.sleep(3 * (attempt + 1))
                if resp.status_code in (401, 403):
                    return [], {"source": SOURCE, "status": "invalid_key",
                                "detail": "data.gov.in rejected the API key.", "fetched_at": fetched_at}
                resp.raise_for_status()
                payload = resp.json()
                batch = payload.get("records") or []
                records.extend(batch)
                total = int(payload.get("total") or 0)
                offset += len(batch)
                if not batch or offset >= total:
                    break
    except Exception as exc:  # noqa: BLE001
        log.warning("CPCB data.gov.in fetch failed: %s", exc)
        return [], {"source": SOURCE, "status": "error", "detail": type(exc).__name__, "fetched_at": fetched_at}

    rows, unmatched = parse_records(
        records, registry,
        value_kind=str(cfg.get("value_kind") or "sub_index"),
        tz=str(cfg.get("timezone") or "Asia/Kolkata"),
        max_age_hours=float(cfg.get("max_age_hours") or 6),
        fetched_at=fetched_at,
    )
    status = "ok" if rows else "empty"
    detail = f"{len(records)} records, {len(rows)} station readings"
    if unmatched:
        detail += f"; unmatched stations: {', '.join(unmatched)[:200]}"
    return rows, {"source": SOURCE, "status": status, "detail": detail,
                  "n_records": len(records), "n_stations": len(rows), "fetched_at": fetched_at}
