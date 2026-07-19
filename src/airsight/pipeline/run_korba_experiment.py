"""Korba experiment runner.

CLI usage::

    python -m airsight.pipeline.run_korba_experiment --stage baselines
    python -m airsight.pipeline.run_korba_experiment --stage baselines
    python -m airsight.pipeline.run_korba_experiment --stage temporal
    python -m airsight.pipeline.run_korba_experiment --stage features_static
    python -m airsight.pipeline.run_korba_experiment --stage attribution

Stages:
    baselines       Run persistence + climatology baselines on Korba station panel.
    temporal        Train LightGBM temporal model and compare to baselines.
    features_static Merge EDGAR, Pop, FIRMS and train LightGBM.
    attribution     Run EDGAR comparison prototype.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

from airsight.config import OUTPUTS
from airsight.models.baselines import (
    persistence_1h,
    persistence_24h,
    station_climatology_hour,
)
from airsight.models.evaluate import score_baseline, time_split


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_REPORTS = OUTPUTS / "reports"
_METRICS = OUTPUTS / "metrics"


def _load_panel(city_id: str = "korba") -> pd.DataFrame:
    path = _REPORTS / f"station_panel_{city_id}.parquet"
    if not path.exists():
        print(f"  [!] Panel not found: {path}")
        print("      Run:  python -m airsight.pipeline.build_station_panel "
              f"--city {city_id}")
        sys.exit(1)
    df = pd.read_parquet(path)
    df.sort_values(["station_id", "timestamp"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ---------------------------------------------------------------------------
# Stage: baselines
# ---------------------------------------------------------------------------

def _run_baselines(city_id: str = "korba") -> None:
    print(f"\n{'='*60}")
    print(f"  Baselines — {city_id}")
    print(f"{'='*60}\n")

    df = _load_panel(city_id)
    print(f"  Panel: {len(df):,} rows, "
          f"{df['station_id'].nunique()} station(s)\n")

    train_mask, test_mask = time_split(df)
    split_ts = df.loc[train_mask, "timestamp"].max()
    print(f"  Train/test split at: {split_ts}")
    print(f"  Train rows: {train_mask.sum():,}  |  Test rows: {test_mask.sum():,}\n")

    results: dict[str, dict] = {}

    # --- persistence_1h ---
    pred = persistence_1h(df)
    m = score_baseline(pred, test_mask)
    results["persistence_1h"] = m
    print(f"  persistence_1h   RMSE={m['rmse']:.2f}  MAE={m['mae']:.2f}  "
          f"R2={m['r2']:.4f}  (n={m['n_scored']:,}, "
          f"dropped={m['n_dropped_nan']:,})")

    # --- persistence_24h ---
    pred = persistence_24h(df)
    m = score_baseline(pred, test_mask)
    results["persistence_24h"] = m
    print(f"  persistence_24h  RMSE={m['rmse']:.2f}  MAE={m['mae']:.2f}  "
          f"R2={m['r2']:.4f}  (n={m['n_scored']:,}, "
          f"dropped={m['n_dropped_nan']:,})")

    # --- station_climatology_hour ---
    pred = station_climatology_hour(df, train_mask)
    m = score_baseline(pred, test_mask)
    results["station_climatology_hour"] = m
    print(f"  climatology_hr   RMSE={m['rmse']:.2f}  MAE={m['mae']:.2f}  "
          f"R2={m['r2']:.4f}  (n={m['n_scored']:,}, "
          f"dropped={m['n_dropped_nan']:,})")

    # ---- Write JSON ----
    _METRICS.mkdir(parents=True, exist_ok=True)
    json_path = _METRICS / f"{city_id}_baselines.json"
    with open(json_path, "w") as fh:
        json.dump(results, fh, indent=2)
    print(f"\n  [OK] {json_path}")

    # ---- Write markdown table ----
    _REPORTS.mkdir(parents=True, exist_ok=True)
    md_path = _REPORTS / f"{city_id}_baselines.md"
    lines = [
        f"# Baseline Results -- {city_id.title()}\n",
        f"Split point: {split_ts}\n",
        "| Model | RMSE | MAE | R2 | N scored | N dropped (NaN) |",
        "|-------|------|-----|----|----------|-----------------|",
    ]
    for name, m in results.items():
        lines.append(
            f"| {name} | {m['rmse']:.2f} | {m['mae']:.2f} | "
            f"{m['r2']:.4f} | {m['n_scored']:,} | {m['n_dropped_nan']:,} |"
        )
    lines.append("")
    with open(md_path, "w") as fh:
        fh.write("\n".join(lines))
    print(f"  [OK] {md_path}")


# ---------------------------------------------------------------------------
# Stage: temporal
# ---------------------------------------------------------------------------

def _run_temporal(city_id: str = "korba") -> None:
    from airsight.models.temporal import train_temporal, save_model

    print(f"\n{'='*60}")
    print(f"  Temporal Model -- {city_id}")
    print(f"{'='*60}\n")

    df = _load_panel(city_id)

    result = train_temporal(df)
    meta = result["meta"]
    test_m = result["test_metrics"]
    train_m = result["train_metrics"]
    imp = result["feature_importance"]

    # ---- Save model ----
    _MODELS = OUTPUTS / "models"
    _MODELS.mkdir(parents=True, exist_ok=True)
    model_path = _MODELS / f"{city_id}_temporal_lgbm.txt"
    save_model(result["model"], model_path)

    # ---- Save feature importance ----
    imp_path = _REPORTS / f"{city_id}_temporal_feature_importance.csv"
    imp.to_csv(imp_path, index=False)
    print(f"  [OK] Feature importance: {imp_path}")

    # ---- Load baseline metrics for comparison ----
    baselines_path = _METRICS / f"{city_id}_baselines.json"
    baselines = {}
    if baselines_path.exists():
        with open(baselines_path) as fh:
            baselines = json.load(fh)

    p1h_rmse = baselines.get("persistence_1h", {}).get("rmse", float("inf"))
    p24h_rmse = baselines.get("persistence_24h", {}).get("rmse", float("inf"))

    beat_p1h = test_m["rmse"] < p1h_rmse
    beat_p24h = test_m["rmse"] < p24h_rmse

    # ---- Save metrics ----
    _METRICS.mkdir(parents=True, exist_ok=True)
    metrics_out = {
        "model": "lightgbm_temporal_v1",
        "backend": meta["backend"],
        "split_point": meta["split_point"],
        "n_train": meta["n_train"],
        "n_test": meta["n_test"],
        "train": train_m,
        "test": test_m,
        "baselines": {
            "persistence_1h_rmse": p1h_rmse,
            "persistence_24h_rmse": p24h_rmse,
        },
        "beat_persistence_1h": beat_p1h,
        "beat_persistence_24h": beat_p24h,
        "feature_cols": result["feature_cols"],
    }
    json_path = _METRICS / f"{city_id}_temporal.json"
    with open(json_path, "w") as fh:
        json.dump(metrics_out, fh, indent=2)
    print(f"  [OK] Metrics: {json_path}")

    # ---- Print scorecard ----
    print(f"\n{'='*60}")
    print(f"  SCORECARD -- {city_id.upper()}")
    print(f"{'='*60}")
    print(f"  {'Model':<25s} {'RMSE':>8s} {'MAE':>8s} {'R2':>8s}")
    print(f"  {'-'*25} {'-'*8} {'-'*8} {'-'*8}")
    if baselines:
        for bname in ["persistence_1h", "persistence_24h"]:
            bm = baselines[bname]
            print(f"  {bname:<25s} {bm['rmse']:8.2f} {bm['mae']:8.2f} {bm['r2']:8.4f}")
    print(f"  {'LightGBM temporal':<25s} {test_m['rmse']:8.2f} "
          f"{test_m['mae']:8.2f} {test_m['r2']:8.4f}")
    print()
    print(f"  Beat persistence_1h?   {'YES' if beat_p1h else 'NO'}")
    print(f"  Beat persistence_24h?  {'YES' if beat_p24h else 'NO'}")
    print(f"{'='*60}")

    # ---- Top features ----
    print("\n  Top 10 features:")
    for _, row in imp.head(10).iterrows():
        print(f"    {row['feature']:<25s} {row['importance']:.0f}")


def _run_features_static(city_id: str = "korba") -> None:
    from airsight.features.spatial import build_spatial_features
    from airsight.models.temporal import train_temporal, save_model

    print(f"\n{'='*60}")
    print(f"  Features Static + Temporal Model -- {city_id}")
    print(f"{'='*60}\n")

    df = _load_panel(city_id)
    df = build_spatial_features(df, city_id=city_id)

    result = train_temporal(df)
    meta = result["meta"]
    test_m = result["test_metrics"]
    train_m = result["train_metrics"]
    imp = result["feature_importance"]

    # ---- Save model ----
    _MODELS = OUTPUTS / "models"
    _MODELS.mkdir(parents=True, exist_ok=True)
    model_path = _MODELS / f"{city_id}_features_static_lgbm.txt"
    save_model(result["model"], model_path)

    # ---- Save feature importance ----
    imp_path = _REPORTS / f"{city_id}_features_static_importance.csv"
    imp.to_csv(imp_path, index=False)
    print(f"  [OK] Feature importance: {imp_path}")

    # ---- Save metrics ----
    _METRICS.mkdir(parents=True, exist_ok=True)
    metrics_out = {
        "model": "lightgbm_features_static_v1",
        "backend": meta["backend"],
        "split_point": meta["split_point"],
        "n_train": meta["n_train"],
        "n_test": meta["n_test"],
        "train": train_m,
        "test": test_m,
        "feature_cols": result["feature_cols"],
    }
    json_path = _METRICS / f"{city_id}_features_static.json"
    with open(json_path, "w") as fh:
        json.dump(metrics_out, fh, indent=2)
    print(f"  [OK] Metrics: {json_path}")

    # ---- Compare to Temporal C1 ----
    temporal_path = _METRICS / f"{city_id}_temporal.json"
    temporal_rmse = float("inf")
    if temporal_path.exists():
        with open(temporal_path) as fh:
            temporal_rmse = json.load(fh).get("test", {}).get("rmse", float("inf"))

    print(f"\n{'='*60}")
    print(f"  SCORECARD -- {city_id.upper()} (Static Features)")
    print(f"{'='*60}")
    print(f"  Temporal C1 RMSE:       {temporal_rmse:8.2f}")
    print(f"  Features Static RMSE:   {test_m['rmse']:8.2f}")
    lift = temporal_rmse - test_m['rmse']
    print(f"  Lift (RMSE reduction):  {lift:8.2f}")
    print(f"{'='*60}")

    print("\n  Top 15 features:")
    for _, row in imp.head(15).iterrows():
        print(f"    {row['feature']:<25s} {row['importance']:.0f}")


def _run_attribution(city_id: str = "korba") -> None:
    from airsight.features.spatial import build_spatial_features
    from airsight.attribution.edgar_compare import run_attribution_comparison

    print(f"\n{'='*60}")
    print(f"  Attribution Prototype -- {city_id}")
    print(f"{'='*60}\n")

    df = _load_panel(city_id)
    # We need static features merged for the attribution prototype
    df = build_spatial_features(df, city_id=city_id)

    res = run_attribution_comparison(df)

    # ---- Save metrics ----
    _METRICS.mkdir(parents=True, exist_ok=True)
    json_path = _METRICS / f"{city_id}_attribution_vs_edgar.json"
    with open(json_path, "w") as fh:
        json.dump(res, fh, indent=2)
    print(f"  [OK] Metrics: {json_path}")

    # ---- Save table report ----
    _REPORTS.mkdir(parents=True, exist_ok=True)
    md_path = _REPORTS / f"{city_id}_attribution_table.md"
    lines = [
        f"# Attribution Prototype -- {city_id.title()}\n",
        f"> **{res['disclaimer']}**\n",
        f"**Mean MAE:** {res['mean_mae']:.4f}\n",
        f"**Mean Cosine Similarity:** {res['mean_cosine_similarity']:.4f}\n",
        "| Station ID | Top EDGAR Sector | Top Proxy Sector | Cosine Sim | MAE |",
        "|------------|------------------|------------------|------------|-----|",
    ]
    for row in res["stations"]:
        lines.append(
            f"| {row['station_id']} | {row['top_edgar_sector']} | "
            f"{row['top_proxy_sector']} | {row['cosine_similarity']:.4f} | "
            f"{row['mae']:.4f} |"
        )
    lines.append("")
    with open(md_path, "w") as fh:
        fh.write("\n".join(lines))
    print(f"  [OK] Report: {md_path}")

    print(f"\n  Mean Cosine Similarity: {res['mean_cosine_similarity']:.4f}")
    print(f"  Mean MAE: {res['mean_mae']:.4f}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run Korba modelling experiment stages."
    )
    parser.add_argument(
        "--stage",
        type=str,
        required=True,
        choices=["baselines", "temporal", "features_static", "attribution"],
        help="Which stage to run.",
    )
    parser.add_argument(
        "--city",
        type=str,
        default="korba",
        help="City ID (default: korba).",
    )
    args = parser.parse_args()

    if args.stage == "baselines":
        _run_baselines(args.city)
    elif args.stage == "temporal":
        _run_temporal(args.city)
    elif args.stage == "features_static":
        _run_features_static(args.city)
    elif args.stage == "attribution":
        _run_attribution(args.city)

    print("\nDone.")


if __name__ == "__main__":
    main()
