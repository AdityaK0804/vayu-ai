"""Ingestion runner: real sources -> persistent store -> H3 surfaces.

This is the module that replaces the "bake a JSON file once and hope" workflow.
It is safe to run on a cron every 30 minutes: every write is an idempotent
upsert keyed on ``(station, timestamp, source)``.

Pipeline per city
-----------------
1. Fetch CAMS hourly air quality for the city centroid (and every configured
   station coordinate) plus weather, in two batched requests.
2. Split the series into *observed* (``ts <= now``) rows and *forecast* rows.
3. Compute CPCB NAQI per hour from the pollutant concentrations.
4. Persist observations, meteorology and the CAMS forecast envelope.
5. Build the H3 hexagon surface from the freshest anchors and snapshot it.

Optional measured layer
-----------------------
If ``OPENAQ_API_KEY`` is set, latest reference-grade station readings are
ingested first and used as surface anchors. They are labelled ``openaq`` and are
always preferred over modelled values when both exist.

Usage::

    python -m airsight.live.ingest --cities korba,raipur
    python -m airsight.live.ingest --all --past-days 3 --forecast-days 5
"""

from __future__ import annotations

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

import h3

from airsight.aqi.cpcb_naqi import band_for_aqi, compute_naqi_rolling, naqi_from_rows
from airsight.config import load_cities, load_stations
from airsight.grid.surface import (
    bbox_for_center,
    build_surface,
    load_boundary,
    resolution_for_bbox,
)
from airsight.live import fires as fires_mod
from airsight.live.openmeteo import PointSeries, fetch_air_quality, fetch_weather
from airsight.live.openaq import fetch_latest as openaq_latest
from airsight.store import Store, to_iso, utcnow

log = logging.getLogger(__name__)

CAMS_SOURCE = "open-meteo-cams"
WX_SOURCE = "open-meteo"
# Upper bound on hexagons per city snapshot. Res-8 (~1 km) cells are what make the
# map read as a surface rather than a district colour, and ~9k polygons is still
# a light payload once gzipped (the API enables GZipMiddleware).
SURFACE_TARGET_CELLS = 9000


# ---------------------------------------------------------------------------
# Registry seeding
# ---------------------------------------------------------------------------


def seed_registry(store: Store, *, include_optional: bool = True) -> dict[str, int]:
    """Load ``config/cities.yaml`` and ``config/stations.csv`` into the store."""
    cities = load_cities(include_optional=include_optional)
    station_rows = load_stations()
    city_ids = {c["id"] for c in cities}

    city_payload = []
    for city in cities:
        bbox = city.get("bbox") or bbox_for_center(float(city["lat"]), float(city["lon"]))
        city_payload.append(
            {
                "id": city["id"],
                "name": city.get("name") or city["id"],
                "state": city.get("state") or "Chhattisgarh",
                "lat": float(city["lat"]),
                "lon": float(city["lon"]),
                "bbox": bbox,
                "role": city.get("role"),
                "calibrated": bool(city.get("has_stations")) or city["id"] in city_ids,
                "source": "config/cities.yaml",
            }
        )

    station_payload = []
    for station in station_rows:
        lat, lon = float(station["latitude"]), float(station["longitude"])
        station_payload.append(
            {
                "station_id": station["station_id"],
                "city_id": station.get("city_id"),
                "name": station.get("station_name") or station["station_id"],
                "lat": lat,
                "lon": lon,
                "source": "cpcb",
                "h3_r7": _h3(lat, lon, 7),
                "h3_r8": _h3(lat, lon, 8),
            }
        )

    return {
        "cities": store.upsert_cities(city_payload),
        "stations": store.upsert_stations(station_payload),
    }


def ensure_city(
    store: Store,
    name: str,
    lat: float,
    lon: float,
    *,
    state: str | None = None,
    bbox: Sequence[float] | None = None,
    calibrated: bool = False,
) -> dict[str, Any]:
    """Register a city on demand (used by geocoded search)."""
    city_id = _slug(name)
    store.upsert_cities(
        [
            {
                "id": city_id,
                "name": name,
                "state": state,
                "lat": lat,
                "lon": lon,
                "bbox": list(bbox) if bbox else bbox_for_center(lat, lon),
                "role": "on_demand",
                "calibrated": calibrated,
                "source": "geocode",
            }
        ]
    )
    return store.city(city_id) or {}


