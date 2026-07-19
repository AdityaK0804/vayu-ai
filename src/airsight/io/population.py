"""WorldPop population data loader.

Memory-efficient sampling using rasterio.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

try:
    import rasterio
except ImportError:
    print("  [!] Please run: pip install rasterio")
    sys.exit(1)

from airsight.config import DATA

_POP_FILE = DATA / "static" / "population" / "worldpop_india.tif"


def get_station_population(stations: pd.DataFrame) -> pd.DataFrame:
    """Sample WorldPop population density at station coordinates.

    Reads from the TIFF without loading the entire array into RAM.

    Parameters
    ----------
    stations : pd.DataFrame
        Must contain ``station_id``, ``latitude``, ``longitude``.

    Returns
    -------
    pd.DataFrame
        Columns: ``station_id``, ``population_density``.
    """
    if not _POP_FILE.exists():
        print(f"  [!] WorldPop file not found: {_POP_FILE}")
        return pd.DataFrame({"station_id": stations["station_id"], "population_density": float("nan")})

    df = pd.DataFrame({"station_id": stations["station_id"].copy()})
    coords = []
    
    for _, row in stations.iterrows():
        if pd.isna(row["latitude"]) or pd.isna(row["longitude"]):
            coords.append(None)
        else:
            # rasterio expects (longitude, latitude)
            coords.append((row["longitude"], row["latitude"]))

    densities = []
    try:
        with rasterio.open(_POP_FILE) as src:
            # sample() yields generators of pixel values
            valid_coords = [c for c in coords if c is not None]
            
            if valid_coords:
                samples = list(src.sample(valid_coords))
                sample_idx = 0
                for c in coords:
                    if c is None:
                        densities.append(float("nan"))
                    else:
                        val = samples[sample_idx][0]
                        # Handle nodata
                        if val == src.nodata or val < 0:
                            densities.append(0.0)
                        else:
                            densities.append(float(val))
                        sample_idx += 1
            else:
                densities = [float("nan")] * len(coords)
    except Exception as exc:
        print(f"  [!] Error reading WorldPop: {exc}")
        densities = [float("nan")] * len(coords)

    df["population_density"] = densities
    return df
