"""
STEP 5 — TomTom live traffic sampling.

*** RUN THIS TODAY. IT NEEDS WALL-CLOCK TIME. YOU CANNOT BACKFILL IT ON DAY 6. ***

WHY:
  The PS explicitly demands "mobility feeds" / "traffic prediction".
  But FREE HISTORICAL TRAFFIC DOES NOT EXIST - TomTom's historical Traffic Stats
  is trial/sales-only, Google and HERE charge. So we do this instead:

    traffic_index(cell, hour, dow) = road_density(cell) x congestion_curve(hour, dow)

  where congestion_curve is CALIBRATED from real live sampling on real Korba roads.
  That's why this must start now: the curve needs a few days of samples.

  SAY THIS TO THE JURY (honesty wins here, faking it loses):
    "Historical probe data is commercial. We calibrate a diurnal traffic model
     from live probe sampling, and the platform ingests municipal ANPR/probe
     feeds directly wherever a city provides them."

SETUP:
  1. https://developer.tomtom.com/ -> free key, NO credit card
  2. export TOMTOM_KEY=your_key
  Free tier ~2,500 non-tile requests/day.
  WARNING: TomTom pricing is being revised effective July 2026 - verify before demo day.

RUN (leave it running in a terminal / cron it):
  export TOMTOM_KEY=xxx
  python scripts/05_tomtom_sample.py --cities korba --once        # test one sample
  python scripts/05_tomtom_sample.py --cities korba --loop 30      # sample every 30 min

OUTPUT: data/traffic/<city>_flow_samples.csv  (appends forever)
"""
import argparse
import csv
import os
import random
import time
from datetime import datetime, timezone

import requests

from common import DATA, get_cities, ensure, ok, say, warn

FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"


def sample_points(city, n=12):
    """Spread sample points across the city bbox. Deterministic per city so
    every run hits the SAME points -> a real time series, not noise."""
    W, S, E, N = city["bbox"]
    rnd = random.Random(city["id"])
    pts = [(city["lat"], city["lon"])]  # always include the centre
    for _ in range(n - 1):
        pts.append((rnd.uniform(S + 0.05, N - 0.05), rnd.uniform(W + 0.05, E - 0.05)))
    return pts


def fetch_one(key, lat, lon):
    r = requests.get(FLOW_URL, params={"key": key, "point": f"{lat},{lon}", "unit": "KMPH"},
                     timeout=30)
    if r.status_code == 403:
        raise PermissionError("403 - bad/expired TomTom key, or free tier changed")
    if r.status_code == 429:
        raise RuntimeError("429 - daily free quota exhausted, back off")
    r.raise_for_status()
    d = r.json().get("flowSegmentData", {})
    cur, free = d.get("currentSpeed"), d.get("freeFlowSpeed")
    congestion = None
    if cur is not None and free:
        congestion = round(max(0.0, 1 - (cur / free)), 4)   # 0 = clear, 1 = gridlock
    return {
        "current_speed": cur,
        "free_flow_speed": free,
        "current_travel_time": d.get("currentTravelTime"),
        "free_flow_travel_time": d.get("freeFlowTravelTime"),
        "confidence": d.get("confidence"),
        "road_class": d.get("frc"),
        "congestion_ratio": congestion,
    }


def run_once(key, cities):
    ensure(DATA / "traffic")
    now = datetime.now(timezone.utc).astimezone()
    total = 0
    for city in cities:
        path = DATA / "traffic" / f"{city['id']}_flow_samples.csv"
        new = not path.exists()
        with open(path, "a", newline="") as f:
            cols = ["timestamp_local", "hour", "dow", "city_id", "point_idx", "lat", "lon",
                    "current_speed", "free_flow_speed", "current_travel_time",
                    "free_flow_travel_time", "confidence", "road_class", "congestion_ratio"]
            w = csv.DictWriter(f, fieldnames=cols)
            if new:
                w.writeheader()
            for i, (lat, lon) in enumerate(sample_points(city)):
                try:
                    row = fetch_one(key, lat, lon)
                except PermissionError as e:
                    warn(str(e)); return total
                except Exception as e:
                    warn(f"{city['id']} pt{i}: {e}")
                    continue
                row.update({
                    "timestamp_local": now.isoformat(timespec="seconds"),
                    "hour": now.hour, "dow": now.weekday(),
                    "city_id": city["id"], "point_idx": i,
                    "lat": round(lat, 5), "lon": round(lon, 5),
                })
                w.writerow(row)
                total += 1
                time.sleep(0.3)
        say(f"{city['id']}: appended -> {path.name}")
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", nargs="*", default=["korba"])
    ap.add_argument("--once", action="store_true", help="single sample then exit")
    ap.add_argument("--loop", type=int, default=0, help="sample every N minutes, forever")
    args = ap.parse_args()

    key = os.environ.get("TOMTOM_KEY")
    if not key:
        warn("export TOMTOM_KEY=your_key   (free, no card: https://developer.tomtom.com/)")
        return

    cities = get_cities(only=args.cities)
    print("\n=== STEP 5: TomTom live traffic ===\n")

    if args.once or not args.loop:
        n = run_once(key, cities)
        ok(f"{n} samples written")
        print("\n  Now leave the loop running:  python scripts/05_tomtom_sample.py --loop 30\n")
        return

    say(f"sampling every {args.loop} min. Ctrl-C to stop. LEAVE THIS RUNNING.")
    try:
        while True:
            n = run_once(key, cities)
            ok(f"{datetime.now():%H:%M} - {n} samples")
            time.sleep(args.loop * 60)
    except KeyboardInterrupt:
        print("\n  stopped.\n")


if __name__ == "__main__":
    main()
