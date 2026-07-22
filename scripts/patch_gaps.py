"""TASK A - patch two data gaps found in the pre-build audit.

1. Extract missing city boundaries from data/boundaries/cg_divisions.geojson.
2. Warn (loudly, non-destructively) that data/fire/ is truncated.

Run:  python scripts/patch_gaps.py
"""
from __future__ import annotations

import json

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

from common import DATA, get_cities, ok, say, warn

# City -> the Chhattisgarh revenue division that contains it.
CITY_DIVISION = {"jagdalpur": "Bastar", "bhilai": "Durg"}

# Properties that might carry the division name, in priority order.
NAME_KEYS = ("division", "admin_name", "DIVISION", "NAME_2", "name")

DIVISIONS = DATA / "boundaries" / "cg_divisions.geojson"


def division_name(props: dict) -> str | None:
    for k in NAME_KEYS:
        if k in props and props[k]:
            return str(props[k]).strip()
    return None


def task_a1() -> None:
    print("=" * 78)
    print("TASK A.1 - extract missing city boundaries from cg_divisions.geojson")
    print("=" * 78)

    if not DIVISIONS.exists():
        warn(f"MISSING {DIVISIONS} - cannot extract anything.")
        return

    div = gpd.read_file(DIVISIONS)
    if div.crs is None:
        div = div.set_crs(4326)
        say("source had no CRS; assumed EPSG:4326")
    else:
        div = div.to_crs(4326)
    say(f"loaded {len(div)} divisions from {DIVISIONS.relative_to(DATA.parent)}")

    key = next((k for k in NAME_KEYS if k in div.columns), None)
    if key is None:
        warn(f"no name-like column in {list(div.columns)}")
        return
    say(f"matching on property '{key}': {sorted(div[key].astype(str))}")
    print()

    # include_optional=True so Bhilai (validation_optional) is visible here.
    cities = {c["id"]: c for c in get_cities(include_optional=True)}

    for cid, wanted in CITY_DIVISION.items():
        out = DATA / "boundaries" / f"{cid}.geojson"
        city = cities.get(cid)
        if city is None:
            warn(f"{cid}: not in cities.yaml, skipping")
            continue
        if out.exists():
            say(f"{cid}: {out.name} already exists - leaving it alone")
            continue

        hit = div[div[key].astype(str).str.strip().str.casefold() == wanted.casefold()]
        if hit.empty:
            warn(f"{cid}: no division named '{wanted}' - nothing written")
            continue
        if len(hit) > 1:
            say(f"{cid}: {len(hit)} '{wanted}' features, dissolving into one")
            geom = hit.union_all()
        else:
            geom = hit.geometry.iloc[0]

        # Verify BEFORE writing: the city centre must fall inside the polygon.
        pt = Point(city["lon"], city["lat"])
        inside = bool(geom.contains(pt))

        feat = gpd.GeoDataFrame(
            [{
                "city_id": cid,
                "city_name": city["name"],
                "division": wanted,
                "source": "cg_divisions.geojson",
                "note": "division-level polygon, not a municipal boundary",
            }],
            geometry=[geom],
            crs="EPSG:4326",
        )
        feat.to_file(out, driver="GeoJSON")

        w, s, e, n = geom.bounds
        mark = "INSIDE" if inside else "OUTSIDE  <<< SUSPECT"
        ok(f"{cid}: wrote {out.relative_to(DATA.parent)} from division '{wanted}'")
        say(f"     centre ({city['lat']}, {city['lon']}) -> {mark} polygon")
        say(f"     bounds [W,S,E,N] = [{w:.4f}, {s:.4f}, {e:.4f}, {n:.4f}]")
        if not inside:
            warn(f"{cid}: centroid check FAILED - wrong division mapping?")
        print()

    print("  boundary coverage now:")
    for cid in cities:
        p = DATA / "boundaries" / f"{cid}.geojson"
        print(f"    {cid:<12}{'OK' if p.exists() else 'MISSING'}")


def task_a2() -> None:
    print()
    print("=" * 78)
    print("TASK A.2 - fire data truncation warning")
    print("=" * 78)

    fire = DATA / "fire" / "firms_chhattisgarh.csv"
    lo = hi = None
    rows = 0
    if fire.exists():
        df = pd.read_csv(fire, usecols=["acq_date"], low_memory=False)
        d = pd.to_datetime(df["acq_date"], errors="coerce").dropna()
        rows, lo, hi = len(df), d.min(), d.max()

    end = pd.Timestamp("2024-12-31")
    bar = "!" * 78
    print(bar)
    print("!!  WARNING - data/fire/ IS TRUNCATED. DO NOT USE AS A MODEL FEATURE.")
    print(bar)
    if lo is not None:
        gap_days = max(0, (end - hi).days)
        span = (end - pd.Timestamp("2021-01-01")).days
        print(f"!!  file      : {fire.relative_to(DATA.parent)}  ({rows:,} rows)")
        print(f"!!  covers    : {lo:%Y-%m-%d} .. {hi:%Y-%m-%d}")
        print("!!  needed    : 2021-01-01 .. 2024-12-31 (config/cities.yaml window)")
        print(f"!!  MISSING   : {hi + pd.Timedelta(days=1):%Y-%m-%d} .. {end:%Y-%m-%d} "
              f"({gap_days} days, ~{gap_days / span:.0%} of the window)")
    else:
        print("!!  file      : NOT FOUND")
    print("!!")
    print("!!  NOTE ON AN EARLIER BAD READING: a first pass reported this file as")
    print("!!  ending 2022-03-30. That was a bug in scripts/audit.py (it row-capped")
    print("!!  reads at 200k rows on an 884k-row file and reported the cap's date).")
    print("!!  audit.py is fixed. The real gap is the TAIL of 2024, not 2.5 years.")
    print("!!")
    print("!!  Why it still must not be a feature: the missing stretch is the END of")
    print("!!  the window - exactly where a chronological test split lands. The model")
    print("!!  would see real fire signal in train and all-zeros in test, which reads")
    print("!!  as 'fires stopped' and silently corrupts the eval, not just the fit.")
    print("!!")
    print("!!  ACTION: re-pull FIRMS for 2024-07-27 .. 2024-12-31, then re-enable.")
    print("!!  UNTIL THEN: 10_harmonize.py emits fire_frp as an all-NaN placeholder.")
    print("!!  The file is NOT deleted - it is kept for the eventual re-pull diff.")
    print(bar)


if __name__ == "__main__":
    task_a1()
    task_a2()