# ---------------------------------------------------------------------------
# City ingestion
# ---------------------------------------------------------------------------


def ingest_cities(
    store: Store | None = None,
    city_ids: Sequence[str] | None = None,
    *,
    past_days: int = 3,
    forecast_days: int = 5,
    include_fires: bool = True,
    build_surfaces: bool = True,
    openaq: bool = True,
) -> dict[str, Any]:
    """Refresh every requested city. Never raises for a single-city failure."""
    started = utcnow()
    own_store = store is None
    store = store or Store.open()
    try:
        # Seed from config when the registry has never been loaded. Checking the
        # source (not just "table empty") keeps a stray non-config row - e.g. a
        # test fixture in a shared Postgres - from blocking the seed forever.
        if not store.scalar(
            "SELECT COUNT(*) FROM cities WHERE source = ?", ("config/cities.yaml",)
        ):
            seed_registry(store)

        cities = store.cities()
        if city_ids:
            wanted = {c.lower() for c in city_ids}
            cities = [c for c in cities if c["id"] in wanted]
        if not cities:
            return {"ok": False, "detail": "no cities matched", "cities": []}

        results: list[dict[str, Any]] = []
        for city in cities:
            try:
                results.append(
                    _ingest_city(
                        store,
                        city,
                        past_days=past_days,
                        forecast_days=forecast_days,
                        build_surface=build_surfaces,
                        openaq=openaq,
                    )
                )
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                log.exception("ingest failed for %s", city["id"])
                store.log_ingest("city", "error", detail=f"{city['id']}: {exc}"[:500])
                results.append({"city_id": city["id"], "ok": False, "error": str(exc)[:200]})

        fire_summary = {"status": "skipped"}
        if include_fires:
            fire_summary = ingest_fires(store)

        ok = sum(1 for r in results if r.get("ok"))
        summary = {
            "ok": ok > 0,
            "started_at": started,
            "finished_at": utcnow(),
            "n_cities": len(results),
            "n_ok": ok,
            "cities": results,
            "fires": fire_summary,
        }
        store.log_ingest(
            "city_batch",
            "ok" if ok else "error",
            rows=sum(int(r.get("observations") or 0) for r in results),
            detail=f"{ok}/{len(results)} cities refreshed",
            started_at=started,
        )
        return summary
    finally:
        if own_store:
            store.close()


