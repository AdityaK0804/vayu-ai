"""AirSight core forecast model: LightGBM, pm25 at t+h for h = 24/48/72.

Design choices (reported, not hidden):
  * ONE MODEL PER HORIZON (3 models). Each horizon has a different relationship to
    the lag features - at 24h yesterday's value is strong, at 72h it is nearly
    noise - and separate models let each learn its own. Horizon-as-a-feature
    would force one tree structure to serve all three.
  * NO SCALER / NO ENCODER. LightGBM is scale-invariant and consumes NaN natively,
    so there is nothing fitted on the data that could leak train statistics into
    test. Rows with missing road_density are KEPT, as specified.
  * Every lag and every target is built by an explicit TIMESTAMP JOIN, never
    shift(): these series have real multi-week gaps and a positional shift would
    silently pair across them.

Run:  python scripts/models/01_forecast_lgbm.py
      python scripts/models/01_forecast_lgbm.py --horizons 24 48 72
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import h3
import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, get_cities, ok, say, warn  # noqa: E402

H3_RES = 8
TEST_FRAC = 0.20
VAL_FRAC = 0.15          # tail of train, time-ordered, for early stopping
LAGS = [0, 1, 3, 6, 24]  # hours before t
MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "forecast_metrics.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"

WEATHER = ["temp_c", "rh_pct", "wind_speed", "wind_dir", "wind_dir_sin",
           "wind_dir_cos", "blh_m", "surface_pressure", "precip_mm"]
STATIC = ["population", "edgar_pm25_total", "edgar_share_ags", "edgar_share_awb",
          "edgar_share_ind", "edgar_share_ref_trf", "edgar_share_ene",
          "edgar_share_rco", "edgar_share_tro", "gppd_nearest_km",
          "gppd_nearest_mw", "gppd_cap_25km", "gppd_inv_dist_mw",
          "road_density_km_km2", "road_length_km"]

LGB_PARAMS = dict(
    objective="regression", metric="rmse", learning_rate=0.05,
    num_leaves=127, min_data_in_leaf=40, feature_fraction=0.85,
    bagging_fraction=0.85, bagging_freq=1, lambda_l2=1.0,
    verbosity=-1, n_jobs=-1, seed=42,
)


def rmse(a, b) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def mae(a, b) -> float:
    return float(np.mean(np.abs(a - b)))


# ------------------------------------------------------------------ load
def load_satellite() -> pd.DataFrame:
    """Daily per-STATION satellite means (aod/no2/so2), long -> wide."""
    frames = []
    for kind in ("aod", "no2", "so2"):
        files = sorted((DATA / "satellite" / kind).glob("*/*stations*.csv"))
        if not files:
            continue
        d = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
        d = d.rename(columns={"cell_id": "station_id", "mean": f"sat_{kind}"})
        d["date"] = pd.to_datetime(d["date"], errors="coerce").dt.normalize()
        d = d.dropna(subset=["date"]).groupby(["station_id", "date"], as_index=False)[f"sat_{kind}"].mean()
        frames.append(d.set_index(["station_id", "date"]))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1).reset_index()


def load_pool() -> tuple[pd.DataFrame, dict]:
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    if "use_in_training" in st.columns:
        flag = st["use_in_training"].astype(str).str.strip().str.lower()
        for _, r in st[flag.isin(("false", "0", "no"))].iterrows():
            warn(f"excluded by use_in_training=FALSE: {r.station_id}")
        st = st[~flag.isin(("false", "0", "no"))]
    st["cell_id"] = [h3.latlng_to_cell(la, lo, H3_RES)
                     for la, lo in zip(st.latitude, st.longitude)]
    cell2st = dict(zip(st.cell_id, st.station_id))

    frames, per_city = [], {}
    for city in get_cities(include_optional=True):
        p = DATA / "processed" / f"{city['id']}_features.parquet"
        if not p.exists():
            continue
        d = pd.read_parquet(p)
        if "pm25" not in d.columns:
            say(f"{city['id']}: zero-station reveal city - not pooled")
            continue
        d = d[d.pm25.notna()].copy()          # target never fabricated or filled
        d["station_id"] = d.cell_id.map(cell2st)
        d = d[d.station_id.notna()]
        if d.empty:
            continue
        d["city_id"] = city["id"]
        per_city[city["id"]] = len(d)
        frames.append(d)
    pool = pd.concat(frames, ignore_index=True)
    return pool.sort_values(["station_id", "timestamp"]).reset_index(drop=True), per_city


def mark_split(pool: pd.DataFrame) -> pd.DataFrame:
    """Time-ordered per station, last 20% test. Identical rule to 00_baselines
    so the two sets of numbers are directly comparable."""
    out = []
    for _, g in pool.groupby("station_id", sort=False):
        g = g.sort_values("timestamp").copy()
        cut = int(len(g) * (1 - TEST_FRAC))
        g["split"] = "train"
        g.iloc[cut:, g.columns.get_loc("split")] = "test"
        out.append(g)
    return pd.concat(out, ignore_index=True)


# ------------------------------------------------------------------ features
def build_samples(pool: pd.DataFrame, sat: pd.DataFrame, h: int) -> pd.DataFrame:
    """One row per (station, origin t) with target pm25(t+h).

    All joins are on explicit timestamps, so a gap simply yields no row rather
    than a fabricated pair.
    """
    keep_now = ["station_id", "city_id", "timestamp", "pm25", "cams_pm25"] + \
               [c for c in WEATHER if c in pool.columns] + \
               [c for c in STATIC if c in pool.columns]
    samples = []
    for sid, g in pool.groupby("station_id", sort=False):
        g = g.sort_values("timestamp")
        base = g[keep_now].rename(columns={"pm25": "pm25_lag0",
                                           "cams_pm25": "cams_now"}).copy()

        # lagged target via timestamp join
        lagsrc = g[["timestamp", "pm25"]]
        for L in LAGS:
            if L == 0:
                continue
            tmp = lagsrc.rename(columns={"pm25": f"pm25_lag{L}"}).copy()
            tmp["timestamp"] = tmp.timestamp + pd.Timedelta(hours=L)
            base = base.merge(tmp, on="timestamp", how="left")

        # target + CAMS at the target time (CAMS is a forecast: its future value
        # is legitimately available at prediction time)
        tgt = g[["timestamp", "pm25", "cams_pm25", "split", "hour", "dow",
                 "month", "is_weekend"]].rename(columns={
                     "timestamp": "target_time", "pm25": "y",
                     "cams_pm25": "cams_target", "hour": "hour_t",
                     "dow": "dow_t", "month": "month_t",
                     "is_weekend": "is_weekend_t"})
        base["target_time"] = base.timestamp + pd.Timedelta(hours=h)
        m = base.merge(tgt, on="target_time", how="inner")

        # Require target AND origin value: same condition the persistence
        # baseline used, so n_pairs line up row for row.
        m = m.dropna(subset=["y", "pm25_lag0"])
        if m.empty:
            continue
        samples.append(m)

    df = pd.concat(samples, ignore_index=True)

    # Satellite is a DAILY aggregate. Join the previous complete day, never the
    # current one: day t's mean includes hours after t and would leak.
    if not sat.empty:
        df["sat_date"] = (df.timestamp - pd.Timedelta(days=1)).dt.normalize()
        df = df.merge(sat.rename(columns={"date": "sat_date"}),
                      on=["station_id", "sat_date"], how="left")
    for c in ("sat_aod", "sat_no2", "sat_so2"):
        if c not in df.columns:
            df[c] = np.nan

    df["horizon"] = h
    return df


def feature_cols(df: pd.DataFrame) -> list[str]:
    cols = [f"pm25_lag{L}" for L in LAGS]
    cols += [c for c in WEATHER if c in df.columns]
    cols += ["cams_now", "cams_target"]
    cols += [c for c in STATIC if c in df.columns]
    cols += ["sat_aod", "sat_no2", "sat_so2"]
    cols += ["hour_t", "dow_t", "month_t", "is_weekend_t"]
    # fire_frp deliberately absent: disabled placeholder, all-NaN.
    return [c for c in cols if c in df.columns]


# ------------------------------------------------------------------ main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", nargs="*", type=int, default=[24, 48, 72])
    args = ap.parse_args()

    print("=" * 100)
    print("AIRSIGHT FORECAST MODEL - LightGBM, one model per horizon")
    print("=" * 100)

    pool, per_city = load_pool()
    pool = mark_split(pool)
    sat = load_satellite()
    say(f"pooled target rows: {len(pool):,}   stations: {pool.station_id.nunique()}")
    say(f"satellite: {'none' if sat.empty else f'{len(sat):,} station-days, '
        f'{sat.date.min():%Y-%m-%d}..{sat.date.max():%Y-%m-%d}'}")

    base = json.loads(BASELINES.read_text()) if BASELINES.exists() else {"results": []}
    bl = {r["horizon_h"]: r for r in base.get("results", [])}

    ensure(MODEL_DIR)
    results, importances = [], {}

    for h in args.horizons:
        print()
        print("=" * 100)
        print(f"HORIZON h = {h}h")
        print("=" * 100)
        df = build_samples(pool, sat, h)
        feats = feature_cols(df)

        tr_all = df[df.split == "train"].sort_values("timestamp")
        te = df[df.split == "test"]
        vcut = int(len(tr_all) * (1 - VAL_FRAC))
        tr, va = tr_all.iloc[:vcut], tr_all.iloc[vcut:]
        say(f"train {len(tr):,} | val {len(va):,} (tail of train) | test {len(te):,}")
        say(f"features: {len(feats)}")

        # Train/test coverage per feature - a feature present in train but absent
        # in test is worse than useless, so surface it rather than trust it.
        cov = pd.DataFrame({
            "train_%": tr[feats].notna().mean() * 100,
            "test_%": te[feats].notna().mean() * 100,
        })
        cov["gap"] = cov["train_%"] - cov["test_%"]
        bad = cov[cov["gap"].abs() > 20].sort_values("gap", ascending=False)
        if len(bad):
            print()
            warn("features with >20pp train/test coverage gap (they cannot help at test):")
            for f, r in bad.iterrows():
                print(f"      {f:<24}train {r['train_%']:>6.1f}%   test {r['test_%']:>6.1f}%")

        ds_tr = lgb.Dataset(tr[feats], tr.y)
        ds_va = lgb.Dataset(va[feats], va.y, reference=ds_tr)
        model = lgb.train(LGB_PARAMS, ds_tr, num_boost_round=3000,
                          valid_sets=[ds_va],
                          callbacks=[lgb.early_stopping(100, verbose=False),
                                     lgb.log_evaluation(0)])
        say(f"best iteration: {model.best_iteration}")

        pred = model.predict(te[feats], num_iteration=model.best_iteration)
        pred = np.clip(pred, 0, None)          # negative pm25 is unphysical

        r = {"horizon_h": h, "n_test": int(len(te)), "n_train": int(len(tr)),
             "n_val": int(len(va)), "n_features": len(feats),
             "best_iteration": int(model.best_iteration),
             "model_rmse": rmse(te.y.to_numpy(), pred),
             "model_mae": mae(te.y.to_numpy(), pred)}

        kor = te.city_id == "korba"
        if kor.any():
            r["korba_n"] = int(kor.sum())
            r["korba_rmse"] = rmse(te.y.to_numpy()[kor.to_numpy()], pred[kor.to_numpy()])
            r["korba_mae"] = mae(te.y.to_numpy()[kor.to_numpy()], pred[kor.to_numpy()])
            # baselines restricted to Korba, same rows, for a like-for-like hero number
            r["korba_persistence_rmse"] = rmse(te.y.to_numpy()[kor.to_numpy()],
                                               te.pm25_lag0.to_numpy()[kor.to_numpy()])

        b = bl.get(h, {})
        r["persistence_rmse"] = b.get("persistence_rmse")
        r["persistence_mae"] = b.get("persistence_mae")
        r["cams_bc_rmse"] = b.get("cams_bc_rmse")
        r["cams_bc_mae"] = b.get("cams_bc_mae")
        for k in ("persistence", "cams_bc"):
            v = r.get(f"{k}_rmse")
            r[f"vs_{k}_pct"] = (100 * (v - r["model_rmse"]) / v) if v else None
        results.append(r)

        imp = pd.Series(model.feature_importance("gain"), index=feats)
        imp = (imp / imp.sum() * 100).sort_values(ascending=False)
        importances[h] = imp.head(15).round(2).to_dict()

        mp = MODEL_DIR / f"lgbm_pm25_h{h}.joblib"
        joblib.dump({"model": model, "features": feats, "horizon": h}, mp)
        ok(f"saved {mp.relative_to(ROOT)}")

    # ---------------------------------------------------------- report
    print()
    print("=" * 104)
    print("RESULTS - POOLED (test rows only)")
    print("=" * 104)
    print(f"{'h':>4}{'n_test':>9}{'model_RMSE':>12}{'model_MAE':>11}{'persist_RMSE':>14}"
          f"{'camsBC_RMSE':>13}{'vs persist':>12}{'vs camsBC':>11}")
    print("-" * 104)
    for r in results:
        p = f"{r['persistence_rmse']:.2f}" if r["persistence_rmse"] else "-"
        c = f"{r['cams_bc_rmse']:.2f}" if r["cams_bc_rmse"] else "-"
        vp = f"{r['vs_persistence_pct']:+.1f}%" if r["vs_persistence_pct"] is not None else "-"
        vc = f"{r['vs_cams_bc_pct']:+.1f}%" if r["vs_cams_bc_pct"] is not None else "-"
        print(f"{r['horizon_h']:>3}h{r['n_test']:>9,}{r['model_rmse']:>12.2f}"
              f"{r['model_mae']:>11.2f}{p:>14}{c:>13}{vp:>12}{vc:>11}")

    print()
    print("=" * 104)
    print("RESULTS - KORBA ONLY (hero city)")
    print("=" * 104)
    print(f"{'h':>4}{'n_test':>9}{'korba_RMSE':>12}{'korba_MAE':>11}"
          f"{'korba_persist_RMSE':>20}{'vs persist':>12}")
    print("-" * 104)
    for r in results:
        if "korba_rmse" not in r:
            continue
        kp = r["korba_persistence_rmse"]
        d = 100 * (kp - r["korba_rmse"]) / kp
        print(f"{r['horizon_h']:>3}h{r['korba_n']:>9,}{r['korba_rmse']:>12.2f}"
              f"{r['korba_mae']:>11.2f}{kp:>20.2f}{d:>11.1f}%")

    print()
    print("=" * 104)
    print("VERDICT")
    print("=" * 104)
    for r in results:
        h = r["horizon_h"]
        vp, vc = r["vs_persistence_pct"], r["vs_cams_bc_pct"]
        wp = "BEATS" if vp and vp > 0 else "LOSES TO"
        wc = "BEATS" if vc and vc > 0 else "LOSES TO"
        print(f"  h={h}h  model RMSE {r['model_rmse']:.2f}")
        print(f"        {wp} persistence ({r['persistence_rmse']:.2f})  -> {vp:+.1f}%")
        print(f"        {wc} cams_bc     ({r['cams_bc_rmse']:.2f})  -> {vc:+.1f}%")

    print()
    print("=" * 104)
    print("FEATURE IMPORTANCE (gain %, top 15)")
    print("=" * 104)
    for h, imp in importances.items():
        print(f"\n  h = {h}h")
        for i, (f, v) in enumerate(imp.items(), 1):
            print(f"    {i:>2}. {f:<26}{v:>6.2f}%")

    payload = {
        "model": "LightGBM, one regressor per horizon",
        "params": LGB_PARAMS,
        "split": "time-ordered per station, last 20% test; val = tail 15% of train",
        "scaler": "none (LightGBM is scale-invariant; nothing fitted -> no leakage)",
        "lags_hours": LAGS,
        "excluded_features": ["fire_frp (disabled placeholder, all-NaN)"],
        "rows_per_city": per_city,
        "results": results,
        "feature_importance_top15": importances,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=float), encoding="utf-8")
    print()
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
