"""Live air-quality + weather poller for the AirSight demo.

No API key. Open-Meteo free tier.

The frontend reads data/live/latest.json off disk and NEVER calls the API itself.
That is the demo-wifi contract: once this has succeeded even once, the UI keeps
rendering real numbers whether or not the venue network survives.

Guarantees:
  - one city failing never affects the others
  - a failed fetch NEVER overwrites good data - the previous reading is kept and
    flagged stale, rather than replaced with an error
  - writes are atomic (tmp + os.replace), so the frontend can never read a
    half-written file mid-poll

Run:  python scripts/live/fetch_live.py
      python scripts/live/fetch_live.py --loop 10     # refetch every 10 min
      python scripts/live/fetch_live.py --city korba
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ensure, get_cities, ok, say, warn  # noqa: E402

AIRQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

AIRQ_CURRENT = [
    "pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide", "ozone",
    "carbon_monoxide", "aerosol_optical_depth", "dust", "us_aqi",
]
AIRQ_HOURLY = ["pm2_5", "us_aqi"]
MET_CURRENT = [
    "temperature_2m", "wind_speed_10m", "wind_direction_10m",
    "boundary_layer_height",
]

LIVE = DATA / "live"
LATEST = LIVE / "latest.json"

TIMEOUT = 30
RETRIES = 3


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def brief(e: Exception, limit: int = 110) -> str:
    """One-line error. requests embeds the full query string in ConnectionError,
    which is ~600 useless chars per city on a console you may be reading on stage."""
    msg = " ".join(str(e).split())
    if isinstance(e, requests.HTTPError) and e.response is not None:
        msg = f"HTTP {e.response.status_code}"
    elif isinstance(e, requests.ConnectionError):
        msg = "connection refused / DNS failure (offline?)"
    elif isinstance(e, requests.Timeout):
        msg = f"timeout after {TIMEOUT}s"
    return f"{type(e).__name__}: {msg[:limit]}"


def get_json(url: str, params: dict) -> dict:
    """GET with bounded retries. Raises on final failure - caller isolates."""
    last: Exception | None = None
    for i in range(RETRIES):
        try:
            r = requests.get(url, params=params, timeout=TIMEOUT)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last = e
            if i < RETRIES - 1:
                time.sleep(2 ** i)  # 1s, 2s
    raise last  # type: ignore[misc]


def write_atomic(path: Path, payload: dict | list) -> None:
    """Write via tmp + replace. The frontend polls this file; a partial write
    would hand it invalid JSON at exactly the wrong moment."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def fetch_city(city: dict) -> dict:
    """Fetch AQ + weather for one city. Raises on failure."""
    aq = get_json(AIRQ_URL, {
        "latitude": city["lat"],
        "longitude": city["lon"],
        "current": ",".join(AIRQ_CURRENT),
        "hourly": ",".join(AIRQ_HOURLY),
        "forecast_days": 3,
        "past_days": 1,
        "timezone": "Asia/Kolkata",
    })
    met = get_json(FORECAST_URL, {
        "latitude": city["lat"],
        "longitude": city["lon"],
        "current": ",".join(MET_CURRENT),
        "timezone": "Asia/Kolkata",
    })
    return {
        "city_id": city["id"],
        "name": city["name"],
        "lat": city["lat"],
        "lon": city["lon"],
        "role": city.get("role"),
        "has_stations": city.get("has_stations"),
        "fetched_at": utc_now(),
        "air_quality": {
            "current": aq.get("current", {}),
            "units": aq.get("current_units", {}),
            "hourly": aq.get("hourly", {}),
        },
        "weather": {
            "current": met.get("current", {}),
            "units": met.get("current_units", {}),
        },
    }


def load_latest() -> dict[str, dict]:
    """Previous latest.json as {city_id: entry}. Never raises - a corrupt file
    must not stop a fresh fetch from rebuilding it."""
    if not LATEST.exists():
        return {}
    try:
        return {e["city_id"]: e for e in json.loads(LATEST.read_text(encoding="utf-8"))}
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        warn(f"latest.json unreadable ({e}); rebuilding from this fetch")
        return {}