def _ingest_city(
    store: Store,
    city: dict[str, Any],
    *,
    past_days: int,
    forecast_days: int,
    build_surface: bool,
    openaq: bool,
) -> dict[str, Any]:
    city_id = city["id"]
    lat, lon = float(city["lat"]), float(city["lon"])
    stations = store.stations(city_id)
    anchor_points: list[tuple[float, float]] = [(lat, lon)]
    for station in stations:
        point = (float(station["lat"]), float(station["lon"]))
        if point not in anchor_points:
            anchor_points.append(point)

    aqu = fetch_air_quality(
        anchor_points, past_days=past_days, forecast_days=forecast_days
    )
    wx = fetch_weather([(lat, lon)], past_days=past_days, forecast_days=forecast_days)
    if not aqu:
        raise RuntimeError("Open-Meteo returned no air-quality series")

    now_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    obs_rows: list[dict[str, Any]] = []
    fc_rows: list[dict[str, Any]] = []

    # Register the CAMS sample points as stations so the surface builder can
    # resolve their coordinates later (it anchors on station geometry, not on
    # the observation row, which keeps a site's id stable across refreshes).
    cams_stations = [
        {
            "station_id": _station_for_series(series, lat, lon, city_id),
            "city_id": city_id,
            "name": f"CAMS grid {series.lat:.3f},{series.lon:.3f}",
            "lat": series.lat,
            "lon": series.lon,
            "source": CAMS_SOURCE,
            "h3_r7": _h3(series.lat, series.lon, 7),
            "h3_r8": _h3(series.lat, series.lon, 8),
        }
        for series in aqu
    ]
    store.upsert_stations(cams_stations)

    for series in aqu:
        station_id = _station_for_series(series, lat, lon, city_id)
        sid_h3_r7 = _h3(series.lat, series.lon, 7)
        sid_h3_r8 = _h3(series.lat, series.lon, 8)

        # Pull each pollutant once so NAQI can apply its official averaging
        # windows (24h for PM/NO2/SO2, 8h for O3/CO) instead of reading a
        # single hour and letting an ozone spike define the city's index.
        hourly_map: dict[str, list[float | None]] = {
            "pm25": list(series.hourly.get("pm2_5") or []),
            "pm10": list(series.hourly.get("pm10") or []),
            "no2": list(series.hourly.get("nitrogen_dioxide") or []),
            "so2": list(series.hourly.get("sulphur_dioxide") or []),
            "o3": list(series.hourly.get("ozone") or []),
            "co": [
                (v / 1000.0 if v is not None else None)
                for v in (series.hourly.get("carbon_monoxide") or [])
            ],
        }

        for idx, stamp in enumerate(series.times):
            ts = to_iso(stamp)
            if not ts:
                continue
            values = {column: _at(series, idx, source_key) for column, source_key in (
                ("pm25", "pm2_5"),
                ("pm10", "pm10"),
                ("no2", "nitrogen_dioxide"),
                ("so2", "sulphur_dioxide"),
                ("o3", "ozone"),
                ("co", "carbon_monoxide"),
            )}
            if values["co"] is not None:
                values["co"] = values["co"] / 1000.0  # µg/m³ -> mg/m³
            naqi = compute_naqi_rolling(hourly_map, idx)
            if not any(v is not None for v in values.values()):
                continue
            row = {
                "station_id": station_id,
                "city_id": city_id,
                "ts": ts,
                "source": CAMS_SOURCE,
                "aqi": naqi.get("aqi"),
                "dominant": naqi.get("dominant_pollutant"),
                "h3_r7": sid_h3_r7,
                "h3_r8": sid_h3_r8,
                **values,
            }
            if ts <= now_hour:
                obs_rows.append(row)
            else:
                fc_rows.append(
                    {
                        "city_id": city_id,
                        "run_ts": now_hour,
                        "ts": ts,
                        "pm25": values["pm25"],
                        "pm10": values["pm10"],
                        "no2": values["no2"],
                        "so2": values["so2"],
                        "o3": values["o3"],
                        "co": values["co"],
                        "aqi": naqi.get("aqi"),
                        "model_version": "cams-direct",
                        "source": CAMS_SOURCE,
                    }
                )

    met_rows = _met_rows(wx[0], city_id) if wx else []
    store.upsert_observations(obs_rows)
    store.upsert_air_forecast(fc_rows)
    if met_rows:
        store.upsert_met(met_rows)

    measured_rows: list[dict[str, Any]] = []
    openaq_status: dict[str, Any] = {"status": "skipped"}
    if openaq:
        measured_rows, openaq_status = _ingest_openaq(store, city, lat, lon)
        if measured_rows:
            store.upsert_stations(
                [
                    {
                        "station_id": r["station_id"],
                        "city_id": city_id,
                        "name": r["name"],
                        "lat": r["lat"],
                        "lon": r["lon"],
                        "source": "openaq",
                        "h3_r7": _h3(r["lat"], r["lon"], 7),
                        "h3_r8": _h3(r["lat"], r["lon"], 8),
                    }
                    for r in measured_rows
                ]
            )
            store.upsert_observations(
                [
                    {
                        "station_id": r["station_id"],
                        "city_id": city_id,
                        "ts": r["ts"],
                        "source": "openaq",
                        "pm25": r.get("pm25"),
                        "pm10": r.get("pm10"),
                        "no2": r.get("no2"),
                        "so2": r.get("so2"),
                        "o3": r.get("o3"),
                        "co": r.get("co"),
                        "aqi": _measured_aqi(store, r),
                        "h3_r7": _h3(r["lat"], r["lon"], 7),
                        "h3_r8": _h3(r["lat"], r["lon"], 8),
                    }
                    for r in measured_rows
                ]
            )

    surface_ts = now_hour + ":00Z"
    hex_cells = 0
    if build_surface:
        try:
            hex_cells = refresh_surface(store, city)
            surface_ts = store.scalar(
                "SELECT MAX(ts) FROM hex_snapshot WHERE city_id = ?", (city_id,)
            ) or surface_ts
        except Exception as exc:  # noqa: BLE001
            log.warning("surface build failed for %s: %s", city_id, exc)

    return {
        "city_id": city_id,
        "ok": True,
        "observations": len(obs_rows) + len(measured_rows),
        "forecast_hours": len(fc_rows),
        "met_hours": len(met_rows),
        "measured_stations": len(measured_rows),
        "openar_status": openaq_status.get("status"),
        "hex_cells": hex_cells,
        "surface_ts": surface_ts,
        "calibrated": bool(city.get("calibrated")),
    }


