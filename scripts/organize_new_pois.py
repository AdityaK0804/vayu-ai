import json
from pathlib import Path
import yaml

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "osm" / "pois"
CITIES_YAML_PATH = BASE_DIR / "config" / "cities.yaml"

def load_cities():
    with open(CITIES_YAML_PATH, "r") as f:
        config = yaml.safe_load(f)
    return config["cities"]

def is_in_bbox(lon, lat, bbox):
    w, s, e, n = bbox
    return w <= lon <= e and s <= lat <= n

def get_poi_type(feature):
    props = feature.get("properties", {})
    # Check landfill tags
    if props.get("landuse") == "landfill" or props.get("amenity") in ["waste_disposal", "recycling"]:
        return "landfills"
    # Check power tags
    if "power" in props or any(k.startswith("plant") or k.startswith("generator") for k in props):
        return "power_osm"
    return None

def main():
    cities = load_cities()
    print("Cities:")
    for city in cities:
        print(f"  {city['id']}: bbox={city['bbox']}")

    new_files = [
        DATA_DIR / "export.geojson",
        DATA_DIR / "export (1).geojson"
    ]

    for p in new_files:
        if not p.exists():
            print(f"File {p.name} not found, skipping.")
            continue
            
        print(f"\nProcessing new file {p.name}...")
        with open(p, "r", encoding="utf-8") as f:
            geojson = json.load(f)
            
        features = geojson.get("features", [])
        print(f"  Found {len(features)} features.")
        
        for feature in features:
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates")
            if not coords:
                continue
            lon, lat = coords[0], coords[1]
            
            # Determine POI type
            poi_type = get_poi_type(feature)
            if not poi_type:
                # Default to power_osm if unclear, or check tags
                poi_type = "power_osm"
                
            # Match to city bbox. Since Raipur and Jagdalpur are the targets,
            # we will match to the closest/overlapping city bbox, prioritizing Raipur/Jagdalpur
            matched_city = None
            for city in cities:
                city_id = city["id"]
                if is_in_bbox(lon, lat, city["bbox"]):
                    # If it falls in Raipur/Jagdalpur, we match immediately
                    if city_id in ["raipur", "jagdalpur"]:
                        matched_city = city_id
                        break
                    # Otherwise keep it as candidate if we don't find Raipur/Jagdalpur
                    if not matched_city:
                        matched_city = city_id
            
            if not matched_city:
                print(f"  Warning: Feature {feature.get('id')} at [{lon}, {lat}] does not match any city bbox.")
                continue
                
            # Load existing features in destination file to deduplicate
            dest_file = DATA_DIR / matched_city / f"{poi_type}.geojson"
            existing_geojson = {"type": "FeatureCollection", "features": []}
            if dest_file.exists():
                with open(dest_file, "r", encoding="utf-8") as df:
                    try:
                        existing_geojson = json.load(df)
                    except Exception:
                        pass
            
            existing_features = existing_geojson.get("features", [])
            
            # Deduplicate by ID
            fid = feature.get("id") or feature.get("properties", {}).get("@id")
            if not fid:
                fid = f"{coords}"
                
            duplicate = False
            for ef in existing_features:
                efid = ef.get("id") or ef.get("properties", {}).get("@id")
                if not efid:
                    ef_coords = ef.get("geometry", {}).get("coordinates", [])
                    efid = f"{ef_coords}"
                if efid == fid:
                    duplicate = True
                    break
                    
            if not duplicate:
                existing_features.append(feature)
                existing_geojson["features"] = existing_features
                with open(dest_file, "w", encoding="utf-8") as df:
                    json.dump(existing_geojson, df, indent=2)
                print(f"  Added feature {fid} to {matched_city}/{poi_type}.geojson")
            else:
                print(f"  Feature {fid} is duplicate in {matched_city}/{poi_type}.geojson, skipping.")

if __name__ == "__main__":
    main()
