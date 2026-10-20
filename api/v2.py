"""Vayu API v2 — live air quality, forecasts, H3 surfaces, fires and search.

Design rules
------------
* **Every number is labelled.** Each response carries ``source``,
  ``generated_at``, ``stale`` and a ``data_quality`` block saying whether the
  value is *measured* (OpenAQ reference station), *modelled* (CAMS) or
  *downscaled* (our H3 surface). No silent synthesis.
* **Freshness is computed, not asserted.** ``stale`` is derived from the age of
  the newest stored observation, not hard-coded.
* **Unknown places still work.** ``/air/point`` answers for any coordinate on
  Earth by querying Open-Meteo live, and says that it is uncalibrated.
* **H3 is the spatial primitive.** Surfaces are returned as H3 cells and,
  optionally, as GeoJSON hexagons so any H3-aware client can render or join them.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Literal

import h3
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from airsight.aqi.cpcb_naqi import band_for_aqi, compute_naqi_rolling, sub_index
from airsight.config import load_cities
from airsight.forecast.service import forecast_city
from airsight.live.ingest import city_summary, refresh_surface
from airsight.live.openmeteo import fetch_air_quality, geocode
from airsight.models.registry import registry_summary
from airsight.store import Store, store_stats, to_iso, utcnow
from api.errors import ApiError
from api.security import require_admin

API_VERSION = "4.0.0"
log = logging.getLogger("vayu.api.v2")

router = APIRouter(prefix="/api/v2", tags=["v2"])


class _TTLCache:
    """Small bounded LRU+TTL cache (the old dict grew without limit)."""

    def __init__(self, maxsize: int = 1024, ttl_s: float = 600) -> None:
        self.maxsize, self.ttl_s = maxsize, ttl_s
        self._data: OrderedDict[Any, tuple[float, Any]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: Any) -> Any:
        with self._lock:
            hit = self._data.get(key)
            if not hit:
                return None
            if time.time() - hit[0] > self.ttl_s:
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return hit[1]

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            self._data[key] = (time.time(), value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_point_cache = _TTLCache(maxsize=1024, ttl_s=600)


def _open_store() -> Store:
    try:
        return Store.open()
    except Exception:  # noqa: BLE001 - DSN/driver text must not reach clients
        log.exception("database unavailable")
        raise ApiError(503, "Data store is temporarily unavailable.", code="store_unavailable") from None

STALE_AFTER_HOURS = 6


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _age_hours(ts: str | None) -> float | None:
    if not ts:
        return None
    try:
        then = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return round((datetime.now(timezone.utc) - then).total_seconds() / 3600.0, 2)


def _quality(source: str | None, *, calibrated: bool = False) -> dict[str, Any]:
    if source == "cpcb":
        return {
            "kind": "measured",
            "label": "Measured — CPCB CAAQMS station (data.gov.in), 24 h average",
            "calibrated": calibrated,
        }
    if source == "openaq":
        return {
            "kind": "measured",
            "label": "Measured — reference-grade CPCB station via OpenAQ",
            "calibrated": calibrated,
        }
    if source == "model":
        return {
            "kind": "model",
            "label": "Model — locally trained on CPCB history, anchored to CAMS input",
            "calibrated": True,
        }
    if source == "open-meteo-cams":
        return {
            "kind": "modelled",
            "label": "Modelled — CAMS global fields, no local calibration",
            "calibrated": False,
        }
    return {"kind": "unknown", "label": "Unknown provenance", "calibrated": False}


def _nearest_city(store: Store, lat: float, lon: float) -> tuple[dict[str, Any] | None, float | None]:
    best, best_km = None, None
    for city in store.cities():
        dlat = (float(city["lat"]) - lat) * 110.574
        dlon = (float(city["lon"]) - lon) * 111.320 * math.cos(math.radians(lat))
        km = math.hypot(dlat, dlon)
        if best_km is None or km < best_km:
            best, best_km = city, km
    return best, best_km


def _pm25_aqi(pm25: float | None) -> int | None:
    if pm25 is None:
        return None
    idx = sub_index("pm25", pm25)
    return None if idx is None else int(round(idx))


# ---------------------------------------------------------------------------
# Health / registry
# ---------------------------------------------------------------------------


@router.get("/health")
def v2_health() -> dict[str, Any]:
    """The single health endpoint: liveness, store counts, per-source freshness
    and the active model versions."""
    with _open_store() as store:
        stats = store_stats(store)
        freshness = store.source_freshness()
        ingests = [
            {k: r.get(k) for k in ("source", "status", "finished_at", "rows")}
            for r in store.recent_ingests(limit=8)
        ]
    try:
        models = registry_summary()
    except Exception:  # noqa: BLE001
        log.exception("model registry unavailable")
        models = None
    latest = stats.get("latest_observation")
    age = _age_hours(latest)
    any_stale = any(v.get("stale") for k, v in freshness.items() if k in ("cams", "forecast"))
    return {
        "status": "empty" if not latest else ("stale" if any_stale else "ok"),
        "version": API_VERSION,
        "generated_at": utcnow(),
        "store": {"backend": stats.get("backend"), "counts": stats.get("counts")},
        "freshness": {
            "latest_observation": latest,
            "age_hours": age,
            "stale": bool(age is None or age > STALE_AFTER_HOURS),
            "stale_after_hours": STALE_AFTER_HOURS,
            "sources": freshness,
        },
        "models": models,
        "recent_ingests": ingests,
        "aqi_basis": "CPCB National AQI (24h PM/NO2/SO2/NH3, max 8h O3/CO)",
    }


@router.get("/models")
def v2_models() -> dict[str, Any]:
    with _open_store() as store:
        return {
            "generated_at": utcnow(),
            "active": registry_summary(),
            "all": store.models(),
        }


# ---------------------------------------------------------------------------
# Cities
# ---------------------------------------------------------------------------


@router.get("/cities")
def v2_cities(include_optional: bool = True) -> dict[str, Any]:
    """City index with the freshest AQI for each registered city."""
    with _open_store() as store:
        if not store.cities():
            rows = []
            for city in load_cities(include_optional=include_optional):
                rows.append(
                    {
                        "id": city["id"],
                        "name": city.get("name") or city["id"],
                        "lat": city["lat"],
                        "lon": city["lon"],
                        "available": False,
                    }
                )
            return {"generated_at": utcnow(), "n": len(rows), "cities": rows,
                    "freshness": store.source_freshness()}

        out = []
        for city in store.cities():
            summary = city_summary(store, city["id"])
            if not summary.get("available"):
                out.append(
                    {
                        "id": city["id"],
                        "name": city["name"],
                        "lat": city["lat"],
                        "lon": city["lon"],
                        "calibrated": bool(city.get("calibrated")),
                        "available": False,
                    }
                )
                continue
            summary["id"] = city["id"]
            summary["calibrated"] = bool(city.get("calibrated"))
            summary["stale"] = bool((_age_hours(summary.get("ts")) or 99) > STALE_AFTER_HOURS)
            summary["quality"] = _quality(summary.get("source"), calibrated=bool(city.get("calibrated")))
            out.append(summary)

        freshness = store.source_freshness()

    out.sort(key=lambda c: (not c.get("available"), -(c.get("aqi") or -1)))
    return {"generated_at": utcnow(), "n": len(out), "cities": out, "freshness": freshness}


@router.get("/cities/{city_id}")
def v2_city(city_id: str) -> dict[str, Any]:
    with _open_store() as store:
        city_row = store.city(city_id) or {}
        summary = city_summary(store, city_id)
        if not summary:
            raise ApiError(404, "Unknown city.", code="unknown_city")
        summary["freshness"] = store.source_freshness(city_id)
        if not summary.get("available"):
            return summary
        summary["stale"] = bool((_age_hours(summary.get("ts")) or 99) > STALE_AFTER_HOURS)
        summary["quality"] = _quality(
            summary.get("source"), calibrated=bool(city_row.get("calibrated"))
        )
        summary["calibrated"] = bool(city_row.get("calibrated"))
        summary["stations"] = [
            s for s in store.stations(city_id)
        ]
        return summary


@router.get("/cities/{city_id}/forecast")
def v2_forecast(city_id: str, hours: int = Query(72, ge=6, le=120)) -> dict[str, Any]:
    with _open_store() as store:
        if not store.city(city_id):
            raise ApiError(404, "Unknown city.", code="unknown_city")
        try:
            result = forecast_city(store, city_id, hours=hours)
        except Exception:  # noqa: BLE001
            log.exception("forecast failed for %s", city_id)
            raise ApiError(503, "Forecast is temporarily unavailable.", code="forecast_unavailable") from None
        result["freshness"] = store.source_freshness(city_id)
    if not result.get("available"):
        raise ApiError(404, "No forecast is available for this city yet.", code="no_forecast")
    result["quality"] = _quality(result.get("source"), calibrated=bool(result.get("calibrated")))
    result["units"] = {"pm25": "µg/m³", "aqi": "CPCB NAQI 0-500"}
    return result


@router.get("/cities/{city_id}/skill")
def v2_skill(city_id: str, days: int = Query(7, ge=1, le=30)) -> dict[str, Any]:
    """Forecast verification against readings that arrived after issue."""
    from airsight.forecast.skill import city_skill

    with _open_store() as store:
        if not store.city(city_id):
            raise ApiError(404, "Unknown city.", code="unknown_city")
        return city_skill(store, city_id, days=days)


@router.get("/cities/{city_id}/surface")
def v2_surface(
    request: Request,
    city_id: str,
    res: int | None = Query(None, ge=5, le=10),
    fmt: Literal["json", "geojson"] = "json",
    rebuild: bool = False,
) -> dict[str, Any]:
    """H3 PM2.5 surface for a city from the newest anchor observations."""
    with _open_store() as store:
        city = store.city(city_id)
        if not city:
            raise ApiError(404, "Unknown city.", code="unknown_city")

        if rebuild:
            # Rebuilding is expensive: admin only.
            require_admin(request)
        ts, cells = store.hex_snapshot(city_id)
        if rebuild or not cells:
            try:
                refresh_surface(store, city)
            except Exception:  # noqa: BLE001
                log.exception("surface build failed for %s", city_id)
                raise ApiError(503, "Map surface is temporarily unavailable.", code="surface_unavailable") from None
            ts, cells = store.hex_snapshot(city_id)

        if not cells:
            raise ApiError(404, "No map surface is available for this city yet.", code="no_surface")

        if res and cells:
            current_res = h3.get_resolution(cells[0]["h3"])
            if res < current_res:
                cells = _resample(cells, res)

        values = [c["pm25"] for c in cells if c.get("pm25") is not None]
        payload_cells = [
            {
                "h3": c["h3"],
                "lat": round(float(c["lat"]), 5),
                "lon": round(float(c["lon"]), 5),
                "pm25": c.get("pm25"),
                "aqi": c.get("aqi"),
                "ei": c.get("emission_index"),
                "pop": c.get("population") or 0,
            }
            for c in cells
        ]
        meta = {
            "city_id": city_id,
            "name": city["name"],
            "ts": ts,
            "resolution": h3.get_resolution(cells[0]["h3"]) if cells else None,
            "n_cells": len(payload_cells),
            "n_anchors": len(store.latest_observations(city_id)),
            "mean_pm25": round(sum(values) / len(values), 1) if values else None,
            "max_pm25": round(max(values), 1) if values else None,
            "generated_at": utcnow(),
            "age_hours": _age_hours(ts),
            "method": cells[0].get("model_version") if cells else None,
            "aqi_basis": "cpcb_pm25_subindex_hourly_estimate",
            "freshness": store.source_freshness(city_id),
            "quality": {
                "kind": "downscaled",
                "label": "Downscaled — IDW anchors reshaped by the EDGAR emission inventory",
                "calibrated": bool(city.get("calibrated")),
            },
        }

        if fmt == "geojson":
            features = []
            for cell in payload_cells:
                ring = [
                    [round(lng, 5), round(lat, 5)]
                    for lat, lng in h3.cell_to_boundary(cell["h3"])
                ]
                ring.append(ring[0])
                features.append(
                    {
                        "type": "Feature",
                        "id": cell["h3"],
                        "properties": {k: v for k, v in cell.items() if k != "h3"},
                        "geometry": {"type": "Polygon", "coordinates": [ring]},
                    }
                )
            return {
                **meta,
                "type": "FeatureCollection",
                "features": features,
            }

        return {**meta, "cells": payload_cells}


def _resample(cells: list[dict[str, Any]], res: int) -> list[dict[str, Any]]:
    """Roll H3 cells up/down to another resolution, averaging overlapping values."""
    buckets: dict[str, dict[str, Any]] = {}
    for cell in cells:
        try:
            parent = h3.cell_to_parent(cell["h3"], res) if res < h3.get_resolution(cell["h3"]) else cell["h3"]
        except Exception:
            continue
        entry = buckets.setdefault(
            parent, {"h3": parent, "values": [], "ei": [], "pop": 0}
        )
        if cell.get("pm25") is not None:
            entry["values"].append(float(cell["pm25"]))
        if cell.get("emission_index") is not None:
            entry["ei"].append(float(cell["emission_index"]))
        entry["pop"] += int(cell.get("population") or 0)
    out = []
    for h3_cell, entry in buckets.items():
        lat, lon = h3.cell_to_latlng(h3_cell)
        values = entry["values"]
        pm = round(sum(values) / len(values), 1) if values else None
        out.append(
            {
                "h3": h3_cell,
                "lat": lat,
                "lon": lon,
                "pm25": pm,
                "aqi": _pm25_aqi(pm),
                "emission_index": round(sum(entry["ei"]) / len(entry["ei"]), 4) if entry["ei"] else None,
                "population": entry["pop"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# Arbitrary point (global)
# ---------------------------------------------------------------------------


@router.get("/air/point")
def v2_air_point(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    live: bool = Query(True, description="Fetch upstream when nothing is stored"),
) -> dict[str, Any]:
    """Current air quality for any coordinate.

    Registered cities are served from the store (fast, H3-indexed). Anything
    else is answered live from Open-Meteo and clearly flagged as uncalibrated.
    """
    key = (round(lat, 2), round(lon, 2), live)
    cached = _point_cache.get(key)
    if cached is not None:
        return {**cached, "cached": True}

    with _open_store() as store:
        city, distance_km = _nearest_city(store, lat, lon)
        if city and distance_km is not None and distance_km <= 12.0:
            summary = city_summary(store, city["id"])
            if summary.get("available"):
                payload = {
                    **summary,
                    "matched_city": city["id"],
                    "distance_km": round(distance_km, 1),
                    "location": {"lat": lat, "lon": lon},
                    "h3_r8": h3.latlng_to_cell(lat, lon, 8),
                    "quality": _quality(summary.get("source"), calibrated=bool(city.get("calibrated"))),
                    "generated_at": utcnow(),
                }
                _point_cache.set(key, payload)
                return payload

    if not live:
        return {
            "available": False,
            "location": {"lat": lat, "lon": lon},
            "detail": "no stored data near this point; pass live=true to query upstream",
        }

    try:
        series = fetch_air_quality([(lat, lon)], past_days=1, forecast_days=1)[0]
    except Exception:  # noqa: BLE001
        log.warning("open-meteo point lookup failed", exc_info=True)
        raise ApiError(503, "Live air-quality data is temporarily unavailable.", code="upstream_unavailable") from None

    current = series.current
    values = {
        "pm25": current.get("pm2_5"),
        "pm10": current.get("pm10"),
        "no2": current.get("nitrogen_dioxide"),
        "so2": current.get("sulphur_dioxide"),
        "o3": current.get("ozone"),
        "co": (current.get("carbon_monoxide") or 0) / 1000.0
        if current.get("carbon_monoxide") is not None
        else None,
    }
    # CPCB windows over the hourly series up to the current hour (never a
    # single instantaneous reading).
    now_key = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    upto = [i for i, t in enumerate(series.times) if str(t)[:16] <= now_key]
    hourly_map = {
        "pm25": list(series.hourly.get("pm2_5") or []),
        "pm10": list(series.hourly.get("pm10") or []),
        "no2": list(series.hourly.get("nitrogen_dioxide") or []),
        "so2": list(series.hourly.get("sulphur_dioxide") or []),
        "o3": list(series.hourly.get("ozone") or []),
        "co": [None if v is None else v / 1000.0 for v in (series.hourly.get("carbon_monoxide") or [])],
    }
    naqi = compute_naqi_rolling(hourly_map, upto[-1]) if upto else compute_naqi_rolling({}, -1)
    payload = {
        "available": bool(naqi.get("aqi") is not None or values["pm25"] is not None),
        "location": {"lat": lat, "lon": lon},
        "h3_r8": h3.latlng_to_cell(lat, lon, 8),
        "h3_r7": h3.latlng_to_cell(lat, lon, 7),
        "ts": to_iso(current.get("time")),
        "pm25": values["pm25"],
        "pm10": values["pm10"],
        "no2": values["no2"],
        "so2": values["so2"],
        "o3": values["o3"],
        "co": round(values["co"], 3) if values["co"] is not None else None,
        "aqi": naqi.get("aqi"),
        "band": naqi.get("band") or band_for_aqi(naqi.get("aqi")),
        "dominant": naqi.get("dominant_pollutant"),
        "sub_indexes": naqi.get("sub_indexes"),
        "averaging": naqi.get("averaging"),
        "aqi_basis": "cpcb_naqi",
        "cpcb_valid": naqi.get("cpcb_valid"),
        "pm25_24h": _round(series.recent_mean("pm2_5", 24)),
        "matched_city": None,
        "quality": {
            "kind": "modelled",
            "label": "Live CAMS field for this coordinate — no local calibration",
            "calibrated": False,
        },
        "source": "open-meteo-cams",
        "generated_at": utcnow(),
    }
    _point_cache.set(key, payload)
    return payload


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


@router.get("/search")
def v2_search(
    q: str = Query(..., min_length=2, max_length=80),
    limit: int = Query(8, ge=1, le=20),
) -> dict[str, Any]:
    """Place search backed by Open-Meteo geocoding (India-first)."""
    try:
        results = geocode(q, count=limit)
    except Exception:  # noqa: BLE001
        log.warning("geocoding failed", exc_info=True)
        raise ApiError(503, "Place search is temporarily unavailable.", code="upstream_unavailable") from None

    with _open_store() as store:
        cities = store.cities()
    registered = {c["name"].lower(): c["id"] for c in cities}
    for item in results:
        item["city_id"] = registered.get(str(item.get("name") or "").lower())
        item["h3_r8"] = h3.latlng_to_cell(float(item["lat"]), float(item["lon"]), 8)
    return {"query": q, "n": len(results), "results": results, "generated_at": utcnow()}


# ---------------------------------------------------------------------------
# Fires
# ---------------------------------------------------------------------------


@router.get("/fires")
def v2_fires(
    hours: int = Query(48, ge=1, le=240),
    city_id: str | None = None,
    west: float | None = None,
    south: float | None = None,
    east: float | None = None,
    north: float | None = None,
) -> dict[str, Any]:
    bbox = None
    if None not in (west, south, east, north):
        bbox = [west, south, east, north]  # type: ignore[list-item]
    with _open_store() as store:
        rows = store.fires(hours=hours, city_id=city_id, bbox=bbox)
        fresh = store.source_freshness()["fires"]
    return {
        "freshness": {"fires": fresh},
        "generated_at": utcnow(),
        "n": len(rows),
        "hours": hours,
        "source": "nasa-firms",
        "fires": rows,
        "h3": {
            "res7_cells": len({r["h3_r7"] for r in rows if r.get("h3_r7")}),
            "res8_cells": len({r["h3_r8"] for r in rows if r.get("h3_r8")}),
        },
    }


# ---------------------------------------------------------------------------
# Admin / refresh
# ---------------------------------------------------------------------------


class RefreshRequest(BaseModel):
    city_ids: list[str] | None = Field(default=None)
    past_days: int = Field(default=3, ge=0, le=7)
    forecast_days: int = Field(default=5, ge=1, le=7)
    include_fires: bool = True
    build_surfaces: bool = True


@router.post("/admin/refresh")
def v2_refresh(body: RefreshRequest | None = None, _admin: str = Depends(require_admin)) -> dict[str, Any]:
    """Run the ingest + forecast cycle on demand. Requires an admin token.
    The hourly scheduler (``python -m airsight.live.jobs schedule``) runs the
    same cycle automatically."""
    from airsight.live.jobs import JobAlreadyRunning, run_cycle

    req = body or RefreshRequest()
    try:
        with _open_store() as store:
            result = run_cycle(
                store,
                req.city_ids,
                past_days=req.past_days,
                forecast_days=req.forecast_days,
                include_fires=req.include_fires,
                build_surfaces=req.build_surfaces,
            )
    except JobAlreadyRunning:
        raise ApiError(409, "A refresh is already running.", code="refresh_in_progress") from None
    _point_cache.clear()
    return result


class WeatherPush(BaseModel):
    city_ids: list[str] = Field(..., min_length=1, max_length=50)
    # Raw Open-Meteo /v1/forecast JSON (object or list, one entry per city, in order).
    open_meteo: Any


@router.post("/admin/ingest/weather")
def v2_ingest_weather(body: WeatherPush, _admin: str = Depends(require_admin)) -> dict[str, Any]:
    """Accept Open-Meteo weather fetched outside Render (whose shared egress IPs
    get HTTP 429). Requires an admin token. Used by the GitHub Actions job."""
    from airsight.live.ingest import ingest_weather_payload

    try:
        with _open_store() as store:
            return ingest_weather_payload(store, body.open_meteo, [c.lower() for c in body.city_ids])
    except ValueError as exc:
        raise ApiError(422, str(exc), code="bad_weather_payload") from None


class AlertCreate(BaseModel):
    city_id: str = Field(..., min_length=2, max_length=40, pattern=r"^[a-z0-9_-]+$")
    title: str = Field(..., min_length=3, max_length=140)
    detail: str | None = Field(None, max_length=1000)
    severity: Literal["info", "warning", "critical"] = "warning"
    aqi: float | None = Field(None, ge=0, le=500)
    pm25: float | None = Field(None, ge=0, le=2000)
    station_id: str | None = Field(None, max_length=80)


@router.post("/admin/alerts", status_code=201)
def v2_create_alert(body: AlertCreate, admin_key: str = Depends(require_admin)) -> dict[str, Any]:
    """Publish an alert (replaces the unauthenticated /api/v1/alerts/inject)."""
    with _open_store() as store:
        if not store.city(body.city_id):
            raise ApiError(404, "Unknown city.", code="unknown_city")
        alert = store.insert_alert({**body.model_dump(), "source": "manual", "created_by": f"key:{admin_key}"})
    alert.pop("created_by", None)
    return {"alert": alert}


@router.get("/alerts")
def v2_alerts(
    limit: int = Query(20, ge=1, le=100),
    city_id: str | None = Query(None, max_length=40),
) -> dict[str, Any]:
    with _open_store() as store:
        items = store.recent_alerts(limit=limit, city_id=city_id)
    for item in items:
        item.pop("created_by", None)
    return {"generated_at": utcnow(), "n": len(items), "alerts": items}


# ---------------------------------------------------------------------------
# Advice and scenarios (ported from the retired /api/v1/agents/* routes)
# ---------------------------------------------------------------------------


class AdviceRequest(BaseModel):
    city_id: str = Field("raipur", max_length=40)
    pm25: float | None = Field(None, ge=0, le=2000)
    aqi: float | None = Field(None, ge=0, le=500)
    top_source: str | None = Field(None, max_length=40)
    asthma: bool = False
    child: bool = False
    elderly: bool = False


@router.post("/advice")
def v2_advice(body: AdviceRequest) -> dict[str, Any]:
    """Bilingual (EN/HI) health advice. Uses the city's current CPCB AQI when
    ``pm25``/``aqi`` are not supplied."""
    from airsight.rag.advisory import generate_advisory

    pm25, aqi = body.pm25, body.aqi
    evidence: dict[str, Any] = {"basis": "request", "pm25": pm25, "aqi": aqi}
    if pm25 is None and aqi is None:
        with _open_store() as store:
            summary = city_summary(store, body.city_id) or {}
            freshness = store.source_freshness(body.city_id) if summary else {}
        if not summary:
            raise ApiError(404, "Unknown city.", code="unknown_city")
        pm25, aqi = summary.get("pm25_24h") or summary.get("pm25"), summary.get("aqi")
        evidence = {
            "basis": "city_summary",
            "pm25": pm25,
            "pm25_field": "pm25_24h" if summary.get("pm25_24h") is not None else "pm25",
            "aqi": aqi,
            "aqi_basis": "CPCB NAQI",
            # Pass through whatever provenance the summary carries (ts, source, stations).
            "summary": {k: v for k, v in summary.items()
                        if any(t in k for t in ("ts", "source", "station", "updated", "dominant", "measured"))},
            "freshness": freshness,
        }
    evidence["top_source"] = body.top_source
    evidence["profile"] = {"asthma": body.asthma, "child": body.child, "elderly": body.elderly}
    try:
        result = generate_advisory(
            city_id=body.city_id, pm25=pm25, aqi=aqi, top_source=body.top_source,
            asthma=body.asthma, child=body.child, elderly=body.elderly,
        )
    except Exception:  # noqa: BLE001
        log.exception("advice generation failed")
        raise ApiError(503, "Health advice is temporarily unavailable.", code="advice_unavailable") from None
    if isinstance(result, dict):
        result = {**result, "evidence": evidence}
    return _json_clean(result)


@router.post("/scenarios")
def v2_scenarios(body: dict[str, Any]) -> dict[str, Any]:
    """What-if scenario (traffic/industry/dust/fire levers) for a city."""
    from api.schemas_phase5 import WhatIfScenario
    from airsight.whatif.engine import Scenario, run_whatif

    try:
        sc = WhatIfScenario(**(body.get("scenario") or body))
    except Exception:  # noqa: BLE001 - pydantic error text is safe but verbose
        raise ApiError(422, "Scenario parameters are invalid.", code="invalid_request") from None
    try:
        result = run_whatif(Scenario(**sc.model_dump()))
    except Exception:  # noqa: BLE001
        log.exception("scenario failed")
        raise ApiError(503, "Scenario engine is temporarily unavailable.", code="scenario_unavailable") from None
    return _json_clean(result)


def _json_clean(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _json_clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_clean(v) for v in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if hasattr(obj, "item"):
        try:
            return _json_clean(obj.item())
        except Exception:  # noqa: BLE001
            return None
    return obj


def _round(value: Any, digits: int = 1) -> float | None:
    try:
        return None if value is None else round(float(value), digits)
    except (TypeError, ValueError):
        return None
