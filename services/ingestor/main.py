"""Live ingestion service — scheduled multi-source loop.

Run:
  python -m services.ingestor.main
  python -m services.ingestor.main --once
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# repo root on path
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.ingestor import cache, db, sources
from services.ingestor.config import Settings, get_settings
from services.ingestor.models import IngestResult

log = logging.getLogger("vayu.ingestor")


async def _to_thread(fn, *args, **kwargs):
    return await asyncio.to_thread(fn, *args, **kwargs)


async def job_stations(settings: Settings) -> IngestResult:
    started = datetime.now(timezone.utc)
    try:
        rows, detail = await _to_thread(sources.fetch_openaq_stations, settings)
        n = await _to_thread(db.write_station_readings, rows, settings) if rows else 0
        # refresh redis from DB bundle
        bundle = await _to_thread(db.fetch_snapshot_bundle, settings)
        await _to_thread(
            cache.publish_live_bundle,
            snapshot=bundle,
            stations=bundle.get("stations") or [],
            fires=bundle.get("fires") or [],
            settings=settings,
        )
        status = "ok" if n else "degraded"
        res = IngestResult(source="stations", status=status, rows_written=n, detail=detail, started_at=started)
    except Exception as exc:
        log.exception("stations job failed")
        res = IngestResult(
            source="stations",
            status="error",
            rows_written=0,
            detail=str(exc),
            started_at=started,
            finished_at=datetime.now(timezone.utc),
        )
    res.finished_at = datetime.now(timezone.utc)
    await _to_thread(db.log_ingest_run, res.source, res.status, res.rows_written, res.detail, settings)
    log.info("stations %s rows=%s %s", res.status, res.rows_written, res.detail)
    return res


async def job_meteo(settings: Settings) -> IngestResult:
    started = datetime.now(timezone.utc)
    try:
        rows, detail = await _to_thread(sources.fetch_open_meteo, settings)
        # meteo is cached in Redis (no dedicated hypertable in 4.1 schema)
        payload = [r.model_dump(mode="json") for r in rows]
        await _to_thread(cache.set_json, cache.KEY_METEO, payload, settings.redis_ttl_snapshot_s, settings)
        status = "ok" if rows else "degraded"
        res = IngestResult(source="meteo", status=status, rows_written=len(rows), detail=detail, started_at=started)
    except Exception as exc:
        log.exception("meteo job failed")
        res = IngestResult(source="meteo", status="error", detail=str(exc), started_at=started)
    res.finished_at = datetime.now(timezone.utc)
    await _to_thread(db.log_ingest_run, res.source, res.status, res.rows_written, res.detail, settings)
    log.info("meteo %s rows=%s %s", res.status, res.rows_written, res.detail)
    return res


async def job_fires(settings: Settings) -> IngestResult:
    started = datetime.now(timezone.utc)
    try:
        rows, detail = await _to_thread(sources.fetch_firms, settings)
        n = await _to_thread(db.write_fire_events, rows, settings) if rows else 0
        fires = await _to_thread(db.fetch_recent_fires, 48, 500, settings)
        await _to_thread(cache.set_json, cache.KEY_FIRES, fires, settings.redis_ttl_snapshot_s, settings)
        # update snapshot fires field
        snap = await _to_thread(cache.get_json, cache.KEY_SNAPSHOT, settings) or {}
        if isinstance(snap, dict):
            snap["fires"] = fires
            snap["n_fires"] = len(fires)
            snap["generated_at"] = datetime.now(timezone.utc).isoformat()
            await _to_thread(cache.set_json, cache.KEY_SNAPSHOT, snap, settings.redis_ttl_snapshot_s, settings)
        status = "ok" if n else "degraded"
        res = IngestResult(source="fires", status=status, rows_written=n, detail=detail, started_at=started)
    except Exception as exc:
        log.exception("fires job failed")
        res = IngestResult(source="fires", status="error", detail=str(exc), started_at=started)
    res.finished_at = datetime.now(timezone.utc)
    await _to_thread(db.log_ingest_run, res.source, res.status, res.rows_written, res.detail, settings)
    log.info("fires %s rows=%s %s", res.status, res.rows_written, res.detail)
    return res


async def job_cams(settings: Settings) -> IngestResult:
    started = datetime.now(timezone.utc)
    try:
        rows, detail = await _to_thread(sources.fetch_cams_proxy, settings)
        payload = [r.model_dump(mode="json") for r in rows]
        await _to_thread(cache.set_json, cache.KEY_CAMS, payload, settings.redis_ttl_snapshot_s, settings)
        # also upsert CAMS pm25 as virtual-ish station rows for calibration
        from services.ingestor.models import StationReadingIn

        station_rows = [
            StationReadingIn(
                ts=r.ts,
                station_id=f"cams:{r.city_id}",
                city_id=r.city_id,
                source="cams",
                pm25=r.pm25,
                no2=r.no2,
                lat=r.lat,
                lon=r.lon,
                aqi_basis="model",
            )
            for r in rows
            if r.pm25 is not None
        ]
        n = await _to_thread(db.write_station_readings, station_rows, settings) if station_rows else 0
        status = "ok" if rows else "degraded"
        res = IngestResult(
            source="cams",
            status=status,
            rows_written=n,
            detail=detail,
            started_at=started,
        )
    except Exception as exc:
        log.exception("cams job failed")
        res = IngestResult(source="cams", status="error", detail=str(exc), started_at=started)
    res.finished_at = datetime.now(timezone.utc)
    await _to_thread(db.log_ingest_run, res.source, res.status, res.rows_written, res.detail, settings)
    log.info("cams %s rows=%s %s", res.status, res.rows_written, res.detail)
    return res


async def run_once(settings: Settings | None = None) -> dict:
    cfg = settings or get_settings()
    results = await asyncio.gather(
        job_stations(cfg),
        job_meteo(cfg),
        job_fires(cfg),
        job_cams(cfg),
        return_exceptions=True,
    )
    out = {}
    for r in results:
        if isinstance(r, Exception):
            log.error("job exception: %s", r)
            continue
        out[r.source] = r.model_dump(mode="json")
    # final snapshot after all writers finished
    try:
        bundle = await _to_thread(db.fetch_snapshot_bundle, cfg)
        meteo = await _to_thread(cache.get_json, cache.KEY_METEO, cfg)
        cams = await _to_thread(cache.get_json, cache.KEY_CAMS, cfg)
        await _to_thread(
            cache.publish_live_bundle,
            snapshot=bundle,
            stations=bundle.get("stations") or [],
            fires=bundle.get("fires") or [],
            meteo=meteo if isinstance(meteo, list) else None,
            cams=cams if isinstance(cams, list) else None,
            settings=cfg,
        )
    except Exception as exc:
        log.warning("final snapshot publish failed: %s", exc)
    return out


async def run_scheduler(settings: Settings | None = None) -> None:
    cfg = settings or get_settings()
    log.info("starting scheduler db=%s redis=%s", cfg.database_url.split("@")[-1], cfg.redis_url)
    if not db.ping_db(cfg):
        log.error("database unreachable — will still schedule and retry")
    if not cache.ping_redis(cfg):
        log.error("redis unreachable — will still schedule and retry")

    # initial catch-up
    await run_once(cfg)

    sched = AsyncIOScheduler()
    sched.add_job(job_stations, "interval", seconds=cfg.interval_stations_s, args=[cfg], id="stations", max_instances=1)
    sched.add_job(job_meteo, "interval", seconds=cfg.interval_meteo_s, args=[cfg], id="meteo", max_instances=1)
    sched.add_job(job_fires, "interval", seconds=cfg.interval_fires_s, args=[cfg], id="fires", max_instances=1)
    sched.add_job(job_cams, "interval", seconds=cfg.interval_cams_s, args=[cfg], id="cams", max_instances=1)
    sched.start()
    log.info("scheduler running — Ctrl+C to stop")
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit):
        sched.shutdown(wait=False)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vayu live ingestor")
    parser.add_argument("--once", action="store_true", help="run all jobs once and exit")
    parser.add_argument("--log-level", default=None)
    args = parser.parse_args(argv)

    cfg = get_settings()
    level = args.log_level or cfg.log_level
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.once:
        out = asyncio.run(run_once(cfg))
        import json

        print(json.dumps(out, indent=2, default=str))
        return 0

    asyncio.run(run_scheduler(cfg))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