def _measured_aqi(store: Store, reading: dict[str, Any]) -> int | None:
    """CPCB AQI for a new measured reading using the station's stored history.

    A single instantaneous reading is never turned into an AQI on its own; the
    CPCB windows (24h / max 8h) need history. Returns None until enough exists.
    """
    try:
        history = store.observations(
            station_id=reading["station_id"], since=_hours_ago(48), limit=200
        )
        rows = [h for h in history if h.get("source") == "openaq"]
        rows.append({k: reading.get(k) for k in ("ts", "pm25", "pm10", "no2", "so2", "o3", "co")})
        return naqi_from_rows(rows).get("aqi")
    except Exception:  # noqa: BLE001
        log.warning("measured AQI computation failed for %s", reading.get("station_id"), exc_info=True)
        return None


def _ingest_openaq(
    store: Store, city: dict[str, Any], lat: float, lon: float
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    # Wider radius for dense urban clusters, tighter for rural districts.
    saw_stations = store.scalar(
        "SELECT COUNT(*) FROM stations WHERE city_id = ?", (city["id"],)
    )
    radius = 60_000 if saw_stations else 120_000
    rows, status = openaq_latest((lat, lon), radius_m=radius)
    if status.get("status") == "ok":
        store.log_ingest("openaq", "ok", rows=len(rows), detail=city["id"])
    return rows, status


def _station_for_series(
    series: PointSeries, city_lat: float, city_lon: float, city_id: str
) -> str:
    if abs(series.lat - city_lat) < 1e-6 and abs(series.lon - city_lon) < 1e-6:
        return f"cams:{city_id}"
    # Open-Meteo snaps to its own model grid; match the nearest configured
    # station so the same physical site keeps a stable id over time.
    return f"cams:{city_id}:{series.lat:.3f},{series.lon:.3f}"


def _met_rows(series: PointSeries, city_id: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for idx, stamp in enumerate(series.times):
        ts = to_iso(stamp)
        if not ts:
            continue
        rows.append(
            {
                "city_id": city_id,
                "ts": ts,
                "temperature_2m": _at(series, idx, "temperature_2m"),
                "relative_humidity_2m": _at(series, idx, "relative_humidity_2m"),
                "dew_point_2m": _at(series, idx, "dew_point_2m"),
                "surface_pressure": _at(series, idx, "surface_pressure"),
                "precipitation": _at(series, idx, "precipitation"),
                "wind_speed_10m": _at(series, idx, "wind_speed_10m"),
                "wind_direction_10m": _at(series, idx, "wind_direction_10m"),
                "cloud_cover": _at(series, idx, "cloud_cover"),
                "shortwave_radiation": _at(series, idx, "shortwave_radiation"),
                "boundary_layer_height": _at(series, idx, "boundary_layer_height"),
                "source": WX_SOURCE,
            }
        )
    return rows


def _at(series: PointSeries, idx: int, key: str) -> float | None:
    values = series.hourly.get(key)
    if not values or idx >= len(values):
        return None
    return values[idx]


# ---------------------------------------------------------------------------
# Fires
# ---------------------------------------------------------------------------


def ingest_fires(
    store: Store, bbox: Sequence[float] | None = None, days: int = 2
) -> dict[str, Any]:
    area = list(bbox) if bbox else _state_bbox(store)
    rows, status = fires_mod.fetch_fires(area, days=days)
    if rows:
        enriched = []
        for row in rows:
            city = _nearest_city(store, row["lat"], row["lon"])
            enriched.append({**row, "city_id": city})
        store.upsert_fires(enriched)
    store.log_ingest(
        "firms",
        status.get("status", "unknown"),
        rows=len(rows),
        detail=str(status.get("detail"))[:400],
    )
    return {**status, "stored": len(rows)}


def _state_bbox(store: Store) -> list[float]:
    row = store.query(
        "SELECT MIN(bbox_w) w, MIN(bbox_s) s, MAX(bbox_e) e, MAX(bbox_n) n FROM cities"
    )
    if row and row[0]["w"] is not None:
        return [row[0]["w"], row[0]["s"], row[0]["e"], row[0]["n"]]
    return [80.0, 17.0, 84.5, 24.5]  # Chhattisgarh fallback


def _nearest_city(store: Store, lat: float, lon: float) -> str | None:
    best: tuple[float, str] | None = None
    for city in store.cities():
        d = (lat - city["lat"]) ** 2 + (lon - city["lon"]) ** 2
        if best is None or d < best[0]:
            best = (d, city["id"])
    if best is None:
        return None
    # ~0.5 degree cutoff keeps state-wide fires unattributed.
    return best[1] if best[0] <= 0.25 else None


# ---------------------------------------------------------------------------
# Surfaces
# ---------------------------------------------------------------------------


def refresh_surface(
    store: Store, city: dict[str, Any] | str, *, ts: str | None = None
) -> int:
    """Rebuild the H3 surface for one city from its freshest anchors."""
    if isinstance(city, str):
        found = store.city(city)
        if not found:
            raise KeyError(f"unknown city {city}")
        city = found

    city_id = city["id"]
    latest = store.latest_observations(city_id)
    anchors: list[dict[str, Any]] = []
    seen: set[tuple[float, float]] = set()
    # Measured stations first — they win ties in the IDW weighting.
    for row in sorted(latest, key=lambda r: 0 if r["source"] == "openaq" else 1):
        if row.get("pm25") is None:
            continue
        station = next(
            (s for s in store.stations(city_id) if s["station_id"] == row["station_id"]),
            None,
        )
        if not station:
            continue
        key = (round(float(station["lat"]), 3), round(float(station["lon"]), 3))
        if key in seen:
            continue
        seen.add(key)
        anchors.append(
            {
                "lat": float(station["lat"]),
                "lon": float(station["lon"]),
                "pm25": float(row["pm25"]),
                "weight": 2.0 if row["source"] == "openaq" else 1.0,
                "source": row["source"],
            }
        )

    bbox = [city.get("bbox_w"), city.get("bbox_s"), city.get("bbox_e"), city.get("bbox_n")]
    if any(v is None for v in bbox):
        bbox = bbox_for_center(float(city["lat"]), float(city["lon"]))
    boundary = load_boundary(city_id)
    res = resolution_for_bbox(bbox, target_cells=SURFACE_TARGET_CELLS)
    stamp = to_iso(ts) or (latest[0]["ts"] if latest else utcnow())

    surface = build_surface(
        city_id,
        anchors,
        bbox=bbox,
        ts=stamp,
        boundary=boundary,
        target_cells=SURFACE_TARGET_CELLS,
    )

    rows = [
        {
            "city_id": city_id,
            "ts": surface.ts,
            "h3": cell["h3"],
            "lat": cell["lat"],
            "lon": cell["lon"],
            "pm25": cell.get("pm25"),
            "aqi": cell.get("aqi"),
            "population": cell.get("pop"),
            "emission_index": cell.get("ei"),
            "detail": cell.get("detail"),
            "model_version": f"surface-{surface.method}",
        }
        for cell in surface.cells
    ]
    store.replace_hex_snapshot(city_id, surface.ts, rows)
    store.prune_hex_snapshots(city_id, keep=24)
    return len(rows)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _h3(lat: float, lon: float, res: int) -> str | None:
    try:
        return h3.latlng_to_cell(lat, lon, res)
    except Exception:
        return None


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-")


def city_summary(store: Store, city_id: str) -> dict[str, Any]:
    """Freshest reading, CPCB-compliant AQI and 24h statistics for a city."""
    city = store.city(city_id)
    if not city:
        return {}

    # Prefer a measured station; fall back to the CAMS grid point.
    window = store.observations(city_id, since=_hours_ago(48), limit=6000)
    measured_rows = [r for r in window if r["source"] == "openaq"]
    rows = measured_rows or [r for r in window if r["source"] == CAMS_SOURCE]
    rows = [r for r in rows if r.get("pm25") is not None]

    # Keep one station (the freshest) so averaging is not polluted by mixing
    # two locations into a single 24-hour window.
    if not rows:
        return {"city_id": city_id, "available": False}
    rows.sort(key=lambda r: r["ts"], reverse=True)
    station_id = rows[0]["station_id"]
    station_rows = sorted(
        [r for r in rows if r["station_id"] == station_id], key=lambda r: r["ts"]
    )
    latest = station_rows[-1]

    # Gap-aware hourly grid: a 24h window spans 24 clock hours, not 24 rows.
    naqi = naqi_from_rows(station_rows)
    aqi = naqi.get("aqi")

    pm_values = [r["pm25"] for r in station_rows[-24:] if r.get("pm25") is not None]
    mean24 = sum(pm_values) / len(pm_values) if pm_values else None

    return {
        "city_id": city_id,
        "name": city["name"],
        "available": True,
        "station_id": station_id,
        "pm25": latest.get("pm25"),
        "pm10": latest.get("pm10"),
        "no2": latest.get("no2"),
        "so2": latest.get("so2"),
        "o3": latest.get("o3"),
        "co": latest.get("co"),
        "aqi": aqi,
        "band": naqi.get("band") or band_for_aqi(aqi),
        "dominant": naqi.get("dominant_pollutant"),
        "sub_indexes": naqi.get("sub_indexes"),
        "averaging": naqi.get("averaging"),
        "aqi_basis": "cpcb_naqi",
        "cpcb_valid": naqi.get("cpcb_valid"),
        "measured": latest["source"] == "openaq",
        "source": latest["source"],
        "ts": latest["ts"],
        "pm25_24h": round(mean24, 1) if mean24 is not None else None,
        "lat": city["lat"],
        "lon": city["lon"],
    }


def _hours_ago(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh live air-quality data")
    parser.add_argument("--cities", help="comma-separated city ids")
    parser.add_argument("--all", action="store_true", help="refresh every registered city")
    parser.add_argument("--past-days", type=int, default=3)
    parser.add_argument("--forecast-days", type=int, default=5)
    parser.add_argument("--no-fires", action="store_true")
    parser.add_argument("--no-surfaces", action="store_true")
    parser.add_argument("--seed", action="store_true", help="reload config registry first")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    started = time.time()
    with Store.open() as store:
        if args.seed:
            print(seed_registry(store))
        city_ids = [c.strip() for c in (args.cities or "").split(",") if c.strip()]
        summary = ingest_cities(
            store,
            city_ids or None,
            past_days=args.past_days,
            forecast_days=args.forecast_days,
            include_fires=not args.no_fires,
            build_surfaces=not args.no_surfaces,
        )
    print(
        f"ingested {summary['n_ok']}/{summary['n_cities']} cities in "
        f"{time.time() - started:.1f}s"
    )
    for row in summary["cities"]:
        print("  ", row)
    print("fires:", summary.get("fires"))
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
