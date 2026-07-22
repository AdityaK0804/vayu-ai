"""
Train LSTM forecast models for 14-day climate predictions with P10/P90
confidence bands using quantile regression.

Trains one model per forecast target:
    WATER_LEVEL  → rainfall proxy (cumulative rainfall)
    SOLAR_OUTPUT → GHI (Global Horizontal Irradiance)
    DISEASE_RISK → heat–humidity index
    HEAT_INDEX   → temperature

Artefacts saved to  ml/models/:
    forecast_{target}.keras          – trained LSTM model (3 quantile outputs)
    forecast_{target}_scaler_X.joblib – input scaler
    forecast_{target}_scaler_y.joblib – output scaler
    forecast_config.json              – sequence lengths, feature cols
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
UTILS = ROOT / "utils"
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(UTILS))
from data_loader import load_climate_data  # noqa: E402

# ── config ───────────────────────────────────────────────────────────────────
LOOKBACK = 60        # days of history as input
HORIZON = 14         # days to forecast
BATCH_SIZE = 256
EPOCHS = 30
LEARNING_RATE = 1e-3
VALIDATION_SPLIT = 0.15
RANDOM_SEED = 42

# Map ForecastType → source column(s)
TARGET_MAP = {
    "WATER_LEVEL":  "rainfall",
    "SOLAR_OUTPUT": "ghi",
    "DISEASE_RISK": "heat_humidity_idx",
    "HEAT_INDEX":   "temperature",
    "FIRE_RISK":    "fire_count",
}

FEATURE_COLS = ["temperature", "rainfall", "humidity", "ghi", "fire_count", "fire_frp_sum"]

np.random.seed(RANDOM_SEED)


# ── quantile loss ────────────────────────────────────────────────────────────
def quantile_loss(q: float):
    """Pinball loss for quantile regression."""
    import tensorflow as tf

    def loss(y_true, y_pred):
        e = y_true - y_pred
        return tf.reduce_mean(tf.maximum(q * e, (q - 1) * e))

    loss.__name__ = f"quantile_{int(q * 100)}"
    return loss


def build_model(n_features: int) -> "tf.keras.Model":
    """Two-layer LSTM → 3 heads (P10, P50, P90)."""
    import tensorflow as tf

    inp = tf.keras.Input(shape=(LOOKBACK, n_features))
    x = tf.keras.layers.LSTM(64, return_sequences=True)(inp)
    x = tf.keras.layers.Dropout(0.2)(x)
    x = tf.keras.layers.LSTM(32)(x)
    x = tf.keras.layers.Dropout(0.2)(x)

    p10 = tf.keras.layers.Dense(HORIZON, name="p10")(x)
    p50 = tf.keras.layers.Dense(HORIZON, name="p50")(x)
    p90 = tf.keras.layers.Dense(HORIZON, name="p90")(x)

    model = tf.keras.Model(inputs=inp, outputs=[p10, p50, p90])
    model.compile(
        optimizer=tf.keras.optimizers.Adam(LEARNING_RATE),
        loss={
            "p10": quantile_loss(0.10),
            "p50": quantile_loss(0.50),
            "p90": quantile_loss(0.90),
        },
    )
    return model


def create_sequences(
    X: np.ndarray,
    y: np.ndarray,
    lookback: int,
    horizon: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Sliding-window sequence generation."""
    Xs, Ys = [], []
    for i in range(len(X) - lookback - horizon + 1):
        Xs.append(X[i : i + lookback])
        Ys.append(y[i + lookback : i + lookback + horizon])
    return np.array(Xs, dtype=np.float32), np.array(Ys, dtype=np.float32)


