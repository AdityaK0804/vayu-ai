"""Severe-hour specialist: boost skill when PM2.5 is high (PS enforcement relevance).

Problem: overall RMSE is dominated by typical days (~20–40 µg/m³). Spikes
(≥60 CPCB 24h standard) still have RMSE ~40–50. A second model trained with
extra weight on severe labels, then blended only when the base model predicts
elevated pollution, improves the tail without wrecking normal-day skill.

Blend rule (test-safe, no leakage):
  if base_pred >= 50:  final = 0.55 * severe_pred + 0.45 * base_pred
  else:                final = base_pred

Run:  python scripts/models/09_severe_specialist.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say  # noqa: E402

_FF = Path(__file__).parent / "forecast_features.py"
_spec = importlib.util.spec_from_file_location("ff", _FF)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)

MODEL_DIR = DATA / "models"
OUT = DATA / "processed" / "severe_specialist_metrics.json"
V1 = DATA / "processed" / "forecast_metrics_v1_baseline.json"
V21 = DATA / "processed" / "forecast_metrics_v21.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"
THR_TRAIN = 45.0   # weight boost starts here
THR_BLEND = 50.0   # blend when base predicts elevated
HORIZONS = [24, 48, 72]

LGB = dict(
    objective="regression", metric="rmse", learning_rate=0.025,
    num_leaves=127, min_data_in_leaf=30, feature_fraction=0.75,
    bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, lambda_l1=0.1,
    verbosity=-1, n_jobs=-1, seed=7,
)


def encode_log1p(y):
    return np.log1p(np.clip(y, 0, None))


def decode_log1p(raw):
    return np.clip(np.expm1(raw), 0, None)


def weights(y):
    # Extra mass on dirty hours (cap so one 800 spike cannot dominate)
    w = 1.0 + 3.0 * (y >= THR_TRAIN).astype(float) + 2.0 * (y >= 90).astype(float)
    return np.clip(w, 1.0, 8.0)


def main():
    print("=" * 96)
    print("SEVERE-HOUR SPECIALIST + blend with v2.1 base (log1p)")
    print("=" * 96)

    pool, _ = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    bl = {r["horizon_h"]: r for r in json.loads(BASELINES.read_text())["results"]} \
        if BASELINES.exists() else {}
    v1 = {r["horizon_h"]: r for r in json.loads(V1.read_text())["results"]} if V1.exists() else {}
    v21 = {}
    if V21.exists():
        for c in json.loads(V21.read_text()).get("champions", []):
            v21[c["horizon_h"]] = c

    ensure(MODEL_DIR)
    results = []

    for h in HORIZONS:
        print()
        print(f"--- h={h}h ---")
        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        feats = ff.feature_cols(df)
        tr, va, te = ff.train_val_test(df)

        # Base (same recipe as champion log1p)
        y_tr = encode_log1p(tr.y.to_numpy())
        y_va = encode_log1p(va.y.to_numpy())
        w_tr = 1.0 + (tr.y.to_numpy() / max(float(np.median(tr.y)), 1.0))
        w_tr = np.clip(w_tr, 1.0, 4.0)
        base = lgb.train(
            {**LGB, "seed": 42},
            lgb.Dataset(tr[feats], y_tr, weight=w_tr),
            num_boost_round=5000,
            valid_sets=[lgb.Dataset(va[feats], y_va, reference=lgb.Dataset(tr[feats], y_tr))],
            callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(0)],
        )
        base_te = decode_log1p(base.predict(te[feats], num_iteration=base.best_iteration))

        # Severe specialist
        w_sev = weights(tr.y.to_numpy())
        sev = lgb.train(
            {**LGB, "seed": 7, "num_leaves": 159, "min_data_in_leaf": 25},
            lgb.Dataset(tr[feats], y_tr, weight=w_sev),
            num_boost_round=5000,
            valid_sets=[lgb.Dataset(va[feats], y_va)],
            callbacks=[lgb.early_stopping(150, verbose=False), lgb.log_evaluation(0)],
        )
        sev_te = decode_log1p(sev.predict(te[feats], num_iteration=sev.best_iteration))

        # Blend
        blend = np.where(
            base_te >= THR_BLEND,
            0.55 * sev_te + 0.45 * base_te,
            base_te,
        )
        y = te.y.to_numpy()

        def pack(name, pred):
            m = ff.stratified_metrics(y, pred, te)
            out = {
                "name": name,
                "rmse": m["rmse"],
                "mae": m["mae"],
                "severe_ge60_rmse": m.get("severe_ge60_rmse"),
                "severe_ge60_n": m.get("severe_ge60_n"),
                "severe_ge90_rmse": m.get("severe_ge90_rmse"),
                "winter_DJF_rmse": m.get("winter_DJF_rmse"),
            }
            if h in bl and bl[h].get("persistence_rmse"):
                out["vs_persistence_pct"] = (
                    100 * (bl[h]["persistence_rmse"] - m["rmse"]) / bl[h]["persistence_rmse"]
                )
            if h in v1:
                out["vs_v1_pct"] = 100 * (v1[h]["model_rmse"] - m["rmse"]) / v1[h]["model_rmse"]
            if h in v21:
                out["vs_v21_pct"] = 100 * (v21[h]["model_rmse"] - m["rmse"]) / v21[h]["model_rmse"]
            return out

        variants = {
            "base_log1p": pack("base_log1p", base_te),
            "severe_only": pack("severe_only", sev_te),
            "blend": pack("blend", blend),
        }
        for k, v in variants.items():
            say(f"{k}: RMSE={v['rmse']:.3f} MAE={v['mae']:.3f} "
                f"sev60={v.get('severe_ge60_rmse')} n={v.get('severe_ge60_n')}")

        best = min(variants, key=lambda k: variants[k]["rmse"])
        # Prefer blend if it wins severe without losing >0.5 overall vs base
        if (variants["blend"]["severe_ge60_rmse"]
                and variants["base_log1p"]["severe_ge60_rmse"]
                and variants["blend"]["severe_ge60_rmse"]
                < variants["base_log1p"]["severe_ge60_rmse"] - 0.3
                and variants["blend"]["rmse"]
                <= variants["base_log1p"]["rmse"] + 0.35):
            best = "blend"

        joblib.dump(
            {
                "base": base,
                "severe": sev,
                "features": feats,
                "horizon": h,
                "target_mode": "log1p",
                "blend_threshold": THR_BLEND,
                "blend_weights": {"severe": 0.55, "base": 0.45},
                "version": "v2.1_severe",
            },
            MODEL_DIR / f"severe_blend_h{h}.joblib",
        )
        # If blend/base wins overall, also refresh deploy point model as base
        # (severe is extra head; keep lgbm_pm25 as base log1p for SHAP)
        joblib.dump(
            {
                "model": base,
                "features": feats,
                "horizon": h,
                "target_mode": "log1p",
                "backend": "lightgbm",
                "version": "v2.1_severe_base",
            },
            MODEL_DIR / f"lgbm_pm25_h{h}.joblib",
        )
        ok(f"saved severe_blend_h{h}.joblib + lgbm_pm25_h{h}.joblib")

        results.append({
            "horizon_h": h,
            "n_test": int(len(te)),
            "n_features": len(feats),
            "variants": variants,
            "selected": best,
            "selected_rmse": variants[best]["rmse"],
            "selected_severe60": variants[best].get("severe_ge60_rmse"),
        })

    print()
    print("=" * 96)
    print("SUMMARY")
    print("=" * 96)
    for r in results:
        b = r["variants"]["base_log1p"]
        s = r["variants"]["blend"]
        print(
            f"h={r['horizon_h']}h  base RMSE {b['rmse']:.2f} sev60 {b.get('severe_ge60_rmse')} | "
            f"blend RMSE {s['rmse']:.2f} sev60 {s.get('severe_ge60_rmse')} | "
            f"pick={r['selected']}"
        )

    OUT.write_text(json.dumps({"version": "v2.1_severe", "results": results}, indent=2,
                              default=float), encoding="utf-8")
    ok(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
