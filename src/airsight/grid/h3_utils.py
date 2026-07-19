"""H3 grid utilities for spatial alignment.

Provides functions to map bounding boxes and station coordinates to H3 cells,
and to aggregate spatial points. Supports both H3 v3 and v4 APIs.
"""

from __future__ import annotations

import pandas as pd

try:
    import h3
except ImportError:
    raise ImportError("Please install the h3-py library: pip install h3")


def cells_for_bbox(bbox: list[float] | tuple[float, float, float, float], res: int) -> list[str]:
    """Get H3 cells covering a bounding box [W, S, E, N].

    Handles API differences between H3 v3 and H3 v4.
    """
    W, S, E, N = bbox
    # GeoJSON polygon format
    poly = {
        "type": "Polygon",
        "coordinates": [[[W, S], [W, N], [E, N], [E, S], [W, S]]],
    }

    try:
        # H3 v4 API
        cells = h3.geo_to_cells(poly, res)
        return list(cells)
    except AttributeError:
        # H3 v3 API fallback
        # v3 polyfill uses (lat, lng) instead of (lng, lat) for geo_json_conformant=False
        gj = {"type": "Polygon", "coordinates": [[[S, W], [N, W], [N, E], [S, E], [S, W]]]}
        cells = h3.polyfill(gj, res, geo_json_conformant=False)
        return list(cells)


def station_to_h3(lat: float, lon: float, res: int) -> str:
    """Find the H3 cell containing a given latitude/longitude coordinate."""
    try:
        # H3 v4 API
        return h3.latlng_to_cell(lat, lon, res)
    except AttributeError:
        # H3 v3 API fallback
        return h3.geo_to_h3(lat, lon, res)


def aggregate_points_to_h3(
    df: pd.DataFrame,
    lat_col: str,
    lon_col: str,
    val_col: str,
    res: int,
    agg_func: str = "mean",
) -> pd.DataFrame:
    """Aggregate point values to H3 cells.

    Parameters
    ----------
    df : pd.DataFrame
        Input data frame containing point locations and values.
    lat_col : str
        Name of the latitude column.
    lon_col : str
        Name of the longitude column.
    val_col : str
        Name of the column containing the value to aggregate.
    res : int
        H3 grid resolution.
    agg_func : str
        Aggregation function (e.g. 'mean', 'sum', 'count').

    Returns
    -------
    pd.DataFrame
        DataFrame indexed by H3 cell containing aggregated values.
    """
    if df.empty:
        return pd.DataFrame(columns=["h3_cell", val_col])

    df = df.copy()
    df["h3_cell"] = df.apply(
        lambda r: station_to_h3(r[lat_col], r[lon_col], res) 
        if pd.notna(r[lat_col]) and pd.notna(r[lon_col]) 
        else None,
        axis=1
    )
    # Drop rows with no coordinate mapping
    df = df.dropna(subset=["h3_cell"])

    aggregated = df.groupby("h3_cell")[val_col].agg(agg_func).reset_index()
    return aggregated
