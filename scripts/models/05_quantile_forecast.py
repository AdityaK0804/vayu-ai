"""Quantile forecast heads — P10 / P50 / P90 confidence bands (v2.1 features).

LightGBM ``objective=quantile`` on the same feature matrix / time split as the
point models. Targets are trained in **log1p space** then decoded with expm1
(matches the champion point model and stabilises tails).

Reported per horizon:
  * P50 RMSE/MAE
  * PICP  — share of actuals inside [P10, P90] (target ~80%)
  * MPIW  — mean interval width (µg/m³)

If PICP is short of 80%, we also fit a small conformal-style expansion factor
on the validation tail (no test leakage) and report both raw and calibrated.

Run:  python scripts/models/05_quantile_forecast.py
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
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

_FF_PATH = Path(__file__).parent / "forecast_features.py"
_spec = importlib.util.spec_from_file_location("forecast_features", _FF_PATH)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)

MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "quantile_metrics.json"
OLD_JSON = DATA / "processed" / "quantile_metrics_v1.json"
QUANTILES = {"p10": 0.10, "p50": 0.50, "p90": 0.90}
TARGET_PICP = 0.80

LGB_BASE = dict(
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


def rmse(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


def _encode(y: np.ndarray) -> np.ndarray:
    return np.log1p(np.clip(y, 0, None))


def _decode(raw: np.ndarray) -> np.ndarray:
    return np.clip(np.expm1(raw), 0, None)


def _mono_sort(lo, mid, hi):
    stack = np.sort(np.vstack([lo, mid, hi]), axis=0)
    return stack[0], stack[1], stack[2]


def _conformal_expand(lo, hi, y, target=TARGET_PICP):
    """Symmetric expansion of [lo,hi] so coverage on this set ≈ target.

    scale s is found so mean(y in [mid - s*half, mid + s*half]) ≈ target,
    with mid = (lo+hi)/2 and half = (hi-lo)/2. Returns scale (≥1).
    """
    mid = 0.5 * (lo + hi)
    half = 0.5 * (hi - lo)
    half = np.maximum(half, 1e-3)
    # binary search scale
    lo_s, hi_s = 1.0, 3.0
    best = 1.0
    for _ in range(30):
        s = 0.5 * (lo_s + hi_s)
        cov = float(np.mean((y >= mid - s * half) & (y <= mid + s * half)))
        if cov < target:
            lo_s = s
        else:
            hi_s = s
            best = s
    return float(max(best, 1.0))


def main() -> None:
    print("=" * 92)
    print("QUANTILE FORECAST v2.1 — P10/P50/P90 on log1p + conformal calibration")
    print("=" * 92)

    # Preserve previous quantile metrics once
    if OUT_JSON.exists() and not OLD_JSON.exists():
        OLD_JSON.write_text(OUT_JSON.read_text(encoding="utf-8"), encoding="utf-8")
        say(f"backed up prior quantiles -> {OLD_JSON.name}")

    pool, per_city = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    say(f"{len(pool):,} target rows · {pool.station_id.nunique()} stations")

    ensure(MODEL_DIR)
    results = []
    old = {}
    if OLD_JSON.exists():
        old = {
            r["horizon_h"]: r
            for r in json.loads(OLD_JSON.read_text()).get("results", [])
        }

    for h in (24, 48, 72):
        print()
        print("=" * 92)
        print(f"HORIZON h = {h}h")
        print("=" * 92)

        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        feats = ff.feature_cols(df)
        tr, va, te = ff.train_val_test(df)
        say(f"train {len(tr):,} | val {len(va):,} | test {len(te):,} | feats {len(feats)}")

        y_tr = _encode(tr.y.to_numpy())
        y_va = _encode(va.y.to_numpy())

        preds_te: dict[str, np.ndarray] = {}
        preds_va: dict[str, np.ndarray] = {}
        for name, q in QUANTILES.items():
            params = {
                **LGB_BASE,
                "objective": "quantile",
                "alpha": q,
                "metric": "quantile",
            }
            ds_tr = lgb.Dataset(tr[feats], y_tr)
            ds_va = lgb.Dataset(va[feats], y_va, reference=ds_tr)
            model = lgb.train(
                params,
                ds_tr,
                num_boost_round=4000,
                valid_sets=[ds_va],
                callbacks=[lgb.early_stopping(120, verbose=False), lgb.log_evaluation(0)],
            )
            preds_te[name] = _decode(
                model.predict(te[feats], num_iteration=model.best_iteration)
            )
            preds_va[name] = _decode(
                model.predict(va[feats], num_iteration=model.best_iteration)
            )
            mp = MODEL_DIR / f"lgbm_pm25_h{h}_{name}.joblib"
            joblib.dump(
                {
                    "model": model,
                    "features": feats,
                    "horizon": h,
                    "quantile": q,
                    "target_mode": "log1p",
                    "version": "v2.1",
                },
                mp,
            )
            say(f"{name}: best_iter={model.best_iteration}  -> {mp.name}")

        y = te.y.to_numpy()
        yv = va.y.to_numpy()
        lo, mid, hi = _mono_sort(preds_te["p10"], preds_te["p50"], preds_te["p90"])
        lo_v, mid_v, hi_v = _mono_sort(preds_va["p10"], preds_va["p50"], preds_va["p90"])

        picp_raw = float(np.mean((y >= lo) & (y <= hi)))
        mpiw_raw = float(np.mean(hi - lo))

        # Conformal expansion fitted on VAL only
        scale = _conformal_expand(lo_v, hi_v, yv, TARGET_PICP)
        mid_te = 0.5 * (lo + hi)
        half_te = 0.5 * (hi - lo)
        lo_c = np.clip(mid_te - scale * half_te, 0, None)
        hi_c = mid_te + scale * half_te
        # Keep P50 as mid (sorted p50)
        picp_c = float(np.mean((y >= lo_c) & (y <= hi_c)))
        mpiw_c = float(np.mean(hi_c - lo_c))

        r = {
            "horizon_h": h,
            "n_test": int(len(te)),
            "n_features": len(feats),
            "target_mode": "log1p",
            "p50_rmse": rmse(y, mid),
            "p50_mae": mae(y, mid),
            "picp": picp_raw,
            "mpiw": mpiw_raw,
            "conformal_scale": scale,
            "picp_calibrated": picp_c,
            "mpiw_calibrated": mpiw_c,
            "crossing_rows_fixed": int(np.sum(preds_te["p10"] > preds_te["p90"])),
        }
        if h in old:
            r["v1_picp"] = old[h].get("picp")
            r["v1_p50_rmse"] = old[h].get("p50_rmse")
            r["v1_mpiw"] = old[h].get("mpiw")
        results.append(r)

        # Save calibrated band recipe for inference
        joblib.dump(
            {
                "conformal_scale": scale,
                "horizon": h,
                "target_mode": "log1p",
                "version": "v2.1",
            },
            MODEL_DIR / f"lgbm_pm25_h{h}_quantile_cal.joblib",
        )

        print()
        say(f"P50 RMSE {r['p50_rmse']:.2f} · MAE {r['p50_mae']:.2f}")
        say(f"PICP raw {picp_raw:.1%} · calibrated {picp_c:.1%} "
            f"(target 80%, scale={scale:.3f})")
        say(f"MPIW raw {mpiw_raw:.1f} · calibrated {mpiw_c:.1f} µg/m³")

    print()
    print("=" * 100)
    print("CALIBRATION")
    print("=" * 100)
    print(f"{'h':>4}{'n':>8}{'P50 RMSE':>10}{'P50 MAE':>9}"
          f"{'PICP_raw':>10}{'PICP_cal':>10}{'scale':>8}{'MPIW_cal':>10}")
    print("-" * 100)
    for r in results:
        print(
            f"{r['horizon_h']:>3}h{r['n_test']:>8,}{r['p50_rmse']:>10.2f}{r['p50_mae']:>9.2f}"
            f"{r['picp']:>9.1%}{r['picp_calibrated']:>9.1%}{r['conformal_scale']:>8.3f}"
            f"{r['mpiw_calibrated']:>10.1f}"
        )

    print()
    for r in results:
        gap = r["picp_calibrated"] - TARGET_PICP
        verdict = (
            "well calibrated" if abs(gap) <= 0.05
            else "over-confident (band too narrow)" if gap < 0
            else "under-confident (band too wide)"
        )
        print(f"  h={r['horizon_h']}h: {verdict} — "
              f"{r['picp_calibrated']:.1%} inside calibrated band "
              f"(raw {r['picp']:.1%})")

    # vs point champion
    fm = DATA / "processed" / "forecast_metrics.json"
    if fm.exists():
        payload = json.loads(fm.read_text())
        pt = {x["horizon_h"]: x.get("model_rmse") for x in payload.get("results", [])}
        print()
        print("  P50 vs point champion (RMSE):")
        for r in results:
            base = pt.get(r["horizon_h"])
            if base:
                d = (base - r["p50_rmse"]) / base * 100
                print(f"    {r['horizon_h']}h  quantile {r['p50_rmse']:.2f} vs point {base:.2f}"
                      f"  ({d:+.1f}%)")

    if old:
        print()
        print("  vs previous quantile run:")
        for r in results:
            if "v1_picp" in r:
                print(f"    {r['horizon_h']}h  PICP {r['v1_picp']:.1%} -> {r['picp']:.1%} raw / "
                      f"{r['picp_calibrated']:.1%} cal | "
                      f"P50 RMSE {r.get('v1_p50_rmse', float('nan')):.2f} -> {r['p50_rmse']:.2f}")

    OUT_JSON.write_text(
        json.dumps(
            {
                "method": "LightGBM quantile on log1p(pm25), v2.1 features, "
                          "conformal scale from val tail",
                "version": "v2.1",
                "split": "time-ordered per station, last 20% test; val = tail 15% of train",
                "target_mode": "log1p",
                "note": "PICP raw = [P10,P90]; PICP calibrated expands the band "
                        "with a val-fitted scale to target 80%.",
                "rows_per_city": per_city,
                "results": results,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print()
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
