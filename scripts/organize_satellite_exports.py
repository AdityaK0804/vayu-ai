import zipfile
from pathlib import Path
import re
import shutil

BASE_DIR = Path(__file__).resolve().parent.parent
ZIP_PATH = BASE_DIR / "data" / "satellite" / "AirSight_exports-20260719T101421Z-1-001.zip"
TEMP_EXTRACT_DIR = BASE_DIR / "data" / "satellite" / "temp_extract"

def main():
    if not ZIP_PATH.exists():
        print(f"Error: ZIP file not found at {ZIP_PATH}")
        return

    # 1. Clean and create extraction directory
    if TEMP_EXTRACT_DIR.exists():
        shutil.rmtree(TEMP_EXTRACT_DIR)
    TEMP_EXTRACT_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Extract ZIP
    print("Extracting GEE exports ZIP...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(TEMP_EXTRACT_DIR)
    print("Extraction complete.")

    # 3. Process and organize files
    # Match pattern: airsight_<channel>_<city>_<mode>_<year>.csv
    # e.g., airsight_aod_bilaspur_stations_2024.csv
    # e.g., airsight_landuse_korba_2021.csv
    pattern = re.compile(r"airsight_([a-zA-Z0-9]+)_([a-zA-Z0-9]+)_(stations|grid7|grid|landuse)?_?(\d{4})\.csv")

    extracted_files = list(TEMP_EXTRACT_DIR.glob("**/*.csv"))
    print(f"\nProcessing {len(extracted_files)} files...")

    moved_count = 0
    for f in extracted_files:
        name = f.name
        match = pattern.match(name)
        if not match:
            # Try matching landuse pattern specifically
            # e.g. airsight_landuse_korba_2021.csv
            if "landuse" in name:
                parts = name.replace(".csv", "").split("_")
                # parts: ['airsight', 'landuse', 'city', 'year']
                if len(parts) >= 4:
                    channel = "landuse"
                    city = parts[2]
                    year = parts[3]
                    dest_dir = BASE_DIR / "data" / "landuse" / city
                    dest_file = dest_dir / name
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(f, dest_file)
                    moved_count += 1
                    continue
            print(f"  [!] Filename format not recognized: {name}")
            continue

        channel, city, mode, year = match.groups()
        
        # Determine target folder
        if channel == "landuse":
            dest_dir = BASE_DIR / "data" / "landuse" / city
        else:
            dest_dir = BASE_DIR / "data" / "satellite" / channel / city

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / name
        
        shutil.copy2(f, dest_file)
        moved_count += 1

    print(f"\nSuccessfully organized {moved_count} files into respective directories.")
    
    # 4. Remove temp directory
    shutil.rmtree(TEMP_EXTRACT_DIR)
    print("Cleaned up temporary extraction folder.")

if __name__ == "__main__":
    main()
