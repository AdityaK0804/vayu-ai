"""Print v1 / v2 / v2.1 proof table."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P = ROOT / "data" / "processed"

v1 = json.loads((P / "forecast_metrics_v1_baseline.json").read_text())
v21 = json.loads((P / "forecast_metrics_v21.json").read_text())
proof = json.loads((P / "forecast_proof_report.json").read_text()) if (P / "forecast_proof_report.json").exists() else None

print("=" * 92)
print("AIRSIGHT FORECAST PROOF  (lower RMSE/MAE is better)")
print("=" * 92)
print(f"{'h':>4} {'metric':<8} {'v1':>10} {'v2.1':>10} {'delta':>10} {'vs persist':>12}")
print("-" * 92)

for r in v1["results"]:
    h = r["horizon_h"]
    c = next(x for x in v21["champions"] if x["horizon_h"] == h)
    pers = r.get("persistence_rmse")
    for metric, old, new in [
        ("RMSE", r["model_rmse"], c["model_rmse"]),
        ("MAE", r["model_mae"], c["model_mae"]),
    ]:
        d = 100 * (old - new) / old
        vp = ""
        if metric == "RMSE" and pers:
            vp = f"{100*(pers-new)/pers:+.1f}%"
        print(f"{h:>3}h {metric:<8} {old:>10.3f} {new:>10.3f} {d:>+9.2f}% {vp:>12}")
    print(f"     champion={c['champion']}  korba_rmse={c.get('korba_rmse')}  "
          f"severe60={c.get('severe_ge60_rmse')}")
    print()

print("Features: v1 n=38  ->  v2.1 n=", v21["horizons"]["24"]["n_features"])
print("Upgrades: met@t+h, multi-CAMS, long lags/rolling, deltas, trap_index,")
print("          traffic proxy, aux pollutants, log1p, sample weights, CatBoost, ensemble")
print()

qm_path = P / "quantile_metrics.json"
if qm_path.exists():
    qm = json.loads(qm_path.read_text())
    print("QUANTILES (P10–P90, log1p + conformal cal)")
    print(f"{'h':>4} {'P50 RMSE':>10} {'PICP_cal':>10} {'MPIW_cal':>10}")
    for r in qm.get("results", []):
        print(f"{r['horizon_h']:>3}h {r['p50_rmse']:>10.2f} "
              f"{r.get('picp_calibrated', r.get('picp', 0)):>9.1%} "
              f"{r.get('mpiw_calibrated', r.get('mpiw', 0)):>10.1f}")
    print()

print("Artifact files:")
print("  data/processed/forecast_metrics_v1_baseline.json")
print("  data/processed/forecast_proof_report.json")
print("  data/processed/forecast_metrics_v21.json")
print("  data/processed/quantile_metrics.json")
print("  data/processed/forecast_metrics.json  (champions pointer)")
print("  data/models/lgbm_pm25_h{24,48,72}.joblib  (v2.1 deploy, log1p)")
print("  data/models/lgbm_pm25_h{24,48,72}_p{10,50,90}.joblib")
print("  web/public/data/{korba,jagdalpur}/  (baked demo)")
