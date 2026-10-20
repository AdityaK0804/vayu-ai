"""Hourly refresh driver for GitHub Actions (free scheduler for the Render API).

1. Wakes the API (Render free instances sleep when idle).
2. If the API reports weather as stale, fetches Open-Meteo weather here - GitHub
   runners are not rate-limited the way Render's shared egress IPs are - and
   pushes it to ``POST /api/v2/admin/ingest/weather``.
3. Calls ``POST /api/v2/admin/refresh`` (CPCB, OpenAQ, CAMS, FIRMS, forecasts).

Env: VAYU_API_BASE (e.g. https://vayu-api-staging.onrender.com), VAYU_ADMIN_TOKEN.
City coordinates come from the API, weather variables from airsight.live.openmeteo.
"""

from __future__ import annotations

import json
import os
import sys
import time

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))
from airsight.live.openmeteo import WX_BASE, WX_HOURLY  # noqa: E402


def main() -> int:
    base = os.environ["VAYU_API_BASE"].rstrip("/") + "/api/v2"
    token = os.environ["VAYU_ADMIN_TOKEN"]
    auth = {"Authorization": f"Bearer {token}"}
    client = httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0))

    health = None
    for attempt in range(8):  # cold start can take ~1 min
        try:
            r = client.get(f"{base}/health")
            if r.status_code == 200:
                health = r.json()
                break
        except httpx.HTTPError:
            pass
        time.sleep(15)
    if health is None:
        print("API did not wake up", file=sys.stderr)
        return 1

    met = (health.get("freshness") or {}).get("sources", {}).get("met", {})
    if met.get("stale", True):
        cities = client.get(f"{base}/cities").json().get("cities", [])
        ids = [c.get("city_id") or c.get("id") for c in cities if c.get("lat") is not None]
        pts = [(c["lat"], c["lon"]) for c in cities if c.get("lat") is not None]
        if ids:
            wx = client.get(WX_BASE, params={
                "latitude": ",".join(f"{p[0]:.5f}" for p in pts),
                "longitude": ",".join(f"{p[1]:.5f}" for p in pts),
                "hourly": ",".join(WX_HOURLY),
                "past_days": 2, "forecast_days": 5,
                "timezone": "UTC", "wind_speed_unit": "ms",
            })
            if wx.status_code == 200:
                push = client.post(f"{base}/admin/ingest/weather", headers=auth,
                                   json={"city_ids": ids, "open_meteo": wx.json()})
                print("weather push:", push.status_code, push.text[:200])
            else:
                print("open-meteo:", wx.status_code)
    else:
        print("weather fresh, skipping fetch")

    # The refresh is synchronous and can outlast proxies; allow ~10 min.
    try:
        r = client.post(f"{base}/admin/refresh", headers=auth, json={},
                        timeout=httpx.Timeout(660.0, connect=30.0))
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        print("refresh:", r.status_code, json.dumps({k: body.get(k) for k in ("ok", "n_ok", "n_cities", "cpcb", "fires", "weather")}))
        if r.status_code == 409:
            return 0  # previous run still going
        return 0 if r.status_code == 200 else 1
    except httpx.HTTPError as exc:
        # The proxy may drop a long request while the server keeps working.
        print("refresh request ended early:", type(exc).__name__)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
