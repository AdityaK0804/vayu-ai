"""Live data API — Redis first, TimescaleDB fallback (+ virtual stations)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from services.ingestor import cache, db
from services.ingestor.config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/live", tags=["live"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/health")
def live_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "redis": cache.ping_redis(),
        "timescale": db.ping_db(),
        "ts": _now(),
    }


@router.get("/snapshot")
def live_snapshot() -> dict[str, Any]:
    """Hot snapshot: stations + fires. Redis → DB rebuild."""
    snap = cache.get_json(cache.KEY_SNAPSHOT)
    if isinstance(snap, dict) and snap.get("stations") is not None:
        snap["cache"] = "redis"
        return snap
    try:
        bundle = db.fetch_snapshot_bundle()
        bundle["cache"] = "timescale"
        try:
            cfg = get_settings()
            cache.publish_live_bundle(
                snapshot=bundle,
                stations=bundle.get("stations") or [],
                fires=bundle.get("fires") or [],
                settings=cfg,
            )
        except Exception:
            pass
        return bundle
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"snapshot unavailable: {exc}") from exc


@router.get("/stations")
def live_stations(
    include_virtual: bool = Query(True, description="Include model-calibrated soft stations"),
) -> dict[str, Any]:
    stations = cache.get_json(cache.KEY_STATIONS)
    source = "redis"
    if stations is None:
        try:
            stations = db.fetch_latest_stations()
            source = "timescale"
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"stations unavailable: {exc}") from exc

    virtual: list[dict[str, Any]] = []
    if include_virtual:
        try:
            from airsight.models.virtual_stations import list_virtual_stations

            virtual = list_virtual_stations(observed=stations if isinstance(stations, list) else [])
        except Exception as exc:
            log.warning("virtual stations: %s", exc)

    return {
        "generated_at": _now(),
        "cache": source,
        "n": len(stations or []),
        "n_virtual": len(virtual),
        "stations": stations or [],
        "virtual_stations": virtual,
    }


@router.get("/fires")
def live_fires(hours: int = Query(48, ge=1, le=168)) -> dict[str, Any]:
    fires = cache.get_json(cache.KEY_FIRES)
    source = "redis"
    if fires is None:
        try:
            fires = db.fetch_recent_fires(hours=hours)
            source = "timescale"
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"fires unavailable: {exc}") from exc
    return {
        "generated_at": _now(),
        "cache": source,
        "hours": hours,
        "n": len(fires or []),
        "fires": fires or [],
    }


@router.get("/meteo")
def live_meteo() -> dict[str, Any]:
    data = cache.get_json(cache.KEY_METEO)
    if data is None:
        raise HTTPException(status_code=404, detail="No meteo snapshot in Redis — run ingestor")
    return {
        "generated_at": _now(),
        "cache": "redis",
        "n": len(data) if isinstance(data, list) else 1,
        "meteo": data,
    }


@router.get("/cams")
def live_cams() -> dict[str, Any]:
    data = cache.get_json(cache.KEY_CAMS)
    if data is None:
        raise HTTPException(status_code=404, detail="No CAMS snapshot in Redis — run ingestor")
    return {
        "generated_at": _now(),
        "cache": "redis",
        "n": len(data) if isinstance(data, list) else 1,
        "cams": data,
    }
