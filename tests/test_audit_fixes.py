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
    """Only v2 is served: one health endpoint, legacy routes retired."""
    client = TestClient(app)
    res = client.get("/api/v2/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in {"ok", "stale", "empty"}
    assert data["version"] == "4.0.0"
    assert "sources" in data["freshness"]

    # v0 root routes are gone; v1 answers 410 with the standard error envelope.
    assert client.get("/health").status_code == 404
    assert client.get("/cities").status_code == 404
    r = client.get("/api/v1/live/snapshot")
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "gone"
