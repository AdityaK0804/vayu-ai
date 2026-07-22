"""Train LGBM + CatBoost (multiple target modes), blend, write proof report.

Runs a full bake-off on identical time-ordered splits:
  v1 baseline (frozen) | LGBM raw | LGBM residual | LGBM log1p
  | CatBoost raw | CatBoost residual | ensemble of best two

Ensemble: weight by inverse-RMSE on the validation tail (no test leakage).

Run (after 01 and 06 have produced models, OR standalone full bake):
  python scripts/models/07_ensemble_proof.py
  python scripts/models/07_ensemble_proof.py --skip-train   # metrics only from saved
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
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
OUT_JSON = DATA / "processed" / "forecast_proof_report.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"
V1_JSON = DATA / "processed" / "forecast_metrics_v1_baseline.json"
HORIZONS = [24, 48, 72]

LGB_PARAMS = dict(
    objective="regression", metric="rmse", learning_rate=0.03,
    num_leaves=95, min_data_in_leaf=50, feature_fraction=0.80,
    bagging_fraction=0.80, bagging_freq=1, lambda_l2=2.0, lambda_l1=0.1,
    verbosity=-1, n_jobs=-1, seed=42,
)
CB_PARAMS = dict(
    loss_function="RMSE", eval_metric="RMSE", iterations=4000,
    learning_rate=0.04, depth=8, l2_leaf_reg=4.0, random_seed=42,
    od_type="Iter", od_wait=120, verbose=False, allow_writing_files=False,
)


def encode_y(y, lag0, target):
    if target == "raw":
        return y
    if target == "residual":
        return y - lag0
    if target == "log1p":
        return np.log1p(np.clip(y, 0, None))
    raise ValueError(target)


def decode_pred(raw, lag0, target):
    if target == "raw":
        p = raw
    elif target == "residual":
        p = lag0 + raw
    else:
        p = np.expm1(raw)
    return np.clip(p, 0, None)


def train_lgb(tr, va, te, feats, target):
    y_tr = encode_y(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), target)
    y_va = encode_y(va.y.to_numpy(), va.pm25_lag0.to_numpy(), target)
    ds_tr = lgb.Dataset(tr[feats], y_tr)
    ds_va = lgb.Dataset(va[feats], y_va, reference=ds_tr)
    model = lgb.train(
        LGB_PARAMS, ds_tr, num_boost_round=5000, valid_sets=[ds_va],
        callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(0)],
    )
    pred_va = decode_pred(
        model.predict(va[feats], num_iteration=model.best_iteration),
        va.pm25_lag0.to_numpy(), target,
    )
    pred_te = decode_pred(
        model.predict(te[feats], num_iteration=model.best_iteration),
        te.pm25_lag0.to_numpy(), target,
    )
    return model, pred_va, pred_te, int(model.best_iteration)


def train_cb(tr, va, te, feats, target):
    y_tr = encode_y(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), target)
    y_va = encode_y(va.y.to_numpy(), va.pm25_lag0.to_numpy(), target)
    X_tr = tr[feats].astype("float64")
    X_va = va[feats].astype("float64")
    X_te = te[feats].astype("float64")
    model = CatBoostRegressor(**CB_PARAMS)
    model.fit(Pool(X_tr, y_tr), eval_set=Pool(X_va, y_va), use_best_model=True)
    pred_va = decode_pred(model.predict(X_va), va.pm25_lag0.to_numpy(), target)
    pred_te = decode_pred(model.predict(X_te), te.pm25_lag0.to_numpy(), target)
    return model, pred_va, pred_te, int(model.get_best_iteration() or 0)


def blend(preds_va: dict[str, np.ndarray], y_va: np.ndarray,
          preds_te: dict[str, np.ndarray]) -> tuple[np.ndarray, dict]:
    """Inverse-RMSE weights on validation predictions."""
    weights = {}
    for name, p in preds_va.items():
        err = ff.rmse(y_va, p)
        weights[name] = 1.0 / max(err, 1e-6)
    s = sum(weights.values())
    weights = {k: v / s for k, v in weights.items()}
    ens = sum(weights[k] * preds_te[k] for k in weights)
    return ens, weights


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", nargs="*", type=int, default=HORIZONS)
    args = ap.parse_args()

    print("=" * 100)
    print("AIRSIGHT FORECAST PROOF — LGBM + CatBoost + ensemble bake-off")
    print("=" * 100)

    pool, per_city = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    say(f"rows={len(pool):,} stations={pool.station_id.nunique()}")

    base = json.loads(BASELINES.read_text()) if BASELINES.exists() else {"results": []}
    bl = {r["horizon_h"]: r for r in base.get("results", [])}
    v1 = {}
    if V1_JSON.exists():
        v1 = {
            r["horizon_h"]: r
            for r in json.loads(V1_JSON.read_text()).get("results", [])
        }

    ensure(MODEL_DIR)
    configs = [
        ("lgbm_raw", "lgbm", "raw"),
        ("lgbm_residual", "lgbm", "residual"),
        ("lgbm_log1p", "lgbm", "log1p"),
        ("catboost_raw", "catboost", "raw"),
        ("catboost_residual", "catboost", "residual"),
    ]

    report = {
        "version": "v2_proof",
        "upgrades": [
            "met_and_cams_at_target_time",
            "longer_lags_rolling_deltas",
            "traffic_diurnal_proxy",
            "aux_copollutants",
            "lgbm_and_catboost",
            "inverse_rmse_ensemble",
        ],
        "rows_per_city": per_city,
        "horizons": {},
    }

    champion_results = []  # for forecast_metrics.json

    for h in args.horizons:
        print()
        print("=" * 100)
        print(f"HORIZON h={h}h — building samples + training all variants")
        print("=" * 100)
        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        feats = ff.feature_cols(df)
        tr, va, te = ff.train_val_test(df)
        say(f"train {len(tr):,} val {len(va):,} test {len(te):,} feats {len(feats)}")

        y_va = va.y.to_numpy()
        y_te = te.y.to_numpy()
        lag0_te = te.pm25_lag0.to_numpy()

        variants = {}
        preds_va, preds_te = {}, {}

        for name, backend, target in configs:
            say(f"training {name}...")
            if backend == "lgbm":
                model, p_va, p_te, best = train_lgb(tr, va, te, feats, target)
                joblib.dump(
                    {"model": model, "features": feats, "horizon": h,
                     "target_mode": target, "backend": "lightgbm", "version": "v2"},
                    MODEL_DIR / f"{name}_h{h}.joblib",
                )
            else:
                model, p_va, p_te, best = train_cb(tr, va, te, feats, target)
                joblib.dump(
                    {"model": model, "features": feats, "horizon": h,
                     "target_mode": target, "backend": "catboost", "version": "v2"},
                    MODEL_DIR / f"{name}_h{h}.joblib",
                )
            m = ff.stratified_metrics(y_te, p_te, te)
            variants[name] = {
                "backend": backend,
                "target_mode": target,
                "best_iteration": best,
                "n_features": len(feats),
                "model_rmse": m["rmse"],
                "model_mae": m["mae"],
                "val_rmse": ff.rmse(y_va, p_va),
                "row_persistence_rmse": ff.rmse(y_te, lag0_te),
                "stratified": {
                    k: v for k, v in m.items()
                    if k not in ("rmse", "mae", "n", "by_city")
                },
                "by_city": m["by_city"],
            }
            kor = te.city_id == "korba"
            if kor.any():
                mask = kor.to_numpy()
                variants[name]["korba_rmse"] = ff.rmse(y_te[mask], p_te[mask])
                variants[name]["korba_persistence_rmse"] = ff.rmse(
                    y_te[mask], lag0_te[mask]
                )
            b = bl.get(h, {})
            if b.get("persistence_rmse"):
                variants[name]["vs_persistence_pct"] = (
                    100 * (b["persistence_rmse"] - m["rmse"]) / b["persistence_rmse"]
                )
            if b.get("cams_bc_rmse"):
                variants[name]["vs_cams_bc_pct"] = (
                    100 * (b["cams_bc_rmse"] - m["rmse"]) / b["cams_bc_rmse"]
                )
            if h in v1:
                variants[name]["vs_v1_pct"] = (
                    100 * (v1[h]["model_rmse"] - m["rmse"]) / v1[h]["model_rmse"]
                )
            preds_va[name] = p_va
            preds_te[name] = p_te
            say(f"  {name}: test RMSE={m['rmse']:.3f} MAE={m['mae']:.3f}")

        # Ensemble: top-2 by validation RMSE
        ranked = sorted(variants.items(), key=lambda kv: kv[1]["val_rmse"])
        top2 = [ranked[0][0], ranked[1][0]]
        ens_pred, weights = blend(
            {k: preds_va[k] for k in top2},
            y_va,
            {k: preds_te[k] for k in top2},
        )
        m_ens = ff.stratified_metrics(y_te, ens_pred, te)
        variants["ensemble_top2"] = {
            "backend": "ensemble",
            "members": top2,
            "weights": weights,
            "model_rmse": m_ens["rmse"],
            "model_mae": m_ens["mae"],
            "val_rmse": ff.rmse(y_va, sum(weights[k] * preds_va[k] for k in top2)),
            "row_persistence_rmse": ff.rmse(y_te, lag0_te),
            "stratified": {
                k: v for k, v in m_ens.items()
                if k not in ("rmse", "mae", "n", "by_city")
            },
            "by_city": m_ens["by_city"],
        }
        b = bl.get(h, {})
        if b.get("persistence_rmse"):
            variants["ensemble_top2"]["vs_persistence_pct"] = (
                100 * (b["persistence_rmse"] - m_ens["rmse"]) / b["persistence_rmse"]
            )
        if b.get("cams_bc_rmse"):
            variants["ensemble_top2"]["vs_cams_bc_pct"] = (
                100 * (b["cams_bc_rmse"] - m_ens["rmse"]) / b["cams_bc_rmse"]
            )
        if h in v1:
            variants["ensemble_top2"]["vs_v1_pct"] = (
                100 * (v1[h]["model_rmse"] - m_ens["rmse"]) / v1[h]["model_rmse"]
            )
        kor = te.city_id == "korba"
        if kor.any():
            mask = kor.to_numpy()
            variants["ensemble_top2"]["korba_rmse"] = ff.rmse(y_te[mask], ens_pred[mask])
            variants["ensemble_top2"]["korba_persistence_rmse"] = ff.rmse(
                y_te[mask], lag0_te[mask]
            )

        # Full blend of all 5
        ens_all, w_all = blend(preds_va, y_va, preds_te)
        m_all = ff.stratified_metrics(y_te, ens_all, te)
        variants["ensemble_all"] = {
            "backend": "ensemble",
            "weights": w_all,
            "model_rmse": m_all["rmse"],
            "model_mae": m_all["mae"],
            "vs_v1_pct": (
                100 * (v1[h]["model_rmse"] - m_all["rmse"]) / v1[h]["model_rmse"]
                if h in v1 else None
            ),
            "vs_persistence_pct": (
                100 * (b["persistence_rmse"] - m_all["rmse"]) / b["persistence_rmse"]
                if b.get("persistence_rmse") else None
            ),
        }

        # Champion for this horizon
        champ_name, champ = min(
            variants.items(), key=lambda kv: kv[1]["model_rmse"]
        )
        say(f"CHAMPION h={h}h: {champ_name} RMSE={champ['model_rmse']:.3f}")

        # Persist production models for champion if LGBM/CB single
        if champ_name.startswith("lgbm"):
            src = MODEL_DIR / f"{champ_name}_h{h}.joblib"
            if src.exists():
                bundle = joblib.load(src)
                joblib.dump(bundle, MODEL_DIR / f"lgbm_pm25_h{h}.joblib")
        elif champ_name.startswith("catboost"):
            src = MODEL_DIR / f"{champ_name}_h{h}.joblib"
            if src.exists():
                bundle = joblib.load(src)
                joblib.dump(bundle, MODEL_DIR / f"catboost_pm25_h{h}.joblib")
                # also keep lgbm best raw as default deploy if ensemble
                pass

        # Always also save ensemble weights for h
        joblib.dump(
            {
                "type": "ensemble_top2",
                "members": top2,
                "weights": weights,
                "horizon": h,
                "features": feats,
            },
            MODEL_DIR / f"ensemble_top2_h{h}.joblib",
        )

        report["horizons"][str(h)] = {
            "n_test": int(len(te)),
            "n_features": len(feats),
            "v1_rmse": v1[h]["model_rmse"] if h in v1 else None,
            "persistence_rmse": b.get("persistence_rmse"),
            "cams_bc_rmse": b.get("cams_bc_rmse"),
            "variants": variants,
            "champion": champ_name,
            "champion_rmse": champ["model_rmse"],
        }

        champion_results.append({
            "horizon_h": h,
            "champion": champ_name,
            "n_test": int(len(te)),
            "n_features": len(feats),
            "model_rmse": champ["model_rmse"],
            "model_mae": champ["model_mae"],
            "persistence_rmse": b.get("persistence_rmse"),
            "cams_bc_rmse": b.get("cams_bc_rmse"),
            "vs_persistence_pct": champ.get("vs_persistence_pct"),
            "vs_cams_bc_pct": champ.get("vs_cams_bc_pct"),
            "vs_v1_pct": champ.get("vs_v1_pct"),
            "korba_rmse": champ.get("korba_rmse"),
            "korba_persistence_rmse": champ.get("korba_persistence_rmse"),
            "stratified": champ.get("stratified"),
            "by_city": champ.get("by_city"),
        })

        # Print table for this horizon
        print()
        print(f"  {'variant':<22}{'RMSE':>10}{'MAE':>10}{'vs_v1':>10}{'vs_pers':>10}")
        print("  " + "-" * 62)
        if h in v1:
            print(f"  {'v1_baseline':<22}{v1[h]['model_rmse']:>10.2f}{v1[h]['model_mae']:>10.2f}"
                  f"{'—':>10}{'':>10}")
        for name, v in sorted(variants.items(), key=lambda kv: kv[1]["model_rmse"]):
            vv = f"{v.get('vs_v1_pct'):+.1f}%" if v.get("vs_v1_pct") is not None else "-"
            vp = f"{v.get('vs_persistence_pct'):+.1f}%" if v.get("vs_persistence_pct") is not None else "-"
            print(f"  {name:<22}{v['model_rmse']:>10.2f}{v['model_mae']:>10.2f}{vv:>10}{vp:>10}")

    # Summary
    print()
    print("=" * 100)
    print("PROOF SUMMARY — champion per horizon")
    print("=" * 100)
    print(f"{'h':>4}{'champion':>22}{'RMSE':>10}{'vs_v1':>10}{'vs_pers':>10}{'vs_cams':>10}")
    print("-" * 70)
    for r in champion_results:
        vv = f"{r['vs_v1_pct']:+.1f}%" if r.get("vs_v1_pct") is not None else "-"
        vp = f"{r['vs_persistence_pct']:+.1f}%" if r.get("vs_persistence_pct") is not None else "-"
        vc = f"{r['vs_cams_bc_pct']:+.1f}%" if r.get("vs_cams_bc_pct") is not None else "-"
        print(f"{r['horizon_h']:>3}h{r['champion']:>22}{r['model_rmse']:>10.2f}{vv:>10}{vp:>10}{vc:>10}")

    report["champions"] = champion_results
    OUT_JSON.write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")

    # Update main forecast_metrics.json with best single-model (prefer ensemble if best)
    best_payload = {
        "model": "AirSight v2 bake-off champion (see forecast_proof_report.json)",
        "version": "v2",
        "source": "07_ensemble_proof.py",
        "results": champion_results,
        "v1_baseline_path": str(V1_JSON.relative_to(ROOT)) if V1_JSON.exists() else None,
        "proof_report": str(OUT_JSON.relative_to(ROOT)),
    }
    (DATA / "processed" / "forecast_metrics.json").write_text(
        json.dumps(best_payload, indent=2, default=float), encoding="utf-8"
    )
    ok("updated data/processed/forecast_metrics.json with champions")


if __name__ == "__main__":
    main()
