"""CLI pipeline step to print a data readiness table.

Lists which data sources and modeling feature groups are available.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from airsight.config import DATA, CONFIG, load_cities


def get_feature_groups_status(city_id: str) -> dict[str, bool]:
    """Check availability of files for each feature group."""
    met_dir = DATA / "met" / city_id
    sat_dir = DATA / "satellite"
    osm_dir = DATA / "osm"
    cpcb_dir = DATA / "cpcb" / city_id
    edgar_dir = DATA / "inventory" / "edgar"
    fire_dir = DATA / "fire"
    pop_dir = DATA / "static" / "population"
    sources_dir = DATA / "sources"

    has_cpcb = cpcb_dir.exists() and any(cpcb_dir.glob("*.csv"))
    has_met = (met_dir / "archive.csv").exists() and (met_dir / "forecast.csv").exists()
    has_cams = (met_dir / "cams_forecast.csv").exists()
    
    has_sat_aod = any((sat_dir / "aod" / city_id).glob("*.csv")) if (sat_dir / "aod" / city_id).exists() else False
    has_sat_no2 = any((sat_dir / "no2" / city_id).glob("*.csv")) if (sat_dir / "no2" / city_id).exists() else False
    has_sat_so2 = any((sat_dir / "so2" / city_id).glob("*.csv")) if (sat_dir / "so2" / city_id).exists() else False
    has_sat = has_sat_aod or has_sat_no2 or has_sat_so2

    has_edgar = edgar_dir.exists() and any(edgar_dir.glob("**/*.*"))
    has_fire = fire_dir.exists() and any(fire_dir.glob("*.csv"))
    has_pop = pop_dir.exists() and any(pop_dir.glob("*.tif"))
    has_gppd = sources_dir.exists() and any(sources_dir.glob("*.csv"))

    has_osm_roads = any((osm_dir / "roads" / city_id).glob("*")) if (osm_dir / "roads" / city_id).exists() else False
    has_osm_pois = (
        (osm_dir / "pois" / city_id).exists() 
        and len(list((osm_dir / "pois" / city_id).glob("*.geojson"))) >= 2
    )
    has_osm = has_osm_roads or has_osm_pois

    return {
        "Base CPCB Targets (CPCB hourly)": has_cpcb,
        "Meteorology Features (Open-Meteo)": has_met,
        "CAMS Baseline Comparison (CAMS)": has_cams,
        "Satellite Predictors (AOD/NO2/SO2)": has_sat,
        "Emissions Inventory (EDGAR PM2.5)": has_edgar,
        "Active Burning (FIRMS FRP)": has_fire,
        "Vulnerability & Population (WorldPop)": has_pop,
        "Point Sources (GPPD Power Plants)": has_gppd,
        "OSM Built Environment (Roads/POIs)": has_osm,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print data readiness and feature groups availability."
    )
    parser.add_argument(
        "--city",
        type=str,
        required=True,
        help="City ID (e.g. korba, jagdalpur).",
    )
    args = parser.parse_args()

    city_id = args.city.lower()
    cities = load_cities(include_optional=True)
    city_map = {c["id"]: c for c in cities}
    
    if city_id not in city_map:
        print(f"Error: Unknown city '{city_id}'")
        return

    city = city_map[city_id]
    
    print("\n" + "=" * 62)
    print(f"  AIRSIGHT DATA READINESS & MODELING FEATURE GROUPS: {city['name'].upper()}")
    print("=" * 62)

    status = get_feature_groups_status(city_id)
    
    print(f"\n  {'Feature Group':40s} {'Status':15s}")
    print(f"  {'-'*40} {'-'*15}")
    
    for group, ready in status.items():
        # Handle exceptions: e.g. Jagdalpur doesn't expect CPCB targets
        if group == "Base CPCB Targets (CPCB hourly)" and not city["has_stations"]:
            print(f"  {group:40s} [N/A (No Stations)]")
            continue
            
        status_str = "READY" if ready else "MISSING"
        # Color coding: Green for READY, Red/Yellow for MISSING depending on criticality
        # We'll use simple brackets for portability across terminals
        print(f"  {group:40s} [{status_str}]")

    print("\n" + "=" * 62 + "\n")


if __name__ == "__main__":
    main()
