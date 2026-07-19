import json
import os
from pathlib import Path
import numpy as np
import pandas as pd
import rasterio
import yaml

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FIRE_DIR = DATA_DIR / "fire"
SOURCES_DIR = DATA_DIR / "sources"
CONFIG_FILE = BASE_DIR / "config" / "cities.yaml"
POP_FILE = DATA_DIR / "static" / "population" / "worldpop_india.tif"

def load_cities():
    with open(CONFIG_FILE, "r") as f:
        config = yaml.safe_load(f)
    return config["cities"]

def load_landfills(city_id):
    path = DATA_DIR / "osm" / "pois" / city_id / "landfills.geojson"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        geojson = json.load(f)
    coords = []
    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        if geom.get("type") == "Point":
            c = geom.get("coordinates")
            coords.append((c[1], c[0]))  # (latitude, longitude)
    return coords

def haversine_dist(lats1, lons1, lats2, lons2):
    """Compute distance matrix between two sets of lat/lon points.
    lats1, lons1: shape (N,)
    lats2, lons2: shape (M,)
    Returns: shape (N, M)
    """
    R = 6371.0  # Earth radius in km
    lats1, lons1 = np.radians(lats1), np.radians(lons1)
    lats2, lons2 = np.radians(lats2), np.radians(lons2)
    
    # Broadcast subtraction
    dlat = lats2[np.newaxis, :] - lats1[:, np.newaxis]
    dlon = lons2[np.newaxis, :] - lons1[:, np.newaxis]
    
    a = np.sin(dlat/2)**2 + np.cos(lats1[:, np.newaxis]) * np.cos(lats2[np.newaxis, :]) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def main():
    cities = load_cities()
    firms_file = FIRE_DIR / "firms_chhattisgarh.csv"
    if not firms_file.exists():
        print(f"Error: {firms_file} does not exist!")
        return

    print("Loading FIRMS active fire dataset...")
    df = pd.read_csv(firms_file)
    print(f"Loaded {len(df)} records.")

    # Filter to only points inside our city bounding boxes
    city_frames = []
    for city in cities:
        cid = city["id"]
        w, s, e, n = city["bbox"]
        pts = df[(df["longitude"].between(w, e)) & (df["latitude"].between(s, n))].copy()
        pts["city_id"] = cid
        city_frames.append(pts)
    
    city_df = pd.concat(city_frames, ignore_index=True)
    print(f"Found {len(city_df)} records falling within city bounding boxes.")

    # ----------------------------------------------------
    # 5a - Persistent industrial thermal hotspots
    # ----------------------------------------------------
    print("\nProcessing 5a: Persistent industrial thermal hotspots...")
    
    # We round coordinates to 2 decimal places to define ~1-2 km cells
    city_df["lat_cell"] = city_df["latitude"].round(2)
    city_df["lon_cell"] = city_df["longitude"].round(2)
    city_df["acq_month"] = pd.to_datetime(city_df["acq_date"]).dt.to_period("M")
    
    # Identify repeat detections (cells active in 5+ distinct months)
    cell_activity = city_df.groupby(["city_id", "lat_cell", "lon_cell"])["acq_month"].nunique().reset_index()
    cell_activity.rename(columns={"acq_month": "active_months"}, inplace=True)
    persistent_cells = cell_activity[cell_activity["active_months"] >= 5]
    
    # Mark persistent cells
    city_df = city_df.merge(
        persistent_cells[["city_id", "lat_cell", "lon_cell", "active_months"]],
        on=["city_id", "lat_cell", "lon_cell"],
        how="left"
    )
    city_df["is_persistent"] = city_df["active_months"].notna()
    
    # Hotspot criteria: frp >= 15.0 OR falls in a persistent cell
    hotspots = city_df[(city_df["frp"] >= 15.0) | (city_df["is_persistent"])].copy()
    hotspots["hotspot_type"] = "industrial_thermal"
    
    # Format and save
    hotspots_out = hotspots[[
        "city_id", "latitude", "longitude", "frp", "confidence", "acq_date", "hotspot_type"
    ]]
    hotspots_out_file = SOURCES_DIR / "firms_thermal_hotspots.csv"
    hotspots_out.to_csv(hotspots_out_file, index=False)
    print(f"Saved {len(hotspots_out)} hotspot records to {hotspots_out_file.relative_to(BASE_DIR)}")

    # ----------------------------------------------------
    # 5b - Waste-burning candidates
    # ----------------------------------------------------
    print("\nProcessing 5b: Waste-burning candidates...")
    
    # Low FRP detections (< 15.0) and nominal/high confidence
    candidates_base = city_df[(city_df["frp"] < 15.0) & (city_df["confidence"].isin(["n", "h"]))].copy()
    
    waste_candidates = []
    
    # Sample WorldPop raster if needed (only open it once)
    print("Opening WorldPop population raster...")
    with rasterio.open(POP_FILE) as pop_src:
        for city in cities:
            cid = city["id"]
            city_pts = candidates_base[candidates_base["city_id"] == cid].copy()
            if city_pts.empty:
                continue
            
            landfills = load_landfills(cid)
            
            if landfills:
                print(f"  City '{cid}' has {len(landfills)} landfills. Performing spatial join...")
                # Compute haversine distance to nearest landfill
                lats = city_pts["latitude"].values
                lons = city_pts["longitude"].values
                lf_lats = np.array([l[0] for l in landfills])
                lf_lons = np.array([l[1] for l in landfills])
                
                dist_matrix = haversine_dist(lats, lons, lf_lats, lf_lons)
                min_dists = dist_matrix.min(axis=1)
                
                city_pts["dist_to_landfill"] = min_dists
                city_pts_filtered = city_pts[city_pts["dist_to_landfill"] <= 2.0].copy()
                city_pts_filtered["near_landfill"] = "yes"
                city_pts_filtered["notes"] = city_pts_filtered["dist_to_landfill"].apply(
                    lambda d: f"Within {d:.2f} km of OSM landfill"
                )
                waste_candidates.append(city_pts_filtered)
                print(f"    Kept {len(city_pts_filtered)} points within 2 km of landfills.")
                
            else:
                print(f"  City '{cid}' has no landfills. Using WorldPop to identify populated areas...")
                # Sample population density
                coords = list(zip(city_pts["longitude"], city_pts["latitude"]))
                sampled = list(pop_src.sample(coords))
                city_pts["pop_density"] = [v[0] for v in sampled]
                
                # Keep points in residential-looking/populated areas (pop_density > 50.0)
                city_pts_filtered = city_pts[city_pts["pop_density"] > 50.0].copy()
                city_pts_filtered["near_landfill"] = "no"
                city_pts_filtered["notes"] = city_pts_filtered["pop_density"].apply(
                    lambda p: f"Populated area candidate (WorldPop density: {p:.1f}/px)"
                )
                waste_candidates.append(city_pts_filtered)
                print(f"    Kept {len(city_pts_filtered)} points in populated areas (pop_density > 50.0).")
                
    waste_df = pd.concat(waste_candidates, ignore_index=True)
    waste_out = waste_df[[
        "city_id", "latitude", "longitude", "frp", "acq_date", "near_landfill", "notes"
    ]]
    
    waste_out_file = SOURCES_DIR / "firms_waste_burning_candidates.csv"
    waste_out.to_csv(waste_out_file, index=False)
    print(f"Saved {len(waste_out)} waste-burning candidates to {waste_out_file.relative_to(BASE_DIR)}")

    # ----------------------------------------------------
    # File Cleanup
    # ----------------------------------------------------
    print("\nPerforming raw archive file cleanup...")
    archives = [
        FIRE_DIR / "fire_archive_J1V-C2_774494.csv",
        FIRE_DIR / "fire_archive_SV-C2_774495.csv"
    ]
    for archive in archives:
        if archive.exists():
            os.remove(archive)
            print(f"  Deleted archive file: {archive.relative_to(BASE_DIR)}")
        else:
            print(f"  Archive file not found (already deleted): {archive.name}")
            
    print("\nAll tasks completed successfully!")

if __name__ == "__main__":
    main()
