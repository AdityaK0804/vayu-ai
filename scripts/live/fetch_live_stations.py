"""Live CPCB station readings via OpenAQ v3 — the real sensor values.

Why this exists: data/live/latest.json comes from Open-Meteo CAMS, which is a
*model*, not a sensor. On 2026-07-22 CAMS put Bhilai near AQI 150 while the
actual CPCB stations (and aqi.in, which reads the same feed) showed 78. For a
dashboard that says "live", the measured value has to win.

Writes data/live/stations_live.json and refreshes data/live/latest.json so the
city index shows measured AQI wherever a station exists, falling back to the
CAMS value only where none does.

Run:  python scripts/live/fetch_live_stations.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

API = "https://api.openaq.org/v3"
LIVE = DATA / "live"
POLL = {"pm25", "pm10", "no2", "so2", "co", "o3"}

# EPA PM2.5 -> US AQI
_AQI = [(0.0, 12.0, 0, 50), (12.1, 35.4, 51, 100), (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200), (150.5, 250.4, 201, 300), (250.5, 500.4, 301, 500)]


def aqi_from_pm25(pm: float) -> int:
    for lo, hi, alo, ahi in _AQI:
        if pm <= hi:
            return int(round((ahi - alo) / (hi - lo) * (pm - lo) + alo))
    return 500


def load_key() -> str | None:
    for n in ("OPENAQ_KEY", "OPENAQ_API_KEY", "OpenAQ_API_KEY"):
        if os.environ.get(n):
            return os.environ[n]
    try:
        from dotenv import dotenv_values
    except ImportError:
        return None
    env = dotenv_values(ROOT / ".env")
    for n in ("OPENAQ_KEY", "OPENAQ_API_KEY", "OpenAQ_API_KEY"):
        if env.get(n):
            return env[n]
    return None


def get(url: str, key: str, tries: int = 4):
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, headers={"X-API-Key": key}, timeout=45)
            if r.status_code == 401 and i < tries - 1:
                time.sleep(2 + 2 * i)   # this endpoint 401s intermittently
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last = e
            if i < tries - 1:
                time.sleep(2 + 2 * i)
    raise last  # type: ignore[misc]


def main() -> None:
    print("=" * 84)
    print("LIVE CPCB STATION READINGS (OpenAQ v3)")
    print("=" * 84)

    key = load_key()
    if not key:
        warn("no OpenAQ key — set OPENAQ_KEY in .env")
        sys.exit(1)

    reg = ROOT / "config" / "cg_openaq_stations.csv"
    if not reg.exists():
        warn(f"missing {reg.relative_to(ROOT)} — run scripts/discover/find_cg_stations.py")
        sys.exit(1)
    aq = pd.read_csv(reg)
    st = pd.read_csv(ROOT / "config" / "stations.csv")

    # openaq station name -> our city_id
    import re

    def norm(x):
        return re.sub(r"[^a-z0-9]", "", re.sub(r"\s*-\s*[^-]+$", "", str(x)).lower())

    name2city = {norm(r.station_name): r.city_id for _, r in st.iterrows()}

    rows, failed = [], []
    for _, r in aq.iterrows():
        try:
            loc = get(f"{API}/locations/{int(r.openaq_id)}", key)["results"][0]
            sensor_param = {s["id"]: s["parameter"]["name"] for s in loc.get("sensors", [])}
            latest = get(f"{API}/locations/{int(r.openaq_id)}/latest", key)["results"]
        except Exception as e:  # noqa: BLE001 — one station must not sink the run
            failed.append((r.station, f"{type(e).__name__}"))
            warn(f"{r.station}: {type(e).__name__}")
            continue

        vals, when = {}, None
        for m in latest:
            pname = sensor_param.get(m.get("sensorsId"))
            v = m.get("value")
            # 0.0 and negatives are CPCB "no reading" sentinels, not clean air
            if pname in POLL and v is not None and float(v) > 0:
                vals[pname] = round(float(v), 1)
                when = (m.get("datetime") or {}).get("utc") or when
        if not vals:
            failed.append((r.station, "no values"))
            continue

        # AQI is DEFINED on a 24-hour average. Scoring a single instantaneous
        # hour against the 24h breakpoints is what made Bhilai read AQI 4 while
        # aqi.in showed 78, so pull the last 24h and average it.
        pm24 = None
        pm_sensor = next((sid for sid, pn in sensor_param.items() if pn == "pm25"), None)
        if pm_sensor:
            try:
                since = (datetime.now(timezone.utc) - timedelta(hours=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
                ms = get(f"{API}/sensors/{pm_sensor}/measurements"
                         f"?datetime_from={since}&limit=200", key)["results"]
                xs = [float(m["value"]) for m in ms
                      if m.get("value") is not None and float(m["value"]) > 0]
                if xs:
                    pm24 = round(sum(xs) / len(xs), 1)
            except Exception:
                pass
        vals["pm25_24h"] = pm24

        rows.append({
            "openaq_id": int(r.openaq_id),
            "station": r.station,
            "city_id": name2city.get(norm(r.station)),
            "lat": float(r.lat), "lon": float(r.lon),
            **vals,
            "us_aqi": aqi_from_pm25(vals["pm25_24h"]) if vals.get("pm25_24h") else None,
            "measured_at_utc": when,
        })
        say(f"{r.station[:42]:<44}now={vals.get('pm25','—'):>6}  24h={vals.get('pm25_24h') or '—':>6}"
            f"  aqi={rows[-1]['us_aqi'] if rows[-1]['us_aqi'] is not None else '—'}")
        time.sleep(0.4)   # be polite to the API

    if not rows:
        warn("no station read succeeded — leaving existing files untouched")
        sys.exit(1)

    ensure(LIVE)
    payload = {
        "fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "OpenAQ v3 — CPCB reference-grade stations (measured, not modelled)",
        "n_stations": len(rows),
        "stations": rows,
    }
    (LIVE / "stations_live.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    ok(f"stations_live.json — {len(rows)} stations")

    # --- fold measured values into the city index ---
    lp = LIVE / "latest.json"
    cities = json.loads(lp.read_text(encoding="utf-8")) if lp.exists() else []
    by_city: dict[str, list[dict]] = {}
    for s in rows:
        if s["city_id"]:
            by_city.setdefault(s["city_id"], []).append(s)

    print()
    print(f"{'city':<12}{'CAMS pm25':>11}{'MEASURED pm25':>15}{'AQI':>6}  source")
    print("-" * 62)
    for c in cities:
        got = by_city.get(c["city_id"], [])
        cams = c.get("current_pm25")
        if got:
            xs = [g["pm25_24h"] for g in got if g.get("pm25_24h")]
            pm = round(sum(xs) / len(xs), 1) if xs else None
            if pm is None:
                c["measured"] = False
                c["n_stations"] = 0
                print(f"{c['city_id']:<12}{str(cams):>11}{'—':>15}{str(c['current_us_aqi']):>6}  no 24h data")
                continue
            c["measured_pm25_24h"] = pm
            c["measured_us_aqi"] = aqi_from_pm25(pm)
            c["measured"] = True
            c["n_stations"] = len(got)
            c["updated"] = payload["fetched_at_utc"]
            src = f"{len(got)} station(s)"
        else:
            c["measured"] = False
            c["n_stations"] = 0
            pm = cams
            src = "CAMS model (no station)"
        print(f"{c['city_id']:<12}{str(cams):>11}{str(pm):>15}{str(c['current_us_aqi']):>6}  {src}")

    lp.write_text(json.dumps(cities, indent=2), encoding="utf-8")
    ok("latest.json refreshed — measured values now take precedence")

    for dest in (ROOT / "web" / "public" / "data" / "live",):
        ensure(dest)
        (dest / "latest.json").write_text(json.dumps(cities, indent=2), encoding="utf-8")
        (dest / "stations_live.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    ok("copied to web/public/data/live/")

    if failed:
        print()
        warn(f"{len(failed)} station(s) failed: {[f[0][:28] for f in failed]}")


if __name__ == "__main__":
    main()
