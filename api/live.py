"""Live data API — Redis first, TimescaleDB fallback (+ NAQI + freshness)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from airsight.aqi.cpcb_naqi import enrich_station_row
from airsight.live.freshness import attach_row_freshness, freshness, source_last_sync
from services.ingestor import cache, db
from services.ingestor.config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/live", tags=["live"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enrich_stations(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in rows or []:
        try:
            e = enrich_station_row(r)
            e = attach_row_freshness(e)
            out.append(e)
        except Exception as exc:
            log.warning("station enrich failed: %s", exc)
            out.append(attach_row_freshness(dict(r)))
    return out


def _enrich_fires(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [attach_row_freshness(dict(r), ts_keys=("ts", "acq_time", "updated_at")) for r in (rows or [])]


def _envelope(
    *,
    cache_src: str,
    stations: list[dict[str, Any]] | None = None,
    fires: list[dict[str, Any]] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta = cache.get_json(cache.KEY_LAST_SYNC)
    if not isinstance(meta, dict):
        meta = {}
    meteo_raw = cache.get_json(cache.KEY_METEO)
    cams_raw = cache.get_json(cache.KEY_CAMS)
    last_sync = source_last_sync(
        stations=stations,
        fires=fires,
        meteo=meteo_raw if isinstance(meteo_raw, list) else None,
        cams=cams_raw if isinstance(cams_raw, list) else None,
        redis_meta=meta,
    )
    st_meta = last_sync.get("stations") if isinstance(last_sync.get("stations"), dict) else {}
    env = {
        "generated_at": _now(),
        "updated_at": st_meta.get("updated_at") or _now(),
        "source": cache_src,
        "stale_flag": bool(st_meta.get("stale_flag", True)),
        "cache": cache_src,
        "last_sync": last_sync,
        "units": {
            "pm25": "µg/m³",
            "pm10": "µg/m³",
            "no2": "µg/m³",
            "so2": "µg/m³",
            "o3": "µg/m³",
            "co": "mg/m³",
            "aqi": "CPCB NAQI 0–500 (unitless)",
        },
    }
    if extra:
        env.update(extra)
    return env


@router.get("/health")
def live_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "redis": cache.ping_redis(),
        "timescale": db.ping_db(),
        "updated_at": _now(),
        "source": "api",
        "stale_flag": False,
        "ts": _now(),
    }


@router.get("/snapshot")
def live_snapshot() -> dict[str, Any]:
    """Hot snapshot: stations + fires. Redis → DB rebuild. Includes NAQI + last_sync."""
    snap = cache.get_json(cache.KEY_SNAPSHOT)
    cache_src = "redis"
    if not (isinstance(snap, dict) and snap.get("stations") is not None):
        try:
            snap = db.fetch_snapshot_bundle()
            cache_src = "timescale"
            try:
                cfg = get_settings()
                cache.publish_live_bundle(
                    snapshot=snap,
                    stations=snap.get("stations") or [],
                    fires=snap.get("fires") or [],
                    settings=cfg,
                )
            except Exception:
                pass
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"snapshot unavailable: {exc}") from exc

    stations = _enrich_stations(list(snap.get("stations") or []))
    fires = _enrich_fires(list(snap.get("fires") or []))
    env = _envelope(cache_src=cache_src, stations=stations, fires=fires)
    env.update(
        {
            "n_stations": len(stations),
            "n_fires": len(fires),
            "stations": stations,
            "fires": fires,
        }
    )
    return env


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

    enriched = _enrich_stations(list(stations or []))

    virtual: list[dict[str, Any]] = []
    if include_virtual:
        try:
            from airsight.models.virtual_stations import list_virtual_stations

            virtual = list_virtual_stations(observed=enriched)
            virtual = _enrich_stations(virtual)
        except Exception as exc:
            log.warning("virtual stations: %s", exc)

    env = _envelope(cache_src=source, stations=enriched)
    env.update(
        {
            "n": len(enriched),
            "n_virtual": len(virtual),
            "stations": enriched,
            "virtual_stations": virtual,
        }
    )
    return env


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
    enriched = _enrich_fires(list(fires or []))
    env = _envelope(cache_src=source, fires=enriched)
    env.update({"hours": hours, "n": len(enriched), "fires": enriched})
    return env


@router.get("/meteo")
def live_meteo() -> dict[str, Any]:
    data = cache.get_json(cache.KEY_METEO)
    if data is None:
        raise HTTPException(status_code=404, detail="No meteo snapshot in Redis — run ingestor")
    rows = data if isinstance(data, list) else [data]
    enriched = [attach_row_freshness(dict(r)) for r in rows]
    env = _envelope(cache_src="redis")
    env.update({"n": len(enriched), "meteo": enriched, "source": "open-meteo", **freshness(enriched[0].get("ts") if enriched else None, source="open-meteo")})
    return env


@router.get("/cams")
def live_cams() -> dict[str, Any]:
    data = cache.get_json(cache.KEY_CAMS)
    if data is None:
        raise HTTPException(status_code=404, detail="No CAMS snapshot in Redis — run ingestor")
    rows = data if isinstance(data, list) else [data]
    enriched = [attach_row_freshness(dict(r)) for r in rows]
    env = _envelope(cache_src="redis")
    env.update({"n": len(enriched), "cams": enriched, "source": "open-meteo-aq"})
    return env


@router.get("/stream")
async def live_stream():
    """Server-Sent Events (SSE) stream for live alerts and telemetry updates."""
    import asyncio
    import json
    from fastapi.responses import StreamingResponse

    async def event_generator():
        yield f"event: ping\ndata: {json.dumps({'type': 'connected', 'ts': _now()})}\n\n"
        while True:
            try:
                toast = cache.get_json("vayu:ui:toast")
                if toast:
                    yield f"event: alert\ndata: {json.dumps(toast)}\n\n"
                await asyncio.sleep(5)
                yield f"event: ping\ndata: {json.dumps({'type': 'heartbeat', 'ts': _now()})}\n\n"
            except asyncio.CancelledError:
                break
            except Exception as exc:
                log.warning("SSE generator error: %s", exc)
                await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
