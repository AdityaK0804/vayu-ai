"""EDGAR inventory data loader.

Extracts PM2.5 emissions per sector at station coordinates.
Uses xarray to sample the netCDF files.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

try:
    import xarray as xr
    _HAS_XARRAY = True
except ImportError:
    xr = None
    _HAS_XARRAY = False

from airsight.config import DATA

_EDGAR_DIR = DATA / "inventory" / "edgar"
# Sectors based on directory names
_SECTORS = ["Power", "Industry", "Transport", "agriculture", "residential"]


def get_station_edgar_features(stations: pd.DataFrame) -> pd.DataFrame:
    """Sample EDGAR PM2.5 emissions for each station.

    Parameters
    ----------
    stations : pd.DataFrame
        Must contain ``station_id``, ``latitude``, ``longitude``.

    Returns
    -------
    pd.DataFrame
        Columns: ``station_id`` and one column per sector e.g. ``edgar_Power_pm25``.
    """
    if not _HAS_XARRAY:
        logger.warning("xarray or netCDF4 not installed; skipping EDGAR netCDF sampling")
        return pd.DataFrame({"station_id": stations["station_id"]})

    if not _EDGAR_DIR.exists():
        logger.info("EDGAR dir not found: %s", _EDGAR_DIR)
        return pd.DataFrame({"station_id": stations["station_id"]})

    df = pd.DataFrame({"station_id": stations["station_id"].copy()})

    for sector in _SECTORS:
        sector_dir = _EDGAR_DIR / sector
        if not sector_dir.exists():
            continue

        # Find the PM2.5 netCDF for this sector
        nc_files = list(sector_dir.glob("*_PM2.5_*.nc"))
        if not nc_files:
            continue
        nc_file = nc_files[0]

        try:
            ds = xr.open_dataset(nc_file)
            # Find the data variable name (usually 'emissions' or something similar)
            data_var = next(iter(ds.data_vars))

            # Sample at station points
            emissions = []
            for _, row in stations.iterrows():
                if pd.isna(row["latitude"]) or pd.isna(row["longitude"]):
                    emissions.append(float("nan"))
                    continue

                # EDGAR uses 0.1x0.1 degree grid. Nearest neighbor sampling.
                try:
                    val = ds[data_var].sel(
                        lat=row["latitude"],
                        lon=row["longitude"],
                        method="nearest"
                    ).values
                    emissions.append(float(val))
                except Exception:
                    emissions.append(float("nan"))

            df[f"edgar_{sector}_pm25"] = emissions
            ds.close()
        except Exception as exc:
            print(f"  [!] Error reading {nc_file.name}: {exc}")

    return df
