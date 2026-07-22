import zipfile
from pathlib import Path
import os
import shutil
import re
import pandas as pd
import yaml

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CPCB_DIR = DATA_DIR / "cpcb"
ZIP_PATH = CPCB_DIR / "CPCB_23_to_25-20260719T163451Z-1-001.zip"
TEMP_DIR = CPCB_DIR / "temp_extract"

STATIONS_CSV = BASE_DIR / "config" / "stations.csv"
CITIES_YAML = BASE_DIR / "config" / "cities.yaml"

# Station mappings
STATION_MAP = {
    # Korba
    "korba_01": {"city": "korba", "keywords": ["rampur"], "name": "Rampur, Korba - CECB", "file": "cpcb_korba_rampur_2021_2025.csv"},
    "korba_02": {"city": "korba", "keywords": ["urja", "urjangr"], "name": "Urja Nagar, Korba - CECB", "file": "cpcb_korba_urja_nagar_2021_2025.csv"},
    # Raipur
    "raipur_01": {"city": "raipur", "keywords": ["aiims"], "name": "AIIMS, Raipur - CECB", "file": "cpcb_raipur_aiims_2021_2025.csv"},
    "raipur_02": {"city": "raipur", "keywords": ["bhatagaon", "bhata_gaon"], "name": "Bhatagaon New ISBT, Raipur - CECB", "file": "cpcb_raipur_bhatagaon_2021_2025.csv"},
    "raipur_03": {"city": "raipur", "keywords": ["krishak", "krishaknagar"], "name": "Krishak Nagar, Raipur - CECB", "file": "cpcb_raipur_krishak_nagar_2021_2025.csv"},
    "raipur_04": {"city": "raipur", "keywords": ["siltara", "sitara"], "name": "Siltara Phase-II, Raipur - CECB", "file": "cpcb_raipur_siltara_2021_2025.csv"},
    # Bhilai
    "bhilai_01": {"city": "bhilai", "keywords": ["hathkhoj", "hathkoj"], "name": "Hathkhoj, Bhilai - CECB", "file": "cpcb_bhilai_hathkhoj_2021_2025.csv"},
    "bhilai_02": {"city": "bhilai", "keywords": ["32_bungalow", "32bungalows"], "name": "32 Bungalows, Bhilai - CECB", "file": "cpcb_bhilai_32_bungalows_2021_2025.csv"},
    "bhilai_03": {"city": "bhilai", "keywords": ["civic", "ncc"], "name": "Civic Center, Bhilai - BSP", "file": "cpcb_bhilai_civic_center_2021_2025.csv"},
    # Bilaspur
    "bilaspur_01": {"city": "bilaspur", "keywords": ["mangala"], "name": "Mangala, Bilaspur - NTPC", "file": "cpcb_bilaspur_mangala_2021_2025.csv"},
    # Raigarh (New)
    "raigarh_01": {"city": "raigarh", "keywords": ["tumidih"], "name": "OP Jindal Industrial Park, Tumidih - CECB", "file": "cpcb_raigarh_tumidih_2021_2025.csv", "lat": 22.06631475, "lon": 83.33820077},
    "raigarh_02": {"city": "raigarh", "keywords": ["milupara"], "name": "Govt. Higher Secondary School, Milupara - CECB", "file": "cpcb_raigarh_milupara_2021_2025.csv", "lat": 22.1910172, "lon": 83.5197009},
    "raigarh_03": {"city": "raigarh", "keywords": ["chhal", "nawapara"], "name": "Nawapara SECL Colony, Chhal - CECB", "file": "cpcb_raigarh_chhal_2021_2025.csv", "lat": 22.118125, "lon": 83.140608},
    "raigarh_04": {"city": "raigarh", "keywords": ["kunjemura", "kunjemara", "op_jindal_school"], "name": "OP Jindal School, Kunjemura - CECB", "file": "cpcb_raigarh_kunjemura_2021_2025.csv", "lat": 22.12665, "lon": 83.483212}
}

