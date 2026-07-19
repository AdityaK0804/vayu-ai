import json
from pathlib import Path
import yaml

# Define paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "osm" / "pois"
CITIES_YAML_PATH = BASE_DIR / "config" / "cities.yaml"

def load_cities():
    with open(CITIES_YAML_PATH, "r") as f:
        config = yaml.safe_load(f)
    return config["cities"]

def main():
    cities = load_cities()
    print("Loaded cities:")
    for city in cities:
        print(f"  {city['id']}")

    # Map each file directly to its corresponding city and POI type
    sources = [
        {"path": DATA_DIR / "Bhilai_Power_Infra.geojson", "city": "bhilai", "type": "power_osm"},
        {"path": DATA_DIR / "Bhilai_Waste_Dump.geojson", "city": "bhilai", "type": "landfills"},
        {"path": DATA_DIR / "Bilaspur_Power_Infra.geojson", "city": "bilaspur", "type": "power_osm"},
        {"path": DATA_DIR / "Korba_Power_Infra.geojson", "city": "korba", "type": "power_osm"},
        {"path": DATA_DIR / "Korba_Waste_Dump.geojson", "city": "korba", "type": "landfills"},
        {"path": DATA_DIR / "export.geojson", "city": "bilaspur", "type": "landfills"},
        {"path": DATA_DIR / "export (1).geojson", "city": "bilaspur", "type": "power_osm"},
    ]

    # Initialize collections
    results = {
        city["id"]: {"landfills": {}, "power_osm": {}} for city in cities
    }

    for source in sources:
        path = source["path"]
        city_id = source["city"]
        poi_type = source["type"]
        
        if not path.exists():
            print(f"Source file {path.name} not found, skipping.")
            continue
        
        print(f"Processing {path.name} -> City: {city_id}, Type: {poi_type}...")
        with open(path, "r", encoding="utf-8") as f:
            geojson = json.load(f)
            
        features = geojson.get("features", [])
        print(f"  Found {len(features)} features.")
        
        for feature in features:
            # Deduplicate using feature ID or coordinates
            fid = feature.get("id") or feature.get("properties", {}).get("@id")
            if not fid:
                # Fallback to coordinate hash if no ID exists
                geom = feature.get("geometry", {})
                coords = geom.get("coordinates", [])
                fid = f"{coords}"
            
            # Store in dict to deduplicate automatically
            results[city_id][poi_type][fid] = feature

    # Write organized files
    print("\nWriting organized GeoJSON files:")
    for city in cities:
        city_id = city["id"]
        city_dir = DATA_DIR / city_id
        city_dir.mkdir(parents=True, exist_ok=True)
        
        for poi_type in ["landfills", "power_osm"]:
            # Convert dict values back to a list of features
            features_dict = results[city_id][poi_type]
            features_list = list(features_dict.values())
            
            dest_file = city_dir / f"{poi_type}.geojson"
            
            output_geojson = {
                "type": "FeatureCollection",
                "features": features_list
            }
            
            with open(dest_file, "w", encoding="utf-8") as f:
                json.dump(output_geojson, f, indent=2)
                
            print(f"  Saved {len(features_list)} unique features to {dest_file.relative_to(BASE_DIR)}")

if __name__ == "__main__":
    main()
