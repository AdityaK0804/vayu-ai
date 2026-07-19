"""Tests for H3 grid utilities, graceful empty-data loaders, and data readiness verification."""

from __future__ import annotations

import pandas as pd
import pytest

from airsight.grid.h3_utils import cells_for_bbox, station_to_h3, aggregate_points_to_h3
from airsight.io.met import load_met_archive, load_met_forecast, load_cams_forecast
from airsight.io.satellite import load_satellite
from airsight.io.osm import load_osm_roads, load_osm_pois
from airsight.io.sources import load_power_plants
from airsight.pipeline.data_readiness import get_feature_groups_status


def test_h3_bbox_mapping():
    # Chhattisgarh region roughly
    bbox = [81.0, 21.0, 81.5, 21.5]
    cells = cells_for_bbox(bbox, res=5)
    assert len(cells) > 0
    assert all(isinstance(c, str) for c in cells)


def test_station_to_h3_coordinates():
    # Korba coordinates roughly
    lat, lon = 22.368, 82.746
    cell7 = station_to_h3(lat, lon, res=7)
    cell8 = station_to_h3(lat, lon, res=8)
    assert isinstance(cell7, str) and len(cell7) == 15
    assert isinstance(cell8, str) and len(cell8) == 15
    assert cell7 != cell8


def test_aggregate_points():
    df = pd.DataFrame({
        "lat": [22.36, 22.37, 22.34],
        "lon": [82.74, 82.75, 82.55],
        "val": [10.0, 20.0, 30.0]
    })
    aggregated = aggregate_points_to_h3(df, "lat", "lon", "val", res=7, agg_func="mean")
    assert not aggregated.empty
    assert "h3_cell" in aggregated.columns
    assert "val" in aggregated.columns


def test_graceful_loaders_missing_data():
    """Verify that loaders do not crash on non-existent or empty directories."""
    # Test for a fake city
    fake_city = "atlantis"
    
    met_df = load_met_archive(fake_city)
    assert isinstance(met_df, pd.DataFrame)
    assert met_df.empty
    
    fc_df = load_met_forecast(fake_city)
    assert isinstance(fc_df, pd.DataFrame)
    assert fc_df.empty
    
    cams_df = load_cams_forecast(fake_city)
    assert isinstance(cams_df, pd.DataFrame)
    assert cams_df.empty

    sat_df = load_satellite(fake_city, "aod")
    assert isinstance(sat_df, pd.DataFrame)
    assert sat_df.empty

    roads_df = load_osm_roads(fake_city)
    assert isinstance(roads_df, pd.DataFrame)
    assert roads_df.empty

    pois_df = load_osm_pois(fake_city, "hospitals")
    assert isinstance(pois_df, pd.DataFrame)
    assert pois_df.empty

    sources_df = load_power_plants(fake_city)
    assert isinstance(sources_df, pd.DataFrame)
    assert sources_df.empty


def test_readiness_status():
    status = get_feature_groups_status("korba")
    assert isinstance(status, dict)
    # Check that core keys are present
    assert "Base CPCB Targets (CPCB hourly)" in status
    assert "Meteorology Features (Open-Meteo)" in status
    assert "OSM Built Environment (Roads/POIs)" in status
