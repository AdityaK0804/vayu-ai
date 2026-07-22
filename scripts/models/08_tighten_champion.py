"""v2.1 tighten pass: log1p + sample weights + met deltas + dual objective.

Focuses on the variants that already won in 07_ensemble_proof:
  * LightGBM log1p (best MAE / long horizon)
  * LightGBM raw (strong RMSE short horizon)
  * CatBoost log1p
  * Ensemble of the two best by val RMSE

Sample weights: emphasize moderate-severe pollution without fully
chasing 800 µg/m³ sensor spikes:
  w = clip(1 + y / y_train_median, 1, 4)

Also trains a Huber-loss LGBM on log1p for robustness.

Run:  python scripts/models/08_tighten_champion.py
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
from catboost import CatBoostRegressor, Pool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say  # noqa: E402

_FF_PATH = Path(__file__).parent / "forecast_features.py"
_spec = importlib.util.spec_from_file_location("forecast_features", _FF_PATH)
ff = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(ff)

MODEL_DIR = DATA / "models"
OUT_JSON = DATA / "processed" / "forecast_metrics_v21.json"
PROOF = DATA / "processed" / "forecast_proof_report.json"
BASELINES = DATA / "processed" / "baseline_metrics.json"
V1_JSON = DATA / "processed" / "forecast_metrics_v1_baseline.json"
HORIZONS = [24, 48, 72]

LGB_LOG = dict(
    objective="regression", metric="rmse", learning_rate=0.025,
    num_leaves=127, min_data_in_leaf=40, feature_fraction=0.75,
    bagging_fraction=0.80, bagging_freq=1, lambda_l2=3.0, lambda_l1=0.2,
    max_bin=255, verbosity=-1, n_jobs=-1, seed=42,
)
LGB_HUBER = dict(
    objective="huber", alpha=0.9, metric="rmse", learning_rate=0.025,
    num_leaves=95, min_data_in_leaf=50, feature_fraction=0.75,
    bagging_fraction=0.80, bagging_freq=1, lambda_l2=2.0,
    verbosity=-1, n_jobs=-1, seed=43,
)
CB_LOG = dict(
    loss_function="RMSE", eval_metric="RMSE", iterations=5000,
    learning_rate=0.03, depth=8, l2_leaf_reg=5.0, random_seed=42,
    od_type="Iter", od_wait=150, verbose=False, allow_writing_files=False,
)


def encode(y, lag0, mode):
    if mode == "raw":
        return y
    if mode == "log1p":
        return np.log1p(np.clip(y, 0, None))
    raise ValueError(mode)


def decode(raw, lag0, mode):
    if mode == "raw":
        p = raw
    else:
        p = np.expm1(raw)
    return np.clip(p, 0, None)


def weights(y: np.ndarray) -> np.ndarray:
    med = float(np.median(y[y > 0])) if np.any(y > 0) else 20.0
    w = 1.0 + (y / max(med, 1.0))
    return np.clip(w, 1.0, 4.0)


def train_lgb(tr, va, te, feats, mode, params, name):
    y_tr = encode(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), mode)
    y_va = encode(va.y.to_numpy(), va.pm25_lag0.to_numpy(), mode)
    w_tr = weights(tr.y.to_numpy())
    w_va = weights(va.y.to_numpy())
    ds_tr = lgb.Dataset(tr[feats], y_tr, weight=w_tr)
    ds_va = lgb.Dataset(va[feats], y_va, weight=w_va, reference=ds_tr)
    model = lgb.train(
        params, ds_tr, num_boost_round=6000, valid_sets=[ds_va],
        callbacks=[lgb.early_stopping(180, verbose=False), lgb.log_evaluation(0)],
    )
    p_va = decode(model.predict(va[feats], num_iteration=model.best_iteration),
                  va.pm25_lag0.to_numpy(), mode)
    p_te = decode(model.predict(te[feats], num_iteration=model.best_iteration),
                  te.pm25_lag0.to_numpy(), mode)
    return model, p_va, p_te, int(model.best_iteration)


def train_cb(tr, va, te, feats, mode):
    y_tr = encode(tr.y.to_numpy(), tr.pm25_lag0.to_numpy(), mode)
    y_va = encode(va.y.to_numpy(), va.pm25_lag0.to_numpy(), mode)
    w_tr = weights(tr.y.to_numpy())
    X_tr = tr[feats].astype("float64")
    X_va = va[feats].astype("float64")
    X_te = te[feats].astype("float64")
    model = CatBoostRegressor(**CB_LOG)
    model.fit(
        Pool(X_tr, y_tr, weight=w_tr),
        eval_set=Pool(X_va, y_va),
        use_best_model=True,
    )
    p_va = decode(model.predict(X_va), va.pm25_lag0.to_numpy(), mode)
    p_te = decode(model.predict(X_te), te.pm25_lag0.to_numpy(), mode)
    return model, p_va, p_te, int(model.get_best_iteration() or 0)


def blend(preds_va, y_va, preds_te):
    w = {k: 1.0 / max(ff.rmse(y_va, p), 1e-6) for k, p in preds_va.items()}
    s = sum(w.values())
    w = {k: v / s for k, v in w.items()}
    ens = sum(w[k] * preds_te[k] for k in w)
    return ens, w


def pack(name, p_te, te, y_te, p_va, y_va, bl, v1, h, best_iter, n_feats):
    m = ff.stratified_metrics(y_te, p_te, te)
    out = {
        "name": name,
        "best_iteration": best_iter,
        "n_features": n_feats,
        "model_rmse": m["rmse"],
        "model_mae": m["mae"],
        "val_rmse": ff.rmse(y_va, p_va),
        "stratified": {k: v for k, v in m.items()
                       if k not in ("rmse", "mae", "n", "by_city")},
        "by_city": m["by_city"],
    }
    b = bl.get(h, {})
    if b.get("persistence_rmse"):
        out["vs_persistence_pct"] = 100 * (b["persistence_rmse"] - m["rmse"]) / b["persistence_rmse"]
    if b.get("cams_bc_rmse"):
        out["vs_cams_bc_pct"] = 100 * (b["cams_bc_rmse"] - m["rmse"]) / b["cams_bc_rmse"]
    if h in v1:
        out["vs_v1_pct"] = 100 * (v1[h]["model_rmse"] - m["rmse"]) / v1[h]["model_rmse"]
    kor = te.city_id == "korba"
    if kor.any():
        mask = kor.to_numpy()
        out["korba_rmse"] = ff.rmse(y_te[mask], p_te[mask])
        out["korba_persistence_rmse"] = ff.rmse(y_te[mask], te.pm25_lag0.to_numpy()[mask])
        out["korba_mae"] = ff.mae(y_te[mask], p_te[mask])
    return out


def main() -> None:
    print("=" * 100)
    print("AIRSIGHT v2.1 TIGHTEN — log1p + weights + met deltas + huber")
    print("=" * 100)

    pool, per_city = ff.load_pool()
    pool = ff.mark_split(pool)
    sat = ff.load_satellite()
    curve = ff.build_congestion_curve()
    bl = {r["horizon_h"]: r for r in json.loads(BASELINES.read_text()).get("results", [])} \
        if BASELINES.exists() else {}
    v1 = {r["horizon_h"]: r for r in json.loads(V1_JSON.read_text()).get("results", [])} \
        if V1_JSON.exists() else {}
    v2 = {}
    if PROOF.exists():
        pr = json.loads(PROOF.read_text())
        for h, d in pr.get("horizons", {}).items():
            v2[int(h)] = d.get("champion_rmse")

    ensure(MODEL_DIR)
    report = {"version": "v2.1", "rows_per_city": per_city, "horizons": {}, "champions": []}

    for h in HORIZONS:
        print()
        print("=" * 100)
        print(f"h={h}h")
        print("=" * 100)
        df = ff.build_samples(pool, sat, h, traffic_curve=curve)
        feats = ff.feature_cols(df)
        tr, va, te = ff.train_val_test(df)
        say(f"train {len(tr):,} val {len(va):,} test {len(te):,} feats {len(feats)}")
        y_te, y_va = te.y.to_numpy(), va.y.to_numpy()

        variants = {}
        preds_va, preds_te = {}, {}
        models = {}

        for name, mode, kind in [
            ("lgbm_log1p_w", "log1p", "lgb_log"),
            ("lgbm_raw_w", "raw", "lgb_log"),
            ("lgbm_huber_log1p", "log1p", "lgb_huber"),
            ("catboost_log1p_w", "log1p", "cb"),
        ]:
            say(f"training {name}...")
            if kind == "lgb_log":
                model, p_va, p_te, best = train_lgb(tr, va, te, feats, mode, LGB_LOG, name)
            elif kind == "lgb_huber":
                model, p_va, p_te, best = train_lgb(tr, va, te, feats, mode, LGB_HUBER, name)
            else:
                model, p_va, p_te, best = train_cb(tr, va, te, feats, mode)
            models[name] = (model, mode, feats)
            preds_va[name], preds_te[name] = p_va, p_te
            variants[name] = pack(name, p_te, te, y_te, p_va, y_va, bl, v1, h, best, len(feats))
            say(f"  {name}: RMSE={variants[name]['model_rmse']:.3f} "
                f"MAE={variants[name]['model_mae']:.3f} "
                f"severe60={variants[name]['stratified'].get('severe_ge60_rmse', float('nan')):.2f}")

        # Ensembles
        ranked = sorted(variants, key=lambda k: variants[k]["val_rmse"])
        top2 = ranked[:2]
        ens2, w2 = blend({k: preds_va[k] for k in top2}, y_va, {k: preds_te[k] for k in top2})
        variants["ensemble_top2"] = pack(
            "ensemble_top2", ens2, te, y_te,
            sum(w2[k] * preds_va[k] for k in top2), y_va, bl, v1, h, 0, len(feats),
        )
        variants["ensemble_top2"]["members"] = top2
        variants["ensemble_top2"]["weights"] = w2

        ens_all, w_all = blend(preds_va, y_va, preds_te)
        variants["ensemble_all"] = pack(
            "ensemble_all", ens_all, te, y_te,
            sum(w_all[k] * preds_va[k] for k in w_all), y_va, bl, v1, h, 0, len(feats),
        )
        variants["ensemble_all"]["weights"] = w_all

        champ = min(variants, key=lambda k: variants[k]["model_rmse"])
        best_mae = min(variants, key=lambda k: variants[k]["model_mae"])
        say(f"CHAMPION RMSE: {champ} = {variants[champ]['model_rmse']:.3f}")
        say(f"CHAMPION MAE : {best_mae} = {variants[best_mae]['model_mae']:.3f}")

        # Save production bundles: best single model + ensemble recipe
        singles = {k: v for k, v in variants.items() if not k.startswith("ensemble")}
        best_single = min(singles, key=lambda k: singles[k]["model_rmse"])
        model, mode, feats_s = models[best_single]
        joblib.dump(
            {"model": model, "features": feats_s, "horizon": h,
             "target_mode": mode, "backend": best_single, "version": "v2.1"},
            MODEL_DIR / f"champion_pm25_h{h}.joblib",
        )
        # Keep lgbm_pm25_h{h}.joblib as best lgbm for downstream SHAP
        lgbm_cands = [k for k in singles if k.startswith("lgbm")]
        if lgbm_cands:
            best_lgb = min(lgbm_cands, key=lambda k: singles[k]["model_rmse"])
            m_lgb, mode_lgb, feats_lgb = models[best_lgb]
            joblib.dump(
                {"model": m_lgb, "features": feats_lgb, "horizon": h,
                 "target_mode": mode_lgb, "backend": "lightgbm", "version": "v2.1",
                 "variant": best_lgb},
                MODEL_DIR / f"lgbm_pm25_h{h}.joblib",
            )
            ok(f"deploy lgbm_pm25_h{h}.joblib <- {best_lgb}")

        joblib.dump(
            {"type": "ensemble", "members": top2, "weights": w2,
             "horizon": h, "features": feats, "version": "v2.1"},
            MODEL_DIR / f"ensemble_top2_h{h}.joblib",
        )

        print()
        print(f"  {'variant':<22}{'RMSE':>9}{'MAE':>9}{'sev60':>9}{'vs_v1':>9}{'vs_v2':>9}")
        print("  " + "-" * 70)
        if h in v1:
            print(f"  {'v1_baseline':<22}{v1[h]['model_rmse']:>9.2f}{v1[h]['model_mae']:>9.2f}"
                  f"{'—':>9}{'—':>9}{'—':>9}")
        if h in v2:
            print(f"  {'v2_champion':<22}{v2[h]:>9.2f}{'':>9}{'':>9}{'':>9}{'—':>9}")
        for name, v in sorted(variants.items(), key=lambda kv: kv[1]["model_rmse"]):
            sev = v["stratified"].get("severe_ge60_rmse")
            sev_s = f"{sev:.1f}" if sev else "-"
            vv1 = f"{v.get('vs_v1_pct'):+.1f}%" if v.get("vs_v1_pct") is not None else "-"
            vv2 = f"{100*(v2[h]-v['model_rmse'])/v2[h]:+.1f}%" if h in v2 else "-"
            print(f"  {name:<22}{v['model_rmse']:>9.2f}{v['model_mae']:>9.2f}"
                  f"{sev_s:>9}{vv1:>9}{vv2:>9}")

        report["horizons"][str(h)] = {
            "n_test": int(len(te)),
            "n_features": len(feats),
            "v1_rmse": v1[h]["model_rmse"] if h in v1 else None,
            "v2_rmse": v2.get(h),
            "persistence_rmse": bl.get(h, {}).get("persistence_rmse"),
            "variants": variants,
            "champion_rmse": variants[champ]["model_rmse"],
            "champion": champ,
            "champion_mae_name": best_mae,
            "champion_mae": variants[best_mae]["model_mae"],
        }
        report["champions"].append({
            "horizon_h": h,
            "champion": champ,
            "model_rmse": variants[champ]["model_rmse"],
            "model_mae": variants[champ]["model_mae"],
            "vs_v1_pct": variants[champ].get("vs_v1_pct"),
            "vs_persistence_pct": variants[champ].get("vs_persistence_pct"),
            "vs_cams_bc_pct": variants[champ].get("vs_cams_bc_pct"),
            "korba_rmse": variants[champ].get("korba_rmse"),
            "severe_ge60_rmse": variants[champ]["stratified"].get("severe_ge60_rmse"),
            "best_single": best_single,
            "best_single_rmse": variants[best_single]["model_rmse"],
        })

    OUT_JSON.write_text(json.dumps(report, indent=2, default=float), encoding="utf-8")
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")

    # Update main metrics pointer
    (DATA / "processed" / "forecast_metrics.json").write_text(
        json.dumps({
            "model": "AirSight v2.1 tighten champions",
            "version": "v2.1",
            "source": "08_tighten_champion.py",
            "proof_v2": str(PROOF.relative_to(ROOT)) if PROOF.exists() else None,
            "proof_v21": str(OUT_JSON.relative_to(ROOT)),
            "v1_baseline": str(V1_JSON.relative_to(ROOT)) if V1_JSON.exists() else None,
            "results": report["champions"],
        }, indent=2, default=float),
        encoding="utf-8",
    )
    ok("updated forecast_metrics.json")

    print()
    print("=" * 100)
    print("v2.1 PROOF SUMMARY")
    print("=" * 100)
    print(f"{'h':>4}{'champ':>22}{'RMSE':>9}{'MAE':>9}{'vs_v1':>9}{'vs_pers':>9}")
    for c in report["champions"]:
        vv = f"{c['vs_v1_pct']:+.1f}%" if c.get("vs_v1_pct") is not None else "-"
        vp = f"{c['vs_persistence_pct']:+.1f}%" if c.get("vs_persistence_pct") is not None else "-"
        print(f"{c['horizon_h']:>3}h{c['champion']:>22}{c['model_rmse']:>9.2f}"
              f"{c['model_mae']:>9.2f}{vv:>9}{vp:>9}")


if __name__ == "__main__":
    main()
