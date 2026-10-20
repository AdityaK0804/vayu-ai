"""Open-Meteo clients: air quality, weather, and geocoding.

Open-Meteo is used as the *live* data source because it is free for
non-commercial use, needs no API key, and serves CAMS (Copernicus Atmosphere
Monitoring Service) model fields interpolated to any coordinate, plus a
7-day hourly forecast. It is the same upstream data many consumer AQI sites
display; the difference is that we label it as *modelled* and never pretend it
is a ground station reading.

Everything here is dependency-light (``httpx``) and batched: a single request
can carry many coordinates, which keeps a 700-district refresh inside the free
rate limits.

Usage::

    from airsight.live.openmeteo import fetch_air_quality, fetch_weather

    aq = fetch_air_quality([(22.36, 82.75), (21.25, 81.63)])
    wx = fetch_weather([(22.36, 82.75)])
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

import httpx

log = logging.getLogger(__name__)

AQ_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"
WX_BASE = "https://api.open-meteo.com/v1/forecast"
GEO_BASE = "https://geocoding-api.open-meteo.com/v1/search"

# Hourly air-quality fields. Names follow the Open-Meteo API, which is also the
# vocabulary stored in the database (``pm2_5`` -> ``pm25`` at the boundary).
AQ_HOURLY: tuple[str, ...] = (
    "pm2_5",
    "pm10",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "sulphur_dioxide",
    "ozone",
    "dust",
    "aerosol_optical_depth",
    "uv_index",
)

WX_HOURLY: tuple[str, ...] = (
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "apparent_temperature",
    "precipitation",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
    "shortwave_radiation",
    "boundary_layer_height",
    "et0_fao_evapotranspiration",
    "vapour_pressure_deficit",
)

MAX_POINTS_PER_REQUEST = 20


class OpenMeteoError(RuntimeError):
    """Raised when an upstream call fails after retries."""


@dataclass
class PointSeries:
    """Hourly series for one coordinate, aligned on ``times``."""

    lat: float
    lon: float
    elevation: float | None
    times: list[str] = field(default_factory=list)
    hourly: dict[str, list[float | None]] = field(default_factory=dict)
    current: dict[str, Any] = field(default_factory=dict)
    units: dict[str, str] = field(default_factory=dict)

    def at(self, variable: str, iso_time: str) -> float | None:
        """Value of *variable* at an exact hourly timestamp, if present."""
        series = self.hourly.get(variable)
        if not series or not self.times:
            return None
        try:
            return series[self.times.index(iso_time)]
        except ValueError:
            return None

    def latest(self, variable: str) -> float | None:
        """Last non-null value in the series."""
        for value in reversed(self.hourly.get(variable) or []):
            if value is not None:
                return value
        return None

    def recent_mean(self, variable: str, hours: int = 24) -> float | None:
        series = [v for v in (self.hourly.get(variable) or []) if v is not None]
        if not series:
            return None
        window = series[-hours:]
        return sum(window) / len(window)


def _client_timeout() -> httpx.Timeout:
    return httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)


def _get_json(url: str, params: dict[str, Any], *, attempts: int = 3) -> Any:
    """GET with bounded exponential backoff. Raises :class:`OpenMeteoError`."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            with httpx.Client(timeout=_client_timeout(), follow_redirects=True) as client:
                response = client.get(url, params=params)
            if response.status_code == 429:
                raise OpenMeteoError("rate limited (429)")
            if response.status_code >= 400:
                raise OpenMeteoError(
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
            return response.json()
        except Exception as exc:  # noqa: BLE001 - retried below
            last = exc
            if attempt < attempts - 1:
                time.sleep(1.5 * (attempt + 1))
    raise OpenMeteoError(str(last) if last else "unknown transport error")


def _chunked(items: Sequence[tuple[float, float]], size: int) -> Iterable[list[tuple[float, float]]]:
    for start in range(0, len(items), size):
        yield list(items[start : start + size])


def _as_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        return [payload]
    return []


def _parse_series(payload: dict[str, Any], fallback_lat: float, fallback_lon: float) -> PointSeries:
    hourly_block = payload.get("hourly") or {}
    times = [str(t) for t in (hourly_block.get("time") or [])]
    series: dict[str, list[float | None]] = {}
    for key, values in hourly_block.items():
        if key == "time" or not isinstance(values, list):
            continue
        series[key] = [None if v is None else float(v) for v in values]
    return PointSeries(
        lat=float(payload.get("latitude", fallback_lat)),
        lon=float(payload.get("longitude", fallback_lon)),
        elevation=payload.get("elevation"),
        times=times,
        hourly=series,
        current=dict(payload.get("current") or {}),
        units=dict(payload.get("current_units") or payload.get("hourly_units") or {}),
    )


# ---------------------------------------------------------------------------
# Air quality
# ---------------------------------------------------------------------------


def fetch_air_quality(
    points: Sequence[tuple[float, float]],
    *,
    past_days: int = 3,
    forecast_days: int = 5,
    hourly: Sequence[str] = AQ_HOURLY,
    domains: str = "auto",
) -> list[PointSeries]:
    """Fetch hourly air quality for every coordinate.

    Returns one :class:`PointSeries` per input point, in input order.
    """
    if not points:
        return []
    out: list[PointSeries] = []
    for batch in _chunked(list(points), MAX_POINTS_PER_REQUEST):
        payload = _get_json(
            AQ_BASE,
            {
                "latitude": ",".join(f"{p[0]:.5f}" for p in batch),
                "longitude": ",".join(f"{p[1]:.5f}" for p in batch),
                "hourly": ",".join(hourly),
                "current": ",".join(hourly),
                "past_days": max(0, min(int(past_days), 92)),
                "forecast_days": max(1, min(int(forecast_days), 7)),
                "timezone": "UTC",
                "domains": domains,
            },
        )
        entries = _as_list(payload)
        if len(entries) != len(batch):
            log.warning(
                "open-meteo AQ returned %d entries for %d points", len(entries), len(batch)
            )
        for idx, entry in enumerate(entries):
            lat, lon = batch[idx] if idx < len(batch) else (0.0, 0.0)
            out.append(_parse_series(entry, lat, lon))
    return out


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------


def fetch_weather(
    points: Sequence[tuple[float, float]],
    *,
    past_days: int = 3,
    forecast_days: int = 5,
    hourly: Sequence[str] = WX_HOURLY,
) -> list[PointSeries]:
    """Fetch hourly meteorology for every coordinate."""
    if not points:
        return []
    out: list[PointSeries] = []
    for batch in _chunked(list(points), MAX_POINTS_PER_REQUEST):
        payload = _get_json(
            WX_BASE,
            {
                "latitude": ",".join(f"{p[0]:.5f}" for p in batch),
                "longitude": ",".join(f"{p[1]:.5f}" for p in batch),
                "hourly": ",".join(hourly),
                "current": ",".join(
                    [
                        "temperature_2m",
                        "relative_humidity_2m",
                        "wind_speed_10m",
                        "wind_direction_10m",
                        "precipitation",
                        "surface_pressure",
                    ]
                ),
                "past_days": max(0, min(int(past_days), 92)),
                "forecast_days": max(1, min(int(forecast_days), 16)),
                "timezone": "UTC",
                "wind_speed_unit": "ms",
            },
        )
        entries = _as_list(payload)
        for idx, entry in enumerate(entries):
            lat, lon = batch[idx] if idx < len(batch) else (0.0, 0.0)
            out.append(_parse_series(entry, lat, lon))
    return out


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------


def geocode(name: str, *, count: int = 8, country_code: str = "IN") -> list[dict[str, Any]]:
    """Search places by name. Returns ``[{name, admin1, lat, lon, ...}]``."""
    query = (name or "").strip()
    if len(query) < 2:
        return []
    payload = _get_json(
        GEO_BASE,
        {
            "name": query,
            "count": max(1, min(int(count), 20)),
            "language": "en",
            "format": "json",
            "countryCode": country_code,
        },
    )
    results = payload.get("results") if isinstance(payload, dict) else None
    out: list[dict[str, Any]] = []
    for item in results or []:
        try:
            out.append(
                {
                    "name": item.get("name"),
                    "state": item.get("admin1"),
                    "district": item.get("admin2"),
                    "country": item.get("country"),
                    "lat": float(item["latitude"]),
                    "lon": float(item["longitude"]),
                    "population": item.get("population"),
                    "timezone": item.get("timezone"),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def point_time_now() -> str:
    """Current UTC hour, formatted like Open-Meteo hourly timestamps."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
