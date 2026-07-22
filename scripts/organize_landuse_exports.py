import zipfile
from pathlib import Path
import re
import shutil
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
ZIP_PATH = BASE_DIR / "data" / "landuse" / "AirSight_exports-20260719T104654Z-1-001.zip"
TEMP_EXTRACT_DIR = BASE_DIR / "data" / "landuse" / "temp_extract"

def clean_filename(name):
    # Strip any GEE segment suffixes like (1), (2), etc.
    # e.g., airsight_landuse_korba_2024(1).csv -> airsight_landuse_korba_2024.csv
    return re.sub(r"\(\d+\)", "", name)

def main():
    if not ZIP_PATH.exists():
        print(f"Error: ZIP file not found at {ZIP_PATH}")
        return

    # 1. Clean and create extraction directory
    if TEMP_EXTRACT_DIR.exists():
        shutil.rmtree(TEMP_EXTRACT_DIR)
    TEMP_EXTRACT_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Extract ZIP
    print("Extracting new exports ZIP...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(TEMP_EXTRACT_DIR)
    print("Extraction complete.")

    # 3. Scan extracted files
    extracted_files = list(TEMP_EXTRACT_DIR.glob("**/*.csv"))
    print(f"Found {len(extracted_files)} CSV files in ZIP. Organizing...")

    # Group files by their target clean name to combine any split segments
    # Pattern: airsight_<channel>_<city>_<mode>_<year>[suf].csv
    # e.g. airsight_landuse_korba_2024(1).csv -> key: (landuse, korba, None, 2024)
    pattern = re.compile(r"airsight_([a-zA-Z0-9]+)_([a-zA-Z0-9]+)_(stations|grid7|grid)?_?(\d{4})(?:\(\d+\))?\.csv")

    groups = {}
    for f in extracted_files:
        name = f.name
        match = pattern.match(name)
        if not match:
            # Handle landuse split names like airsight_landuse_korba_2024(1).csv
            if "landuse" in name:
                parts = name.replace(".csv", "").split("_")
                if len(parts) >= 4:
                    channel = "landuse"
                    city = parts[2]
                    # strip suffix from year part, e.g. 2024(1) -> 2024
                    year = re.sub(r"\(\d+\)", "", parts[3])
                    key = (channel, city, "landuse", int(year))
                    groups.setdefault(key, []).append(f)
                    continue
            print(f"  [!] Unrecognized filename: {name}")
            continue

        channel, city, mode, year = match.groups()
        # mode might be None
        key = (channel, city, mode, int(year))
        groups.setdefault(key, []).append(f)

    # Combine and save files
    moved_count = 0
    for key, file_paths in groups.items():
        channel, city, mode, year = key
        
        # Target folder and name
        if channel == "landuse":
            dest_dir = BASE_DIR / "data" / "landuse" / city
            target_name = f"airsight_landuse_{city}_{year}.csv"
        else:
            dest_dir = BASE_DIR / "data" / "satellite" / channel / city
            mode_str = f"_{mode}" if mode else ""
            target_name = f"airsight_{channel}_{city}{mode_str}_{year}.csv"

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / target_name

        # If there are multiple parts, concatenate them and drop duplicates
        if len(file_paths) > 1:
            print(f"  Combining {len(file_paths)} split segments for {target_name}...")
            dfs = []
            for fp in file_paths:
                try:
                    dfs.append(pd.read_csv(fp))
                except Exception as e:
                    print(f"    [!] Error reading {fp.name}: {e}")
            
            if dfs:
                df_combined = pd.concat(dfs, ignore_index=True)
                # Drop duplicate rows based on unique index columns
                # For grid / landuse: cell_id (and date if temporal grid data)
                subset = ["cell_id"]
                if "date" in df_combined.columns:
                    subset.append("date")
                
                # Check what unique subset columns are actually in the df
                subset = [c for c in subset if c in df_combined.columns]
                df_combined = df_combined.drop_duplicates(subset=subset)
                df_combined.to_csv(dest_file, index=False)
                moved_count += 1
        else:
            # Just copy the single file
            shutil.copy2(file_paths[0], dest_file)
            moved_count += 1

    print(f"\nSuccessfully processed and organized {moved_count} unique datasets.")

    # 4. Clean up temp folder
    shutil.rmtree(TEMP_EXTRACT_DIR)
    print("Cleaned up temporary extraction folder.")

if __name__ == "__main__":
    main()
