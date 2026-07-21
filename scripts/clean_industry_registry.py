"""Clean industry_registry.geojson so every point carries a name that references
a real, named plant - required for enforcement dossiers to name actual sources.

Rules (original name preserved in 'raw_name'):
  * gppd / named-OSM points  -> kept as-is (these ARE the named anchors)
  * unknown_osm* placeholders -> "Unnamed <industrial|power> site near <plant> (<d> km)"
  * firms_thermal hotspots    -> "Thermal hotspot near <plant> (<d> km)"
  * s5p_so2 hotspots          -> "SO2 hotspot near <plant> (<d> km)"

'plant' is the nearest named anchor (GPPD plant or named OSM facility). Hotspot
points are kept, only relabelled - so nothing is dropped.

Run:  python scripts/clean_industry_registry.py
"""
from __future__ import annotations

import math
import shutil
import sys
from pathlib import Path

import geopandas as gpd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA, ROOT, ok, say  # noqa: E402

REG = DATA / "sources" / "industry_registry.geojson"


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main():
    d = gpd.read_file(REG)
    if "raw_name" not in d.columns:
        d["raw_name"] = d["name"]

    is_placeholder = d["raw_name"].astype(str).str.startswith("unknown")
    named_anchor = ((d.source == "gppd") |
                    (d.source.isin(["osm", "osm_power"]) & ~is_placeholder))
    anchors = d[named_anchor][["name", "latitude", "longitude"]].reset_index(drop=True)
    say(f"{len(anchors)} named anchors (GPPD + named OSM) out of {len(d)} points")

    def nearest_anchor(lat, lon):
        best, bd = None, 1e9
        for _, a in anchors.iterrows():
            dist = haversine_km(lat, lon, a.latitude, a.longitude)
            if dist < bd:
                best, bd = a["name"], dist
        return best, bd

    new_names, relabelled = [], 0
    for _, r in d.iterrows():
        raw = str(r["raw_name"])
        if r.source == "gppd" or (r.source in ("osm", "osm_power") and not raw.startswith("unknown")):
            new_names.append(r["name"])          # already a real name
            continue
        plant, dist = nearest_anchor(r.latitude, r.longitude)
        tag = f"{plant} ({dist:.1f} km)" if plant else f"({r.latitude:.3f},{r.longitude:.3f})"
        if r.source == "firms_thermal":
            nm = f"Thermal hotspot near {tag}"
        elif r.source == "s5p_so2":
            nm = f"SO2 hotspot near {tag}"
        else:  # unknown_osm* placeholder
            kind = "power" if "power" in r.source else "industrial"
            nm = f"Unnamed {kind} site near {tag}"
        new_names.append(nm)
        relabelled += 1

    d["name"] = new_names
    shutil.copy2(REG, REG.with_suffix(".geojson.bak"))
    ok(f"backed up -> {REG.name}.bak")
    d.to_file(REG, driver="GeoJSON")
    ok(f"relabelled {relabelled} points; {len(d) - relabelled} kept as named anchors")

    print("\n  examples after cleaning:")
    for s in ("gppd", "osm_power", "firms_thermal", "s5p_so2"):
        sub = d[d.source == s]
        if len(sub):
            print(f"    [{s}] {sub.iloc[0]['name']}")


if __name__ == "__main__":
    main()
