"""Tests for CPCB + stations loaders — runs against real Korba data."""

from pathlib import Path

import pandas as pd
import pytest

from airsight.config import DATA
from airsight.io.stations import load_stations
from airsight.io.cpcb import load_cpcb_city, load_cpcb_station

KORBA_DIR = DATA / "cpcb" / "korba"
HAS_KORBA = KORBA_DIR.exists() and any(KORBA_DIR.glob("*.csv"))


# ---------------------------------------------------------------------------
# Station loader tests
# ---------------------------------------------------------------------------

class TestStations:
    def test_loads_all(self):
        df = load_stations()
        assert isinstance(df, pd.DataFrame)
        assert len(df) > 0
        assert "latitude" in df.columns
        assert "longitude" in df.columns
        assert df["latitude"].dtype == float
        assert df["longitude"].dtype == float

    def test_filter_korba(self):
        df = load_stations(city_id="korba")
        assert len(df) >= 1
        assert (df["city_id"] == "korba").all()

    def test_filter_nonexistent(self):
        df = load_stations(city_id="atlantis")
        assert len(df) == 0


# ---------------------------------------------------------------------------
# CPCB loader tests — only if real data is present
# ---------------------------------------------------------------------------

@pytest.mark.skipif(not HAS_KORBA, reason="No Korba CPCB data present")
class TestCPCBKorba:
    def test_load_city(self):
        df = load_cpcb_city("korba")
        assert isinstance(df, pd.DataFrame)
        assert len(df) > 0

    def test_columns_normalised(self):
        df = load_cpcb_city("korba")
        # Core pollutant columns must exist
        for col in ("timestamp", "pm25", "pm10", "no2", "so2", "co", "o3"):
            assert col in df.columns, f"Missing column: {col}"

    def test_timestamp_parsed(self):
        df = load_cpcb_city("korba")
        assert pd.api.types.is_datetime64_any_dtype(df["timestamp"])

    def test_station_metadata_attached(self):
        df = load_cpcb_city("korba")
        assert "station_id" in df.columns
        assert "latitude" in df.columns
        assert "longitude" in df.columns
        assert df["station_id"].nunique() >= 1

    def test_pm25_not_all_nan(self):
        df = load_cpcb_city("korba")
        assert df["pm25"].notna().any(), "pm25 is 100% NaN — data issue"

    def test_multi_year_range(self):
        df = load_cpcb_city("korba")
        ts = df["timestamp"].dropna()
        years = ts.dt.year.nunique()
        assert years >= 2, f"Expected multi-year range, got {years} year(s)"

    def test_load_single_station(self):
        stations = load_stations(city_id="korba")
        sid = stations.iloc[0]["station_id"]
        df = load_cpcb_station("korba", station_id=sid)
        assert len(df) > 0
        assert (df["station_id"] == sid).all()


@pytest.mark.skipif(not HAS_KORBA, reason="No Korba CPCB data present")
class TestCPCBEdgeCases:
    def test_empty_city_returns_empty(self):
        """Jagdalpur has no CPCB station — should return empty gracefully."""
        jag_dir = DATA / "cpcb" / "jagdalpur"
        if jag_dir.exists() and not any(jag_dir.glob("*.csv")):
            df = load_cpcb_city("jagdalpur")
            assert df.empty
