"""Meteorological data loader.

Loads historical, forecast, and CAMS air quality forecast data from ``data/met/<city_id>/``.
Returns empty DataFrames gracefully if folders/files are missing.
"""

from __future__ import annotations

import logging
from pathlib import Path
import pandas as pd

from airsight.config import DATA

logger = logging.getLogger(__name__)

# Expected columns in meteorological data
MET_COLUMNS = [
    "timestamp",
    "city_id",
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "surface_pressure",
    "precipitation",
    "boundary_layer_height",
]

# Expected columns in CAMS data
CAMS_COLUMNS = [
    "timestamp",
    "city_id",
    "pm2_5",
    "pm10",
    "nitrogen_dioxide",
    "ozone",
    "sulphur_dioxide",
    "carbon_monoxide",
    "dust",
]


def load_met_archive(city_id: str) -> pd.DataFrame:
    """Load historical meteorological data for a given city."""
    path = DATA / "met" / city_id / "archive.csv"
    if not path.exists():
        logger.warning(f"Met archive CSV missing: {path}")
        return pd.DataFrame(columns=MET_COLUMNS)
    try:
        df = pd.read_csv(path, parse_dates=["timestamp"])
        # Ensure all columns exist
        for col in MET_COLUMNS:
            if col not in df.columns:
                df[col] = float("nan")
        return df[MET_COLUMNS]
    except Exception as e:
        logger.error(f"Error reading met archive for {city_id}: {e}")
        return pd.DataFrame(columns=MET_COLUMNS)


def load_met_forecast(city_id: str) -> pd.DataFrame:
    """Load meteorological forecast data for a given city."""
    path = DATA / "met" / city_id / "forecast.csv"
    if not path.exists():
        logger.warning(f"Met forecast CSV missing: {path}")
        return pd.DataFrame(columns=MET_COLUMNS)
    try:
        df = pd.read_csv(path, parse_dates=["timestamp"])
        for col in MET_COLUMNS:
            if col not in df.columns:
                df[col] = float("nan")
        return df[MET_COLUMNS]
    except Exception as e:
        logger.error(f"Error reading met forecast for {city_id}: {e}")
        return pd.DataFrame(columns=MET_COLUMNS)


def load_cams_forecast(city_id: str) -> pd.DataFrame:
    """Load CAMS air quality forecast data for a given city."""
    path = DATA / "met" / city_id / "cams_forecast.csv"
    if not path.exists():
        logger.warning(f"CAMS forecast CSV missing: {path}")
        return pd.DataFrame(columns=CAMS_COLUMNS)
    try:
        df = pd.read_csv(path, parse_dates=["timestamp"])
        for col in CAMS_COLUMNS:
            if col not in df.columns:
                df[col] = float("nan")
        return df[CAMS_COLUMNS]
    except Exception as e:
        logger.error(f"Error reading CAMS forecast for {city_id}: {e}")
        return pd.DataFrame(columns=CAMS_COLUMNS)
