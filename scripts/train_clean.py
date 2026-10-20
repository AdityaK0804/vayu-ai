"""Retrain PM2.5 forecast models on the cleaned 14-station CPCB set.

Applies config/data_quarantine.yaml (CLEANUP.md), joins Open-Meteo CAMS +
ERA5 history per station, evaluates against persistence and CAMS baselines
(time split + leave-one-station-out) and writes artifacts in the registry's
joblib contract: models/<version>/pm25_h{H}_p{10,50,90}.joblib.

    python scripts/train_clean.py --om-dir /workspace/vayu-data/fetched/open_meteo
"""
from __future__ import annotations

import argparse, json, math, sys
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb, numpy as np, pandas as pd, yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from airsight.features import fire_upwind  # noqa: E402
from airsight.live.fires import parse_csv  # noqa: E402
HORIZONS = (24, 48, 72)
CAMS = {"pm2_5": "cams_pm25", "pm10": "cams_pm10", "nitrogen_dioxide": "cams_no2",
        "sulphur_dioxide": "cams_so2", "ozone": "cams_o3", "dust": "cams_dust"}
MET = {"temperature_2m": "temp_c", "relative_humidity_2m": "rh_pct", "dew_point_2m": "dew_point_c",
       "wind_speed_10m": "wind_speed", "boundary_layer_height": "blh_m",
       "surface_pressure": "surface_pressure", "precipitation": "precip_mm"}
FEATURES = (list(CAMS.values()) + ["temp_c", "rh_pct", "dew_point_c", "wind_speed", "wind_dir_sin",
            "wind_dir_cos", "blh_m", "surface_pressure", "precip_mm", "hour", "dow", "month",
            "is_weekend", "hour_sin", "hour_cos", "pm25_lag1", "pm25_lag3", "pm25_lag24",
            "pm25_roll24_mean", "pm25_roll24_std"])
PARAMS = dict(n_estimators=400, learning_rate=0.05, num_leaves=31, min_child_samples=50,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.8, verbose=-1, n_jobs=4)
# Target transform. "log1p": fit on log1p(PM2.5), predict expm1. Quantiles are
# invariant under monotone transforms, so p10/p50/p90 map back exactly. Chosen
# by time-split + LOSO ablation (see models/<version>/metrics.json).
TRANSFORM = "log1p"


def fwd(y):
    return np.log1p(y) if TRANSFORM == "log1p" else y


def inv(p):
    return np.expm1(p) if TRANSFORM == "log1p" else p


def load_station_pm(path: Path) -> pd.Series:
    df = pd.read_csv(path, usecols=[0, 1])
    df.columns = ["ts", "pm25"]
    # CPCB timestamps are IST hour-starts; shift to UTC and snap to the hour.
    ts = (pd.to_datetime(df["ts"]) - pd.Timedelta(hours=5, minutes=30)).dt.floor("h")
    s = pd.Series(pd.to_numeric(df["pm25"], errors="coerce").values, index=ts.dt.tz_localize("UTC"))
    s = s[(s > 0) & (s < 1000)]
    return s.groupby(level=0).mean()


def load_om(om_dir: Path, oid: int, kind: str, mapping: dict) -> pd.DataFrame:
    h = json.loads((om_dir / f"{oid}_{kind}.json").read_text())["hourly"]
    df = pd.DataFrame({v: h.get(k) for k, v in mapping.items()})
    df.index = pd.to_datetime(h["time"]).tz_localize("UTC")
    if kind == "weather_archive":
        wd = np.deg2rad(pd.Series(h["wind_direction_10m"], index=df.index, dtype=float))
        df["wind_dir_sin"], df["wind_dir_cos"] = np.sin(wd), np.cos(wd)
    return df.astype(float)


def load_clean_stations(om: Path, cdir: Path):
    """CPCB files with CLEANUP.md drops/quarantine applied, then validated archive fills."""
    q = yaml.safe_load((ROOT / "config" / "data_quarantine.yaml").read_text())
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    ids = pd.read_csv(ROOT / "config" / "cpcb_stations.csv").set_index("station_id")["openaq_id"]
    pms, inputs, log, cams_start = {}, {}, [], None
    for r in st.itertuples():
        if r.source_file in q["drop_files"]:
            continue
        pm = load_station_pm(next(cdir.rglob(r.source_file)))
        n0 = len(pm)
        for qq in q["quarantine"]:
            if qq["station_id"] == r.station_id:
                lo, hi = pd.Timestamp(qq["start"], tz="UTC"), pd.Timestamp(qq["end"], tz="UTC")
                pm = pm[(pm.index < lo) | (pm.index >= hi)]
        n_kept = len(pm)
        added = 0
        for rep in q.get("replacements") or []:
            f = ROOT / "data" / rep["source"] / f"{r.station_id}_{rep['year']}.csv"
            if rep["station_id"] != r.station_id or not f.exists():
                continue
            a = pd.read_csv(f)
            a = pd.Series(pd.to_numeric(a["pm25"], errors="coerce").values,
                          index=pd.to_datetime(a["ts"], utc=True)).dropna()
            a = a[(a > 0) & (a < 1000) & ~a.index.isin(pm.index)]
            added += len(a)
            pm = pd.concat([pm, a]).sort_index()
        entry = {"station_id": r.station_id, "file": r.source_file, "pm25_hours": n0,
                 "kept_after_quarantine": int(n_kept), "added_from_archive": int(added)}
        if pm.empty:
            log.append({**entry, "excluded": "no clean hours"})
            continue
        oid = int(ids[r.station_id])
        cams = load_om(om, oid, "airquality", CAMS)
        cams_start = cams.index.min()
        pms[r.station_id] = pm
        inputs[r.station_id] = (cams, load_om(om, oid, "weather_archive", MET))
        log.append(entry)
    return pms, inputs, log, cams_start


