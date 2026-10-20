"""Upwind satellite fire power (FIRMS FRP) feature, shared by training and serving.

For an issue time t and a station at (lat0, lon0):

    fire_frp_upwind(t) = sum of FRP [MW] over FIRMS detections with
        t - window_h < acq_time <= t,
        great-circle distance <= radius_km,
        bearing station->fire within +/- sector_deg/2 of the wind-FROM
        direction (10 m) at t,
    after collapsing detections at the same ~100 m location within the window
    to their max FRP (the dedupe live ingest applies).

All parameters come from config/live_sources.yaml -> firms.upwind_feature.
scripts/train_clean.py and forecast.service call the same function.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml

from airsight.config import CONFIG

FEATURE = "fire_frp_upwind"
_CFG = Path(CONFIG) / "live_sources.yaml"
EARTH_KM = 6371.0


def params(cfg_path: Path = _CFG) -> dict[str, float]:
    p = yaml.safe_load(cfg_path.read_text())["firms"]["upwind_feature"]
    return {k: float(p[k]) for k in ("window_h", "radius_km", "sector_deg")}


def _dist_bearing(lat0: float, lon0: float, lat: np.ndarray, lon: np.ndarray):
    p0, p1 = np.radians(lat0), np.radians(lat)
    dl = np.radians(lon - lon0)
    a = np.sin((p1 - p0) / 2) ** 2 + np.cos(p0) * np.cos(p1) * np.sin(dl / 2) ** 2
    dist = 2 * EARTH_KM * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    y = np.sin(dl) * np.cos(p1)
    x = np.cos(p0) * np.sin(p1) - np.sin(p0) * np.cos(p1) * np.cos(dl)
    return dist, (np.degrees(np.arctan2(y, x)) + 360.0) % 360.0


def upwind_frp(fires: pd.DataFrame, lat0: float, lon0: float, issue_ts: Any,
               wind_from_deg: Any, *, window_h: float, radius_km: float,
               sector_deg: float) -> np.ndarray:
    """Feature value per issue time. fires: columns ts (UTC), lat, lon, frp."""
    issue = pd.DatetimeIndex(pd.to_datetime(issue_ts, utc=True))
    wd = np.asarray(wind_from_deg, dtype=float).reshape(-1)
    out = np.zeros(len(issue))
    if fires is None or len(fires) == 0 or len(issue) == 0:
        return out
    f = fires.dropna(subset=["lat", "lon"])
    lat, lon = f["lat"].to_numpy(float), f["lon"].to_numpy(float)
    dist, brg = _dist_bearing(lat0, lon0, lat, lon)
    near = dist <= radius_km
    if not near.any():
        return out
    ts = pd.to_datetime(f["ts"], utc=True).dt.tz_convert(None).to_numpy()[near].astype("datetime64[s]").astype(np.int64)
    frp = np.nan_to_num(f["frp"].to_numpy(float)[near], nan=0.0)
    brg = brg[near]
    loc = (np.round(lat[near], 3) * 1e4).astype(np.int64) * 10**8 + (np.round(lon[near], 3) * 1e4).astype(np.int64)
    order = np.argsort(ts, kind="stable")
    ts, frp, brg, loc = ts[order], frp[order], brg[order], loc[order]
    t_issue = issue.tz_convert(None).to_numpy().astype("datetime64[s]").astype(np.int64)
    w = int(window_h * 3600)
    hi = np.searchsorted(ts, t_issue, side="right")
    lo = np.searchsorted(ts, t_issue - w, side="right")
    half = sector_deg / 2.0
    for i in range(len(issue)):
        a, b = lo[i], hi[i]
        if a >= b or not np.isfinite(wd[i]):
            out[i] = 0.0 if a >= b else np.nan
            continue
        if half < 180.0:
            diff = np.abs((brg[a:b] - wd[i] + 180.0) % 360.0 - 180.0)
            m = diff <= half
        else:
            m = np.ones(b - a, bool)
        if not m.any():
            continue
        _, inv = np.unique(loc[a:b][m], return_inverse=True)
        mx = np.zeros(inv.max() + 1)
        np.maximum.at(mx, inv, frp[a:b][m])
        out[i] = float(mx.sum())
    return out
