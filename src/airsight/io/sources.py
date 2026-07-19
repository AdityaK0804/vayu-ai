"""Industrial and energy sources data loader.

Loads Global Power Plant Database (GPPD) files from ``data/sources/``.
"""

from __future__ import annotations

import logging
from pathlib import Path
import pandas as pd

from airsight.config import DATA, load_cities

logger = logging.getLogger(__name__)

GPPD_COLUMNS = [
    "city_id",
    "name",
    "capacity_mw",
    "primary_fuel",
    "latitude",
    "longitude",
    "owner",
    "commissioning_year",
]


def load_power_plants(city_id: str | None = None) -> pd.DataFrame:
    """Load power plants from the static source registry.

    Parameters
    ----------
    city_id : str | None
        If provided, returns only power plants located in that city's bounding box.

    Returns
    -------
    pd.DataFrame
        Power plants with location and metadata.
    """
    by_city_path = DATA / "sources" / "power_plants_by_city.csv"
    india_path = DATA / "sources" / "gppd_india.csv"

    # Attempt to load per-city pre-clipped CSV first
    if by_city_path.exists():
        try:
            df = pd.read_csv(by_city_path)
            for col in GPPD_COLUMNS:
                if col not in df.columns:
                    df[col] = float("nan")
            df = df[GPPD_COLUMNS]
            if city_id is not None:
                df = df[df["city_id"] == city_id]
            return df.reset_index(drop=True)
        except Exception as e:
            logger.error(f"Error reading {by_city_path.name}: {e}")

    # Fallback: load full India CSV and clip dynamically if we have bboxes
    if india_path.exists():
        try:
            df = pd.read_csv(india_path, low_memory=False)
            # Find the city bbox if city_id specified
            cities = load_cities(include_optional=True)
            city_map = {c["id"]: c for c in cities}

            if city_id is not None:
                if city_id not in city_map:
                    logger.warning(f"City '{city_id}' not found in configuration.")
                    return pd.DataFrame(columns=GPPD_COLUMNS)
                city = city_map[city_id]
                W, S, E, N = city["bbox"]
                sel = df[(df["longitude"].between(W, E)) & (df["latitude"].between(S, N))].copy()
                sel["city_id"] = city_id
            else:
                # Clip for all cities combined
                frames = []
                for cid, city in city_map.items():
                    W, S, E, N = city["bbox"]
                    sel = df[(df["longitude"].between(W, E)) & (df["latitude"].between(S, N))].copy()
                    sel["city_id"] = cid
                    frames.append(sel)
                sel = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

            for col in GPPD_COLUMNS:
                if col not in sel.columns:
                    sel[col] = float("nan")
            return sel[GPPD_COLUMNS].reset_index(drop=True)
        except Exception as e:
            logger.error(f"Error reading {india_path.name}: {e}")

    logger.warning("No power plant registry CSV files found in data/sources/")
    return pd.DataFrame(columns=GPPD_COLUMNS)
