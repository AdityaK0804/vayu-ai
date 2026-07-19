"""
STEP 3 — Source registry: power plants (GPPD) + active fire (FIRMS).

WHY:
  GPPD  -> geolocates NTPC Korba + the Korba coal complex. The Enforcement agent
           needs actual points on a map to say "inspect THIS one".
  FIRMS -> crop burning AND the thermal signature of Korba's power plants /
           Bhilai's steel works. Powers: "that spike wasn't traffic, it was the
           industrial cluster 4km upwind."

RUN:   python scripts/03_fetch_sources.py
       python scripts/03_fetch_sources.py --firms-key YOUR_MAP_KEY   # optional
NEEDS: nothing for GPPD. FIRMS: either a free MAP_KEY (2 min signup) OR do the
       manual CSV download (see MANUAL_DOWNLOADS.md) - manual is fine.

HONEST CAVEAT (say this if asked):
  WRI stopped maintaining GPPD in early 2022 (last release v1.3.0). Fine as a
  static registry - power plants do not move - but don't claim it's live.
"""
import argparse
import io

import pandas as pd
import requests

from common import DATA, get_cities, get_state, ensure, ok, say, warn

GPPD_CSV = ("https://raw.githubusercontent.com/wri/global-power-plant-database/"
            "master/output_database/global_power_plant_database.csv")


def fetch_gppd():
    print("\n--- Global Power Plant Database ---")
    out = ensure(DATA / "sources")
    try:
        r = requests.get(GPPD_CSV, timeout=180)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text), low_memory=False)
    except Exception as e:
        warn(f"GPPD download failed: {e}")
        warn("Manual fallback: https://github.com/wri/global-power-plant-database "
             "-> output_database/global_power_plant_database.csv")
        return

    ind = df[df["country"] == "IND"].copy()
    ind.to_csv(out / "gppd_india.csv", index=False)
    ok(f"gppd_india.csv  ({len(ind)} plants)")

    # Clip to each city bbox -> the registry the Attribution agent reasons over.
    rows = []
    for c in get_cities(include_optional=True):
        W, S, E, N = c["bbox"]
        sel = ind[(ind.longitude.between(W, E)) & (ind.latitude.between(S, N))].copy()
        sel["city_id"] = c["id"]
        rows.append(sel)
        say(f"{c['id']}: {len(sel)} plants")
        if len(sel):
            top = sel.nlargest(min(3, len(sel)), "capacity_mw")[["name", "capacity_mw", "primary_fuel"]]
            for _, t in top.iterrows():
                say(f"    - {t['name']} | {t['capacity_mw']} MW | {t['primary_fuel']}")

    if rows:
        allc = pd.concat(rows, ignore_index=True)
        keep = [c for c in ["city_id", "name", "capacity_mw", "primary_fuel",
                            "latitude", "longitude", "owner", "commissioning_year"]
                if c in allc.columns]
        allc[keep].to_csv(out / "power_plants_by_city.csv", index=False)
        ok(f"power_plants_by_city.csv  ({len(allc)} rows)  <-- Enforcement agent reads this")


def fetch_firms(map_key):
    print("\n--- NASA FIRMS active fire ---")
    out = ensure(DATA / "fire")
    if not map_key:
        warn("no --firms-key given.")
        warn("EASIEST PATH (5 min, no code): download the CSV manually ->")
        warn("  https://firms.modaps.eosdis.nasa.gov/download/")
        warn("  VIIRS S-NPP/NOAA-20 | area=Chhattisgarh | 2021-2024 | CSV")
        warn(f"  save to: {out / 'firms_chhattisgarh.csv'}")
        return

    W, S, E, N = get_state()["bbox"]
    area = f"{W},{S},{E},{N}"
    # NOTE: the free area API serves a rolling recent window (up to ~10 days),
    # NOT 4 years of history. For the 2021-2024 archive you MUST use the manual
    # download page. This call is for LIVE demo data only.
    url = (f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/"
           f"{map_key}/VIIRS_SNPP_NRT/{area}/7")
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text))
        df.to_csv(out / "firms_recent_7d.csv", index=False)
        ok(f"firms_recent_7d.csv  ({len(df)} detections)  [LIVE demo layer]")
        warn("This is only the last 7 days. Historical 2021-2024 = manual download.")
    except Exception as e:
        warn(f"FIRMS API failed: {e} -> use the manual download instead")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--firms-key", default=None,
                    help="free MAP_KEY from firms.modaps.eosdis.nasa.gov (optional)")
    args = ap.parse_args()

    print("\n=== STEP 3: source registry ===")
    fetch_gppd()
    fetch_firms(args.firms_key)
    print("\n=== DONE. Next: python scripts/04_gee_export.py ===\n")


if __name__ == "__main__":
    main()
