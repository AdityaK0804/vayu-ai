"""Satellite data loader.

Loads MODIS AOD, Sentinel-5P NO2, and Sentinel-5P SO2 data from ``data/satellite/<channel>/<city_id>/*.csv``.
Returns empty DataFrames gracefully if folders/files are missing.
"""

from __future__ import annotations

import logging
from pathlib import Path
import pandas as pd

from airsight.config import DATA

logger = logging.getLogger(__name__)

SATELLITE_COLUMNS = ["cell_id", "date", "mean"]


def load_satellite(city_id: str, channel: str) -> pd.DataFrame:
    """Load satellite data for a given city and channel (aod, no2, so2)."""
    if channel not in ("aod", "no2", "so2"):
        raise ValueError(f"Invalid channel: {channel}. Expected aod, no2, or so2.")

    channel_dir = DATA / "satellite" / channel / city_id
    if not channel_dir.exists():
        logger.warning(f"Satellite channel directory missing: {channel_dir}")
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    csv_files = list(channel_dir.glob("*.csv"))
    if not csv_files:
        logger.warning(f"No satellite CSV files found in {channel_dir}")
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    frames = []
    for path in csv_files:
        try:
            # The GEE export columns: cell_id, date, mean
            df = pd.read_csv(path, parse_dates=["date"])
            for col in SATELLITE_COLUMNS:
                if col not in df.columns:
                    df[col] = float("nan")
            frames.append(df[SATELLITE_COLUMNS])
        except Exception as e:
            logger.error(f"Error reading satellite file {path.name}: {e}")

    if not frames:
        return pd.DataFrame(columns=SATELLITE_COLUMNS)

    combined = pd.concat(frames, ignore_index=True)
    combined.sort_values(["cell_id", "date"], inplace=True)
    return combined.reset_index(drop=True)
