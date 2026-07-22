"""Offline bake: produce the static JSON the frontend reads.

The frontend NEVER runs the model or calls an API - it reads these files off disk.
That is the demo-wifi contract and the "offline bake" box in the architecture.

Per city (korba = hero, jagdalpur = reveal), writes to web/public/data/<city>/:
  forecast_frames.json  per-cell predicted pm25 over a 72h slider (grid field from
                        the spatial model; korba also carries its trained lag-model
                        forecast at the real station cells)
  attribution.json      source shares for the top cells at the demo hour
  priority_wards.json   ranked enforcement dossiers
  stations.json         real station coords + latest reading (jagdalpur: empty)
  metrics.json          headline proof-panel numbers

Run:  python scripts/bake/bake_demo_data.py
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
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / "models" / fname)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _load("fc", "01_forecast_lgbm.py")
ENF = _load("enf", "04_enforcement.py")

WEB = ROOT / "web" / "public" / "data"
FRAME_STEP_H = 6          # slider frame spacing
FRAME_HOURS = 72          # horizon
CITIES = {"korba": "hero", "jagdalpur": "reveal"}


def _round(x, n=1):
    try:
        return round(float(x), n)
    except (TypeError, ValueError):
        return None


def city_hourly(city_id: str) -> pd.DataFrame:
    """One row per hour of city-level weather + cams (every cell shares it)."""
    d = pd.read_parquet(DATA / "processed" / f"{city_id}_features.parquet")
    cols = [c for c in FC.WEATHER if c in d.columns] + ["cams_pm25"]
    return (d[["timestamp"] + cols].drop_duplicates("timestamp")
            .set_index("timestamp").sort_index())


def demo_origin(city_id: str) -> pd.Timestamp:
    """Worst-air hour (max CAMS) that still has 72h of data after it - a data-driven
    'bad day' the slider can run forward from."""
    h = city_hourly(city_id)
    cutoff = h.index.max() - pd.Timedelta(hours=FRAME_HOURS)
    cand = h[h.index <= cutoff]
    return cand.cams_pm25.idxmax()


def bake_forecast_frames(city_id: str, origin: pd.Timestamp) -> dict:
    model, feats = ENF._spatial_model()
    grid = ENF._grid(city_id).copy()
    hourly = city_hourly(city_id)
    stamps = [origin + pd.Timedelta(hours=k) for k in range(0, FRAME_HOURS + 1, FRAME_STEP_H)]

    # predict the full grid field at each frame; static per-cell is constant, only
    # weather/cams/calendar change frame to frame
    for c in ("sat_aod", "sat_no2", "sat_so2"):
        if c not in grid.columns:
            grid[c] = np.nan
    values = {int(i): [] for i in range(len(grid))}
    used_stamps = []
    for ts in stamps:
        idx = hourly.index.get_indexer([ts], method="nearest")[0]
        wx = hourly.iloc[idx]
        used_stamps.append(pd.Timestamp(hourly.index[idx]))
        for k in [c for c in FC.WEATHER if c in hourly.columns] + ["cams_pm25"]:
            grid[k] = wx[k]
        grid["hour"], grid["dow"] = ts.hour, ts.dayofweek
        grid["month"], grid["is_weekend"] = ts.month, int(ts.dayofweek >= 5)
        pred = np.clip(model.predict(grid[feats]), 0, None)
        for i, v in enumerate(pred):
            values[i].append(int(round(v)))

    cells = [{"c": row.cell_id, "lat": _round(row.lat, 4), "lon": _round(row.lon, 4),
              "v": values[i]} for i, row in grid.reset_index(drop=True).iterrows()]

    out = {
        "city": city_id,
        "grid_model": "spatial_no_lag",
        "origin": str(origin),
        "timestamps": [str(s) for s in used_stamps],
        "frame_step_hours": FRAME_STEP_H,
        "threshold_ug_m3": ENF.CPCB_PM25_24H,
        "n_cells": len(cells),
        "cells": cells,
    }

    # korba: attach the REAL trained lag-model forecast at the station cells, so
    # the hero city shows its actual t+24/48/72 skill, not just the spatial field.
    if city_id == "korba":
        out["station_forecast"] = _hero_station_forecast(origin)
        out["station_forecast_model"] = "trained_lgbm_lag (h=24/48/72)"
    return out


def _decode_pm25(raw: float, target_mode: str) -> float:
    """Map model output back to µg/m³ (v2.1 champions use log1p)."""
    if target_mode == "log1p":
        return float(np.clip(np.expm1(raw), 0, None))
    return float(np.clip(raw, 0, None))


def _hero_station_forecast(origin: pd.Timestamp) -> list:
    """Trained lag-model prediction at korba's station cells for h=24/48/72."""
    pool, sat = ENF._STATE["pool"], FC.load_satellite()
    sub = pool[pool.city_id == "korba"].copy()
    if "split" not in sub.columns:      # build_samples expects it; not filtered here
        sub["split"] = "train"
    # v2 feature builder accepts optional traffic_curve; fall back if older API
    try:
        import importlib.util
        _ff = Path(__file__).resolve().parents[1] / "models" / "forecast_features.py"
        if _ff.exists():
            spec = importlib.util.spec_from_file_location("ff_bake", _ff)
            ff = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(ff)
            curve = ff.build_congestion_curve()
        else:
            curve = None
    except Exception:
        curve = None
    frames = []
    for h in (24, 48, 72):
        bundle = joblib.load(DATA / "models" / f"lgbm_pm25_h{h}.joblib")
        try:
            samples = FC.build_samples(sub, sat, h, traffic_curve=curve)
        except TypeError:
            samples = FC.build_samples(sub, sat, h)
        samples["cell_id"] = samples.station_id.map(
            {r.station_id: __import__("h3").latlng_to_cell(r.latitude, r.longitude, FC.H3_RES)
             for _, r in pd.read_csv(ROOT / "config" / "stations.csv").iterrows()})
        at = samples[samples.timestamp == origin]
        if at.empty:
            at = samples.iloc[[(samples.timestamp - origin).abs().argmin()]]
        mode = bundle.get("target_mode", "raw")
        feats = bundle["features"]
        for _, row in at.iterrows():
            X = pd.DataFrame([{f: row[f] if f in row.index else np.nan for f in feats}])[feats]
            X = X.astype(float)
            raw = float(bundle["model"].predict(X)[0])
            pred = _decode_pm25(raw, mode)
            frames.append({"cell": row.cell_id, "horizon_h": h,
                           "valid_time": str(pd.Timestamp(row.target_time)),
                           "pred_pm25": _round(pred), "actual_pm25": _round(row.y),
                           "target_mode": mode})
    return frames


