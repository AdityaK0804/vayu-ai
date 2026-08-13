"""Ensemble + conformal + retrain + drift helpers (Phase 4.4)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np


# ---------------------------------------------------------------------------
# Residual stacking: ŷ = ŷ_stgnn + g(features)   (g ≈ CatBoost/LGBM residual)
# ---------------------------------------------------------------------------


@dataclass
class ResidualEnsemble:
    """Holds a base STGNN-like callable + residual booster."""

    residual_model: Any = None  # sklearn/lgbm with predict()
    w_base: float = 1.0
    w_resid: float = 1.0

    def predict(self, base_pred: np.ndarray, features: np.ndarray) -> np.ndarray:
        base = np.asarray(base_pred, dtype=float)
        if self.residual_model is None:
            return base
        resid = np.asarray(self.residual_model.predict(features), dtype=float)
        return self.w_base * base + self.w_resid * resid


# ---------------------------------------------------------------------------
# Split conformal intervals (exchangeability assumption on calibration residuals)
# ---------------------------------------------------------------------------


@dataclass
class ConformalInterval:
    q_hat: float

    def bounds(self, y_hat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        y = np.asarray(y_hat, dtype=float)
        return y - self.q_hat, y + self.q_hat


def fit_conformal(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    alpha: float = 0.1,
) -> ConformalInterval:
    """Absolute residual quantile conformal (symmetric)."""
    resid = np.abs(np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float))
    n = len(resid)
    if n == 0:
        return ConformalInterval(q_hat=0.0)
    # standard split-conformal quantile level
    q_level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    q_hat = float(np.percentile(resid, 100 * q_level))
    return ConformalInterval(q_hat=q_hat)


# ---------------------------------------------------------------------------
# Champion / challenger promotion gate
# ---------------------------------------------------------------------------


@dataclass
class ModelCard:
    name: str
    version: str
    mae: float
    rmse: float
    path: str
    meta: dict[str, Any] = field(default_factory=dict)


def should_promote(challenger: ModelCard, champion: ModelCard | None, min_rel_improve: float = 0.02) -> bool:
    """Promote only if MAE improves by ≥ min_rel_improve (default 2%)."""
    if champion is None:
        return True
    if champion.mae <= 0:
        return challenger.mae < champion.mae
    rel = (champion.mae - challenger.mae) / champion.mae
    return rel >= min_rel_improve


# ---------------------------------------------------------------------------
# Drift: Population Stability Index + rolling MAE alert
# ---------------------------------------------------------------------------


def psi(expected: np.ndarray, actual: np.ndarray, buckets: int = 10) -> float:
    """Population Stability Index between two 1-D samples."""
    expected = np.asarray(expected, dtype=float)
    actual = np.asarray(actual, dtype=float)
    expected = expected[np.isfinite(expected)]
    actual = actual[np.isfinite(actual)]
    if len(expected) < 10 or len(actual) < 10:
        return 0.0
    qs = np.linspace(0, 100, buckets + 1)
    bins = np.unique(np.percentile(expected, qs))
    if len(bins) < 3:
        return 0.0
    e_hist, _ = np.histogram(expected, bins=bins)
    a_hist, _ = np.histogram(actual, bins=bins)
    e = e_hist / max(e_hist.sum(), 1)
    a = a_hist / max(a_hist.sum(), 1)
    e = np.clip(e, 1e-6, None)
    a = np.clip(a, 1e-6, None)
    return float(np.sum((a - e) * np.log(a / e)))


def rolling_mae(y_true: Sequence[float], y_pred: Sequence[float], window: int = 24) -> list[float]:
    yt = np.asarray(y_true, dtype=float)
    yp = np.asarray(y_pred, dtype=float)
    err = np.abs(yt - yp)
    out: list[float] = []
    for i in range(len(err)):
        lo = max(0, i - window + 1)
        out.append(float(np.mean(err[lo : i + 1])))
    return out


def drift_alert(psi_value: float, mae_now: float, mae_base: float, psi_thr: float = 0.2, mae_thr: float = 1.25) -> dict[str, Any]:
    """Simple alert dict for ops dashboards."""
    flags = []
    if psi_value >= psi_thr:
        flags.append("psi_high")
    if mae_base > 0 and mae_now / mae_base >= mae_thr:
        flags.append("mae_regression")
    return {
        "alert": bool(flags),
        "flags": flags,
        "psi": psi_value,
        "mae_now": mae_now,
        "mae_base": mae_base,
    }
