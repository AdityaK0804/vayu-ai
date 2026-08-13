"""Live bias calibration for STGNN (or any) forecasts.

Applies exponential smoothing of recent observation − prediction residuals
so the next issued forecast is shifted toward truth without a full retrain.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np


@dataclass
class BiasState:
    """Per-node (or global) running bias estimate."""

    bias: float = 0.0
    n: int = 0
    alpha: float = 0.25  # smoothing factor for residual

    def update(self, y_true: float, y_pred: float) -> float:
        residual = float(y_true) - float(y_pred)
        if self.n == 0:
            self.bias = residual
        else:
            self.bias = (1.0 - self.alpha) * self.bias + self.alpha * residual
        self.n += 1
        return self.bias

    def correct(self, y_pred: float | np.ndarray) -> float | np.ndarray:
        return y_pred + self.bias


@dataclass
class Kalman1D:
    """Minimal 1-D Kalman filter on bias (level-only)."""

    x: float = 0.0  # bias state
    p: float = 1.0
    q: float = 0.01  # process noise
    r: float = 4.0  # observation noise (residual var)

    def update(self, residual: float) -> float:
        # predict
        self.p = self.p + self.q
        # update
        k = self.p / (self.p + self.r)
        self.x = self.x + k * (residual - self.x)
        self.p = (1.0 - k) * self.p
        return self.x

    def correct(self, y_pred: float | np.ndarray) -> float | np.ndarray:
        return y_pred + self.x


@dataclass
class LiveCalibrator:
    """Map station_id / h3_cell → BiasState."""

    method: str = "exp"  # exp | kalman
    alpha: float = 0.25
    states: dict[str, BiasState | Kalman1D] = field(default_factory=dict)

    def _get(self, key: str) -> BiasState | Kalman1D:
        if key not in self.states:
            if self.method == "kalman":
                self.states[key] = Kalman1D()
            else:
                self.states[key] = BiasState(alpha=self.alpha)
        return self.states[key]

    def observe(self, key: str, y_true: float, y_pred: float) -> float:
        st = self._get(key)
        if isinstance(st, Kalman1D):
            return st.update(float(y_true) - float(y_pred))
        return st.update(y_true, y_pred)

    def apply(self, key: str, y_pred: float | np.ndarray) -> float | np.ndarray:
        return self._get(key).correct(y_pred)

    def apply_vector(
        self,
        keys: Sequence[str],
        y_pred: np.ndarray,
    ) -> np.ndarray:
        y = np.asarray(y_pred, dtype=float).copy()
        for i, k in enumerate(keys):
            y[i] = float(self.apply(k, y[i]))
        return y
