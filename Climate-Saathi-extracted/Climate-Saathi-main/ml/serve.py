"""
FastAPI inference server for Climate Saathi ML models.

Endpoints
---------
POST /api/v1/risk/score     – LightGBM risk scoring + SHAP explanation
POST /api/v1/forecast       – LSTM 14-day forecast with P10/P90 bands
POST /api/v1/pv/health      – PV anomaly detection (physics model)
POST /api/v1/whatif          – What-if risk re-scoring with overridden climate
POST /api/v1/digital-twin   – Unified facility state (digital twin)
GET  /health                – liveness check

Authentication: X-API-Key header (compare against ML_API_KEY env var).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import shap
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# ── paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models"
UTILS = ROOT / "utils"
sys.path.insert(0, str(UTILS))

from data_loader import load_climate_data  # noqa: E402
from feature_engineering import engineer_features, get_feature_columns  # noqa: E402
from risk_labels import RISK_COLUMNS  # noqa: E402

# PV anomaly detector (physics model)
sys.path.insert(0, str(ROOT))
from pv_anomaly import score_pv_health, expected_pv_output  # noqa: E402

# ── config ───────────────────────────────────────────────────────────────────
API_KEY = os.getenv("ML_API_KEY", "")

app = FastAPI(title="Climate Saathi ML API", version="1.0.0")

# ── model loading (done once at startup) ─────────────────────────────────────
risk_models: dict[str, lgb.Booster] = {}
risk_scaler = None
risk_feature_names: list[str] = []
risk_explainer: shap.TreeExplainer | None = None

forecast_models: dict = {}
forecast_scalers: dict = {}
forecast_config: dict = {}


@app.on_event("startup")
def load_models():
    global risk_models, risk_scaler, risk_feature_names, risk_explainer
    global forecast_models, forecast_scalers, forecast_config

    # ── Risk models ──────────────────────────────────────────────────────
    feat_path = MODEL_DIR / "risk_feature_names.json"
    if feat_path.exists():
        with open(feat_path) as f:
            risk_feature_names = json.load(f)

    scaler_path = MODEL_DIR / "risk_scaler.joblib"
    if scaler_path.exists():
        risk_scaler = joblib.load(scaler_path)

    for target in RISK_COLUMNS:
        model_path = MODEL_DIR / f"risk_model_{target}.txt"
        if model_path.exists():
            risk_models[target] = lgb.Booster(model_file=str(model_path))

    # SHAP explainer (use the overallRisk booster as reference)
    if "overallRisk" in risk_models:
        risk_explainer = shap.TreeExplainer(risk_models["overallRisk"])

    print(f"Loaded {len(risk_models)} risk models, {len(risk_feature_names)} features")

    # ── Forecast models ──────────────────────────────────────────────────
    config_path = MODEL_DIR / "forecast_config.json"
    if config_path.exists():
        with open(config_path) as f:
            forecast_config = json.load(f)

        import tensorflow as tf

        for target_name in forecast_config.get("targets", {}):
            keras_path = MODEL_DIR / f"forecast_{target_name}.keras"
            sx_path = MODEL_DIR / f"forecast_{target_name}_scaler_X.joblib"
            sy_path = MODEL_DIR / f"forecast_{target_name}_scaler_y.joblib"
            if keras_path.exists() and sx_path.exists() and sy_path.exists():
                forecast_models[target_name] = tf.keras.models.load_model(
                    str(keras_path), compile=False
                )
                forecast_scalers[target_name] = {
                    "X": joblib.load(sx_path),
                    "y": joblib.load(sy_path),
                }
        print(f"Loaded {len(forecast_models)} forecast models")


# ── auth helper ──────────────────────────────────────────────────────────────
def _check_api_key(x_api_key: str | None):
    if API_KEY and (not x_api_key or x_api_key != API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── Schemas ──────────────────────────────────────────────────────────────────
class SensorReading(BaseModel):
    sensorType: str
    value: float
    unit: str
    timestamp: str


class RiskScoreRequest(BaseModel):
    facilityId: str
    readings: list[SensorReading] = []
    district: str | None = None
    lat: float | None = None
    lon: float | None = None


class ShapValue(BaseModel):
    featureName: str
    shapValue: float
    rank: int


class RiskScoreResponse(BaseModel):
    waterRisk: float
    energyRisk: float
    sanitationRisk: float
    diseaseRisk: float
    overallRisk: float
    shapValues: list[ShapValue]


class ForecastRequest(BaseModel):
    facilityId: str
    forecastType: str  # WATER_LEVEL | SOLAR_OUTPUT | DISEASE_RISK | HEAT_INDEX
    district: str | None = None


class ForecastResponse(BaseModel):
    forecastType: str
    values: list[float]   # P50 median
    p10: list[float]
    p90: list[float]
    horizonDays: int


# ── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "risk_models": len(risk_models),
        "forecast_models": len(forecast_models),
    }


@app.post("/api/v1/risk/score", response_model=RiskScoreResponse)
def score_risk(
    req: RiskScoreRequest,
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)

    if not risk_models:
        raise HTTPException(503, "Risk models not loaded")

    # Build feature vector from sensor readings + climate context
    feature_vec = _build_risk_features(req)

    # Predict each risk dimension
    predictions: dict[str, float] = {}
    for target, booster in risk_models.items():
        raw = float(booster.predict(feature_vec)[0])
        predictions[target] = max(0.0, min(1.0, raw))

    # SHAP explanation for top features
    shap_values_list: list[ShapValue] = []
    if risk_explainer is not None:
        sv = risk_explainer.shap_values(feature_vec)
        if isinstance(sv, list):
            sv = sv[0]
        sv = sv.flatten()
        ranked_idx = np.argsort(np.abs(sv))[::-1]
        for rank, idx in enumerate(ranked_idx[:10]):
            shap_values_list.append(ShapValue(
                featureName=risk_feature_names[idx] if idx < len(risk_feature_names) else f"feature_{idx}",
                shapValue=round(float(sv[idx]), 6),
                rank=rank + 1,
            ))

    return RiskScoreResponse(
        waterRisk=predictions.get("waterRisk", 0),
        energyRisk=predictions.get("energyRisk", 0),
        sanitationRisk=predictions.get("sanitationRisk", 0),
        diseaseRisk=predictions.get("diseaseRisk", 0),
        overallRisk=predictions.get("overallRisk", 0),
        shapValues=shap_values_list,
    )


@app.post("/api/v1/forecast", response_model=ForecastResponse)
def forecast(
    req: ForecastRequest,
    x_api_key: str | None = Header(None),
):
    _check_api_key(x_api_key)

    target = req.forecastType
    if target not in forecast_models:
        raise HTTPException(503, f"Forecast model for {target} not loaded")

    lookback = forecast_config.get("lookback", 60)
    feature_cols = forecast_config.get("feature_cols", ["temperature", "rainfall", "humidity", "ghi"])

    # Get recent climate data for the district
    district = req.district or "Raipur"
    seq = _build_forecast_sequence(district, feature_cols, lookback, target)

    model = forecast_models[target]
    scaler_X = forecast_scalers[target]["X"]
    scaler_y = forecast_scalers[target]["y"]

    # Scale input
    seq_scaled = scaler_X.transform(seq.reshape(-1, len(feature_cols)))
    seq_scaled = seq_scaled.reshape(1, lookback, len(feature_cols))

    # Predict
    p10_s, p50_s, p90_s = model.predict(seq_scaled)

    # Inverse scale
    p10_vals = scaler_y.inverse_transform(p10_s.reshape(-1, 1)).flatten().tolist()
    p50_vals = scaler_y.inverse_transform(p50_s.reshape(-1, 1)).flatten().tolist()
    p90_vals = scaler_y.inverse_transform(p90_s.reshape(-1, 1)).flatten().tolist()

    return ForecastResponse(
        forecastType=target,
        values=[round(v, 3) for v in p50_vals],
        p10=[round(v, 3) for v in p10_vals],
        p90=[round(v, 3) for v in p90_vals],
        horizonDays=forecast_config.get("horizon", 14),
    )


# ── Feature-building helpers ─────────────────────────────────────────────────
# Cache the most recent climate data in memory after first load
_climate_cache: dict[str, pd.DataFrame] = {}


def _get_recent_climate(district: str, days: int = 60) -> pd.DataFrame:
    """Return the last `days` rows for a district from cached CSV data."""
    if "all" not in _climate_cache:
        _climate_cache["all"] = load_climate_data(start_year=2023, end_year=2024)

    df = _climate_cache["all"]
    ddf = df[df["district"] == district].sort_values("date").tail(days)
    return ddf


def _sensor_means(readings: list[SensorReading]) -> dict[str, float]:
    """Average sensor readings by type."""
    from collections import defaultdict
    acc: dict[str, list[float]] = defaultdict(list)
    for r in readings:
        acc[r.sensorType].append(r.value)
    return {k: np.mean(v) for k, v in acc.items()}


def _build_risk_features(req: RiskScoreRequest) -> np.ndarray:
    """
    Construct a 1×N feature vector for risk scoring.

    Strategy:
      - Start from the most recent climate data for the district
      - Overlay any live sensor readings if available
      - Run through the same feature engineering pipeline used in training
    """
    district = req.district or "Raipur"
    climate = _get_recent_climate(district, days=90)

    if climate.empty:
        # Fallback: use overall mean
        climate = _get_recent_climate("Raipur", days=90)

    # Engineer features on the small window
    feat_df = engineer_features(climate, drop_na=True)

    if feat_df.empty:
        # Absolute fallback — zero vector
        return np.zeros((1, len(risk_feature_names)), dtype=np.float32)

    # Take the last row (most recent day)
    last_row = feat_df.iloc[[-1]]

    # Overlay sensor readings onto climate features where applicable
    sensor_map = {
        "TEMPERATURE": "temperature",
        "HUMIDITY": "humidity",
        "WATER_LEVEL": "rainfall",
        "SOLAR_OUTPUT": "ghi",
    }
    smeans = _sensor_means(req.readings)
    for sensor_type, col in sensor_map.items():
        if sensor_type in smeans and col in last_row.columns:
            last_row[col] = smeans[sensor_type]

    # Extract feature columns in the same order as training
    available = [c for c in risk_feature_names if c in last_row.columns]
    missing = [c for c in risk_feature_names if c not in last_row.columns]

    vec = np.zeros((1, len(risk_feature_names)), dtype=np.float32)
    for i, col in enumerate(risk_feature_names):
        if col in last_row.columns:
            vec[0, i] = float(last_row[col].iloc[0])

    # Scale
    if risk_scaler is not None:
        vec = risk_scaler.transform(vec)

    return vec


def _build_forecast_sequence(
    district: str,
    feature_cols: list[str],
    lookback: int,
    target: str,
) -> np.ndarray:
    """Build a (lookback, n_features) array for forecast input."""
    climate = _get_recent_climate(district, days=lookback + 10)

    if len(climate) < lookback:
        # Pad with district mean if not enough data
        climate = _get_recent_climate("Raipur", days=lookback + 10)

    cols = [c for c in feature_cols if c in climate.columns]
    arr = climate[cols].tail(lookback).values.astype(np.float32)

    # Pad if still short
    if arr.shape[0] < lookback:
        pad = np.tile(arr.mean(axis=0), (lookback - arr.shape[0], 1))
        arr = np.vstack([pad, arr])

    return arr


# ── PV Anomaly Detection ─────────────────────────────────────────────────────
class PvHealthRequest(BaseModel):
    facilityId: str
    ghi_actual: float       # kWh/m²/day from sensor or NASA POWER
    temperature: float      # °C ambient
    panel_area: float = 2.0
    efficiency: float = 0.18


class PvHealthResponse(BaseModel):
    expected_kw: float
    actual_kw: float
    derating: float
    anomaly: bool
    status: str   # NORMAL | WARNING | CRITICAL


@app.post("/api/v1/pv/health", response_model=PvHealthResponse)
def pv_health(req: PvHealthRequest, x_api_key: str | None = Header(None)):
    _check_api_key(x_api_key)
    result = score_pv_health(
        ghi_actual=req.ghi_actual,
        ghi_expected_context=req.ghi_actual,  # best-case: same irradiance
        temperature=req.temperature,
        panel_area=req.panel_area,
        eta=req.efficiency,
    )
    return PvHealthResponse(**result)


# ── What-if Risk Simulation ──────────────────────────────────────────────────
class WhatIfRequest(BaseModel):
    facilityId: str
    district: str | None = None
    overrides: dict[str, float] = {}  # e.g. {"temperature": 42, "rainfall": 0}


class WhatIfResponse(BaseModel):
    baseline: dict[str, float]     # original risk scores
    simulated: dict[str, float]    # risk scores with overrides
    deltas: dict[str, float]       # difference


@app.post("/api/v1/whatif", response_model=WhatIfResponse)
def whatif_risk(req: WhatIfRequest, x_api_key: str | None = Header(None)):
    _check_api_key(x_api_key)

    if not risk_models:
        raise HTTPException(503, "Risk models not loaded")

    district = req.district or "Raipur"
    climate = _get_recent_climate(district, days=90)
    if climate.empty:
        climate = _get_recent_climate("Raipur", days=90)

    # ── Baseline ──
    feat_df = engineer_features(climate, drop_na=True)
    if feat_df.empty:
        zero = {t: 0.0 for t in RISK_COLUMNS}
        return WhatIfResponse(baseline=zero, simulated=zero, deltas=zero)

    last_row = feat_df.iloc[[-1]].copy()
    baseline_vec = _extract_feature_vec(last_row)

    baseline_scores: dict[str, float] = {}
    for target, booster in risk_models.items():
        raw = float(booster.predict(baseline_vec)[0])
        baseline_scores[target] = round(max(0.0, min(1.0, raw)), 4)

    # ── Simulated (apply overrides to climate, re-engineer) ──
    sim_climate = climate.copy()
    for col, val in req.overrides.items():
        if col in sim_climate.columns:
            sim_climate.iloc[-1, sim_climate.columns.get_loc(col)] = val

    sim_feat_df = engineer_features(sim_climate, drop_na=True)
    if sim_feat_df.empty:
        return WhatIfResponse(baseline=baseline_scores, simulated=baseline_scores,
                              deltas={t: 0.0 for t in RISK_COLUMNS})

    sim_row = sim_feat_df.iloc[[-1]].copy()
    sim_vec = _extract_feature_vec(sim_row)

    sim_scores: dict[str, float] = {}
    for target, booster in risk_models.items():
        raw = float(booster.predict(sim_vec)[0])
        sim_scores[target] = round(max(0.0, min(1.0, raw)), 4)

    deltas = {t: round(sim_scores.get(t, 0) - baseline_scores.get(t, 0), 4) for t in RISK_COLUMNS}

    return WhatIfResponse(baseline=baseline_scores, simulated=sim_scores, deltas=deltas)


def _extract_feature_vec(row_df: "pd.DataFrame") -> np.ndarray:
    """Extract feature vector from a single-row engineered DataFrame."""
    vec = np.zeros((1, len(risk_feature_names)), dtype=np.float32)
    for i, col in enumerate(risk_feature_names):
        if col in row_df.columns:
            vec[0, i] = float(row_df[col].iloc[0])
    if risk_scaler is not None:
        vec = risk_scaler.transform(vec)
    return vec


# ── Digital Twin ─────────────────────────────────────────────────────────────
class DigitalTwinRequest(BaseModel):
    facilityId: str
    district: str | None = None
    lat: float | None = None
    lon: float | None = None
    readings: list[SensorReading] = []


class DigitalTwinResponse(BaseModel):
    facilityId: str
    riskScores: dict[str, float]
    pvHealth: PvHealthResponse | None = None
    latestClimate: dict[str, float]
    forecastSummary: dict[str, float]


@app.post("/api/v1/digital-twin", response_model=DigitalTwinResponse)
def digital_twin(req: DigitalTwinRequest, x_api_key: str | None = Header(None)):
    _check_api_key(x_api_key)

    district = req.district or "Raipur"
    climate = _get_recent_climate(district, days=90)

    # ── Risk scores ──
    risk_scores: dict[str, float] = {}
    if risk_models:
        feat_df = engineer_features(climate.copy(), drop_na=True)
        if not feat_df.empty:
            vec = _extract_feature_vec(feat_df.iloc[[-1]])
            for target, booster in risk_models.items():
                raw = float(booster.predict(vec)[0])
                risk_scores[target] = round(max(0.0, min(1.0, raw)), 4)

    # ── PV health from sensor or last GHI reading ──
    pv: PvHealthResponse | None = None
    smeans = _sensor_means(req.readings)
    ghi_val = smeans.get("SOLAR_OUTPUT") or (float(climate["ghi"].iloc[-1]) if not climate.empty and "ghi" in climate.columns else None)
    temp_val = smeans.get("TEMPERATURE") or (float(climate["temperature"].iloc[-1]) if not climate.empty and "temperature" in climate.columns else None)

    if ghi_val is not None and temp_val is not None:
        pv_result = score_pv_health(ghi_actual=ghi_val, ghi_expected_context=ghi_val, temperature=temp_val)
        pv = PvHealthResponse(**pv_result)

    # ── Latest climate snapshot ──
    latest_climate: dict[str, float] = {}
    if not climate.empty:
        last = climate.iloc[-1]
        for col in ["temperature", "rainfall", "humidity", "ghi"]:
            if col in last.index:
                latest_climate[col] = round(float(last[col]), 2)

    # ── Forecast summary (mean of p50 values if available) ──
    forecast_summary: dict[str, float] = {}
    for target_name, model in forecast_models.items():
        try:
            lookback = forecast_config.get("lookback", 60)
            feature_cols = forecast_config.get("feature_cols", ["temperature", "rainfall", "humidity", "ghi"])
            seq = _build_forecast_sequence(district, feature_cols, lookback, target_name)
            scaler_X = forecast_scalers[target_name]["X"]
            scaler_y = forecast_scalers[target_name]["y"]
            seq_scaled = scaler_X.transform(seq.reshape(-1, len(feature_cols)))
            seq_scaled = seq_scaled.reshape(1, lookback, len(feature_cols))
            _, p50_s, _ = model.predict(seq_scaled)
            p50_vals = scaler_y.inverse_transform(p50_s.reshape(-1, 1)).flatten()
            forecast_summary[target_name] = round(float(np.mean(p50_vals)), 3)
        except Exception:
            pass

    return DigitalTwinResponse(
        facilityId=req.facilityId,
        riskScores=risk_scores,
        pvHealth=pv,
        latestClimate=latest_climate,
        forecastSummary=forecast_summary,
    )


# ── Run ──────────────────────────────────────────────────────────────────────
import pandas as pd  # noqa: E402 (needed by helpers above)

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("ML_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
