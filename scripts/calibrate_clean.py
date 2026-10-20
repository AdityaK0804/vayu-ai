"""Fit split-conformal interval scales for models/<version> (CQR-style).

Quantile models are refit on train (< 2025-01-01 UTC). The scale s per horizon
is the finite-sample-corrected 80% quantile of the normalised nonconformity
score on the even 7-day blocks of the held-out period (>= 2025-01-01). Coverage is then
measured on the odd 7-day blocks. The fitted scales
are written to models/<version>/calibration.json and bundle.json.

    python scripts/calibrate_clean.py --version clean_20261020
"""
from __future__ import annotations

import argparse, json, math, sys
from datetime import datetime, timezone
from pathlib import Path

import lightgbm as lgb, numpy as np, pandas as pd, yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import train_clean as tc  # noqa: E402

TARGET_COVERAGE = 0.8  # nominal p10–p90 band


def nonconformity(y, p10, p50, p90):
    lo = np.maximum(p50 - p10, 1e-6)
    hi = np.maximum(p90 - p50, 1e-6)
    return np.where(y < p50, (p50 - y) / lo, (y - p50) / hi)


def apply(scale, p10, p50, p90):
    lo = np.maximum(p50 - scale * (p50 - p10), 0.0)
    return np.minimum(lo, p50), p50, np.maximum(p50 + scale * (p90 - p50), p50)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--om-dir", default="/workspace/vayu-data/fetched/open_meteo")
    a = ap.parse_args()
    vdir = tc.ROOT / "models" / a.version
    pms, inputs, _, cams_start = tc.load_clean_stations(Path(a.om_dir), tc.ROOT / "data" / "cpcb")
    t_cal, t_eval = pd.Timestamp("2025-01-01", tz="UTC"), pd.Timestamp("2025-07-01", tz="UTC")
    out = {"created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "method": "split-conformal scaling of p10/p90 half-widths around p50 (CQR)",
           "target_coverage": TARGET_COVERAGE,
           "windows": {"train": "< 2025-01-01", "calibration": ">= 2025-01-01, even 7-day blocks",
                       "evaluation": ">= 2025-01-01, odd 7-day blocks (never used for fitting)"}, "horizons": {}}
    for h in tc.HORIZONS:
        f = pd.concat(tc.station_frame(pms[s], *inputs[s], h) for s in pms)
        f = f[f.index >= cams_start]
        # Held-out period split into alternating 7-day blocks so both the
        # calibration and evaluation sets span every season (monsoon vs winter
        # shift made a contiguous Jan-Jun calibration under-cover Jul-Dec).
        tr, hold = f[f.index < t_cal], f[f.index >= t_cal]
        block = ((hold.index - t_cal) // pd.Timedelta(days=7)) % 2
        ca, ev = hold[block == 0], hold[block == 1]
        preds = {}
        for qv in (0.1, 0.5, 0.9):
            m = lgb.LGBMRegressor(objective="quantile", alpha=qv, **tc.PARAMS).fit(tr[tc.FEATURES], tr["target"])
            preds[qv] = (m.predict(ca[tc.FEATURES]), m.predict(ev[tc.FEATURES]))
        p10c, p50c, p90c = (np.minimum(preds[0.1][0], preds[0.5][0]), preds[0.5][0],
                            np.maximum(preds[0.9][0], preds[0.5][0]))
        p10e, p50e, p90e = (np.minimum(preds[0.1][1], preds[0.5][1]), preds[0.5][1],
                            np.maximum(preds[0.9][1], preds[0.5][1]))
        scores = nonconformity(ca["target"].values, p10c, p50c, p90c)
        n = len(scores)
        level = min(1.0, math.ceil((n + 1) * TARGET_COVERAGE) / n)
        scale = float(np.quantile(scores, level, method="higher"))
        ye = ev["target"].values
        raw = float(np.mean((ye >= np.maximum(p10e, 0)) & (ye <= p90e)))
        lo, _, hi = apply(scale, p10e, p50e, p90e)
        cal = float(np.mean((ye >= lo) & (ye <= hi)))
        out["horizons"][str(h)] = {"scale": round(scale, 4), "n_calibration": n, "n_evaluation": int(len(ev)),
            "eval_coverage_raw": round(raw, 3), "eval_coverage_calibrated": round(cal, 3),
            "eval_mean_width_raw": round(float(np.mean(p90e - np.maximum(p10e, 0))), 2),
            "eval_mean_width_calibrated": round(float(np.mean(hi - lo)), 2)}
        print(h, out["horizons"][str(h)], flush=True)
    (vdir / "calibration.json").write_text(json.dumps(out, indent=2))
    b = json.loads((vdir / "bundle.json").read_text())
    b["calibration"] = {}
    b["calibration_by_horizon"] = {k: {"scale": v["scale"], "source": "calibration.json"}
                                   for k, v in out["horizons"].items()}
    (vdir / "bundle.json").write_text(json.dumps(b, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
