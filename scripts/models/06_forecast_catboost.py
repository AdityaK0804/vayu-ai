"""CatBoost multi-horizon PM2.5 forecast — same features/split as LGBM v2.

CatBoost often complements LightGBM on tabular data with many missing values.
We train one model per horizon and write metrics + joblib bundles for the
ensemble step (07_ensemble_proof.py).

Run:
  python scripts/models/06_forecast_catboost.py
  python scripts/models/06_forecast_catboost.py --target residual
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor, Pool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

_FF_PATH = Path(__file__).parent / "forecast_features.py"
_spec = importlib.util.spec_from_file_location("forecast_features", _FF_PATH)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)

MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "forecast_metrics_catboost.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"
V1_JSON = DATA / "processed" / "forecast_metrics_v1_baseline.json"

CB_PARAMS = dict(
    loss_function="RMSE",
    eval_metric="RMSE",
    iterations=4000,
    learning_rate=0.04,
    depth=8,
    l2_leaf_reg=4.0,
    random_seed=42,
    od_type="Iter",
    od_wait=120,
    verbose=False,
    thread_count=-1,
    allow_writing_files=False,
)


def _decode_pred(raw_pred: np.ndarray, te: pd.DataFrame, target: str) -> np.ndarray:
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


def train_horizon(df: pd.DataFrame, h: int, target: str, bl: dict) -> dict:
    feats = ff.feature_cols(df)
    tr, va, te = ff.train_val_test(df)
    say(f"train {len(tr):,} | val {len(va):,} | test {len(te):,} | feats {len(feats)}")

    y_tr = _encode_y(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), target)
    y_va = _encode_y(va.y.to_numpy(), va.pm25_lag0.to_numpy(), target)

    # CatBoost handles NaN natively; fill only for safety on object dtypes
    X_tr = tr[feats].astype("float64")
    X_va = va[feats].astype("float64")
    X_te = te[feats].astype("float64")

    train_pool = Pool(X_tr, y_tr)
    val_pool = Pool(X_va, y_va)
    model = CatBoostRegressor(**CB_PARAMS)
    model.fit(train_pool, eval_set=val_pool, use_best_model=True)
    say(f"best_iteration={model.get_best_iteration()}")

    raw = model.predict(X_te)
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
        "best_iteration": int(model.get_best_iteration() or 0),
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
    r["cams_bc_rmse"] = b.get("cams_bc_rmse")
    for k in ("persistence", "cams_bc"):
        v = r.get(f"{k}_rmse")
        r[f"vs_{k}_pct"] = (100 * (v - r["model_rmse"]) / v) if v else None

    r["row_persistence_rmse"] = ff.rmse(y, te.pm25_lag0.to_numpy())
    r["vs_row_persistence_pct"] = (
        100 * (r["row_persistence_rmse"] - r["model_rmse"]) / r["row_persistence_rmse"]
    )

    imp = pd.Series(model.get_feature_importance(), index=feats)
    imp = (imp / imp.sum() * 100).sort_values(ascending=False)
    r["feature_importance_top20"] = imp.head(20).round(2).to_dict()

    # Also store test predictions for ensemble fusion without re-predicting
    pred_path = MODEL_DIR / f"catboost_pm25_h{h}_test_pred.npz"
    np.savez_compressed(
        pred_path,
        y=y,
        pred=pred,
        pm25_lag0=te.pm25_lag0.to_numpy(),
        city_id=te.city_id.to_numpy(),
        timestamp=te.timestamp.astype("int64").to_numpy(),
        station_id=te.station_id.to_numpy(),
    )

    mp = MODEL_DIR / f"catboost_pm25_h{h}.joblib"
    joblib.dump(
        {
            "model": model,
            "features": feats,
            "horizon": h,
            "target_mode": target,
            "backend": "catboost",
            "version": "v2",
        },
        mp,
    )
    ok(f"saved {mp.relative_to(ROOT)}")
    return r


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", nargs="*", type=int, default=[24, 48, 72])
    ap.add_argument("--target", choices=["raw", "residual", "log1p"], default="raw")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    out_path = Path(args.out) if args.out else OUT_JSON

    print("=" * 100)
    print(f"AIRSIGHT FORECAST v2 — CatBoost | target={args.target}")
    print("=" * 100)

    pool, per_city = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    say(f"pooled target rows: {len(pool):,}   stations: {pool.station_id.nunique()}")

    base = json.loads(BASELINES.read_text()) if BASELINES.exists() else {"results": []}
    bl = {r["horizon_h"]: r for r in base.get("results", [])}
    v1 = None
    if V1_JSON.exists():
        v1 = {
            r["horizon_h"]: r
            for r in json.loads(V1_JSON.read_text()).get("results", [])
        }

    ensure(MODEL_DIR)
    results = []
    for h in args.horizons:
        print()
        print("=" * 100)
        print(f"HORIZON h = {h}h")
        print("=" * 100)
        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        if df.empty:
            warn(f"h={h}: no samples")
            continue
        results.append(train_horizon(df, h, args.target, bl))

    print()
    print("=" * 110)
    print("CATBOOST RESULTS")
    print("=" * 110)
    hdr = f"{'h':>4}{'n_test':>9}{'RMSE':>10}{'MAE':>10}{'vs_pers':>10}{'vs_cams':>10}"
    if v1:
        hdr += f"{'v1':>10}{'vs_v1':>10}"
    print(hdr)
    print("-" * 110)
    for r in results:
        vp = f"{r['vs_persistence_pct']:+.1f}%" if r.get("vs_persistence_pct") is not None else "-"
        vc = f"{r['vs_cams_bc_pct']:+.1f}%" if r.get("vs_cams_bc_pct") is not None else "-"
        line = (
            f"{r['horizon_h']:>3}h{r['n_test']:>9,}{r['model_rmse']:>10.2f}"
            f"{r['model_mae']:>10.2f}{vp:>10}{vc:>10}"
        )
        if v1 and r["horizon_h"] in v1:
            old = v1[r["horizon_h"]]["model_rmse"]
            d = 100 * (old - r["model_rmse"]) / old
            line += f"{old:>10.2f}{d:>+9.1f}%"
        print(line)

    payload = {
        "model": "CatBoost v2, one regressor per horizon",
        "version": "v2",
        "target_mode": args.target,
        "params": {k: v for k, v in CB_PARAMS.items() if k != "thread_count"},
        "split": "time-ordered per station, last 20% test; val = tail 15% of train",
        "lags_hours": ff.LAGS,
        "rows_per_city": per_city,
        "results": results,
    }
    out_path.write_text(json.dumps(payload, indent=2, default=float), encoding="utf-8")
    print()
    ok(f"wrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