def bake_attribution(dossiers: list) -> dict:
    """Slim per-cell attribution for the top cells (from the enforcement dossiers)."""
    return {"cells": [{
        "cell": d["cell"], "ward": d["ward"], "lat": d["lat"], "lon": d["lon"],
        "predicted_pm25": d["predicted_pm25"], "top_source": d["top_source"],
        "shares": d["attribution_shares"], "confidence": d["confidence"],
        "edgar_top": d["edgar_agreement"]["edgar_top"],
        "edgar_match": d["edgar_agreement"]["match"],
        "named_upwind_source": d["named_upwind_source"],
    } for d in dossiers]}


def bake_stations(city_id: str) -> dict:
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    st = st[st.city_id == city_id]
    if st.empty:
        return {"city": city_id, "has_stations": False, "stations": [],
                "note": "zero-station city - predicted blind (the reveal)"}
    import h3
    proc = pd.read_parquet(DATA / "processed" / f"{city_id}_features.parquet")
    out = []
    for _, r in st.iterrows():
        cell = h3.latlng_to_cell(r.latitude, r.longitude, FC.H3_RES)
        cser = proc[(proc.cell_id == cell) & proc.pm25.notna()].sort_values("timestamp")
        latest = cser.iloc[-1] if len(cser) else None
        out.append({
            "station_id": r.station_id, "name": r.station_name,
            "lat": _round(r.latitude, 5), "lon": _round(r.longitude, 5),
            "latest_pm25": _round(latest.pm25) if latest is not None else None,
            "latest_time": str(latest.timestamp) if latest is not None else None,
            "use_in_training": bool(r.get("use_in_training", True)),
        })
    return {"city": city_id, "has_stations": True, "stations": out}


