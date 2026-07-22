"""
Feature engineering — creates rolling, lag, anomaly, and interaction features
from the base climate DataFrame for ML model training.
"""

from __future__ import annotations
import pandas as pd
import numpy as np


def add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Day-of-year, month, season, year."""
    df = df.copy()
    df["day_of_year"] = df["date"].dt.dayofyear
    df["month"] = df["date"].dt.month
    df["year"] = df["date"].dt.year
    # Season: 1=Winter(Dec-Feb), 2=Summer(Mar-May), 3=Monsoon(Jun-Sep), 4=PostMonsoon(Oct-Nov)
    month = df["month"]
    df["season"] = np.select(
        [month.isin([12, 1, 2]), month.isin([3, 4, 5]),
         month.isin([6, 7, 8, 9]), month.isin([10, 11])],
        [1, 2, 3, 4],
    )
    # Cyclical encoding for day_of_year
    df["doy_sin"] = np.sin(2 * np.pi * df["day_of_year"] / 365.25)
    df["doy_cos"] = np.cos(2 * np.pi * df["day_of_year"] / 365.25)
    return df


def _get_rolling_params(df: pd.DataFrame) -> list[str]:
    """Return base params available in the DataFrame for rolling features."""
    base = ["temperature", "rainfall", "humidity", "ghi"]
    fire = ["fire_count", "fire_frp_sum"]
    return base + [c for c in fire if c in df.columns]


def add_rolling_features(
    df: pd.DataFrame,
    windows: list[int] = [7, 14, 30],
    params: list[str] | None = None,
) -> pd.DataFrame:
    """
    Per-district rolling mean and std for each parameter.
    """
    df = df.copy()
    if params is None:
        params = _get_rolling_params(df)
    df = df.sort_values(["district", "date"])
    grouped = df.groupby("district")

    for param in params:
        for w in windows:
            col_mean = f"{param}_roll{w}_mean"
            col_std = f"{param}_roll{w}_std"
            df[col_mean] = grouped[param].transform(
                lambda s: s.rolling(w, min_periods=max(1, w // 2)).mean()
            )
            df[col_std] = grouped[param].transform(
                lambda s: s.rolling(w, min_periods=max(1, w // 2)).std()
            )
    return df


def add_lag_features(
    df: pd.DataFrame,
    lags: list[int] = [1, 3, 7, 14],
    params: list[str] | None = None,
) -> pd.DataFrame:
    """Per-district lag features."""
    df = df.copy()
    if params is None:
        params = _get_rolling_params(df)
    df = df.sort_values(["district", "date"])
    grouped = df.groupby("district")

    for param in params:
        for lag in lags:
            col = f"{param}_lag{lag}"
            df[col] = grouped[param].transform(lambda s: s.shift(lag))
    return df


def add_anomaly_features(
    df: pd.DataFrame,
    params: list[str] = ["temperature", "rainfall", "humidity", "ghi"],
) -> pd.DataFrame:
    """
    Anomaly = (value - 30-day rolling mean) / 30-day rolling std.
    Also: deviation from long-term monthly mean for that district.
    """
    df = df.copy()
    for param in params:
        mean_col = f"{param}_roll30_mean"
        std_col = f"{param}_roll30_std"
        if mean_col in df.columns and std_col in df.columns:
            df[f"{param}_anomaly"] = (df[param] - df[mean_col]) / df[std_col].replace(0, np.nan)
            df[f"{param}_anomaly"] = df[f"{param}_anomaly"].fillna(0)

    # Long-term monthly anomaly per district
    monthly_means = df.groupby(["district", "month"])[params].transform("mean")
    for param in params:
        df[f"{param}_monthly_anomaly"] = df[param] - monthly_means[param]

    return df


def add_interaction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Cross-parameter interactions relevant to risk."""
    df = df.copy()

    # Heat index proxy: high temp + high humidity → disease / heat stress risk
    df["heat_humidity_idx"] = df["temperature"] * df["humidity"] / 100.0

    # Drought indicator: low rainfall + high temperature → water stress
    rain_7 = df.get("rainfall_roll7_mean", df["rainfall"])
    df["drought_idx"] = df["temperature"] / (rain_7 + 0.1)

    # Solar deficit: below normal GHI → energy risk
    ghi_30 = df.get("ghi_roll30_mean", df["ghi"])
    df["solar_deficit"] = ghi_30 - df["ghi"]

    # Rainfall intensity: current vs rolling mean — flood proxy
    rain_30 = df.get("rainfall_roll30_mean", df["rainfall"])
    df["rainfall_intensity"] = df["rainfall"] / (rain_30 + 0.01)

    # Disease season factor: monsoon (season=3) + high humidity → elevated risk
    df["monsoon_humidity"] = (df["season"] == 3).astype(float) * df["humidity"]

    # ── Fire-derived interactions (only if fire columns present) ──
    if "fire_count" in df.columns:
        # Fire risk amplified by dry/hot conditions
        df["fire_heat_idx"] = df["fire_count"] * df["temperature"] / 50.0
        df["fire_drought_idx"] = df["fire_count"] * df["drought_idx"]
        # Inverse: more rain = less fire risk
        df["fire_rain_suppress"] = df["fire_count"] / (df["rainfall"] + 0.1)
        # FRP intensity per fire event
        df["fire_frp_per_event"] = df["fire_frp_sum"] / (df["fire_count"] + 1)
        # Healthcare stress from fires
        if "healthcare_facility_count" in df.columns:
            df["fire_per_facility"] = df["fire_count"] / (df["healthcare_facility_count"] + 1)

    return df


def add_change_features(
    df: pd.DataFrame,
    params: list[str] | None = None,
) -> pd.DataFrame:
    """Day-over-day and 7-day change."""
    df = df.copy()
    if params is None:
        params = _get_rolling_params(df)
    grouped = df.groupby("district")
    for param in params:
        df[f"{param}_change_1d"] = grouped[param].transform(lambda s: s.diff(1))
        df[f"{param}_change_7d"] = grouped[param].transform(lambda s: s.diff(7))
    return df


def engineer_features(
    df: pd.DataFrame,
    drop_na: bool = True,
) -> pd.DataFrame:
    """Full feature pipeline — call this on the raw climate DataFrame."""
    df = add_calendar_features(df)
    df = add_rolling_features(df)
    df = add_lag_features(df)
    df = add_anomaly_features(df)
    df = add_interaction_features(df)
    df = add_change_features(df)

    if drop_na:
        df = df.dropna().reset_index(drop=True)

    return df


def get_feature_columns(df: pd.DataFrame) -> list[str]:
    """Return the list of columns usable as model features (exclude ID / target cols)."""
    exclude = {"district", "division", "date", "lat", "lon"}
    return [c for c in df.columns if c not in exclude and df[c].dtype in [np.float64, np.float32, np.int64, np.int32, float, int]]


if __name__ == "__main__":
    from data_loader import load_climate_data

    df = load_climate_data(start_year=2020)
    print(f"Raw: {len(df):,} rows, {len(df.columns)} cols")

    df = engineer_features(df)
    feats = get_feature_columns(df)
    print(f"Engineered: {len(df):,} rows, {len(feats)} feature cols")
    print("Features:", feats[:20], "...")