def train_target(df: pd.DataFrame, target_name: str, target_col: str) -> None:
    """Train one forecast model for a single target variable."""
    import tensorflow as tf

    print(f"\n{'='*60}")
    print(f"> Training forecast: {target_name} (column: {target_col})")
    print(f"{'='*60}")

    # Ensure fire columns exist (filled with 0 for years before FIRMS data)
    for col in FEATURE_COLS:
        if col not in df.columns:
            df[col] = 0.0

    # Build features + target per district, then concatenate
    all_X, all_y = [], []
    districts = sorted(df["district"].unique())

    for dist in districts:
        ddf = df[df["district"] == dist].sort_values("date").reset_index(drop=True)

        # Ensure target column exists
        if target_col == "heat_humidity_idx":
            ddf["heat_humidity_idx"] = ddf["temperature"] * ddf["humidity"] / 100.0

        feat = ddf[FEATURE_COLS].values.astype(np.float32)
        tgt = ddf[target_col].values.astype(np.float32)

        if len(feat) < LOOKBACK + HORIZON:
            continue

        all_X.append(feat)
        all_y.append(tgt)

    # Scale features globally
    X_concat = np.concatenate(all_X)
    y_concat = np.concatenate(all_y)

    scaler_X = StandardScaler().fit(X_concat.reshape(-1, len(FEATURE_COLS)))
    scaler_y = StandardScaler().fit(y_concat.reshape(-1, 1))

    # Generate sequences per district, then merge
    seq_X, seq_y = [], []
    for feat, tgt in zip(all_X, all_y):
        feat_s = scaler_X.transform(feat)
        tgt_s = scaler_y.transform(tgt.reshape(-1, 1)).flatten()
        sx, sy = create_sequences(feat_s, tgt_s, LOOKBACK, HORIZON)
        seq_X.append(sx)
        seq_y.append(sy)

    X_all = np.concatenate(seq_X)
    y_all = np.concatenate(seq_y)

    # Shuffle and split
    idx = np.random.permutation(len(X_all))
    split = int(len(idx) * (1 - VALIDATION_SPLIT))
    train_idx, val_idx = idx[:split], idx[split:]

    X_train, y_train = X_all[train_idx], y_all[train_idx]
    X_val, y_val = X_all[val_idx], y_all[val_idx]

    print(f"  Train samples: {len(X_train):,}  Val samples: {len(X_val):,}")

    # Build & train
    model = build_model(n_features=len(FEATURE_COLS))

    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
        tf.keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=3),
    ]

    model.fit(
        X_train,
        {"p10": y_train, "p50": y_train, "p90": y_train},
        validation_data=(X_val, {"p10": y_val, "p50": y_val, "p90": y_val}),
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        callbacks=callbacks,
        verbose=1,
    )

    # Evaluate
    p10_pred, p50_pred, p90_pred = model.predict(X_val, batch_size=BATCH_SIZE)
    mae = np.mean(np.abs(y_val - p50_pred))
    coverage = np.mean((y_val >= p10_pred) & (y_val <= p90_pred))
    print(f"  Val MAE (scaled): {mae:.4f}  P10-P90 coverage: {coverage:.1%}")

    # Save artefacts
    model.save(str(MODEL_DIR / f"forecast_{target_name}.keras"))
    joblib.dump(scaler_X, MODEL_DIR / f"forecast_{target_name}_scaler_X.joblib")
    joblib.dump(scaler_y, MODEL_DIR / f"forecast_{target_name}_scaler_y.joblib")
    print(f"  Saved -> forecast_{target_name}.keras")


def main() -> None:
    print("> Loading climate data (2015-2024) ...")
    df = load_climate_data(start_year=2015, end_year=2024)
    print(f"  {len(df):,} rows loaded")

    config = {
        "lookback": LOOKBACK,
        "horizon": HORIZON,
        "feature_cols": FEATURE_COLS,
        "targets": TARGET_MAP,
    }
    with open(MODEL_DIR / "forecast_config.json", "w") as f:
        json.dump(config, f, indent=2)

    for target_name, target_col in TARGET_MAP.items():
        train_target(df, target_name, target_col)

    print("\n[OK] All forecast models trained and saved to ml/models/")


if __name__ == "__main__":
    main()
