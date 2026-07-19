import json
from pathlib import Path
import numpy as np
import pandas as pd
import yaml

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SOURCES_DIR = DATA_DIR / "sources"
CONFIG_FILE = BASE_DIR / "config" / "cities.yaml"
OUTPUT_FILE = SOURCES_DIR / "industry_registry.geojson"

def load_cities():
    with open(CONFIG_FILE, "r") as f:
        config = yaml.safe_load(f)
    return config["cities"]

def get_centroid(geometry):
    """Compute the centroid (longitude, latitude) of any geojson geometry."""
    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")
    
    if not coords:
        return None
        
    if geom_type == "Point":
        return coords[0], coords[1]
        
    elif geom_type in ["Polygon", "MultiLineString"]:
        # Flatten coordinates
        flat_coords = []
        if geom_type == "Polygon":
            for ring in coords:
                for pt in ring:
                    flat_coords.append(pt)
        else:
            for line in coords:
                for pt in line:
                    flat_coords.append(pt)
        if not flat_coords:
            return None
        arr = np.array(flat_coords)
        mean_lon, mean_lat = arr[:, 0].mean(), arr[:, 1].mean()
        return mean_lon, mean_lat
        
    elif geom_type == "MultiPolygon":
        flat_coords = []
        for poly in coords:
            for ring in poly:
                for pt in ring:
                    flat_coords.append(pt)
        if not flat_coords:
            return None
        arr = np.array(flat_coords)
        mean_lon, mean_lat = arr[:, 0].mean(), arr[:, 1].mean()
        return mean_lon, mean_lat
        
    elif geom_type == "LineString":
        arr = np.array(coords)
        mean_lon, mean_lat = arr[:, 0].mean(), arr[:, 1].mean()
        return mean_lon, mean_lat
        
    return None

def main():
    cities = load_cities()
    print("Loaded cities:")
    for city in cities:
        print(f"  {city['id']}")

    features = []

    # 1. GPPD Power Plants
    gppd_file = SOURCES_DIR / "power_plants_by_city.csv"
    if gppd_file.exists():
        print(f"\nProcessing GPPD Power Plants: {gppd_file.name}...")
        df = pd.read_csv(gppd_file)
        for _, row in df.iterrows():
            name = row.get("name")
            if pd.isna(name):
                name = f"unknown_gppd_{row['latitude']:.4f}_{row['longitude']:.4f}"
            
            notes_parts = []
            if not pd.isna(row.get("capacity_mw")):
                notes_parts.append(f"Capacity: {row['capacity_mw']} MW")
            if not pd.isna(row.get("primary_fuel")):
                notes_parts.append(f"Fuel: {row['primary_fuel']}")
            if not pd.isna(row.get("owner")):
                notes_parts.append(f"Owner: {row['owner']}")
            if not pd.isna(row.get("commissioning_year")):
                notes_parts.append(f"Commissioned: {int(row['commissioning_year'])}")
            
            feat = {
                "type": "Feature",
                "properties": {
                    "name": name,
                    "city_id": row["city_id"],
                    "source": "gppd",
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                    "notes": ", ".join(notes_parts)
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["longitude"]), float(row["latitude"])]
                }
            }
            features.append(feat)
        print(f"  Added {len(df)} GPPD features.")
    else:
        print(f"\n[!] GPPD file not found: {gppd_file.name}")

    # 2. FIRMS Thermal Hotspots
    firms_file = SOURCES_DIR / "firms_thermal_hotspots.csv"
    if firms_file.exists():
        print(f"\nProcessing FIRMS Thermal Hotspots: {firms_file.name}...")
        df = pd.read_csv(firms_file)
        
        # Round coordinates to 2 decimal places to group by ~1.1 km cells
        df["lat_cell"] = df["latitude"].round(2)
        df["lon_cell"] = df["longitude"].round(2)
        
        # Group by cell to avoid bloated GeoJSON files
        grouped = df.groupby(["city_id", "lat_cell", "lon_cell"]).agg(
            count=("frp", "count"),
            max_frp=("frp", "max"),
            mean_frp=("frp", "mean"),
            min_date=("acq_date", "min"),
            max_date=("acq_date", "max")
        ).reset_index()
        
        for _, row in grouped.iterrows():
            lat, lon = float(row["lat_cell"]), float(row["lon_cell"])
            name = f"Persistent thermal hotspot cell ({lat:.2f}, {lon:.2f})"
            notes = (
                f"Detections: {row['count']}, Max FRP: {row['max_frp']:.1f}, "
                f"Avg FRP: {row['mean_frp']:.1f}, Active: {row['min_date']} to {row['max_date']}"
            )
            
            feat = {
                "type": "Feature",
                "properties": {
                    "name": name,
                    "city_id": row["city_id"],
                    "source": "firms_thermal",
                    "latitude": lat,
                    "longitude": lon,
                    "notes": notes
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat]
                }
            }
            features.append(feat)
        print(f"  Added {len(grouped)} aggregated FIRMS cells (from {len(df)} individual points).")
    else:
        print(f"\n[!] FIRMS file not found: {firms_file.name}")

    # 3. OSM Layers per city
    for city in cities:
        cid = city["id"]
        # Map file labels to sources
        layers = [
            {"filename": "industrial.geojson", "source": "osm", "notes_label": "Industrial area"},
            {"filename": "stacks.geojson", "source": "osm", "notes_label": "Stack/works"},
            {"filename": "power_osm.geojson", "source": "osm_power", "notes_label": "Power facility"}
        ]
        
        for layer in layers:
            p = DATA_DIR / "osm" / "pois" / cid / layer["filename"]
            if not p.exists():
                continue
                
            with open(p, "r", encoding="utf-8") as f:
                try:
                    geojson = json.load(f)
                except Exception as e:
                    print(f"  [!] Error reading {p.relative_to(BASE_DIR)}: {e}")
                    continue
                    
            layer_feats = geojson.get("features", [])
            added_count = 0
            
            for feature in layer_feats:
                geom = feature.get("geometry")
                if not geom:
                    continue
                
                centroid = get_centroid(geom)
                if not centroid:
                    continue
                    
                lon, lat = centroid
                props = feature.get("properties", {})
                name = props.get("name")
                
                if not name:
                    name = f"unknown_{layer['source']}_{lat:.4f}_{lon:.4f}"
                    
                # Collect notes from tags
                notes_parts = [layer["notes_label"]]
                interesting_keys = ["landuse", "man_made", "power", "substation", "voltage", "operator", "plant:output:electricity"]
                for k in interesting_keys:
                    v = props.get(k)
                    if v:
                        notes_parts.append(f"{k}: {v}")
                
                feat = {
                    "type": "Feature",
                    "properties": {
                        "name": name,
                        "city_id": cid,
                        "source": layer["source"],
                        "latitude": lat,
                        "longitude": lon,
                        "notes": ", ".join(notes_parts)
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    }
                }
                features.append(feat)
                added_count += 1
                
            if added_count > 0:
                print(f"  Added {added_count} features from {cid}/{layer['filename']}.")

    # Output GeoJSON
    registry_geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(registry_geojson, f, indent=2)
        
    print(f"\nSuccessfully created merged registry: {OUTPUT_FILE.relative_to(BASE_DIR)}")
    print(f"Total features in registry: {len(features)}")

if __name__ == "__main__":
    main()
