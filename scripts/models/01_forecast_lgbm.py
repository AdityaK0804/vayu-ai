"""AirSight core forecast model: LightGBM, pm25 at t+h for h = 24/48/72.

v2 upgrades (vs forecast_metrics_v1_baseline.json):
  * Met + multi-CAMS at TARGET hour t+h (forecastable Open-Meteo / CAMS)
  * Longer lags, rolling stats, deltas, residual-to-CAMS
  * Traffic diurnal proxy; aux co-pollutants
  * Optional residual / log1p targets (--target raw|residual|log1p)
  * Stratified metrics (severe hours, season, per-city)

Design constants retained:
  * ONE MODEL PER HORIZON
  * No scaler (LightGBM scale-invariant, NaN-native)
  * Explicit timestamp joins only

Run:
  python scripts/models/01_forecast_lgbm.py
  python scripts/models/01_forecast_lgbm.py --target residual
  python scripts/models/01_forecast_lgbm.py --target log1p --horizons 24 48 72
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

_FF_PATH = Path(__file__).parent / "forecast_features.py"
_spec = importlib.util.spec_from_file_location("forecast_features", _FF_PATH)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)

MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "forecast_metrics.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"
V1_JSON = DATA / "processed" / "forecast_metrics_v1_baseline.json"

# Back-compat aliases for 03_attribution / 05_quantile / 04_enforcement
load_pool = ff.load_pool
mark_split = ff.mark_split
load_satellite = ff.load_satellite
build_samples = ff.build_samples
feature_cols = ff.feature_cols
WEATHER = ff.WEATHER
STATIC = ff.STATIC
LAGS = ff.LAGS
H3_RES = ff.H3_RES
TEST_FRAC = ff.TEST_FRAC
VAL_FRAC = ff.VAL_FRAC

LGB_PARAMS = dict(
    objective="regression",
    metric="rmse",
    learning_rate=0.03,
    num_leaves=95,
    min_data_in_leaf=50,
    feature_fraction=0.80,
    bagging_fraction=0.80,
    bagging_freq=1,
    lambda_l2=2.0,
    lambda_l1=0.1,
    verbosity=-1,
    n_jobs=-1,
    seed=42,
)


def _decode_pred(raw_pred: np.ndarray, te: pd.DataFrame, target: str) -> np.ndarray:
    """Map model output space back to µg/m³ PM2.5."""
    if target == "raw":
        pred = raw_pred
    elif target == "residual":
        pred = te.pm25_lag0.to_numpy() + raw_pred
    elif target == "log1p":
        pred = np.expm1(raw_pred)
    else:
        raise ValueError(target)
    return np.clip(pred, 0, None)


def _encode_y(y: np.ndarray, lag0: np.ndarray, target: str) -> np.ndarray:
    if target == "raw":
        return y
    if target == "residual":
        return y - lag0
    if target == "log1p":
        return np.log1p(np.clip(y, 0, None))
    raise ValueError(target)


def train_horizon(df: pd.DataFrame, h: int, target: str, bl: dict) -> tuple[dict, dict]:
    feats = ff.feature_cols(df)
    tr, va, te = ff.train_val_test(df)
    say(f"train {len(tr):,} | val {len(va):,} | test {len(te):,} | feats {len(feats)}")

    y_tr = _encode_y(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), target)
    y_va = _encode_y(va.y.to_numpy(), va.pm25_lag0.to_numpy(), target)

    ds_tr = lgb.Dataset(tr[feats], y_tr)
    ds_va = lgb.Dataset(va[feats], y_va, reference=ds_tr)
    model = lgb.train(
        LGB_PARAMS,
        ds_tr,
        num_boost_round=5000,
        valid_sets=[ds_va],
        callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(0)],
    )
    say(f"best_iteration={model.best_iteration}")

    raw = model.predict(te[feats], num_iteration=model.best_iteration)
    pred = _decode_pred(raw, te, target)
    y = te.y.to_numpy()

    metrics = ff.stratified_metrics(y, pred, te)
    r: dict = {
        "horizon_h": h,
        "target_mode": target,
        "n_test": metrics["n"],
        "n_train": int(len(tr)),
        "n_val": int(len(va)),
        "n_features": len(feats),
        "best_iteration": int(model.best_iteration),
        "model_rmse": metrics["rmse"],
        "model_mae": metrics["mae"],
        "stratified": {
            k: v for k, v in metrics.items()
            if k not in ("rmse", "mae", "n", "by_city")
        },
        "by_city": metrics["by_city"],
    }

    kor = te.city_id == "korba"
    if kor.any():
        mask = kor.to_numpy()
        r["korba_n"] = int(mask.sum())
        r["korba_rmse"] = ff.rmse(y[mask], pred[mask])
        r["korba_mae"] = ff.mae(y[mask], pred[mask])
        r["korba_persistence_rmse"] = ff.rmse(y[mask], te.pm25_lag0.to_numpy()[mask])

    b = bl.get(h, {})
    r["persistence_rmse"] = b.get("persistence_rmse")
    r["persistence_mae"] = b.get("persistence_mae")
    r["cams_bc_rmse"] = b.get("cams_bc_rmse")
    r["cams_bc_mae"] = b.get("cams_bc_mae")
    for k in ("persistence", "cams_bc"):
        v = r.get(f"{k}_rmse")
        r[f"vs_{k}_pct"] = (100 * (v - r["model_rmse"]) / v) if v else None

    r["row_persistence_rmse"] = ff.rmse(y, te.pm25_lag0.to_numpy())
    r["vs_row_persistence_pct"] = (
        100 * (r["row_persistence_rmse"] - r["model_rmse"]) / r["row_persistence_rmse"]
    )

    imp = pd.Series(model.feature_importance("gain"), index=feats)
    imp = (imp / imp.sum() * 100).sort_values(ascending=False)
    r["feature_importance_top20"] = imp.head(20).round(2).to_dict()

    mp = MODEL_DIR / f"lgbm_pm25_h{h}.joblib"
    joblib.dump(
        {
            "model": model,
            "features": feats,
            "horizon": h,
            "target_mode": target,
            "backend": "lightgbm",
            "version": "v2",
        },
        mp,
    )
    ok(f"saved {mp.relative_to(ROOT)}")
    return r, r["feature_importance_top20"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", nargs="*", type=int, default=[24, 48, 72])
    ap.add_argument(
        "--target",
        choices=["raw", "residual", "log1p"],
        default="raw",
        help="raw pm25 | residual vs lag0 | log1p(pm25)",
    )
    ap.add_argument(
        "--out",
        default=None,
        help="metrics JSON path",
    )
    args = ap.parse_args()

    out_path = Path(args.out) if args.out else (
        OUT_JSON if args.target == "raw"
        else DATA / "processed" / f"forecast_metrics_{args.target}.json"
    )

    print("=" * 100)
    print(f"AIRSIGHT FORECAST v2 — LightGBM | target={args.target}")
    print("=" * 100)

    pool, per_city = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    say(f"pooled target rows: {len(pool):,}   stations: {pool.station_id.nunique()}")
    say(f"satellite: {'none' if sat.empty else f'{len(sat):,} station-days'}")

    base = json.loads(BASELINES.read_text()) if BASELINES.exists() else {"results": []}
    bl = {r["horizon_h"]: r for r in base.get("results", [])}
    v1 = None
    if V1_JSON.exists():
        v1 = {
            r["horizon_h"]: r
            for r in json.loads(V1_JSON.read_text()).get("results", [])
        }

    ensure(MODEL_DIR)
    results, importances = [], {}

    for h in args.horizons:
        print()
        print("=" * 100)
        print(f"HORIZON h = {h}h")
        print("=" * 100)
        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        if df.empty:
            warn(f"h={h}: no samples")
            continue
        r, imp = train_horizon(df, h, args.target, bl)
        results.append(r)
        importances[str(h)] = imp

    print()
    print("=" * 110)
    print("RESULTS — POOLED (test rows only)")
    print("=" * 110)
    hdr = (
        f"{'h':>4}{'n_test':>9}{'model_RMSE':>12}{'model_MAE':>11}"
        f"{'persist':>10}{'vs_pers':>10}{'camsBC':>10}{'vs_cams':>10}"
    )
    if v1:
        hdr += f"{'v1_RMSE':>10}{'vs_v1':>10}"
    print(hdr)
    print("-" * 110)
    for r in results:
        p = f"{r['persistence_rmse']:.2f}" if r["persistence_rmse"] else "-"
        c = f"{r['cams_bc_rmse']:.2f}" if r["cams_bc_rmse"] else "-"
        vp = (
            f"{r['vs_persistence_pct']:+.1f}%"
            if r["vs_persistence_pct"] is not None else "-"
        )
        vc = (
            f"{r['vs_cams_bc_pct']:+.1f}%"
            if r["vs_cams_bc_pct"] is not None else "-"
        )
        line = (
            f"{r['horizon_h']:>3}h{r['n_test']:>9,}{r['model_rmse']:>12.2f}"
            f"{r['model_mae']:>11.2f}{p:>10}{vp:>10}{c:>10}{vc:>10}"
        )
        if v1 and r["horizon_h"] in v1:
            old = v1[r["horizon_h"]]["model_rmse"]
            d = 100 * (old - r["model_rmse"]) / old
            line += f"{old:>10.2f}{d:>+9.1f}%"
        print(line)

    print()
    print("=" * 100)
    print("KORBA (hero city)")
    print("=" * 100)
    for r in results:
        if "korba_rmse" not in r:
            continue
        kp = r["korba_persistence_rmse"]
        d = 100 * (kp - r["korba_rmse"]) / kp
        print(
            f"  h={r['horizon_h']}h  RMSE {r['korba_rmse']:.2f}  "
            f"persist {kp:.2f}  ({d:+.1f}%)  n={r['korba_n']:,}"
        )

    print()
    print("=" * 100)
    print("FEATURE IMPORTANCE (gain %, top 15)")
    print("=" * 100)
    for h, imp in importances.items():
        print(f"\n  h = {h}h")
        for i, (f, v) in enumerate(list(imp.items())[:15], 1):
            print(f"    {i:>2}. {f:<32}{v:>6.2f}%")

    payload = {
        "model": "LightGBM v2, one regressor per horizon",
        "version": "v2",
        "target_mode": args.target,
        "params": LGB_PARAMS,
        "split": "time-ordered per station, last 20% test; val = tail 15% of train",
        "scaler": "none",
        "lags_hours": ff.LAGS,
        "upgrades": [
            "met_and_cams_at_target_time",
            "longer_lags_and_rolling",
            "deltas_and_cams_residual",
            "traffic_diurnal_proxy",
            "aux_copollutants",
            "stratified_metrics",
        ],
        "rows_per_city": per_city,
        "results": results,
        "feature_importance_top20": importances,
    }
    out_path = out_path if out_path.is_absolute() else (ROOT / out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, default=float), encoding="utf-8")
    print()
    try:
        shown = out_path.relative_to(ROOT)
    except ValueError:
        shown = out_path
    ok(f"wrote {shown}")


if __name__ == "__main__":
    main()
