"""
STEP 99 — Verify what's collected. THE STOP RULE.

RUN:  python scripts/99_verify.py

This is your gate. When Korba + Jagdalpur go GREEN -> STOP COLLECTING, START BUILDING.
Everything after that is polish, and polish doesn't score if the demo isn't finished.
"""
import csv

from common import DATA, ROOT, get_cities

G, Y, R, X = "\033[92m", "\033[93m", "\033[91m", "\033[0m"


def has_files(d, pattern="*"):
    return d.exists() and any(d.glob(pattern))


def count_files(d, pattern="*"):
    return len(list(d.glob(pattern))) if d.exists() else 0


def mark(ok_):
    return f"{G}OK{X}" if ok_ else f"{R}MISSING{X}"


def check_stations():
    p = ROOT / "config" / "stations.csv"
    if not p.exists():
        return {}, False
    by_city, bad = {}, 0
    with open(p) as f:
        for row in csv.DictReader(l for l in f if not l.strip().startswith("#")):
            cid = (row.get("city_id") or "").strip()
            if not cid:
                continue
            try:
                float(row["latitude"]); float(row["longitude"])
                by_city[cid] = by_city.get(cid, 0) + 1
            except (ValueError, KeyError, TypeError):
                bad += 1
    return by_city, bad == 0


def main():
    print("\n" + "=" * 62)
    print("  AIRSIGHT — DATA READINESS")
    print("=" * 62)

    stations, st_clean = check_stations()

    # ---- global (one download covers all cities) ----
    print("\nSTATE-WIDE / GLOBAL")
    g = {
        "EDGAR inventory  (attribution ground truth)": has_files(DATA / "inventory" / "edgar", "**/*.*"),
        "FIRMS fire CSV   (industrial + crop burning)": has_files(DATA / "fire", "*.csv"),
        "WorldPop raster  (Business Impact layer)":     has_files(DATA / "static" / "population", "*.tif"),
        "GPPD power plants(Enforcement registry)":      has_files(DATA / "sources", "*.csv"),
    }
    for k, v in g.items():
        print(f"  {k:48s} {mark(v)}")

    print(f"\n  {'config/stations.csv (THE #1 BLOCKER)':48s} "
          f"{mark(bool(stations) and st_clean)}")
    if stations:
        for c, n in stations.items():
            print(f"      {c}: {n} stations with lat/lon")
    else:
        print(f"      {R}-> nothing joins to the H3 grid without this. Do it first.{X}")

    # ---- per city ----
    ready = {}
    for city in get_cities(include_optional=True):
        cid, role = city["id"], city["role"]
        if role == "validation_optional":
            continue
        print(f"\n{city['name'].upper()}  [{role}]"
              + ("   <-- NO CPCB EXPECTED" if not city["has_stations"] else ""))

        checks = {
            "CPCB hourly":        (has_files(DATA / "cpcb" / cid, "*.csv"), city["has_stations"]),
            "Open-Meteo archive": ((DATA / "met" / cid / "archive.csv").exists(), True),
            "Open-Meteo forecast":((DATA / "met" / cid / "forecast.csv").exists(), True),
            "CAMS (baseline #2)": ((DATA / "met" / cid / "cams_forecast.csv").exists(), True),
            "Satellite AOD":      (has_files(DATA / "satellite" / "aod" / cid, "*.csv"), True),
            "Satellite NO2":      (has_files(DATA / "satellite" / "no2" / cid, "*.csv"), False),
            "Satellite SO2":      (has_files(DATA / "satellite" / "so2" / cid, "*.csv"), False),
            "Land use":           (has_files(DATA / "landuse" / cid, "*.csv"), False),
            "OSM roads":          (has_files(DATA / "osm" / "roads" / cid, "*"), True),
            "OSM POIs":           (count_files(DATA / "osm" / "pois" / cid, "*.geojson") >= 2, True),
            "Boundary":           ((DATA / "boundaries" / f"{cid}.geojson").exists(), False),
        }
        must_ok = True
        for label, (present, required) in checks.items():
            if label == "CPCB hourly" and not city["has_stations"]:
                print(f"  {label:22s} {Y}N/A — zero-station city (this is the point){X}")
                continue
            tag = mark(present) if required else (f"{G}OK{X}" if present else f"{Y}optional{X}")
            print(f"  {label:22s} {tag}")
            if required and not present:
                must_ok = False
        ready[cid] = must_ok

    # ---- verdict ----
    print("\n" + "=" * 62)
    hero = ready.get("korba", False)
    reveal = ready.get("jagdalpur", False)
    blocker = bool(stations) and st_clean

    if hero and reveal and blocker:
        print(f"  {G}>>> STOP COLLECTING. START BUILDING. <<<{X}")
        print("  Korba + Jagdalpur are green. That is enough to win.")
        print("  Raipur if time. Bhilai/Bilaspur ONLY if Day 5 is green.")
    else:
        print(f"  {Y}NOT READY YET{X}")
        if not blocker:
            print(f"    {R}1. config/stations.csv  <- do this FIRST, everything blocks on it{X}")
        if not hero:
            print("    2. Korba (hero city) incomplete — finish this before any other city")
        if not reveal:
            print("    3. Jagdalpur incomplete — no CPCB needed, but met+satellite are")
        print("\n  Reminder: collection ends in 48h. Korba first, completely, then loop.")
    print("=" * 62 + "\n")


if __name__ == "__main__":
    main()
