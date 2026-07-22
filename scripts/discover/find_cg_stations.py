"""Discover live PM2.5 monitoring stations across Chhattisgarh via OpenAQ v3.

Answers: which CG cities actually have a station still reporting, and which of
those are NOT yet in config/cities.yaml (i.e. candidate new cities).

Auth: OPENAQ_KEY (env or .env). This repo's .env already carries the key under
the older name OpenAQ_API_KEY, so that is accepted as a fallback.

Run:  python scripts/discover/find_cg_stations.py
      python scripts/discover/find_cg_stations.py --all-states   # keep neighbours
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

API = "https://api.openaq.org/v3/locations"
# State bbox from cities.yaml. It is a RECTANGLE, so it necessarily overhangs
# into Odisha / MP / Maharashtra / Telangana / Jharkhand - hence the polygon
# test below, which is what actually decides "is this Chhattisgarh".
BBOX = "80.2,17.8,84.4,24.1"
PAGE_LIMIT = 1000
MIN_LAST_YEAR = 2024
OUT = ROOT / "config" / "cg_openaq_stations.csv"


def load_key() -> str | None:
    """os.environ first, then .env. OPENAQ_KEY is the documented name; the other
    spellings are what this repo happens to already have on disk."""
    names = ("OPENAQ_KEY", "OPENAQ_API_KEY", "OpenAQ_API_KEY")
    for n in names:
        if os.environ.get(n):
            say(f"using key from environment: {n}")
            return os.environ[n]
    try:
        from dotenv import dotenv_values
    except ImportError:
        return None
    env = dotenv_values(ROOT / ".env")
    for n in names:
        if env.get(n):
            if n != "OPENAQ_KEY":
                say(f"using .env key '{n}' (OPENAQ_KEY not set - rename it to silence this)")
            else:
                say("using key from .env: OPENAQ_KEY")
            return env[n]
    return None


def fetch_all(key: str) -> list[dict]:
    """Paginate /v3/locations over the bbox."""
    out: list[dict] = []
    page = 1
    while True:
        r = requests.get(
            API,
            params={"bbox": BBOX, "limit": PAGE_LIMIT, "page": page},
            headers={"X-API-Key": key},
            timeout=60,
        )
        if r.status_code == 401:
            print()
            warn("401 UNAUTHORIZED from OpenAQ.")
            warn("Set a valid key:  export OPENAQ_KEY=<your key>")
            warn("  (or put OPENAQ_KEY=... in .env). Get one free at "
                 "https://explore.openaq.org/register")
            sys.exit(1)
        if r.status_code == 429:
            warn("429 rate-limited by OpenAQ - try again in a minute.")
            sys.exit(1)
        r.raise_for_status()
        res = r.json().get("results", [])
        out.extend(res)
        say(f"page {page}: {len(res)} locations (running total {len(out)})")
        if len(res) < PAGE_LIMIT:
            break
        page += 1
    return out


def parse_city(name: str) -> str:
    """OpenAQ/CPCB names read 'Locality, City - AGENCY'. locality is null in the
    API for every Indian station, so the city has to come out of the name."""
    n = re.sub(r"\s*-\s*[^-]+$", "", str(name)).strip()  # drop trailing agency
    if "," in n:
        return n.rsplit(",", 1)[-1].strip()
    return n.strip()


def cg_mask(df: pd.DataFrame) -> pd.Series:
    """True where the point falls inside Chhattisgarh, tested against the real
    division polygons rather than guessed from the agency suffix in the name."""
    shp = DATA / "boundaries" / "cg_divisions.geojson"
    if not shp.exists():
        warn("cg_divisions.geojson missing - cannot verify state; keeping all bbox hits")
        return pd.Series(True, index=df.index)
    import geopandas as gpd
    from shapely.geometry import Point

    cg = gpd.read_file(shp)
    cg = cg.set_crs(4326) if cg.crs is None else cg.to_crs(4326)
    poly = cg.union_all()
    return pd.Series([poly.contains(Point(lo, la)) for la, lo in zip(df.lat, df.lon)],
                     index=df.index)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all-states", action="store_true",
                    help="keep bbox hits outside Chhattisgarh too")
    args = ap.parse_args()

    print("=" * 84)
    print("OPENAQ v3 - live PM2.5 station discovery over the Chhattisgarh bbox")
    print("=" * 84)

    key = load_key()
    if not key:
        warn("No API key found.")
        warn("Set it:  export OPENAQ_KEY=<your key>   (or add OPENAQ_KEY=... to .env)")
        warn("Free key: https://explore.openaq.org/register")
        sys.exit(1)

    raw = fetch_all(key)
    if not raw:
        warn("OpenAQ returned ZERO locations for this bbox. Nothing written.")
        return
    ok(f"{len(raw)} locations in bbox {BBOX}")

    rows = []
    for x in raw:
        params = sorted({s.get("parameter", {}).get("name") for s in x.get("sensors", [])} - {None})
        c = x.get("coordinates") or {}
        first = (x.get("datetimeFirst") or {}).get("utc")
        last = (x.get("datetimeLast") or {}).get("utc")
        rows.append({
            "openaq_id": x.get("id"),
            "station": x.get("name"),
            "city": x.get("locality") or parse_city(x.get("name", "")),
            "lat": c.get("latitude"),
            "lon": c.get("longitude"),
            "parameters": ",".join(params),
            "has_pm25": "pm25" in params,
            "provider": (x.get("provider") or {}).get("name"),
            "owner": (x.get("owner") or {}).get("name"),
            "first_date": (first or "")[:10],
            "last_date": (last or "")[:10],
        })
    df = pd.DataFrame(rows).dropna(subset=["lat", "lon"])

    # --- filters ---------------------------------------------------------
    n0 = len(df)
    df = df[df.has_pm25]
    n1 = len(df)
    last_year = pd.to_datetime(df.last_date, errors="coerce").dt.year
    df = df[last_year >= MIN_LAST_YEAR]
    n2 = len(df)

    df["in_cg"] = cg_mask(df)
    n_cg = int(df.in_cg.sum())

    print()
    say(f"filter: {n0} in bbox -> {n1} measure pm25 -> {n2} still reporting "
        f"(last_date >= {MIN_LAST_YEAR}) -> {n_cg} inside Chhattisgarh")

    if not args.all_states:
        outside = df[~df.in_cg]
        if len(outside):
            say(f"dropped {len(outside)} live pm25 stations in NEIGHBOURING states "
                f"(bbox overhang): {', '.join(sorted(outside.city.unique()))}")
        df = df[df.in_cg]

    if df.empty:
        warn("No stations survived the filters. Nothing written.")
        return

    df = df.sort_values(["city", "station"]).reset_index(drop=True)

    print()
    print("=" * 108)
    print("LIVE PM2.5 STATIONS - CHHATTISGARH" + ("" if not args.all_states else " + NEIGHBOURS"))
    print("=" * 108)
    print(f"{'city':<16}{'station':<44}{'lat':>10}{'lon':>10}  {'first':<12}{'last':<12}")
    print("-" * 108)
    for city, g in df.groupby("city", sort=True):
        for _, r in g.iterrows():
            print(f"{city:<16}{str(r.station)[:43]:<44}{r.lat:>10.4f}{r.lon:>10.4f}  "
                  f"{r.first_date:<12}{r.last_date:<12}")

    cols = ["openaq_id", "station", "city", "lat", "lon", "parameters",
            "provider", "owner", "first_date", "last_date", "in_cg"]
    df[cols].to_csv(OUT, index=False)
    print()
    ok(f"wrote {OUT.relative_to(ROOT)}  ({len(df)} stations)")

    # --- candidate new cities -------------------------------------------
    known = get_cities(include_optional=True)
    known_names = {c["id"].lower() for c in known} | {c["name"].lower() for c in known}
    cand = (df[~df.city.str.lower().isin(known_names)]
            .groupby("city")
            # NB: not 'last' - that shadows Series.last and attribute access
            # silently returns the method instead of the value.
            .agg(stations=("openaq_id", "count"), latest=("last_date", "max"))
            .sort_values("stations", ascending=False))

    print()
    print("=" * 84)
    print("CANDIDATE NEW CITIES (live pm25, inside CG, not in config/cities.yaml)")
    print("=" * 84)
    if cand.empty:
        say("none - cities.yaml already covers every CG city with a live pm25 station.")
    else:
        print(f"{'city':<22}{'stations':>10}  {'latest data':<12}")
        print("-" * 48)
        for city, r in cand.iterrows():
            print(f"{city:<22}{int(r['stations']):>10}  {r['latest']:<12}")
        print()
        say(f"{len(cand)} candidate cities, {int(cand.stations.sum())} stations total.")
        say("Adding one = ~8 lines in cities.yaml (the scalability story).")

    print()
    print("already in cities.yaml:")
    for c in known:
        n = int((df.city.str.lower() == c["name"].lower()).sum())
        print(f"  {c['name']:<14}{n:>3} live pm25 station(s)"
              + ("   <- zero-station city (expected)" if not c.get("has_stations") else ""))


if __name__ == "__main__":
    main()
