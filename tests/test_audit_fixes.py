"""Regression tests verifying audit remediation fixes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app
from scripts.features_v2 import build_feature_row
from src.airsight.aqi.cpcb_naqi import sub_index
from src.airsight.io.edgar import get_station_edgar_features
from src.airsight.io.population import get_station_population
import pandas as pd


def test_features_v2_standard_aliases():
    """Verify harmonized column names extract properly without NaN fallbacks."""
    sample_raw = {
        "temp_c": 28.5,
        "rh_pct": 65.0,
        "precip_mm": 0.0,
        "blh_m": 850.0,
        "population": 120000,
        "cams_no2": 15.2,
        "sat_aod": 0.45,
        "pm25": 45.0,
        "wind_speed": 3.2,
        "wind_direction": 180.0,
    }
    features = build_feature_row(sample_raw)
    assert features["temp_2m"] == 28.5
    assert features["rh_2m"] == 65.0
    assert features["precip"] == 0.0
    assert features["pblh"] == 850.0
    assert features["pop_density"] == 120000
    assert features["no2_column"] == 15.2
    assert features["aod550"] == 0.45
    assert features["pm25_lag1"] == 45.0


def test_cpcb_naqi_sub_index():
    """Verify CPCB NAQI breakpoint logic."""
    assert sub_index("pm25", 15.0) == 25.0
    assert sub_index("pm25", 45.0) == 75.5
    assert sub_index("pm25", 75.0) == 150.5
    assert sub_index("pm25", 105.0) == 250.5
    assert sub_index("pm25", 185.0) == 350.5
    assert sub_index("pm25", 375.0) == 450.5


def test_graceful_raster_loaders():
    """Verify edgar and population loaders return valid DataFrame without crashing."""
    df_stations = pd.DataFrame([{"station_id": "test_st_1", "latitude": 21.25, "longitude": 81.63}])
    df_edgar = get_station_edgar_features(df_stations)
    assert "station_id" in df_edgar.columns
    assert len(df_edgar) == 1

    df_pop = get_station_population(df_stations)
    assert "station_id" in df_pop.columns
    assert len(df_pop) == 1


def test_api_health_and_routes():
    """Verify FastAPI health check, metadata, and live stream endpoint."""
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.1.0"

    # Verify live endpoints
    res_cities = client.get("/cities")
    assert res_cities.status_code == 200
    assert isinstance(res_cities.json(), list)
