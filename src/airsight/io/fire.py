"""FIRMS active fire data loader.

Extracts fire radiative power (FRP) and computes aggregated fire features
for stations within a spatial buffer.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from airsight.config import DATA

_FIRMS_FILE = DATA / "fire" / "firms_chhattisgarh.csv"


def load_firms() -> pd.DataFrame:
    """Load the Chhattisgarh FIRMS active fire CSV.

    Returns
    -------
    pd.DataFrame
        DataFrame with columns: latitude, longitude, frp, acq_date.
        ``acq_date`` is parsed as datetime.
    """
    if not _FIRMS_FILE.exists():
        print(f"  [!] FIRMS data not found: {_FIRMS_FILE}")
        return pd.DataFrame()

    df = pd.read_csv(
        _FIRMS_FILE,
        usecols=["latitude", "longitude", "frp", "acq_date"],
        parse_dates=["acq_date"],
    )
    return df


def _haversine(lat1: np.ndarray, lon1: np.ndarray, lat2: float, lon2: float) -> np.ndarray:
    """Vectorized Haversine distance in kilometers."""
    R = 6371.0  # Earth radius in km
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c


def get_station_fire_features(
    stations: pd.DataFrame,
    radius_km: float = 25.0,
) -> pd.DataFrame:
    """Compute daily aggregated fire features for each station.

    Parameters
    ----------
    stations : pd.DataFrame
        Must contain ``station_id``, ``latitude``, ``longitude``.
    radius_km : float
        Search radius around each station in kilometers.

    Returns
    -------
    pd.DataFrame
        Columns: ``station_id``, ``timestamp`` (daily), ``fire_frp_sum_25km``.
        Only days with fires > 0 are returned; missing days should be 0-filled
        after joining.
    """
    firms = load_firms()
    if firms.empty:
        return pd.DataFrame(columns=["station_id", "timestamp", f"fire_frp_sum_{int(radius_km)}km"])

    frames = []
    firms_lat = firms["latitude"].values
    firms_lon = firms["longitude"].values

    for _, row in stations.iterrows():
        sid = row["station_id"]
        slat = row["latitude"]
        slon = row["longitude"]

        if pd.isna(slat) or pd.isna(slon):
            continue

        # Distance mask
        dist = _haversine(firms_lat, firms_lon, slat, slon)
        mask = dist <= radius_km
        near_fires = firms[mask].copy()

        if near_fires.empty:
            continue

        # Aggregate daily sum of FRP
        daily = near_fires.groupby("acq_date")["frp"].sum().reset_index()
        daily.rename(columns={"acq_date": "timestamp", "frp": f"fire_frp_sum_{int(radius_km)}km"}, inplace=True)
        daily["station_id"] = sid
        frames.append(daily)

    if not frames:
        return pd.DataFrame(columns=["station_id", "timestamp", f"fire_frp_sum_{int(radius_km)}km"])

    return pd.concat(frames, ignore_index=True)
