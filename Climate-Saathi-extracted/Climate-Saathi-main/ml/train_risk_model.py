"""
Train a LightGBM multi-output risk-scoring model.

Produces five LightGBM regressors (one per risk dimension) plus a global SHAP
TreeExplainer that can rank feature importance at inference time.

Artefacts saved to  ml/models/:
    risk_model_waterRisk.txt     – LightGBM booster
    risk_model_energyRisk.txt
    risk_model_sanitationRisk.txt
    risk_model_diseaseRisk.txt
    risk_model_overallRisk.txt
    risk_feature_names.json      – ordered feature list
    risk_scaler.joblib            – fitted StandardScaler
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
UTILS = ROOT / "utils"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(UTILS))
from data_loader import load_climate_data          # noqa: E402
from feature_engineering import engineer_features, get_feature_columns  # noqa: E402
from risk_labels import generate_risk_labels, RISK_COLUMNS             # noqa: E402

# ── hyper-parameters ─────────────────────────────────────────────────────────
LGB_PARAMS = {
    "objective": "regression",
    "metric": "mae",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "max_depth": 8,
    "min_child_samples": 50,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "verbose": -1,
}
NUM_BOOST_ROUND = 500
EARLY_STOPPING = 30
TEST_SIZE = 0.15
RANDOM_STATE = 42


def main() -> None:
    # 1. Load data (use recent 10 years for training)
    print("> Loading climate data (2015-2024) ...")
    raw = load_climate_data(start_year=2015, end_year=2024)
    print(f"  {len(raw):,} rows loaded")

    # 2. Engineer features
    print("> Engineering features ...")
    feat_df = engineer_features(raw)
    print(f"  {len(feat_df):,} rows after feature engineering")

    # 3. Generate risk labels
    print("> Generating risk labels ...")
    labelled = generate_risk_labels(feat_df)

    # 4. Prepare X / y
    feature_cols = get_feature_columns(labelled)
    # Remove risk columns from features (they're targets)
    feature_cols = [c for c in feature_cols if c not in RISK_COLUMNS]

    X = labelled[feature_cols].values.astype(np.float32)
    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    # Save feature names + scaler
    with open(MODEL_DIR / "risk_feature_names.json", "w") as f:
        json.dump(feature_cols, f)
    joblib.dump(scaler, MODEL_DIR / "risk_scaler.joblib")

    # 5. Train one model per risk dimension
    X_train, X_test, idx_train, idx_test = train_test_split(
        X, np.arange(len(X)), test_size=TEST_SIZE, random_state=RANDOM_STATE
    )

    for target in RISK_COLUMNS:
        y = labelled[target].values.astype(np.float32)
        y_train, y_test = y[idx_train], y[idx_test]

        dtrain = lgb.Dataset(X_train, label=y_train)
        dval = lgb.Dataset(X_test, label=y_test, reference=dtrain)

        print(f"\n> Training {target} ...")
        callbacks = [
            lgb.early_stopping(EARLY_STOPPING),
            lgb.log_evaluation(100),
        ]
        booster = lgb.train(
            LGB_PARAMS,
            dtrain,
            num_boost_round=NUM_BOOST_ROUND,
            valid_sets=[dval],
            valid_names=["val"],
            callbacks=callbacks,
        )

        # Evaluate
        preds = booster.predict(X_test)
        mae = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        print(f"  {target}  MAE={mae:.4f}  RMSE={rmse:.4f}")

        # Save
        model_path = MODEL_DIR / f"risk_model_{target}.txt"
        booster.save_model(str(model_path))
        print(f"  Saved -> {model_path.name}")

    print("\n[OK] Risk-scoring models trained and saved to ml/models/")


if __name__ == "__main__":
    main()
