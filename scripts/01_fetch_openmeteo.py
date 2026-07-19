"""
STEP 1 — Open-Meteo: historical met + forecast met + CAMS air quality.

WHY THIS IS THE MOST IMPORTANT SCRIPT:
  ERA5 is *reanalysis* = the past. You CANNOT build a 24-72h forecast from it.
  Open-Meteo gives real FORECASTS, free, NO API KEY, globally.
  It also serves CAMS air-quality forecasts -> your SECOND baseline to beat.
  Beating CAMS (a real operational forecast model) >>> beating persistence.

RUN:   python scripts/01_fetch_openmeteo.py
       python scripts/01_fetch_openmeteo.py --cities korba        # just the hero
NEEDS: nothing. No signup, no key. Free tier ~10k calls/day.

OUTPUT: data/met/<city>/archive.csv, forecast.csv, cams.csv (+ raw .json)
"""
import argparse
import json
import time

import pandas as pd
import requests

from common import DATA, get_cities, ensure, ok, say, warn

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
AIRQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# boundary_layer_height = the winter-smog "lid" variable. It powers your
# thermal-inversion feature. If the endpoint rejects it we retry without it,
# so a variable-name change can never block you.
MET_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "surface_pressure",
    "precipitation",
    "boundary_layer_height",
]

AIRQ_VARS = [
    "pm2_5", "pm10", "nitrogen_dioxide", "ozone",
    "sulphur_dioxide", "carbon_monoxide", "dust",
]


def _get(url, params, tries=3):
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=90)
            if r.status_code == 400:
                return r  # let caller inspect (likely bad variable name)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if i == tries - 1:
                raise
            warn(f"retry {i+1}/{tries} after error: {e}")
            time.sleep(3 * (i + 1))


def _to_frame(payload, city_id):
    """Open-Meteo returns column-oriented hourly dict -> tidy DataFrame."""
    hourly = payload.get("hourly")
    if not hourly:
        return pd.DataFrame()
    df = pd.DataFrame(hourly)
    df = df.rename(columns={"time": "timestamp"})
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.insert(0, "city_id", city_id)
    return df


def fetch_met_archive(city):
    """Historical hourly met, chunked by year (server-friendly)."""
    frames, blh_ok = [], True
    first_year = int(city["start_date"][:4])
    last_year = int(city["end_date"][:4])
    for year in range(first_year, last_year + 1):
        start = max(f"{year}-01-01", city["start_date"])
        end = min(f"{year}-12-31", city["end_date"])
        params = {
            "latitude": city["lat"], "longitude": city["lon"],
            "start_date": start, "end_date": end,
            "hourly": ",".join(MET_VARS if blh_ok else [v for v in MET_VARS if v != "boundary_layer_height"]),
            "timezone": city["timezone"],
        }
        r = _get(ARCHIVE_URL, params)
        if r.status_code == 400 and blh_ok:
            warn("archive rejected boundary_layer_height -> retrying without it "
                 "(use ERA5 for BLH if you need it, or check open-meteo docs)")
            blh_ok = False
            params["hourly"] = ",".join(v for v in MET_VARS if v != "boundary_layer_height")
            r = _get(ARCHIVE_URL, params)
        r.raise_for_status()
        frames.append(_to_frame(r.json(), city["id"]))
        say(f"archive {year} ok")
        time.sleep(1)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(), blh_ok


def fetch_met_forecast(city):
    params = {
        "latitude": city["lat"], "longitude": city["lon"],
        "hourly": ",".join(MET_VARS),
        "forecast_days": 3,          # 72h = the PS horizon
        "past_days": 2,
        "timezone": city["timezone"],
    }
    r = _get(FORECAST_URL, params)
    if r.status_code == 400:
        params["hourly"] = ",".join(v for v in MET_VARS if v != "boundary_layer_height")
        r = _get(FORECAST_URL, params)
    r.raise_for_status()
    return r.json()


def fetch_cams(city, historical=False):
    params = {
        "latitude": city["lat"], "longitude": city["lon"],
        "hourly": ",".join(AIRQ_VARS),
        "timezone": city["timezone"],
    }
    if historical:
        params.update({"start_date": city["start_date"], "end_date": city["end_date"]})
    else:
        params.update({"forecast_days": 3, "past_days": 2})
    r = _get(AIRQ_URL, params)
    r.raise_for_status()
    return r.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cities", nargs="*", default=None,
                    help="city ids, e.g. --cities korba jagdalpur")
    ap.add_argument("--skip-cams-history", action="store_true",
                    help="CAMS history can be slow/limited; skip if it stalls")
    args = ap.parse_args()

    print("\n=== STEP 1: Open-Meteo (no signup needed) ===\n")

    for city in get_cities(only=args.cities):
        cid = city["id"]
        out = ensure(DATA / "met" / cid)
        print(f"\n--- {city['name']} ({cid}) ---")

        # 1. historical met -> training features
        df, blh_ok = fetch_met_archive(city)
        if not df.empty:
            df.to_csv(out / "archive.csv", index=False)
            ok(f"archive.csv  rows={len(df)}  cols={len(df.columns)}"
               f"{'' if blh_ok else '  (NO boundary_layer_height)'}")

        # 2. forecast met -> inference + demo
        fc = fetch_met_forecast(city)
        (out / "forecast.json").write_text(json.dumps(fc))
        _to_frame(fc, cid).to_csv(out / "forecast.csv", index=False)
        ok("forecast.csv (72h ahead)")

        # 3. CAMS air quality -> YOUR BASELINE TO BEAT
        cams = fetch_cams(city, historical=False)
        (out / "cams_forecast.json").write_text(json.dumps(cams))
        _to_frame(cams, cid).to_csv(out / "cams_forecast.csv", index=False)
        ok("cams_forecast.csv  <-- baseline #2 (beat this, not just persistence)")

        if not args.skip_cams_history:
            try:
                ch = fetch_cams(city, historical=True)
                _to_frame(ch, cid).to_csv(out / "cams_archive.csv", index=False)
                ok("cams_archive.csv")
            except Exception as e:
                warn(f"CAMS history unavailable ({e}) - not blocking, skip it")

    print("\n=== DONE. Next: python scripts/02_fetch_osm.py ===\n")


if __name__ == "__main__":
    main()
