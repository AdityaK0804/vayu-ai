"""Verify stored forecasts against the measured readings that later arrived.

For each target hour that now has a measured city-mean PM2.5 (CPCB/OpenAQ),
every stored run that predicted it is scored by lead time. Baselines use the
same runs: the CAMS forecast issued in that run, and persistence (the measured
value at issue time). Lead buckets follow the model registry's horizons.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np

from airsight.forecast.service import CAMS_SOURCE, MODEL_SOURCE
from airsight.models.registry import HORIZONS
from airsight.store import Store

MEASURED_SOURCES = ("cpcb", "openaq")


def _hour(ts: str) -> str:
    return ts[:13] + ":00:00Z"


def _measured_by_hour(store: Store, city_id: str, since: str, until: str) -> dict[str, float]:
    acc: dict[str, list[float]] = defaultdict(list)
    for r in store.observations(city_id, since=since, until=until):
        if r.get("source") in MEASURED_SOURCES and r.get("pm25") is not None:
            acc[_hour(r["ts"])].append(float(r["pm25"]))
    return {k: float(np.mean(v)) for k, v in acc.items()}


def _bucket(lead_h: float) -> int | None:
    for h in HORIZONS:
        if 0 < lead_h <= h:
            return h
    return None


def _stats(errors: list[float]) -> dict[str, Any] | None:
    if not errors:
        return None
    e = np.asarray(errors)
    return {"mae": round(float(np.mean(np.abs(e))), 2), "bias": round(float(np.mean(e)), 2)}


def city_skill(store: Store, city_id: str, *, days: int = 7, now: datetime | None = None) -> dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).replace(minute=0, second=0, microsecond=0)
    since = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    until = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    issue_since = (now - timedelta(days=days, hours=max(HORIZONS))).strftime("%Y-%m-%dT%H:%M:%SZ")
    measured = _measured_by_hour(store, city_id, issue_since, until)
    runs = store.forecast_runs(city_id, since=since, until=until, sources=(MODEL_SOURCE, CAMS_SOURCE))
    cams = {(_hour(r["run_ts"]), _hour(r["ts"])): r["pm25"] for r in runs if r["source"] == CAMS_SOURCE}
    per: dict[int, dict[str, list]] = {h: defaultdict(list) for h in HORIZONS}
    versions: set[str] = set()
    for r in runs:
        if r["source"] != MODEL_SOURCE or r.get("pm25") is None:
            continue
        ts, run = _hour(r["ts"]), _hour(r["run_ts"])
        obs = measured.get(ts)
        if obs is None:
            continue
        lead = (datetime.fromisoformat(ts.replace("Z", "+00:00"))
                - datetime.fromisoformat(run.replace("Z", "+00:00"))).total_seconds() / 3600
        b = _bucket(lead)
        if b is None:
            continue
        versions.add(r.get("model_version") or "unknown")
        d = per[b]
        d["model"].append(float(r["pm25"]) - obs)
        if r.get("p10") is not None and r.get("p90") is not None:
            d["inside"].append(float(r["p10"]) <= obs <= float(r["p90"]))
        c = cams.get((run, ts))
        if c is not None:
            d["cams"].append(float(c) - obs)
            d["model_paired"].append(float(r["pm25"]) - obs)
        p = measured.get(run)
        if p is not None:
            d["persistence"].append(p - obs)
            d["model_paired_p"].append(float(r["pm25"]) - obs)
    out = []
    for h in HORIZONS:
        d = per[h]
        out.append({
            "lead_bucket_h": h,
            "n": len(d["model"]),
            "model": _stats(d["model"]),
            "interval_coverage": round(float(np.mean(d["inside"])), 3) if d["inside"] else None,
            "vs_cams": {"n": len(d["cams"]), "model": _stats(d["model_paired"]), "cams": _stats(d["cams"])},
            "vs_persistence": {"n": len(d["persistence"]), "model": _stats(d["model_paired_p"]),
                               "persistence": _stats(d["persistence"])},
        })
    return {"city_id": city_id, "window_days": days, "verified_at": until,
            "measured_hours": sum(1 for k in measured if k >= since),
            "model_versions": sorted(versions), "by_lead": out,
            "note": "Computed live from stored runs; empty until forecasts mature against new readings."}
