"""Baseline models for hourly PM2.5 prediction.

All baselines operate per-station on a sorted-by-timestamp DataFrame.
They add a ``y_hat`` column and return it alongside the ground truth ``y``.

Baselines implemented:

* **persistence_1h** — ``y_hat(t) = y(t-1)``
* **persistence_24h** — ``y_hat(t) = y(t-24)``
* **station_climatology_hour** — ``y_hat(t) = mean(pm25) for that hour-of-day``,
  computed on the *train* split only.
"""

from __future__ import annotations

import pandas as pd


def persistence(df: pd.DataFrame, lag: int = 1,
                target: str = "pm25") -> pd.DataFrame:
    """Naive persistence baseline: predict the value *lag* steps ago.

    Parameters
    ----------
    df : pd.DataFrame
        Must contain ``target`` and ``timestamp`` columns, sorted by
        ``(station_id, timestamp)``.
    lag : int
        Number of hourly steps to shift (1 = last hour, 24 = same hour
        yesterday).
    target : str
        Column name holding the ground truth.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with an added ``y_hat`` column.  Rows where either
        ``y`` or ``y_hat`` is NaN should be dropped before scoring.
    """
    out = df.copy()
    out["y"] = out[target]
    out["y_hat"] = out.groupby("station_id")[target].shift(lag)
    return out


def persistence_1h(df: pd.DataFrame, **kw) -> pd.DataFrame:
    """y_hat(t) = y(t-1)."""
    return persistence(df, lag=1, **kw)


def persistence_24h(df: pd.DataFrame, **kw) -> pd.DataFrame:
    """y_hat(t) = y(t-24)."""
    return persistence(df, lag=24, **kw)


def station_climatology_hour(
    df: pd.DataFrame,
    train_mask: pd.Series,
    target: str = "pm25",
) -> pd.DataFrame:
    """Predict the per-station, per-hour-of-day mean from the training set.

    Parameters
    ----------
    df : pd.DataFrame
        Full dataset (train + test).
    train_mask : pd.Series[bool]
        Boolean mask identifying training rows.
    target : str
        Column holding the ground truth.

    Returns
    -------
    pd.DataFrame
        Copy with ``y`` and ``y_hat`` columns.
    """
    out = df.copy()
    out["y"] = out[target]
    out["_hour"] = out["timestamp"].dt.hour

    # Compute hourly climatology on training data only
    clim = (
        out.loc[train_mask]
        .groupby(["station_id", "_hour"])[target]
        .mean()
        .rename("y_hat")
    )

    out = out.merge(
        clim,
        left_on=["station_id", "_hour"],
        right_index=True,
        how="left",
    )
    out.drop(columns=["_hour"], inplace=True)
    return out