def load_fire_archive(fdir: Path) -> pd.DataFrame:
    """FIRMS SP archive CSVs (scripts/fetch_firms_archive.py), parsed like live ingest."""
    rows = []
    for f in sorted(fdir.glob("*.csv")):
        rows += parse_csv(f.read_text())
    if not rows:
        raise SystemExit(f"no FIRMS archive in {fdir}; run scripts/fetch_firms_archive.py")
    return pd.DataFrame(rows)[["ts", "lat", "lon", "frp"]].drop_duplicates()


def fire_issue_series(fires: pd.DataFrame, lat: float, lon: float, met: pd.DataFrame,
                      start, end) -> pd.Series:
    """fire_frp_upwind at every hourly issue time, wind-from from the met archive."""
    idx = pd.date_range(start, end, freq="h")
    m = met.reindex(idx)
    wd = (np.degrees(np.arctan2(m["wind_dir_sin"], m["wind_dir_cos"])) + 360.0) % 360.0
    return pd.Series(fire_upwind.upwind_frp(fires, lat, lon, idx, wd.to_numpy(), **fire_upwind.params()),
                     index=idx)


def station_frame(pm: pd.Series, cams: pd.DataFrame, met: pd.DataFrame, horizon: int,
                  fire: pd.Series | None = None) -> pd.DataFrame:
    idx = pd.date_range(pm.index.min(), pm.index.max(), freq="h")
    pm = pm.reindex(idx)
    # Issue-time state, mirroring forecast.service._recent_state.
    st = pd.DataFrame(index=idx)
    st["pm25_lag1"] = pm
    st["pm25_lag3"] = pm.shift(2)
    st["pm25_lag24"] = pm.shift(23)
    st["pm25_roll24_mean"] = pm.rolling(24, min_periods=6).mean()
    st["pm25_roll24_std"] = pm.rolling(24, min_periods=6).std(ddof=0)
    if fire is not None:
        st[fire_upwind.FEATURE] = fire.reindex(idx)
    out = st.shift(horizon)  # row = target hour; state known `horizon` hours earlier
    out["target"] = pm
    out = out.join(cams, how="left").join(met, how="left")
    ts = out.index
    out["hour"], out["dow"], out["month"] = ts.hour, ts.dayofweek, ts.month
    out["is_weekend"] = (ts.dayofweek >= 5).astype(int)
    out["hour_sin"] = np.sin(2 * math.pi * out["hour"] / 24)
    out["hour_cos"] = np.cos(2 * math.pi * out["hour"] / 24)
    return out.dropna(subset=["target", "pm25_lag1"])


def scores(y, p):
    e = p - y
    return {"mae": round(float(np.mean(np.abs(e))), 2), "rmse": round(float(np.sqrt(np.mean(e**2))), 2),
            "bias": round(float(np.mean(e)), 2)}


def evaluate(train, test):
    m = lgb.LGBMRegressor(objective="regression_l1", **PARAMS).fit(train[FEATURES], fwd(train["target"]))
    t = test.dropna(subset=["cams_pm25"])
    y = t["target"].values
    return {"n": int(len(t)), "model": scores(y, inv(m.predict(t[FEATURES]))),
            "persistence": scores(y, t["pm25_lag1"].values), "cams": scores(y, t["cams_pm25"].values)}


