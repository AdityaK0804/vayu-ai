"""
PV Anomaly Detector — Physics-based solar panel performance model.

Compares actual PV output against expected output derived from:
    P_model = A · η · G · (1 + β · (T_cell − T_STC))

Where:
  A     = panel area (m²)
  η     = rated efficiency (e.g., 0.18 = 18%)
  G     = Global Horizontal Irradiance (W/m²) from NASA POWER
  β     = temperature coefficient (~−0.004 /°C for crystalline Si)
  T_cell = cell temperature ≈ T_ambient + 0.0256 · G (NOCT model)
  T_STC  = Standard Test Condition temp = 25 °C

A "derating ratio" < 1.0 signals under-performance (soiling, shading, faults).
Rolling 48-hr derating ratio smooths out transient cloud effects.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ── Default panel parameters (typical rooftop installation) ─────────────────
DEFAULT_PANEL_AREA_M2 = 2.0       # m² per panel unit
DEFAULT_EFFICIENCY = 0.18          # 18 % rated
DEFAULT_TEMP_COEFF = -0.004        # /°C, crystalline Si
T_STC = 25.0                       # °C, Standard Test Condition
NOCT_FACTOR = 0.0256               # T_cell ≈ T_ambient + NOCT_FACTOR * G


def expected_pv_output(
    ghi: np.ndarray | float,
    t_ambient: np.ndarray | float,
    panel_area: float = DEFAULT_PANEL_AREA_M2,
    eta: float = DEFAULT_EFFICIENCY,
    beta: float = DEFAULT_TEMP_COEFF,
) -> np.ndarray:
    """
    Compute expected PV power output (W) from irradiance and temperature.

    Parameters
    ----------
    ghi : array-like
        Global Horizontal Irradiance in W/m².
    t_ambient : array-like
        Ambient temperature in °C.
    panel_area : float
        Total panel area in m².
    eta : float
        Panel rated efficiency (0–1).
    beta : float
        Temperature coefficient (negative for Si).

    Returns
    -------
    np.ndarray
        Expected power output in watts, clipped to ≥ 0.
    """
    ghi = np.asarray(ghi, dtype=np.float64)
    t_ambient = np.asarray(t_ambient, dtype=np.float64)

    t_cell = t_ambient + NOCT_FACTOR * ghi
    p_expected = panel_area * eta * ghi * (1.0 + beta * (t_cell - T_STC))
    return np.clip(p_expected, 0.0, None)


def compute_derating_ratio(
    actual_kwh: np.ndarray | float,
    ghi: np.ndarray | float,
    t_ambient: np.ndarray | float,
    **kwargs,
) -> np.ndarray:
    """
    Compute derating ratio = actual / expected.

    Values significantly below 1.0 flag under-performance.
    """
    p_exp = expected_pv_output(ghi, t_ambient, **kwargs)
    # Convert expected W to kWh (assuming 1-hour intervals for daily data)
    exp_kwh = p_exp / 1000.0
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(exp_kwh > 0.01, np.asarray(actual_kwh) / exp_kwh, 1.0)
    return np.clip(ratio, 0.0, 2.0)  # cap at 2× to suppress noise


def detect_pv_anomalies(
    df: pd.DataFrame,
    actual_col: str = "ghi",
    temp_col: str = "temperature",
    window: int = 2,
    threshold: float = 0.70,
    panel_area: float = DEFAULT_PANEL_AREA_M2,
    eta: float = DEFAULT_EFFICIENCY,
) -> pd.DataFrame:
    """
    Add PV anomaly columns to a climate DataFrame.

    Adds:
      pv_expected_kw   – physics-model expected output (kW)
      pv_derating      – actual / expected ratio
      pv_derating_roll – rolling mean derating (smoothed)
      pv_anomaly_flag  – 1 if rolling derating < threshold

    Parameters
    ----------
    df : pd.DataFrame
        Must contain `actual_col` (GHI in kWh/m²/day) and `temp_col`.
    window : int
        Rolling window in days for smoothing (default 2 = 48 hrs for daily data).
    threshold : float
        Derating ratio below this → flagged as anomaly.
    """
    df = df.copy()

    ghi = df[actual_col].values
    temp = df[temp_col].values

    # Expected output in kW
    p_exp_w = expected_pv_output(ghi, temp, panel_area=panel_area, eta=eta)
    df["pv_expected_kw"] = p_exp_w / 1000.0

    # Derating = actual / expected
    df["pv_derating"] = compute_derating_ratio(ghi, ghi, temp, panel_area=panel_area, eta=eta)

    # Rolling smoothed derating
    if "district" in df.columns:
        df["pv_derating_roll"] = df.groupby("district")["pv_derating"].transform(
            lambda s: s.rolling(window, min_periods=1).mean()
        )
    else:
        df["pv_derating_roll"] = df["pv_derating"].rolling(window, min_periods=1).mean()

    # Anomaly flag
    df["pv_anomaly_flag"] = (df["pv_derating_roll"] < threshold).astype(int)

    return df


def score_pv_health(
    ghi_actual: float,
    ghi_expected_context: float,
    temperature: float,
    panel_area: float = DEFAULT_PANEL_AREA_M2,
    eta: float = DEFAULT_EFFICIENCY,
) -> dict:
    """
    Score a single facility's PV health for the digital twin / what-if API.

    Returns
    -------
    dict with keys:
      expected_kw, derating, anomaly, status ('NORMAL' | 'WARNING' | 'CRITICAL')
    """
    p_exp = expected_pv_output(ghi_expected_context, temperature, panel_area, eta)
    exp_kw = float(p_exp) / 1000.0

    actual_kw = float(ghi_actual) / 1000.0 * panel_area * eta
    derating = actual_kw / exp_kw if exp_kw > 0.001 else 1.0
    derating = min(max(derating, 0.0), 2.0)

    if derating < 0.50:
        status = "CRITICAL"
    elif derating < 0.70:
        status = "WARNING"
    else:
        status = "NORMAL"

    return {
        "expected_kw": round(exp_kw, 3),
        "actual_kw": round(actual_kw, 3),
        "derating": round(derating, 3),
        "anomaly": derating < 0.70,
        "status": status,
    }


# ── CLI quick test ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Simulated: GHI = 5.2 kWh/m²/day, T = 35°C
    result = score_pv_health(ghi_actual=4.0, ghi_expected_context=5.2, temperature=35.0)
    print("PV Health Score:", result)

    # Batch test with DataFrame
    test_df = pd.DataFrame({
        "ghi": [5.0, 4.8, 3.2, 2.0, 5.1, 4.9, 1.5, 5.0],
        "temperature": [32, 33, 35, 38, 31, 32, 40, 33],
        "district": ["Raipur"] * 8,
    })
    result_df = detect_pv_anomalies(test_df)
    print("\nBatch results:")
    print(result_df[["ghi", "temperature", "pv_expected_kw", "pv_derating", "pv_derating_roll", "pv_anomaly_flag"]])