def main():
    if not ZIP_PATH.exists():
        print(f"Error: {ZIP_PATH} does not exist!")
        return

    # 1. Extract ZIP
    print(f"Extracting CPCB ZIP to {TEMP_DIR}...")
    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(TEMP_DIR)

    # Find extracted CSV files
    all_files = []
    for root, dirs, files in os.walk(TEMP_DIR):
        for f in files:
            if f.endswith(".csv"):
                all_files.append(Path(root) / f)

    print(f"Found {len(all_files)} CPCB CSV files in extraction folder.")

    # Group extracted files by their mapped station
    station_files = {sid: [] for sid in STATION_MAP}
    for f in all_files:
        matched = False
        path_str = str(f).lower()
        # Match using the keywords
        for sid, info in STATION_MAP.items():
            if any(kw.lower() in path_str for kw in info["keywords"]):
                station_files[sid].append(f)
                matched = True
                break
                
        if not matched:
            print(f"  [!] Unmatched file in ZIP: {f.relative_to(TEMP_DIR)}")

    # 2. Process and merge each station's CSVs
    print("\nMerging and writing CSV files...")
    processed_count = 0
    for sid, files in station_files.items():
        if not files:
            print(f"  [!] No files found in ZIP for station {sid} ({STATION_MAP[sid]['name']})")
            continue
            
        print(f"  Station {sid} ({len(files)} files):")
        dfs = []
        for f in files:
            try:
                # Read CSV, skip lines starting with # if any
                df = pd.read_csv(f, comment='#')
                # Standardize timestamp
                if "Timestamp" not in df.columns:
                    # check for casing
                    df = df.rename(columns={c: "Timestamp" for c in df.columns if c.lower() == "timestamp"})
                
                if "Timestamp" in df.columns:
                    dfs.append(df)
                else:
                    print(f"    [!] Missing Timestamp column in {f.name}")
            except Exception as e:
                print(f"    [!] Error reading {f.name}: {e}")

        if dfs:
            df_merged = pd.concat(dfs, ignore_index=True)
            # Standardize Timestamp format
            df_merged["Timestamp"] = pd.to_datetime(df_merged["Timestamp"])
            # Drop duplicate Timestamps, keeping first
            df_merged = df_merged.drop_duplicates(subset=["Timestamp"])
            # Sort chronologically
            df_merged = df_merged.sort_values("Timestamp")
            
            # Format timestamp as YYYY-MM-DD HH:MM:SS
            df_merged["Timestamp"] = df_merged["Timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

            # Write to city folder
            city = STATION_MAP[sid]["city"]
            dest_dir = CPCB_DIR / city
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / STATION_MAP[sid]["file"]
            
            df_merged.to_csv(dest_file, index=False)
            print(f"    Saved {len(df_merged)} rows to {dest_file.relative_to(BASE_DIR)}")
            processed_count += 1

    # 3. Delete deprecated 2021-2024 files
    print("\nCleaning up deprecated 2021-2024 CPCB files...")
    for sid, info in STATION_MAP.items():
        city = info["city"]
        deprecated_pattern = f"cpcb_{city}_*_2021_2024.csv"
        city_dir = CPCB_DIR / city
        if city_dir.exists():
            for f in city_dir.glob(deprecated_pattern):
                print(f"  Deleting: {f.relative_to(BASE_DIR)}")
                f.unlink()

    # 4. Configure Raigarh in config/cities.yaml
    print("\nUpdating config/cities.yaml...")
    with open(CITIES_YAML, "r") as f:
        config = yaml.safe_load(f)

    # Check if raigarh already exists in cities
    cities_list = config.get("cities", [])
    raigarh_exists = any(c.get("id") == "raigarh" for c in cities_list)
    
    if not raigarh_exists:
        raigarh_city = {
            "id": "raigarh",
            "name": "Raigarh",
            "role": "validation_optional",
            "lat": 22.1255,
            "lon": 83.3704,
            "bbox": [83.0, 21.9, 83.7, 22.35],
            "has_stations": True,
            "notes": "Raigarh industrial belt. OP Jindal steel & power complexes. Heavily monitored CECB/Jindal stations."
        }
        cities_list.append(raigarh_city)
        config["cities"] = cities_list
        # Update default end_date to include 2025
        config["defaults"]["end_date"] = "2025-12-31"
        
        with open(CITIES_YAML, "w") as f:
            yaml.safe_dump(config, f, sort_keys=False)
        print("  Added Raigarh to cities list, and updated end_date default to 2025-12-31.")
    else:
        print("  Raigarh already exists in config/cities.yaml.")

    # 5. Update config/stations.csv
    print("\nUpdating config/stations.csv...")
    stations_data = [
        "station_id,station_name,city_id,latitude,longitude,source_file"
    ]
    for sid, info in STATION_MAP.items():
        # Get coordinates
        lat = info.get("lat")
        lon = info.get("lon")
        
        # If coordinates aren't in station map (for existing stations), find them in existing stations.csv
        if lat is None:
            # Look up from original stations.csv if it exists
            if STATIONS_CSV.exists():
                df_orig = pd.read_csv(STATIONS_CSV)
                match_row = df_orig[df_orig["station_id"] == sid]
                if not match_row.empty:
                    lat = match_row.iloc[0]["latitude"]
                    lon = match_row.iloc[0]["longitude"]
        
        if lat is not None and lon is not None:
            stations_data.append(f'{sid},"{info["name"]}",{info["city"]},{lat},{lon},{info["file"]}')
        else:
            print(f"  [!] Missing coordinates for station {sid} ({info['name']}), skipping from stations.csv")

    with open(STATIONS_CSV, "w", encoding="utf-8") as f:
        f.write("\n".join(stations_data) + "\n")
    print(f"  Successfully wrote {len(stations_data)-1} stations to config/stations.csv.")

    # Clean up temp directory
    shutil.rmtree(TEMP_DIR)
    print("\nCleaned up temporary directories.")

if __name__ == "__main__":
    main()
