"""
STEP 0 — Create the /data folder tree + stations.csv template.

RUN:  python scripts/00_setup.py
NEEDS: nothing. Run this first.
"""
from common import DATA, ROOT, get_cities, ensure, ok, say

STATIONS_HEADER = "station_id,station_name,city_id,latitude,longitude,source_file\n"
STATIONS_EXAMPLE = (
    "# DELETE THESE EXAMPLE ROWS once you fill in real ones.\n"
    "# Find lat/lon on the CPCB portal station page, or search the station name on Google Maps.\n"
    "# korba_01,Korba (CECB) - Korba,korba,22.3595,82.7501,korba_cecb_2021_2024.csv\n"
)


def main():
    print("\n=== STEP 0: scaffold ===\n")

    cities = get_cities(include_optional=True)

    # Folder tree (mirrors Dataset_Collection_Guide.md)
    ensure(DATA / "inventory" / "edgar")
    ensure(DATA / "fire")
    ensure(DATA / "sources")
    ensure(DATA / "traffic")
    ensure(DATA / "static" / "population")
    ensure(DATA / "boundaries")

    for c in cities:
        cid = c["id"]
        ensure(DATA / "cpcb" / cid)
        ensure(DATA / "met" / cid)
        ensure(DATA / "landuse" / cid)
        ensure(DATA / "osm" / "roads" / cid)
        ensure(DATA / "osm" / "pois" / cid)
        for ch in ("aod", "no2", "so2"):
            ensure(DATA / "satellite" / ch / cid)
        say(f"folders ready: {cid}")

    ok(f"folder tree created under {DATA}")

    # stations.csv — THE #1 BLOCKER
    st = ROOT / "config" / "stations.csv"
    if not st.exists():
        st.write_text(STATIONS_HEADER + STATIONS_EXAMPLE)
        ok(f"created template: {st}")
    else:
        say(f"stations.csv already exists, leaving it alone: {st}")

    print("""
=== NEXT ===
  1. FILL IN config/stations.csv  <-- BLOCKING. Nothing joins to the grid without lat/lon.
  2. Drop your CPCB hourly CSVs into data/cpcb/<city_id>/
  3. Run: python scripts/01_fetch_openmeteo.py     (no signup needed - start here)
  4. Sign up for Google Earth Engine NOW (approval lags): https://earthengine.google.com/
""")


if __name__ == "__main__":
    main()
