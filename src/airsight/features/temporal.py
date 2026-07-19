"""Temporal feature engineering for hourly PM2.5 prediction.

Builds features from the CPCB station panel **only** — no satellite data
required.  All features are strictly causal (no future leakage).

Feature groups:

* **Lags**: ``pm25_lag1``, ``pm25_lag24``, ``pm25_lag168`` (1 week)
* **Rolling stats**: ``pm25_roll24_mean``, ``pm25_roll24_std``
  (trailing 24-hour window, min_periods=12)
* **Calendar**: ``hour``, ``dayofweek``, ``month``
  Plus cyclical encodings: ``hour_sin/cos``, ``dow_sin/cos``, ``month_sin/cos``
* **Meteorology** (if present in panel): ``at_degc``, ``rh_pct``,
  ``ws_ms``, ``wd_deg`` — plus wind components ``wind_u``, ``wind_v``
* **Station ID**: integer-coded categorical for LightGBM
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Feature builders
# ---------------------------------------------------------------------------

def _add_lags(df: pd.DataFrame, target: str = "pm25") -> pd.DataFrame:
    """Add lagged features per station (1h, 24h, 168h)."""
    g = df.groupby("station_id")[target]
    df["pm25_lag1"] = g.shift(1)
    df["pm25_lag24"] = g.shift(24)
    df["pm25_lag168"] = g.shift(168)
    return df


def _add_rolling(df: pd.DataFrame, target: str = "pm25") -> pd.DataFrame:
    """Add 24-hour trailing rolling mean and std per station."""
    g = df.groupby("station_id")[target]
    df["pm25_roll24_mean"] = g.transform(
        lambda s: s.shift(1).rolling(24, min_periods=12).mean()
    )
    df["pm25_roll24_std"] = g.transform(
        lambda s: s.shift(1).rolling(24, min_periods=12).std()
    )
    return df


def _add_calendar(df: pd.DataFrame) -> pd.DataFrame:
    """Add calendar features from the timestamp column."""
    ts = df["timestamp"]
    df["hour"] = ts.dt.hour
    df["dayofweek"] = ts.dt.dayofweek
    df["month"] = ts.dt.month

    # Cyclical encodings
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["dow_sin"] = np.sin(2 * np.pi * df["dayofweek"] / 7)
    df["dow_cos"] = np.cos(2 * np.pi * df["dayofweek"] / 7)
    df["month_sin"] = np.sin(2 * np.pi * (df["month"] - 1) / 12)
    df["month_cos"] = np.cos(2 * np.pi * (df["month"] - 1) / 12)
    return df


def _add_met(df: pd.DataFrame) -> pd.DataFrame:
    """Add meteorological features if columns exist in the panel."""
    met_cols = ["at_degc", "rh_pct", "ws_ms", "wd_deg"]
    present = [c for c in met_cols if c in df.columns]

    # Decompose wind into u/v components if ws + wd available
    if "ws_ms" in df.columns and "wd_deg" in df.columns:
        wd_rad = np.deg2rad(df["wd_deg"])
        df["wind_u"] = -df["ws_ms"] * np.sin(wd_rad)
        df["wind_v"] = -df["ws_ms"] * np.cos(wd_rad)

    return df


def _add_station_cat(df: pd.DataFrame) -> pd.DataFrame:
    """Encode station_id as an integer category for LightGBM."""
    df["station_cat"] = df["station_id"].astype("category").cat.codes
    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Feature columns in the order they will be used for training.
FEATURE_COLS: list[str] = [
    # lags
    "pm25_lag1", "pm25_lag24", "pm25_lag168",
    # rolling
    "pm25_roll24_mean", "pm25_roll24_std",
    # calendar
    "hour", "dayofweek", "month",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
    "month_sin", "month_cos",
    # met
    "at_degc", "rh_pct", "ws_ms", "wd_deg", "wind_u", "wind_v",
    # station
    "station_cat",
]


def build_features(df: pd.DataFrame, target: str = "pm25") -> pd.DataFrame:
    """Build all temporal features on a sorted station panel.

    Parameters
    ----------
    df : pd.DataFrame
        Station panel sorted by ``(station_id, timestamp)``.
    target : str
        Ground-truth column name.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with feature columns added.  The caller should
        filter to ``FEATURE_COLS`` (intersected with actual columns)
        before training.
    """
    out = df.copy()
    out.sort_values(["station_id", "timestamp"], inplace=True)
    out.reset_index(drop=True, inplace=True)

    out = _add_lags(out, target)
    out = _add_rolling(out, target)
    out = _add_calendar(out)
    out = _add_met(out)
    out = _add_station_cat(out)

    return out


def get_feature_cols(df: pd.DataFrame) -> list[str]:
    """Return the subset of ``FEATURE_COLS`` plus spatial features present in *df*."""
    cols = [c for c in FEATURE_COLS if c in df.columns]
    # Add spatial/static features dynamically
    for c in df.columns:
        if c.startswith("edgar_") or c == "population_density" or c.startswith("fire_frp_"):
            if c not in cols:
                cols.append(c)
    return cols
