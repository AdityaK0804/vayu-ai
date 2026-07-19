"""Spatial and static feature merging.

Merges EDGAR, WorldPop, and FIRMS features onto the station panel.
"""

from __future__ import annotations

import pandas as pd

from airsight.io.edgar import get_station_edgar_features
from airsight.io.fire import get_station_fire_features
from airsight.io.population import get_station_population
from airsight.io.stations import load_stations


def build_spatial_features(
    panel: pd.DataFrame,
    city_id: str = "korba",
    fire_radius_km: float = 25.0,
) -> pd.DataFrame:
    """Enrich the panel with static (EDGAR, Pop) and spatial (Fire) features.

    Parameters
    ----------
    panel : pd.DataFrame
        Station panel with hourly data.
    city_id : str
        City ID to load station coordinates.
    fire_radius_km : float
        Radius for fire aggregation.

    Returns
    -------
    pd.DataFrame
        Enriched panel.
    """
    stations = load_stations(city_id)
    if stations.empty:
        return panel

    print("  Loading EDGAR emissions...")
    edgar_df = get_station_edgar_features(stations)
    
    print("  Loading WorldPop density...")
    pop_df = get_station_population(stations)
    
    print(f"  Loading FIRMS fires ({fire_radius_km}km radius)...")
    fire_df = get_station_fire_features(stations, radius_km=fire_radius_km)

    out = panel.copy()

    # Merge static features (station-level)
    static_df = edgar_df.merge(pop_df, on="station_id", how="outer")
    out = out.merge(static_df, on="station_id", how="left")

    # Merge temporal-spatial features (station + timestamp-daily level)
    if not fire_df.empty:
        # Convert panel timestamp to daily to merge with daily fire features
        out["_date"] = out["timestamp"].dt.normalize()
        out = out.merge(
            fire_df,
            left_on=["station_id", "_date"],
            right_on=["station_id", "timestamp"],
            how="left",
            suffixes=("", "_fire")
        )
        out.drop(columns=["_date", "timestamp_fire"], inplace=True)
        # Fill missing days with 0 fires
        fire_col = f"fire_frp_sum_{int(fire_radius_km)}km"
        if fire_col in out.columns:
            out[fire_col] = out[fire_col].fillna(0.0)

    return out
