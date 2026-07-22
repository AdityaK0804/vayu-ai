"""Quantile forecast heads — P10 / P50 / P90 confidence bands.

The one idea worth taking from the Climate Saathi reference. Their LSTM emits
three quantile heads with a pinball loss; LightGBM does the same natively via
`objective="quantile"`, so we get calibrated bands with no new architecture, no
sequence framing, and — crucially — no change to the honest setup we already
have: real measured CPCB labels and a time-ordered split.

What this adds over 01_forecast_lgbm.py: instead of one number, each horizon
returns a range. A forecast of "48 µg/m³ (P10 31 – P90 71)" tells an official
how much to trust it; a bare 48 does not.

Reported per horizon:
  * P50 RMSE/MAE          — should track the existing point model
  * PICP                  — Prediction Interval Coverage Probability: the share
                            of actuals that land inside [P10, P90]. A correctly
                            calibrated 80% band should cover ~80%.
  * MPIW                  — Mean Prediction Interval Width, in µg/m³.

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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "quantile_metrics.json"
QUANTILES = {"p10": 0.10, "p50": 0.50, "p90": 0.90}
VAL_FRAC = 0.15


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / fname)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _load("fc", "01_forecast_lgbm.py")


def rmse(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


def main() -> None:
    print("=" * 92)
    print("QUANTILE FORECAST — P10 / P50 / P90 confidence bands")
    print("=" * 92)

    pool, per_city = FC.load_pool()
    pool = FC.mark_split(pool)
    sat = FC.load_satellite()
    say(f"{len(pool):,} target rows · {pool.station_id.nunique()} stations")

    ensure(MODEL_DIR)
    results = []

    for h in (24, 48, 72):
        print()
        print("=" * 92)
        print(f"HORIZON h = {h}h")
        print("=" * 92)

        df = FC.build_samples(pool, sat, h)
        feats = FC.feature_cols(df)

        tr_all = df[df.split == "train"].sort_values("timestamp")
        te = df[df.split == "test"]
        vcut = int(len(tr_all) * (1 - VAL_FRAC))
        tr, va = tr_all.iloc[:vcut], tr_all.iloc[vcut:]
        say(f"train {len(tr):,} | val {len(va):,} | test {len(te):,}")

        preds: dict[str, np.ndarray] = {}
        for name, q in QUANTILES.items():
            params = {
                **FC.LGB_PARAMS,
                "objective": "quantile",
                "alpha": q,
                "metric": "quantile",
            }
            ds_tr = lgb.Dataset(tr[feats], tr.y)
            ds_va = lgb.Dataset(va[feats], va.y, reference=ds_tr)
            model = lgb.train(
                params,
                ds_tr,
                num_boost_round=3000,
                valid_sets=[ds_va],
                callbacks=[lgb.early_stopping(100, verbose=False), lgb.log_evaluation(0)],
            )
            preds[name] = np.clip(
                model.predict(te[feats], num_iteration=model.best_iteration), 0, None
            )
            mp = MODEL_DIR / f"lgbm_pm25_h{h}_{name}.joblib"
            joblib.dump({"model": model, "features": feats, "horizon": h, "quantile": q}, mp)
            say(f"{name}: best_iter={model.best_iteration}  -> {mp.name}")

        y = te.y.to_numpy()
        lo, mid, hi = preds["p10"], preds["p50"], preds["p90"]

        # Quantile regression fits each level independently, so the three curves
        # can cross on individual rows. Sorting restores monotonicity without
        # touching the fit.
        stack = np.sort(np.vstack([lo, mid, hi]), axis=0)
        lo, mid, hi = stack[0], stack[1], stack[2]

        picp = float(np.mean((y >= lo) & (y <= hi)))
        mpiw = float(np.mean(hi - lo))

        r = {
            "horizon_h": h,
            "n_test": int(len(te)),
            "p50_rmse": rmse(y, mid),
            "p50_mae": mae(y, mid),
            "picp": picp,
            "mpiw": mpiw,
            "crossing_rows_fixed": int(np.sum(preds["p10"] > preds["p90"])),
        }
        results.append(r)
        print()
        say(f"P50 RMSE {r['p50_rmse']:.2f} · MAE {r['p50_mae']:.2f}")
        say(f"PICP {picp:.1%} (target 80%) · MPIW {mpiw:.1f} µg/m³")

    # ---------------------------------------------------------------- report
    print()
    print("=" * 92)
    print("CALIBRATION")
    print("=" * 92)
    print(f"{'h':>4}{'n_test':>9}{'P50 RMSE':>11}{'P50 MAE':>10}{'PICP':>9}{'target':>9}{'MPIW':>10}")
    print("-" * 92)
    for r in results:
        print(
            f"{r['horizon_h']:>3}h{r['n_test']:>9,}{r['p50_rmse']:>11.2f}{r['p50_mae']:>10.2f}"
            f"{r['picp']:>8.1%}{'80.0%':>9}{r['mpiw']:>10.1f}"
        )

    print()
    for r in results:
        gap = r["picp"] - 0.80
        verdict = (
            "well calibrated" if abs(gap) <= 0.05
            else "over-confident (band too narrow)" if gap < 0
            else "under-confident (band too wide)"
        )
        print(f"  h={r['horizon_h']}h: {verdict} — {r['picp']:.1%} of actuals inside the band")

    # compare against the existing point model
    fm = DATA / "processed" / "forecast_metrics.json"
    if fm.exists():
        pt = {x["horizon_h"]: x["model_rmse"] for x in json.loads(fm.read_text())["results"]}
        print()
        print("  P50 vs the existing point model (RMSE):")
        for r in results:
            base = pt.get(r["horizon_h"])
            if base:
                d = (base - r["p50_rmse"]) / base * 100
                print(f"    {r['horizon_h']}h  quantile {r['p50_rmse']:.2f} vs point {base:.2f}"
                      f"  ({d:+.1f}%)")

    OUT_JSON.write_text(
        json.dumps(
            {
                "method": "LightGBM objective=quantile, alpha in {0.10,0.50,0.90}",
                "split": "time-ordered per station, last 20% test (same as the point model)",
                "note": "PICP is the share of test actuals inside [P10,P90]; 80% is the target.",
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
