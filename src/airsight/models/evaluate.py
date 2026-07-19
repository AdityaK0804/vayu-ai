"""Model evaluation utilities — metrics + temporal train/test split.

**Split strategy (documented choice)**:

We use a **global chronological split** — the earliest 70 % of *all*
timestamps across all stations form the training set, the remaining 30 %
form the test set.  The split point is shared across stations so there is
no data leakage (a station's future never appears in another station's
training window).  We **never** random-shuffle time series data.

**Metrics**: RMSE, MAE, R-squared (via scikit-learn).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# ---------------------------------------------------------------------------
# Train / test split
# ---------------------------------------------------------------------------

def time_split(
    df: pd.DataFrame,
    train_frac: float = 0.70,
    ts_col: str = "timestamp",
) -> tuple[pd.Series, pd.Series]:
    """Return boolean masks for train and test splits.

    Parameters
    ----------
    df : pd.DataFrame
        Must contain *ts_col* (datetime).
    train_frac : float
        Fraction of the timestamp range to use for training (default 70 %).

    Returns
    -------
    (train_mask, test_mask)
        Pair of ``pd.Series[bool]`` aligned to *df*.
    """
    ts = df[ts_col].dropna()
    if ts.empty:
        raise ValueError("No valid timestamps for splitting")

    t_min, t_max = ts.min(), ts.max()
    split_point = t_min + (t_max - t_min) * train_frac

    train_mask = df[ts_col] <= split_point
    test_mask = df[ts_col] > split_point
    return train_mask, test_mask


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def compute_metrics(
    y_true: np.ndarray | pd.Series,
    y_pred: np.ndarray | pd.Series,
) -> dict[str, float]:
    """Compute RMSE, MAE, and R-squared on non-NaN pairs.

    Returns a dict with keys ``rmse``, ``mae``, ``r2``, ``n``.
    """
    mask = pd.notna(y_true) & pd.notna(y_pred)
    yt = np.asarray(y_true)[mask]
    yp = np.asarray(y_pred)[mask]
    n = int(len(yt))
    if n == 0:
        return {"rmse": float("nan"), "mae": float("nan"),
                "r2": float("nan"), "n": 0}
    return {
        "rmse": float(np.sqrt(mean_squared_error(yt, yp))),
        "mae": float(mean_absolute_error(yt, yp)),
        "r2": float(r2_score(yt, yp)),
        "n": n,
    }


def score_baseline(
    df: pd.DataFrame,
    test_mask: pd.Series,
) -> dict[str, Any]:
    """Score a baseline DataFrame that already has ``y`` and ``y_hat``.

    Only rows in *test_mask* are scored.  NaN pairs are dropped.
    Returns a metrics dict including ``n_total``, ``n_scored``,
    ``n_dropped_nan``.
    """
    test = df.loc[test_mask].copy()
    n_total = len(test)

    valid = test.dropna(subset=["y", "y_hat"])
    n_scored = len(valid)
    n_dropped = n_total - n_scored

    metrics = compute_metrics(valid["y"], valid["y_hat"])
    metrics["n_total_test"] = n_total
    metrics["n_scored"] = n_scored
    metrics["n_dropped_nan"] = n_dropped
    return metrics
