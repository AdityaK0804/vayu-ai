"""LightGBM temporal model for hourly PM2.5 forecasting.

Falls back to ``sklearn.ensemble.HistGradientBoostingRegressor`` if
``lightgbm`` is not installed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from airsight.features.temporal import build_features, get_feature_cols
from airsight.models.evaluate import compute_metrics, time_split

# ---------------------------------------------------------------------------
# Try LightGBM, fall back to sklearn
# ---------------------------------------------------------------------------

try:
    import lightgbm as lgb
    _HAS_LGB = True
except ImportError:
    _HAS_LGB = False


_LGB_PARAMS: dict[str, Any] = {
    "objective": "regression",
    "metric": "rmse",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "max_depth": -1,
    "min_child_samples": 30,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "n_estimators": 500,
    "verbose": -1,
}


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_temporal(
    df: pd.DataFrame,
    target: str = "pm25",
    train_frac: float = 0.70,
) -> dict[str, Any]:
    """Train a LightGBM temporal model on a station panel.

    Parameters
    ----------
    df : pd.DataFrame
        Raw station panel (sorted by station_id, timestamp).
    target : str
        Ground-truth column.
    train_frac : float
        Chronological split fraction.

    Returns
    -------
    dict with keys:
        model         trained model object
        feature_cols  list[str]
        feature_importance  pd.DataFrame  (feature, importance)
        train_metrics dict
        test_metrics  dict
        meta          dict  (n_train, n_test, split_point, ...)
    """
    print("  Building features...")
    feat = build_features(df, target)
    feature_cols = get_feature_cols(feat)
    print(f"  Feature columns ({len(feature_cols)}): {feature_cols}")

    # Time split
    train_mask, test_mask = time_split(feat, train_frac)
    split_point = feat.loc[train_mask, "timestamp"].max()

    # Prepare X / y — drop rows where target or ALL lag features are NaN
    required_present = [target, "pm25_lag1"]  # at minimum
    feat_valid = feat.dropna(subset=required_present)

    train = feat_valid[train_mask.reindex(feat_valid.index, fill_value=False)]
    test = feat_valid[test_mask.reindex(feat_valid.index, fill_value=False)]

    X_train = train[feature_cols]
    y_train = train[target]
    X_test = test[feature_cols]
    y_test = test[target]

    print(f"  Train: {len(X_train):,} rows  |  Test: {len(X_test):,} rows")
    print(f"  Split point: {split_point}")

    # Identify categorical columns for LightGBM
    cat_cols = [c for c in ["station_cat", "hour", "dayofweek", "month"]
                if c in feature_cols]

    # ---- Train ----
    if _HAS_LGB:
        print("  Training LightGBM...")
        model = lgb.LGBMRegressor(**_LGB_PARAMS)
        model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            categorical_feature=cat_cols,
        )
        y_pred_train = model.predict(X_train)
        y_pred_test = model.predict(X_test)

        # Feature importance
        imp = pd.DataFrame({
            "feature": feature_cols,
            "importance": model.feature_importances_,
        }).sort_values("importance", ascending=False)
    else:
        print("  LightGBM not found — using HistGradientBoostingRegressor")
        from sklearn.ensemble import HistGradientBoostingRegressor
        # sklearn doesn't natively handle NaN in all cases; fill with -999
        X_train_sk = X_train.fillna(-999)
        X_test_sk = X_test.fillna(-999)

        model = HistGradientBoostingRegressor(
            max_iter=500, learning_rate=0.05, max_leaf_nodes=63,
            min_samples_leaf=30, random_state=42,
        )
        model.fit(X_train_sk, y_train)
        y_pred_train = model.predict(X_train_sk)
        y_pred_test = model.predict(X_test_sk)

        imp = pd.DataFrame({
            "feature": feature_cols,
            "importance": [0] * len(feature_cols),
        })

    train_metrics = compute_metrics(y_train, y_pred_train)
    test_metrics = compute_metrics(y_test, y_pred_test)

    return {
        "model": model,
        "feature_cols": feature_cols,
        "feature_importance": imp,
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "meta": {
            "n_train": len(X_train),
            "n_test": len(X_test),
            "split_point": str(split_point),
            "backend": "lightgbm" if _HAS_LGB else "sklearn",
        },
    }


def save_model(model: Any, path: Path) -> None:
    """Save model to disk — .txt for LightGBM, .joblib otherwise."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if _HAS_LGB and hasattr(model, "booster_"):
        model.booster_.save_model(str(path))
        print(f"  [OK] Model saved: {path}")
    else:
        import joblib
        path = path.with_suffix(".joblib")
        joblib.dump(model, path)
        print(f"  [OK] Model saved: {path}")
