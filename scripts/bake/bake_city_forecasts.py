"""Bake multi-city 24/48/72h PM2.5 forecasts from deployed LightGBM models.

For every city with a features parquet (and live feed fallback):
  - Find latest origin t where target weather at t+h exists
  - Predict with data/models/lgbm_pm25_h{24,48,72}.joblib (log1p decode)
  - Optional P10/P50/P90 if quantile models present
  - Attach live PM2.5 and CPCB category

Also embeds korba/jagdalpur grid trajectory (mean over cells per frame)
from existing forecast_frames.json when available.

Output: web/public/data/forecasts_72h.json

Run: python scripts/bake/bake_city_forecasts.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, get_cities, ok, say, warn  # noqa: E402

WEB = ROOT / "web" / "public" / "data"
MODEL_DIR = DATA / "models"
HORIZONS = (24, 48, 72)

_spec = importlib.util.spec_from_file_location(
    "ff", ROOT / "scripts" / "models" / "forecast_features.py"
)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)


def cpcb_cat(pm25: float | None) -> dict:
    if pm25 is None or pm25 != pm25:
        return {"label": "Unknown", "hex": "#606a72"}
    p = float(pm25)
    bands = [
        (30, "Good", "#00c26e"),
        (60, "Satisfactory", "#f2d024"),
        (90, "Moderate", "#fb923c"),
        (120, "Poor", "#e11d48"),
        (250, "Very Poor", "#9333ea"),
        (1e9, "Severe", "#7f1d1d"),
    ]
    for hi, lab, hex_ in bands:
        if p <= hi:
            return {"label": lab, "hex": hex_}
    return {"label": "Severe", "hex": "#7f1d1d"}


def decode(raw: np.ndarray | float, mode: str) -> float:
    x = float(np.asarray(raw).ravel()[0])
    if mode == "log1p":
        return float(np.clip(np.expm1(x), 0, None))
    return float(np.clip(x, 0, None))


def load_models():
    point, quant = {}, {}
    for h in HORIZONS:
        p = MODEL_DIR / f"lgbm_pm25_h{h}.joblib"
        if p.exists():
            point[h] = joblib.load(p)
        for q in ("p10", "p50", "p90"):
            qp = MODEL_DIR / f"lgbm_pm25_h{h}_{q}.joblib"
            if qp.exists():
                quant[(h, q)] = joblib.load(qp)
    return point, quant


def predict_row(bundle, row: pd.Series) -> float:
    feats = bundle["features"]
    X = pd.DataFrame([{f: row[f] if f in row.index else np.nan for f in feats}])[feats]
    X = X.astype(float)
    raw = bundle["model"].predict(X)[0]
    return decode(raw, bundle.get("target_mode", "raw"))


def city_forecasts(pool: pd.DataFrame, sat, curve, point, quant) -> list[dict]:
    out = []
    for cid, g in pool.groupby("city_id", sort=False):
        g = g.sort_values("timestamp")
        city_name = cid
        for c in get_cities(include_optional=True):
            if c["id"] == cid:
                city_name = c["name"]
                break

        horizons = {}
        for h in HORIZONS:
            if h not in point:
                continue
            try:
                samples = ff.build_samples(g, sat, h, traffic_curve=curve)
            except Exception as e:
                warn(f"{cid} h={h}: {e}")
                continue
            if samples.empty:
                continue
            # latest origin that still has target-time features
            samples = samples.sort_values("timestamp")
            row = samples.iloc[-1]
            bundle = point[h]
            pred = predict_row(bundle, row)
            entry = {
                "horizon_h": h,
                "origin": str(row["timestamp"]),
                "valid_time": str(row["target_time"]),
                "pred_pm25": round(pred, 1),
                "actual_pm25": round(float(row["y"]), 1) if pd.notna(row.get("y")) else None,
                "pm25_lag0": round(float(row["pm25_lag0"]), 1) if pd.notna(row.get("pm25_lag0")) else None,
                "cams_target": round(float(row["cams_target"]), 1) if "cams_target" in row.index and pd.notna(row.get("cams_target")) else None,
                "cpcb": cpcb_cat(pred),
            }
            # quantiles
            for q in ("p10", "p50", "p90"):
                bq = quant.get((h, q))
                if bq:
                    entry[q] = round(predict_row(bq, row), 1)
            horizons[str(h)] = entry

        if not horizons:
            continue

        last = g[g.pm25.notna()].iloc[-1] if g.pm25.notna().any() else g.iloc[-1]
        live_pm = float(last["pm25"]) if pd.notna(last.get("pm25")) else None
        out.append({
            "city_id": cid,
            "city_name": city_name,
            "has_stations": "pm25" in g.columns and g.pm25.notna().any(),
            "latest_observed_pm25": round(live_pm, 1) if live_pm is not None else None,
            "latest_observed_time": str(last["timestamp"]) if "timestamp" in last.index else None,
            "latest_cpcb": cpcb_cat(live_pm),
            "horizons": horizons,
            "model": "LightGBM v2.1 log1p · one model per horizon",
            "n_features": len(point[24]["features"]) if 24 in point else None,
        })
        say(f"{cid}: horizons {list(horizons.keys())} latest_obs={live_pm}")
    return out


def attach_live(cities: list[dict]) -> list[dict]:
    live_p = WEB / "live" / "latest.json"
    if not live_p.exists():
        return cities
    live = {r["city_id"]: r for r in json.loads(live_p.read_text(encoding="utf-8"))}
    for c in cities:
        lv = live.get(c["city_id"])
        if not lv:
            continue
        c["live"] = {
            "pm25": lv.get("current_pm25") or lv.get("measured_pm25_24h"),
            "us_aqi": lv.get("current_us_aqi") or lv.get("measured_us_aqi"),
            "measured": lv.get("measured"),
            "updated": lv.get("updated"),
            "n_stations": lv.get("n_stations"),
        }
        # if no historical features city, still show live
        if c.get("latest_observed_pm25") is None and c["live"]["pm25"] is not None:
            c["latest_observed_pm25"] = c["live"]["pm25"]
            c["latest_cpcb"] = cpcb_cat(c["live"]["pm25"])
    return cities


def grid_trajectory(city_id: str) -> dict | None:
    p = WEB / city_id / "forecast_frames.json"
    if not p.exists():
        return None
    # stream parse lightly
    d = json.loads(p.read_text(encoding="utf-8"))
    ts = d.get("timestamps") or []
    cells = d.get("cells") or []
    if not ts or not cells:
        return None
    n = len(ts)
    means = []
    for i in range(n):
        vals = [c["v"][i] for c in cells if i < len(c.get("v", []))]
        means.append(round(float(np.mean(vals)), 1) if vals else None)
    return {
        "city_id": city_id,
        "origin": d.get("origin"),
        "timestamps": ts,
        "frame_step_hours": d.get("frame_step_hours", 6),
        "grid_mean_pm25": means,
        "n_cells": d.get("n_cells"),
        "threshold_ug_m3": d.get("threshold_ug_m3", 60),
    }


def metrics_block() -> dict:
    p = WEB / "korba" / "metrics.json"
    if not p.exists():
        return {}
    m = json.loads(p.read_text(encoding="utf-8"))
    return {
        "model_version": m.get("model_version"),
        "forecast_vs_baselines": m.get("forecast_vs_baselines"),
        "headline": m.get("headline"),
    }


def main() -> None:
    print("=" * 80)
    print("BAKE multi-city 72h forecasts from trained LGBM")
    print("=" * 80)

    point, quant = load_models()
    if not point:
        sys.exit("no point models in data/models/")
    say(f"point models: {sorted(point)}  quantiles: {len(quant)}")

    # use the same station-mapped pool the trainer uses (has station_id + split)
    pool_pm, per_city = ff.load_pool()
    pool_pm = ff.mark_split(pool_pm)
    say(f"training pool rows={len(pool_pm):,} cities={list(per_city)}")
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()

    cities = city_forecasts(pool_pm, sat, curve, point, quant)
    cities = attach_live(cities)

    traj = {}
    for cid in ("korba", "jagdalpur"):
        t = grid_trajectory(cid)
        if t:
            traj[cid] = t
            say(f"grid traj {cid}: {len(t['timestamps'])} frames")

    # ensure jagdalpur present; fill horizons from grid trajectory if no lag model
    ids = {c["city_id"] for c in cities}
    for city in get_cities(include_optional=True):
        if city["id"] in ids:
            continue
        horizons = {}
        tr = traj.get(city["id"])
        if tr and tr.get("grid_mean_pm25"):
            step = int(tr.get("frame_step_hours") or 6)
            means = tr["grid_mean_pm25"]
            ts = tr["timestamps"]
            for h in HORIZONS:
                idx = min(len(means) - 1, max(0, h // step))
                pred = means[idx]
                horizons[str(h)] = {
                    "horizon_h": h,
                    "origin": tr.get("origin"),
                    "valid_time": ts[idx] if idx < len(ts) else None,
                    "pred_pm25": pred,
                    "actual_pm25": None,
                    "pm25_lag0": means[0],
                    "cams_target": None,
                    "cpcb": cpcb_cat(pred),
                    "source": "spatial_grid_trajectory",
                }
        cities.append({
            "city_id": city["id"],
            "city_name": city["name"],
            "has_stations": False,
            "latest_observed_pm25": None,
            "latest_observed_time": None,
            "latest_cpcb": cpcb_cat(None),
            "horizons": horizons,
            "model": "spatial grid bake (zero-station path)",
            "n_features": None,
            "note": "zero-station reveal — no CPCB lags",
        })
    cities = attach_live(cities)

    payload = {
        "version": "v2.1",
        "horizons_h": list(HORIZONS),
        "model_note": "LightGBM one model per horizon; target log1p(pm25); features include fire + met@t+h",
        "proof": metrics_block(),
        "cities": sorted(cities, key=lambda c: c["city_name"]),
        "grid_trajectories": traj,
    }
    out = ensure(WEB) / "forecasts_72h.json"
    def _jsonable(o):
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(type(o))

    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=_jsonable),
        encoding="utf-8",
    )
    ok(f"wrote {out.relative_to(ROOT)} · {len(cities)} cities")


if __name__ == "__main__":
    main()