def attach_fire(firms_dir: str):
    """Enable the fire feature: extends FEATURES and returns a per-station builder."""
    if fire_upwind.FEATURE not in FEATURES:
        FEATURES.append(fire_upwind.FEATURE)
    archive = load_fire_archive(Path(firms_dir))
    st = pd.read_csv(ROOT / "config" / "stations.csv").set_index("station_id")

    def build(pms, inputs, cams_start):
        return {s: fire_issue_series(archive, float(st.loc[s, "latitude"]), float(st.loc[s, "longitude"]),
                                     inputs[s][1], max(pms[s].index.min(), cams_start - pd.Timedelta(days=4)),
                                     pms[s].index.max()) for s in pms}
    return build


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--om-dir", default="/workspace/vayu-data/fetched/open_meteo")
    ap.add_argument("--cpcb-dir", default=str(ROOT / "data" / "cpcb"))
    ap.add_argument("--out", default=str(ROOT / "models"))
    ap.add_argument("--skip-loso", action="store_true")
    ap.add_argument("--version", default=None)
    ap.add_argument("--transform", default=TRANSFORM, choices=["log1p", "none"])
    ap.add_argument("--fire", action=argparse.BooleanOptionalAction, default=True,
                    help="add fire_frp_upwind (config firms.upwind_feature)")
    ap.add_argument("--firms-dir", default="/workspace/vayu-data/fetched/firms")
    a = ap.parse_args()
    globals()["TRANSFORM"] = a.transform
    fire_by_station = attach_fire(a.firms_dir) if a.fire else None
    om, cdir = Path(a.om_dir), Path(a.cpcb_dir)
    pms, inputs, log, cams_start = load_clean_stations(om, cdir)
    fires = fire_by_station(pms, inputs, cams_start) if fire_by_station else None
    report = {"created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "data": log, "cams_history_start": str(cams_start.date()),
              "note": "Rows restricted to hours with CAMS available (Open-Meteo CAMS history starts "
                      "2022-08-01). CPCB IST timestamps floored to UTC hours (30-min alignment error).",
              "target_transform": a.transform, "horizons": {}}
    version = a.version or ("clean_" + datetime.now(timezone.utc).strftime("%Y%m%d"))
    vdir = Path(a.out) / version
    vdir.mkdir(parents=True, exist_ok=True)
    split = pd.Timestamp("2025-01-01", tz="UTC")
    for h in HORIZONS:
        frames = {s: station_frame(pms[s], *inputs[s], h, fire=(fires or {}).get(s)).assign(station=s)
                  for s in pms}
        allf = pd.concat(frames.values())
        allf = allf[allf.index >= cams_start]
        res = {"n_rows": int(len(allf))}
        res["time_split"] = evaluate(allf[allf.index < split], allf[allf.index >= split])
        res["time_split"]["desc"] = "train < 2025-01-01 UTC, test >= 2025-01-01 UTC, all stations"
        if not a.skip_loso:
            per, pooled = {}, []
            for s in frames:
                te = allf[allf.station == s]
                if len(te.dropna(subset=["cams_pm25"])) < 500:
                    continue
                per[s] = evaluate(allf[allf.station != s], te)
            res["loso"] = per
            tot = sum(v["n"] for v in per.values())
            res["loso_weighted_mae"] = {k: round(sum(v[k]["mae"] * v["n"] for v in per.values()) / tot, 2)
                                        for k in ("model", "persistence", "cams")}
            res["loso_model_beats_both"] = sum(
                v["model"]["mae"] < min(v["persistence"]["mae"], v["cams"]["mae"]) for v in per.values())
            res["loso_stations"] = len(per)
        # Final artifacts: all clean rows, quantiles; coverage measured on the time split.
        tr, te = allf[allf.index < split], allf[allf.index >= split]
        cov_models = {}
        for qv in (0.1, 0.5, 0.9):
            mdl = lgb.LGBMRegressor(objective="quantile", alpha=qv, **PARAMS)
            cov_models[qv] = inv(mdl.fit(tr[FEATURES], fwd(tr["target"])).predict(te[FEATURES]))
        inside = (te["target"] >= cov_models[0.1]) & (te["target"] <= cov_models[0.9])
        res["time_split_p10_p90_coverage"] = round(float(inside.mean()), 3)
        for qv in (0.1, 0.5, 0.9):
            mdl = lgb.LGBMRegressor(objective="quantile", alpha=qv, **PARAMS).fit(allf[FEATURES], fwd(allf["target"]))
            # Plain LightGBM text: diffable, no pickle/version coupling on Render.
            mdl.booster_.save_model(str(vdir / f"pm25_h{h}_p{int(qv*100)}.txt"))
        report["horizons"][str(h)] = res
        print(h, json.dumps({k: v for k, v in res.items() if k != "loso"}), flush=True)
    (vdir / "bundle.json").write_text(json.dumps({"version": version, "features": FEATURES,
        "calibration": {}, "target_transform": TRANSFORM,
        "fire_upwind": fire_upwind.params() if fire_by_station else None, "horizons": list(HORIZONS), "quantiles": [0.1, 0.5, 0.9]}, indent=2))
    (vdir / "metrics.json").write_text(json.dumps(report, indent=2))
    print("wrote", vdir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
