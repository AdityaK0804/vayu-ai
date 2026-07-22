from pathlib import Path
import shutil
import yaml
import pandas as pd
import subprocess

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CPCB_DIR = DATA_DIR / "cpcb"
RAIGARH_DIR = CPCB_DIR / "raigarh"

STATIONS_CSV = BASE_DIR / "config" / "stations.csv"
CITIES_YAML = BASE_DIR / "config" / "cities.yaml"

CITIES_INFO = {
    "tumidih": {
        "name": "Tumidih",
        "lat": 22.06631475,
        "lon": 83.33820077,
        "bbox": [83.238, 21.966, 83.438, 22.166],
        "station_name": "OP Jindal Industrial Park, Tumidih - CECB",
        "orig_file": "cpcb_raigarh_tumidih_2021_2025.csv",
        "new_file": "cpcb_tumidih_tumidih_2021_2025.csv",
        "station_id": "tumidih_01"
    },
    "milupara": {
        "name": "Milupara",
        "lat": 22.1910172,
        "lon": 83.5197009,
        "bbox": [83.420, 22.091, 83.620, 22.291],
        "station_name": "Govt. Higher Secondary School, Milupara - CECB",
        "orig_file": "cpcb_raigarh_milupara_2021_2025.csv",
        "new_file": "cpcb_milupara_milupara_2021_2025.csv",
        "station_id": "milupara_01"
    },
    "chhal": {
        "name": "Chhal",
        "lat": 22.118125,
        "lon": 83.140608,
        "bbox": [83.041, 22.018, 83.241, 22.218],
        "station_name": "Nawapara SECL Colony, Chhal - CECB",
        "orig_file": "cpcb_raigarh_chhal_2021_2025.csv",
        "new_file": "cpcb_chhal_chhal_2021_2025.csv",
        "station_id": "chhal_01"
    },
    "kunjemara": {
        "name": "Kunjemara",
        "lat": 22.12665,
        "lon": 83.483212,
        "bbox": [83.383, 22.027, 83.583, 22.227],
        "station_name": "OP Jindal School, Kunjemura - CECB",
        "orig_file": "cpcb_raigarh_kunjemura_2021_2025.csv",
        "new_file": "cpcb_kunjemara_kunjemara_2021_2025.csv",
        "station_id": "kunjemara_01"
    }
}

def main():
    # 1. Create separate city folders and move files
    print("Moving and renaming CPCB files into individual city directories...")
    for cid, info in CITIES_INFO.items():
        city_dir = CPCB_DIR / cid
        city_dir.mkdir(parents=True, exist_ok=True)
        
        src_path = RAIGARH_DIR / info["orig_file"]
        dest_path = city_dir / info["new_file"]
        
        if src_path.exists():
            shutil.copy2(src_path, dest_path)
            print(f"  Copied {info['orig_file']} -> {cid}/{info['new_file']}")
        else:
            print(f"  [!] Source file not found: {src_path}")

    # Remove old Raigarh directory
    if RAIGARH_DIR.exists():
        shutil.rmtree(RAIGARH_DIR)
        print("Removed old data/cpcb/raigarh/ directory.")

    # Remove old data/met/raigarh/ directory if it exists
    old_met_dir = DATA_DIR / "met" / "raigarh"
    if old_met_dir.exists():
        shutil.rmtree(old_met_dir)
        print("Removed old data/met/raigarh/ directory.")

    # 2. Update config/cities.yaml
    print("\nUpdating config/cities.yaml...")
    with open(CITIES_YAML, "r") as f:
        config = yaml.safe_load(f)

    # Filter out raigarh
    cities_list = [c for c in config.get("cities", []) if c.get("id") != "raigarh"]

    # Add the four individual cities
    for cid, info in CITIES_INFO.items():
        # Check if already exists, else append
        if not any(c.get("id") == cid for c in cities_list):
            cities_list.append({
                "id": cid,
                "name": info["name"],
                "role": "validation_optional",
                "lat": info["lat"],
                "lon": info["lon"],
                "bbox": info["bbox"],
                "has_stations": True,
                "notes": f"Industrial station at {info['name']}."
            })
            print(f"  Added city {cid} to config.")

    config["cities"] = cities_list
    with open(CITIES_YAML, "w") as f:
        yaml.safe_dump(config, f, sort_keys=False)
    print("  Saved updated config/cities.yaml.")

    # 3. Update config/stations.csv
    print("\nUpdating config/stations.csv...")
    # Load original stations, filter out raigarh stations
    stations_data = []
    if STATIONS_CSV.exists():
        df_orig = pd.read_csv(STATIONS_CSV)
        # Filter out raigarh_* stations
        df_filtered = df_orig[~df_orig["station_id"].str.startswith("raigarh_")]
        stations_data = df_filtered.to_dict(orient="records")

    # Add the four new individual city stations
    for cid, info in CITIES_INFO.items():
        stations_data.append({
            "station_id": info["station_id"],
            "station_name": info["station_name"],
            "city_id": cid,
            "latitude": info["lat"],
            "longitude": info["lon"],
            "source_file": info["new_file"]
        })

    # Save to CSV
    df_new_stations = pd.DataFrame(stations_data)
    df_new_stations.to_csv(STATIONS_CSV, index=False)
    print(f"  Successfully wrote {len(df_new_stations)} stations to config/stations.csv.")

    # 4. Fetch meteorology data for these 4 cities
    print("\nFetching meteorology data for new cities...")
    cities_args = " ".join(CITIES_INFO.keys())
    cmd = f"python scripts/01_fetch_openmeteo.py --cities {cities_args}"
    try:
        subprocess.run(cmd, shell=True, check=True)
        print("  Meteorology data successfully fetched.")
    except Exception as e:
        print(f"  [!] Error fetching meteorology: {e}")

if __name__ == "__main__":
    main()