def summarize(entry: dict) -> dict:
    cur = entry["air_quality"]["current"]
    return {
        "city_id": entry["city_id"],
        "name": entry["name"],
        "lat": entry["lat"],
        "lon": entry["lon"],
        "current_pm25": cur.get("pm2_5"),
        "current_us_aqi": cur.get("us_aqi"),
        "updated": entry["fetched_at"],
        "stale": False,
    }


def aqi_band(aqi) -> str:
    if aqi is None:
        return "-"
    for hi, label in ((50, "Good"), (100, "Moderate"), (150, "Unhealthy(SG)"),
                      (200, "Unhealthy"), (300, "Very Unhealthy")):
        if aqi <= hi:
            return label
    return "Hazardous"


def run_once(cities: list[dict]) -> bool:
    print("=" * 78)
    print(f"AIRSIGHT LIVE FETCH  {utc_now()}")
    print("=" * 78)

    ensure(LIVE)
    previous = load_latest()
    rows: dict[str, dict] = {}
    failed: list[tuple[str, str]] = []

    for city in cities:
        cid = city["id"]
        try:
            entry = fetch_city(city)
        except Exception as e:  # noqa: BLE001 - isolate every city
            failed.append((cid, brief(e)))
            warn(f"{cid}: FAILED - {brief(e)}")
            # Carry the previous good reading forward, marked stale. Better a
            # visibly-old number than a blank panel on stage.
            if cid in previous:
                kept = {**previous[cid], "stale": True}
                rows[cid] = kept
                say(f"{cid}: kept previous reading from {kept.get('updated')} (stale)")
            continue

        write_atomic(LIVE / f"{cid}_live.json", entry)
        rows[cid] = summarize(entry)
        cur = entry["air_quality"]["current"]
        ok(f"{cid}: pm2.5={cur.get('pm2_5')} us_aqi={cur.get('us_aqi')}")

    fresh = [c for c, r in rows.items() if not r.get("stale")]
    if not fresh:
        warn("EVERY city failed - latest.json left UNTOUCHED (previous data preserved)")
    else:
        # Preserve any city absent from this run entirely (e.g. --city korba)
        # so a targeted refetch never truncates the frontend's city list.
        merged = {**previous, **rows}
        write_atomic(LATEST, list(merged.values()))
        ok(f"latest.json -> {len(merged)} cities ({len(fresh)} fresh)")

    print()
    print(f"{'city':<12}{'PM2.5':>9}{'US AQI':>9}  {'band':<15}{'updated (UTC)':<22}state")
    print("-" * 78)
    for city in cities:
        r = rows.get(city["id"])
        if r is None:
            print(f"{city['id']:<12}{'-':>9}{'-':>9}  {'-':<15}{'-':<22}FAILED (no prior)")
            continue
        pm = r["current_pm25"]
        aqi = r["current_us_aqi"]
        print(f"{r['city_id']:<12}{pm if pm is not None else '-':>9}"
              f"{aqi if aqi is not None else '-':>9}  {aqi_band(aqi):<15}"
              f"{r['updated']:<22}{'STALE' if r.get('stale') else 'live'}")

    if failed:
        print()
        warn(f"{len(failed)} city(ies) failed this cycle:")
        for cid, err in failed:
            say(f"  {cid}: {err}")
    return not failed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", type=int, metavar="N",
                    help="refetch every N minutes (default: run once)")
    ap.add_argument("--city", help="restrict to one city id")
    args = ap.parse_args()

    only = [args.city] if args.city else None
    cities = get_cities(only=only, include_optional=True)
    if not cities:
        sys.exit(f"unknown city: {args.city}")

    if not args.loop:
        run_once(cities)
        return

    say(f"loop mode: every {args.loop} min. Ctrl-C to stop.")
    while True:
        try:
            run_once(cities)
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001 - the loop must outlive any cycle
            warn(f"cycle crashed, continuing: {type(e).__name__}: {e}")
        try:
            time.sleep(args.loop * 60)
        except KeyboardInterrupt:
            print()
            say("stopped.")
            return


if __name__ == "__main__":
    main()
