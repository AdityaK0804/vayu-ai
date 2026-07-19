"""Generate station H3 map for Korba at resolution 7 and 8.

Writes to outputs/reports/korba_h3_station_map.csv.
"""

from __future__ import annotations

from pathlib import Path
import pandas as pd

from airsight.config import OUTPUTS
from airsight.io.stations import load_stations
from airsight.grid.h3_utils import station_to_h3


def main() -> None:
    stations = load_stations("korba")
    if stations.empty:
        print("No stations found for Korba. Make sure config/stations.csv is set up.")
        return

    records = []
    for _, row in stations.iterrows():
        sid = row["station_id"]
        lat = row["latitude"]
        lon = row["longitude"]
        
        h3_res7 = station_to_h3(lat, lon, res=7)
        h3_res8 = station_to_h3(lat, lon, res=8)
        
        records.append({
            "station_id": sid,
            "latitude": lat,
            "longitude": lon,
            "h3_res7": h3_res7,
            "h3_res8": h3_res8
        })

    df = pd.DataFrame(records)
    
    out_dir = OUTPUTS / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "korba_h3_station_map.csv"
    
    df.to_csv(out_path, index=False)
    print(f"Station H3 map successfully written to: {out_path}")
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
