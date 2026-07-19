"""OSM data loader.

Loads road networks and point of interest (POI) features from OSM data directories.
"""

from __future__ import annotations

import logging
from pathlib import Path
import pandas as pd

try:
    import geopandas as gpd
except ImportError:
    gpd = None

from airsight.config import DATA

logger = logging.getLogger(__name__)


def load_osm_roads(city_id: str) -> gpd.GeoDataFrame | pd.DataFrame:
    """Load OSM road edges for a given city as a GeoDataFrame."""
    path = DATA / "osm" / "roads" / city_id / "road_edges.geojson"
    if not path.exists():
        logger.warning(f"OSM road edges GeoJSON missing: {path}")
        if gpd is not None:
            return gpd.GeoDataFrame(columns=["highway", "length", "road_weight", "geometry"])
        return pd.DataFrame(columns=["highway", "length", "road_weight"])
        
    if gpd is None:
        logger.error("geopandas is not installed. Cannot load spatial GeoJSON.")
        return pd.DataFrame(columns=["highway", "length", "road_weight"])

    try:
        return gpd.read_file(path)
    except Exception as e:
        logger.error(f"Error reading OSM roads for {city_id}: {e}")
        return gpd.GeoDataFrame(columns=["highway", "length", "road_weight", "geometry"])


def load_osm_pois(city_id: str, poi_type: str) -> gpd.GeoDataFrame | pd.DataFrame:
    """Load OSM POIs (hospitals, schools, industrial, stacks, kilns) for a given city."""
    valid_types = ("hospitals", "schools", "industrial", "stacks", "kilns")
    if poi_type not in valid_types:
        raise ValueError(f"Invalid POI type: {poi_type}. Expected one of {valid_types}.")

    path = DATA / "osm" / "pois" / city_id / f"{poi_type}.geojson"
    if not path.exists():
        logger.warning(f"OSM POI GeoJSON missing: {path}")
        if gpd is not None:
            return gpd.GeoDataFrame(columns=["geometry"])
        return pd.DataFrame()

    if gpd is None:
        logger.error("geopandas is not installed. Cannot load spatial GeoJSON.")
        return pd.DataFrame()

    try:
        return gpd.read_file(path)
    except Exception as e:
        logger.error(f"Error reading OSM POIs '{poi_type}' for {city_id}: {e}")
        return gpd.GeoDataFrame(columns=["geometry"])