def bake_metrics(city_id: str) -> dict:
    def rd(name):
        p = DATA / "processed" / name
        return json.loads(p.read_text()) if p.exists() else {}

    bm = rd("baseline_metrics.json")
    fm = rd("forecast_metrics.json")
    fm21 = rd("forecast_metrics_v21.json")
    lm = rd("loso_metrics.json")
    qm = rd("quantile_metrics.json")
    v1 = rd("forecast_metrics_v1_baseline.json")

    # Prefer v2.1 champions; fall back to forecast_metrics.results
    champ_list = fm21.get("champions") or fm.get("results") or []
    fres = {r["horizon_h"]: r for r in champ_list}
    bres = {r["horizon_h"]: r for r in bm.get("results", [])}
    v1res = {r["horizon_h"]: r for r in v1.get("results", [])}
    qres = {r["horizon_h"]: r for r in qm.get("results", [])}

    rows_per_city = (
        fm21.get("rows_per_city")
        or fm.get("rows_per_city")
        or v1.get("rows_per_city")
        or {}
    )

    horizons = []
    for h in (24, 48, 72):
        f, b = fres.get(h, {}), bres.get(h, {})
        old = v1res.get(h, {})
        q = qres.get(h, {})
        horizons.append({
            "horizon_h": h,
            "model_rmse": _round(f.get("model_rmse"), 2),
            "model_mae": _round(f.get("model_mae"), 2),
            "persistence_rmse": _round(b.get("persistence_rmse") or f.get("persistence_rmse"), 2),
            "cams_bc_rmse": _round(b.get("cams_bc_rmse") or f.get("cams_bc_rmse"), 2),
            "vs_persistence_pct": _round(f.get("vs_persistence_pct"), 1),
            "vs_cams_bc_pct": _round(f.get("vs_cams_bc_pct"), 1),
            "vs_v1_pct": _round(f.get("vs_v1_pct"), 1),
            "v1_rmse": _round(old.get("model_rmse"), 2),
            "champion": f.get("champion") or f.get("best_single"),
            "quantile_p50_rmse": _round(q.get("p50_rmse"), 2),
            "quantile_picp": _round(q.get("picp_calibrated") or q.get("picp"), 3),
            "quantile_mpiw": _round(q.get("mpiw_calibrated") or q.get("mpiw"), 1),
        })

    h24 = fres.get(24, {})
    return {
        "city": city_id,
        "model_version": fm21.get("version") or fm.get("version") or "v2.1",
        "dataset": {
            "pooled_target_rows": sum(rows_per_city.values()) or None,
            "stations": lm.get("n_stations"),
            "window": bm.get("window") or lm.get("window"),
            "n_features": (fm21.get("horizons") or {}).get("24", {}).get("n_features"),
        },
        "forecast_vs_baselines": horizons,
        "zero_station_loso": {
            "rmse_satellite_subset": _round(lm.get("pooled_loso_rmse_satellite"), 2),
            "rmse_all_stations": _round(lm.get("pooled_loso_rmse_all"), 2),
            "cams_bc_rmse": _round(lm.get("pooled_cams_bc_rmse_satellite"), 2),
            "beats_cams_by_pct": _round(lm.get("vs_cams_pct_satellite"), 1),
        },
        "headline": (
            f"v2.1 forecast beats v1 by {_round(h24.get('vs_v1_pct'), 1)}% RMSE at 24h "
            f"({_round(h24.get('model_rmse'), 2)} vs persistence "
            f"{_round(bres.get(24, {}).get('persistence_rmse'), 2)}); "
            f"zero-station LOSO {_round(lm.get('pooled_loso_rmse_satellite'), 1)} ug/m3 "
            f"(beats CAMS by {_round(lm.get('vs_cams_pct_satellite'), 0)}%)."
        ),
    }


def main():
    print("=" * 90)
    print("BAKE DEMO DATA -> web/public/data/<city>/")
    print("=" * 90)
    ENF._spatial_model()   # warm once, shared across cities

    summary = []
    for city_id, role in CITIES.items():
        print(f"\n--- {city_id} ({role}) ---")
        out_dir = ensure(WEB / city_id)
        origin = demo_origin(city_id)
        say(f"demo origin: {origin}")

        pw = ENF.get_priority_wards(city_id, origin, top_n=12)
        files = {
            "forecast_frames.json": bake_forecast_frames(city_id, origin),
            "priority_wards.json": pw,
            "attribution.json": bake_attribution(pw["dossiers"]),
            "stations.json": bake_stations(city_id),
            "metrics.json": bake_metrics(city_id),
        }
        for fname, obj in files.items():
            p = out_dir / fname
            p.write_text(json.dumps(obj, separators=(",", ":"), default=float), encoding="utf-8")
            kb = p.stat().st_size / 1024
            say(f"{fname:<22}{kb:>8.1f} KB")
            summary.append((city_id, fname, kb))

        ff = files["forecast_frames.json"]
        st = files["stations.json"]
        print(f"  sanity: {ff['n_cells']:,} cells x {len(ff['timestamps'])} frames | "
              f"{len(st['stations'])} stations | "
              f"{len(pw['dossiers'])} dossiers | "
              f"top source: {pw['dossiers'][0]['top_source']} "
              f"({pw['dossiers'][0]['named_upwind_source']})")
        pm_all = [v for c in ff["cells"] for v in c["v"]]
        over = sum(1 for c in ff["cells"] if max(c["v"]) > ENF.CPCB_PM25_24H)
        print(f"          pm25 field range {min(pm_all)}..{max(pm_all)} ug/m3, "
              f"{over:,} cells peak over {int(ENF.CPCB_PM25_24H)}")

    print()
    print("=" * 90)
    print("BAKE SUMMARY")
    print("=" * 90)
    tot = 0.0
    for city_id, fname, kb in summary:
        print(f"  {city_id:<11}{fname:<24}{kb:>9.1f} KB")
        tot += kb
    print(f"  {'TOTAL':<35}{tot:>9.1f} KB")
    ok(f"baked to {WEB.relative_to(ROOT)}/<city>/")


if __name__ == "__main__":
    main()
