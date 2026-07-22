"""
Synthetic risk-label generator — derives training labels from climate features
using domain-knowledge thresholds calibrated for Chhattisgarh.

Each risk is a float in [0, 1]:
  waterRisk      : drought / water-shortage likelihood
  energyRisk     : solar-panel under-performance likelihood
  sanitationRisk : flooding / bacterial-contamination likelihood
  diseaseRisk    : vector-borne / heat-related disease likelihood
  overallRisk    : weighted combination
"""

from __future__ import annotations
import numpy as np
import pandas as pd


def _sigmoid(x: np.ndarray) -> np.ndarray:
    """Numerically stable sigmoid."""
    return np.where(x >= 0, 1 / (1 + np.exp(-x)), np.exp(x) / (1 + np.exp(x)))


def _minmax(s: pd.Series) -> pd.Series:
    lo, hi = s.min(), s.max()
    if hi - lo < 1e-9:
        return pd.Series(np.zeros(len(s)), index=s.index)
    return (s - lo) / (hi - lo)


def compute_water_risk(df: pd.DataFrame) -> pd.Series:
    """
    High water risk when:
      - Rainfall is low (especially rolling 30-day mean)
      - Temperature is high (evaporation)
      - Humidity is low (dryness)
    """
    rain_30 = df.get("rainfall_roll30_mean", df["rainfall"])
    rain_7 = df.get("rainfall_roll7_mean", df["rainfall"])

    # Negative rainfall anomaly → higher risk
    rain_deficit = -rain_30 / (rain_30.mean() + 0.01)

    # High temperature contributes to evaporation
    temp_factor = (df["temperature"] - 25) / 15  # centered at 25°C

    # Low humidity → dryness
    humidity_deficit = (50 - df["humidity"]) / 50

    raw = 0.45 * rain_deficit + 0.30 * temp_factor + 0.25 * humidity_deficit

    # Fire amplifier: active fires dry out water sources
    if "fire_count" in df.columns:
        fire_norm = _minmax(df["fire_count"].clip(upper=df["fire_count"].quantile(0.99)))
        raw = raw + 0.15 * fire_norm

    return _minmax(_sigmoid(raw))


def compute_energy_risk(df: pd.DataFrame) -> pd.Series:
    """
    High energy risk when:
      - GHI is low (cloudy / rainy days)
      - Solar deficit is positive (below long-term mean)
      - Consecutive low-GHI days
    """
    ghi_norm = (df["ghi"] - df["ghi"].mean()) / (df["ghi"].std() + 1e-9)
    solar_deficit = df.get("solar_deficit", -ghi_norm)

    # Low GHI → high risk
    ghi_factor = -ghi_norm

    # Rolling low-GHI indicator
    ghi_7 = df.get("ghi_roll7_mean", df["ghi"])
    ghi_7_norm = (ghi_7 - ghi_7.mean()) / (ghi_7.std() + 1e-9)
    persistence = -ghi_7_norm

    raw = 0.50 * ghi_factor + 0.30 * persistence + 0.20 * (solar_deficit / (solar_deficit.std() + 1e-9))
    return _minmax(_sigmoid(raw))


def compute_sanitation_risk(df: pd.DataFrame) -> pd.Series:
    """
    High sanitation risk when:
      - Rainfall is very high (flooding, sewage overflow)
      - Humidity is high (bacterial growth)
      - Rainfall intensity spikes
    """
    rain_intensity = df.get("rainfall_intensity", df["rainfall"] / (df["rainfall"].mean() + 0.01))
    humidity_factor = (df["humidity"] - 60) / 30

    # Heavy rainfall
    rain_30 = df.get("rainfall_roll30_mean", df["rainfall"])
    rain_excess = rain_30 / (rain_30.mean() + 0.01)

    raw = 0.40 * _minmax(rain_intensity) + 0.35 * _minmax(humidity_factor) + 0.25 * _minmax(rain_excess)

    # Fire debris worsens sanitation after rains
    if "fire_count" in df.columns:
        fire_roll = df.get("fire_count_roll7_mean", df["fire_count"])
        fire_sani = _minmax(fire_roll.clip(upper=fire_roll.quantile(0.99))) * _minmax(rain_intensity)
        raw = raw + 0.10 * fire_sani

    return _minmax(_sigmoid(raw - 0.5))


def compute_disease_risk(df: pd.DataFrame) -> pd.Series:
    """
    High disease risk when:
      - Temperature + humidity are both high (vector-borne: malaria, dengue)
      - Monsoon season with stagnant water
      - Heat stress conditions (extreme heat)
    """
    heat_humidity = df.get("heat_humidity_idx", df["temperature"] * df["humidity"] / 100)
    monsoon_hum = df.get("monsoon_humidity", df["humidity"] * (df.get("season", 3) == 3).astype(float))

    # Normalise
    hh_norm = (heat_humidity - heat_humidity.mean()) / (heat_humidity.std() + 1e-9)
    temp_extreme = (df["temperature"] - 35) / 10  # extreme heat above 35°C

    raw = 0.40 * hh_norm + 0.30 * _minmax(monsoon_hum) + 0.30 * temp_extreme

    # Fire smoke increases respiratory disease risk
    if "fire_frp_sum" in df.columns:
        frp_norm = _minmax(df["fire_frp_sum"].clip(upper=df["fire_frp_sum"].quantile(0.99)))
        raw = raw + 0.15 * frp_norm

    # Lower healthcare capacity amplifies disease impact
    if "healthcare_facility_count" in df.columns:
        hc = df["healthcare_facility_count"]
        hc_deficit = 1.0 - _minmax(hc.clip(upper=hc.quantile(0.95)))
        raw = raw + 0.05 * hc_deficit

    return _minmax(_sigmoid(raw))


def compute_overall_risk(
    water: pd.Series,
    energy: pd.Series,
    sanitation: pd.Series,
    disease: pd.Series,
) -> pd.Series:
    """Weighted combination — water and disease weighted higher for schools / health centres."""
    return 0.30 * water + 0.20 * energy + 0.20 * sanitation + 0.30 * disease


def generate_risk_labels(df: pd.DataFrame) -> pd.DataFrame:
    """
    Given an engineered-feature DataFrame, produce a copy with 5 risk label columns.
    """
    df = df.copy()
    df["waterRisk"] = compute_water_risk(df)
    df["energyRisk"] = compute_energy_risk(df)
    df["sanitationRisk"] = compute_sanitation_risk(df)
    df["diseaseRisk"] = compute_disease_risk(df)
    df["overallRisk"] = compute_overall_risk(
        df["waterRisk"], df["energyRisk"], df["sanitationRisk"], df["diseaseRisk"]
    )
    return df


RISK_COLUMNS = ["waterRisk", "energyRisk", "sanitationRisk", "diseaseRisk", "overallRisk"]


if __name__ == "__main__":
    from data_loader import load_climate_data
    from feature_engineering import engineer_features

    print("Loading data ...")
    raw = load_climate_data(start_year=2020, end_year=2024)
    print(f"  rows: {len(raw)}")

    print("Engineering features ...")
    feat = engineer_features(raw)
    print(f"  rows after feature eng: {len(feat)}")

    print("Generating risk labels ...")
    labelled = generate_risk_labels(feat)
    for col in RISK_COLUMNS:
        print(f"  {col}: mean={labelled[col].mean():.3f}  std={labelled[col].std():.3f}  "
              f"min={labelled[col].min():.3f}  max={labelled[col].max():.3f}")
