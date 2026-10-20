"""Hourly refresh job: ingest -> surfaces -> forecasts, with freshness logging.

Entrypoints
-----------
* ``python -m airsight.live.jobs once``      one cycle, exit code 0/1 (cron-ready)
* ``python -m airsight.live.jobs schedule``  long-running worker, runs at minute
  ``VAYU_INGEST_MINUTE`` (default 7) of every hour and once at start-up.

Used by ``POST /api/v2/admin/refresh`` too, so the button and the schedule do
exactly the same work. A process-level lock prevents overlapping runs.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

from airsight.store import Store, utcnow

log = logging.getLogger("vayu.jobs")

_run_lock = threading.Lock()


class JobAlreadyRunning(RuntimeError):
    pass


def run_cycle(
    store: Store | None = None,
    city_ids: Sequence[str] | None = None,
    *,
    past_days: int = 2,
    forecast_days: int = 5,
    include_fires: bool = True,
    build_surfaces: bool = True,
    forecast_hours: int = 72,
) -> dict[str, Any]:
    """One full refresh. Never raises for a single city or source failing."""
    if not _run_lock.acquire(blocking=False):
        raise JobAlreadyRunning("a refresh is already in progress")
    own = store is None
    store = store or Store.open()
    started = utcnow()
    try:
        from airsight.forecast.service import forecast_city
        from airsight.live.ingest import ingest_cities

        summary = ingest_cities(
            store,
            list(city_ids) if city_ids else None,
            past_days=past_days,
            forecast_days=forecast_days,
            include_fires=include_fires,
            build_surfaces=build_surfaces,
        )
        forecasts = []
        n_fc_ok = 0
        for row in summary.get("cities", []):
            if not row.get("ok"):
                continue
            try:
                f = forecast_city(store, row["city_id"], hours=forecast_hours)
                n_fc_ok += int(bool(f.get("available")))
                forecasts.append({
                    "city_id": row["city_id"],
                    "available": bool(f.get("available")),
                    "model_version": f.get("model_version"),
                    "n_hours": len(f.get("hourly") or []),
                })
            except Exception:  # noqa: BLE001
                log.exception("forecast failed for %s", row["city_id"])
                forecasts.append({"city_id": row["city_id"], "available": False})
        store.log_ingest(
            "forecast",
            "ok" if n_fc_ok else "error",
            rows=n_fc_ok,
            detail=f"{n_fc_ok}/{len(forecasts)} city forecasts",
            started_at=started,
        )
        # Client-safe summary (per-city error strings stay in the server log).
        return {
            "ok": bool(summary.get("ok")),
            "started_at": started,
            "finished_at": utcnow(),
            "n_cities": summary.get("n_cities", 0),
            "n_ok": summary.get("n_ok", 0),
            "cities": [
                {"city_id": c.get("city_id"), "ok": bool(c.get("ok"))} for c in summary.get("cities", [])
            ],
            "fires": {k: (summary.get("fires") or {}).get(k) for k in ("status", "stored", "n")},
            "forecasts": forecasts,
            "freshness": store.source_freshness(),
        }
    finally:
        if own:
            store.close()
        _run_lock.release()


def _next_run(now: datetime, minute: int) -> datetime:
    target = now.replace(minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(hours=1)
    return target


def schedule_forever(minute: int | None = None, *, run_at_start: bool = True) -> None:
    """Simple dependency-free hourly loop (no APScheduler needed)."""
    minute = int(os.environ.get("VAYU_INGEST_MINUTE", "7") if minute is None else minute) % 60
    stop = threading.Event()

    def _stop(*_: Any) -> None:
        log.info("scheduler stopping")
        stop.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _stop)
        except ValueError:  # not main thread
            pass

    first = True
    while not stop.is_set():
        if not (first and run_at_start):
            now = datetime.now(timezone.utc)
            wait = (_next_run(now, minute) - now).total_seconds()
            log.info("next refresh in %.0f s", wait)
            if stop.wait(wait):
                break
        first = False
        t0 = time.time()
        try:
            res = run_cycle()
            log.info("refresh ok=%s cities=%s/%s in %.1fs", res["ok"], res["n_ok"], res["n_cities"], time.time() - t0)
        except JobAlreadyRunning:
            log.warning("previous refresh still running; skipped")
        except Exception:  # noqa: BLE001 - the worker must survive a bad cycle
            log.exception("refresh cycle failed")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Vayu hourly ingest job")
    parser.add_argument("mode", choices=["once", "schedule"], nargs="?", default="once")
    parser.add_argument("--cities", help="comma-separated city ids")
    parser.add_argument("--no-fires", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if args.mode == "schedule":
        schedule_forever()
        return 0
    ids = [c.strip() for c in (args.cities or "").split(",") if c.strip()] or None
    res = run_cycle(city_ids=ids, include_fires=not args.no_fires)
    log.info("refresh ok=%s cities=%s/%s", res["ok"], res["n_ok"], res["n_cities"])
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
