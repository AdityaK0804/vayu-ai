import pandas as pd
from pathlib import Path
import h3

BASE_DIR = Path(__file__).resolve().parent.parent
SO2_DIR = BASE_DIR / "data" / "satellite" / "so2"
OUTPUT_FILE = BASE_DIR / "data" / "sources" / "s5p_so2_hotspots.csv"

def get_lat_lon(cell_id):
    try:
        return h3.cell_to_latlng(cell_id)
    except AttributeError:
        return h3.h3_to_geo(cell_id)

def main():
    grid_files = list(SO2_DIR.glob("**/airsight_so2_*_grid7_*.csv"))
    if not grid_files:
        print("No SO2 grid7 files found!")
        return

    print(f"Found {len(grid_files)} SO2 grid7 files. Processing...")
    
    dfs = []
    for f in grid_files:
        city = f.parent.name
        year = int(f.name.replace(".csv", "").split("_")[-1])
        
        df = pd.read_csv(f)
        # Group by cell_id to get the annual average SO2 concentration per cell
        cell_means = df.groupby("cell_id")["mean"].mean().reset_index()
        cell_means["city_id"] = city
        cell_means["year"] = year
        dfs.append(cell_means)

    df_all = pd.concat(dfs, ignore_index=True)
    df_all = df_all.rename(columns={"mean": "so2_mean"})

    # Filter for the top 5% (95th percentile) of cell mean values per city and year
    hotspots = []
    for (city, year), group in df_all.groupby(["city_id", "year"]):
        threshold = group["so2_mean"].quantile(0.95)
        # Filter for cells above the 95th percentile
        city_hotspots = group[group["so2_mean"] >= threshold].copy()
        hotspots.append(city_hotspots)
        print(f"  {city} ({year}): threshold={threshold:.6f}, kept {len(city_hotspots)} cells")

    df_hotspots = pd.concat(hotspots, ignore_index=True)

    # Convert cell_id to latitude and longitude
    print("Converting H3 cell IDs to lat/lon coordinates...")
    coords = df_hotspots["cell_id"].apply(lambda cid: pd.Series(get_lat_lon(cid)))
    df_hotspots["lat"] = coords[0]
    df_hotspots["lon"] = coords[1]

    # Reorder columns
    df_hotspots = df_hotspots[["city_id", "cell_id", "lat", "lon", "so2_mean", "year"]]

    # Save to CSV
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df_hotspots.to_csv(OUTPUT_FILE, index=False)
    print(f"Successfully saved {len(df_hotspots)} SO2 hotspots to {OUTPUT_FILE.relative_to(BASE_DIR)}")

if __name__ == "__main__":
    main()
