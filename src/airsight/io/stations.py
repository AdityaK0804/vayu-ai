"""Station metadata loader.

Reads ``config/stations.csv`` and returns validated station records as a
:class:`pandas.DataFrame`.  Latitude and longitude are coerced to float;
rows that fail validation are dropped with a warning.
"""

from __future__ import annotations

import pandas as pd

from airsight.config import CONFIG


_STATIONS_CSV = CONFIG / "stations.csv"


def load_stations(city_id: str | None = None) -> pd.DataFrame:
    """Load station metadata from ``config/stations.csv``.

    Parameters
    ----------
    city_id : str | None
        If provided, return only rows where ``city_id`` matches.

    Returns
    -------
    pd.DataFrame
        Columns: station_id, station_name, city_id, latitude, longitude,
        source_file.  ``latitude`` and ``longitude`` are float64.
    """
    df = pd.read_csv(
        _STATIONS_CSV,
        comment="#",
        skipinitialspace=True,
        dtype=str,
    )
    # Strip whitespace from all string columns
    df = df.apply(lambda col: col.str.strip() if col.dtype == "object" else col)

    # Drop rows with empty city_id
    df = df[df["city_id"].notna() & (df["city_id"] != "")]

    # Validate and coerce lat/lon
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    bad = df[df["latitude"].isna() | df["longitude"].isna()]
    if len(bad):
        ids = bad["station_id"].tolist()
        print(f"  [!] Dropped {len(bad)} station(s) with invalid lat/lon: {ids}")
    df = df.dropna(subset=["latitude", "longitude"])

    if city_id is not None:
        df = df[df["city_id"] == city_id]

    return df.reset_index(drop=True)
