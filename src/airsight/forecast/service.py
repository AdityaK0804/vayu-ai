"""Live forecast service: registered model + current store state -> forecast.

The model is only half the story. A forecast is *honest* when it can answer
three questions at once:

1. What is the expected PM2.5 at each hour (P50) and how uncertain is it
   (P10-P90)?
2. What did the upstream CAMS model say for the same hour, so the user can see
   the correction the local model applied?
3. Which model version, trained on which window, produced this number?

Every response carries all three. When no trained model covers a city (a newly
geocoded district, for example) the service degrades to labelled CAMS output
rather than inventing a calibrated one.

Usage::

    from airsight.forecast.service import forecast_city

    fc = forecast_city(store, "korba", hours=72)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence

import h3
import numpy as np
import pandas as pd

from airsight.aqi.cpcb_naqi import band_for_aqi
from airsight.config import DATA
from airsight.grid.surface import load_static_grid
from airsight.models.registry import HORIZONS, add_inference_features, load_active, predict_frame
from airsight.store import Store, to_iso, utcnow

log = logging.getLogger(__name__)

CAMS_SOURCE = "open-meteo-cams"
MODEL_SOURCE = "model"
FIRE_RADIUS_KM = 60.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def forecast_city(
    store: Store,
    city_id: str,
    *,
    hours: int = 72,
    persist: bool = True,
) -> dict[str, Any]:
    """Forecast one city from the freshest stored state."""
    city = store.city(city_id)
    if not city:
        return {"city_id": city_id, "available": False, "detail": "unknown city"}

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    horizon_end = now + timedelta(hours=max(1, min(hours, 120)))

    met_rows = _future_met(store, city_id, now, horizon_end)
    cams_rows = _future_cams(store, city_id, now, horizon_end)
    if not met_rows and not cams_rows:
        return {
            "city_id": city_id,
            "available": False,
            "detail": "no forecast inputs stored — run the ingest first",
        }

    frame = _join_inputs(cams_rows, met_rows, now)
    if frame.empty:
        return {"city_id": city_id, "available": False, "detail": "no overlapping inputs"}

    statics = _static_profile(city)
    fire = _fire_features(store, city, now)
    state = _recent_state(store, city_id, now)

    rows = frame.copy()
    for key, value in {**statics, **fire, **state}.items():
        rows[key] = value
    rows = add_inference_features(rows.rename(columns={"ts": "timestamp"}))

    hourly = _predict_rows(store, rows)
    series = _serialise(city, hourly, now, _history_pm25(store, city_id, now))
    if persist and series:
        _persist(store, city_id, series)

    model_version = series[0]["model_version"] if series else None
    return {
        "city_id": city_id,
        "name": city["name"],
        "available": bool(series),
        "generated_at": utcnow(),
        "origin": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon_h": hours,
        "calibrated": bool(city.get("calibrated")),
        "model_version": model_version,
        "aqi_basis": "cpcb_naqi_pm25_24h_rolling",
        "source": MODEL_SOURCE if model_version and not model_version.startswith("cams") else CAMS_SOURCE,
        "inputs": {
            "measured_pm25": state.get("pm25_lag1"),
            "cams_pm25": state.get("cams_pm25"),
            "fires_nearby_24h": fire.get("fire_count"),
            "met_hours": len(met_rows),
            "cams_hours": len(cams_rows),
            "missing_features": hourly.attrs.get("missing_features") or {},
        },
        "hourly": series,
    }


def forecast_all(store: Store, *, hours: int = 72, city_ids: Sequence[str] | None = None) -> dict[str, Any]:
    cities = store.cities()
    if city_ids:
        wanted = {c.lower() for c in city_ids}
        cities = [c for c in cities if c["id"] in wanted]
    out = []
    for city in cities:
        try:
            out.append(forecast_city(store, city["id"], hours=hours))
        except Exception as exc:  # noqa: BLE001
            log.warning("forecast failed for %s: %s", city["id"], exc)
            out.append({"city_id": city["id"], "available": False, "detail": str(exc)[:200]})
    return {
        "generated_at": utcnow(),
        "horizon_h": hours,
        "n": len(out),
        "cities": out,
    }


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


def _future_met(store: Store, city_id: str, now: datetime, end: datetime) -> list[dict[str, Any]]:
    return [
        row
        for row in store.met(
            city_id,
            since=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            until=end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
    ]


def _future_cams(store: Store, city_id: str, now: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = store.air_forecast(
        city_id,
        since=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        source=CAMS_SOURCE,
    )
    out = []
    for row in rows:
        if row["ts"] > end.strftime("%Y-%m-%dT%H:%M:%SZ"):
            break
        out.append(row)
    return out


def _join_inputs(
    cams_rows: list[dict[str, Any]], met_rows: list[dict[str, Any]], now: datetime
) -> pd.DataFrame:
    now_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    cams = pd.DataFrame(cams_rows)
    met = pd.DataFrame(met_rows)
    if cams.empty and met.empty:
        return pd.DataFrame()
    if cams.empty:
        cams = pd.DataFrame({"ts": met["ts"]})
    if met.empty:
        met = pd.DataFrame({"ts": cams["ts"]})

    cams = cams.rename(
        columns={
            "pm25": "cams_pm25",
            "pm10": "cams_pm10",
            "no2": "cams_no2",
            "so2": "cams_so2",
            "o3": "cams_o3",
            "co": "cams_co",
            "dust": "cams_dust",
        }
    )
    keep_cams = [c for c in cams.columns if c == "ts" or c.startswith("cams_")]
    merged = pd.merge(cams[keep_cams], met, on="ts", how="outer").sort_values("ts")
    merged = merged[merged["ts"] >= now_iso]
    if "cams_dust" not in merged:
        merged["cams_dust"] = np.nan
    merged = merged.rename(
        columns={
            "temperature_2m": "temp_c",
            "relative_humidity_2m": "rh_pct",
            "dew_point_2m": "dew_point_c",
            "wind_speed_10m": "wind_speed",
            "boundary_layer_height": "blh_m",
            "precipitation": "precip_mm",
        }
    )
    return merged.reset_index(drop=True)


def _static_profile(city: dict[str, Any]) -> dict[str, Any]:
    """Static emission/population context for the city centroid cell."""
    statics = load_static_grid(city["id"])
    profile: dict[str, Any] = {}
    if statics:
        cell = h3.latlng_to_cell(float(city["lat"]), float(city["lon"]), 8)
        row = statics.get(cell)
        if row is None:
            # Fall back to the nearest cell centroid in the grid.
            best, best_d = None, 1e9
            for key, candidate in statics.items():
                try:
                    clat, clon = h3.cell_to_latlng(key)
                except Exception:
                    continue
                d = (clat - float(city["lat"])) ** 2 + (clon - float(city["lon"])) ** 2
                if d < best_d:
                    best, best_d = candidate, d
            row = best
        if row:
            profile = {
                "population": row.get("population"),
                "edgar_pm25_total": row.get("edgar_pm25_total"),
                "edgar_share_ind": row.get("edgar_share_ind"),
                "edgar_share_ene": row.get("edgar_share_ene"),
                "edgar_share_ref_trf": row.get("edgar_share_ref_trf"),
                "edgar_share_rco": row.get("edgar_share_rco"),
                "edgar_share_ags": row.get("edgar_share_ags"),
                "edgar_share_awb": row.get("edgar_share_awb"),
                "edgar_share_tro": row.get("edgar_share_tro"),
                "gppd_cap_25km": row.get("gppd_cap_25km"),
                "gppd_nearest_km": row.get("gppd_nearest_km"),
                "road_density_km_km2": row.get("road_density_km_km2"),
            }
    return profile


def _fire_features(store: Store, city: dict[str, Any], now: datetime) -> dict[str, Any]:
    since = (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = store.query(
        "SELECT lat, lon, frp FROM fires WHERE ts >= ?", (since,)
    )
    lat0, lon0 = float(city["lat"]), float(city["lon"])
    count = 0
    frp_total = 0.0
    for row in rows:
        dlat = (float(row["lat"]) - lat0) * 111.0
        dlon = (float(row["lon"]) - lon0) * 111.0 * np.cos(np.radians(lat0))
        if (dlat**2 + dlon**2) ** 0.5 <= FIRE_RADIUS_KM:
            count += 1
            frp_total += float(row["frp"] or 0.0)
    return {"fire_count": count, "fire_frp": round(frp_total, 2)}


def _recent_state(store: Store, city_id: str, now: datetime) -> dict[str, Any]:
    """Latest observed PM2.5 and trailing statistics for lag features."""
    since = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = store.observations(city_id, since=since, limit=2000)
    measured = [r for r in rows if r["source"] in ("cpcb", "openaq") and r.get("pm25") is not None]
    modelled = [r for r in rows if r["source"] == CAMS_SOURCE and r.get("pm25") is not None]
    series = measured or modelled
    series = sorted(series, key=lambda r: r["ts"])
    values = [float(r["pm25"]) for r in series]
    latest = values[-1] if values else None
    features: dict[str, Any] = {
        "pm25_lag1": latest,
        "pm25_lag3": values[-3] if len(values) >= 3 else latest,
        "pm25_lag24": values[-24] if len(values) >= 24 else latest,
        "pm25_roll24_mean": float(np.mean(values[-24:])) if values else None,
        "pm25_roll24_std": float(np.std(values[-24:])) if len(values) >= 6 else None,
    }
    modelled_values = [float(r["pm25"]) for r in sorted(modelled, key=lambda r: r["ts"])]
    if features["pm25_roll24_std"] is None:
        # Too few measured hours yet: fall back to the CAMS series' 24 h spread.
        if len(modelled_values) >= 6:
            features["pm25_roll24_std"] = float(np.std(modelled_values[-24:]))
    features["cams_pm25_latest"] = modelled_values[-1] if modelled_values else None
    return features


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------


def _predict_rows(store: Store, rows: pd.DataFrame) -> pd.DataFrame:
    """Apply the horizon-matched registered model to each target hour."""
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    ts = pd.to_datetime(rows["timestamp"], utc=True)
    lead_h = ((ts - now) / pd.Timedelta(hours=1)).round().astype(int)

    bundles: dict[int, dict[str, Any] | None] = {}
    for horizon in HORIZONS:
        try:
            bundles[horizon] = load_active(horizon, store)
        except Exception as exc:  # noqa: BLE001
            log.warning("could not load model h%s: %s", horizon, exc)
            bundles[horizon] = None

    out = rows.copy()
    out["p10"] = np.nan
    out["p50"] = np.nan
    out["p90"] = np.nan
    out["model_version"] = None

    # Kernel-weighted ensemble of the horizon specialists. Hard bucket edges
    # produced visible 10 µg/m³ cliffs at h=24 and h=48; a Gaussian kernel over
    # lead time blends the neighbours smoothly while still favouring the model
    # trained for that exact horizon.
    accum = {"p10": np.zeros(len(out)), "p50": np.zeros(len(out)), "p90": np.zeros(len(out))}
    weight_sum = np.zeros(len(out))
    versions: set[str] = set()
    missing_by_model: dict[str, list[str]] = {}
    lead = lead_h.to_numpy(dtype=float)

    for horizon, bundle in bundles.items():
        if bundle is None:
            continue
        try:
            preds = predict_frame(bundle, out)
        except Exception as exc:  # noqa: BLE001 - fall back to CAMS for this horizon
            log.warning("model h%s skipped: %s", horizon, exc)
            missing_by_model[str(bundle.get("version"))] = ["<too many missing>"]
            continue
        if preds.attrs.get("missing_features"):
            missing_by_model[str(bundle.get("version"))] = list(preds.attrs["missing_features"])
        weights = np.exp(-(((lead - horizon) / 14.0) ** 2))
        # Below the first horizon the kernel is flat rather than fading out.
        weights = np.where(lead < HORIZONS[0], 1.0 if horizon == HORIZONS[0] else weights, weights)
        for key in accum:
            accum[key] += weights * preds[key].to_numpy()
        weight_sum += weights
        versions.add(str(bundle["version"]))

    covered = weight_sum > 1e-9
    for key in accum:
        out.loc[covered, key] = (accum[key][covered] / weight_sum[covered])
    label = ",".join(sorted(versions)) + "+kernel" if versions else None
    out.loc[covered, "model_version"] = label

    # Anything the registry does not cover stays on the CAMS baseline.
    missing = out["p50"].isna() & out["cams_pm25"].notna()
    out.loc[missing, "p50"] = out.loc[missing, "cams_pm25"]
    out.loc[missing, "p10"] = out.loc[missing, "cams_pm25"] * 0.7
    out.loc[missing, "p90"] = out.loc[missing, "cams_pm25"] * 1.4
    out.loc[missing, "model_version"] = "cams-direct"

    out = out[out["p50"].notna()]
    out["p50"] = out["p50"].clip(lower=0.0)
    out["p10"] = out["p10"].clip(lower=0.0)
    out["p90"] = out["p90"].clip(lower=out["p50"])
    out.attrs["missing_features"] = missing_by_model
    return out


def _serialise(
    city: dict[str, Any],
    df: pd.DataFrame,
    now: datetime,
    history_pm25: list[float | None] | None = None,
) -> list[dict[str, Any]]:
    """Forecast rows. ``aqi`` is the CPCB PM2.5 sub-index of the *24h rolling
    mean* (observed history + forecast), not of a single hour."""
    from airsight.aqi.cpcb_naqi import rolling_pm25_aqi

    history = list(history_pm25 or [])[-23:]
    p50s = [float(v) for v in df["p50"].tolist()] if len(df) else []
    rolled = rolling_pm25_aqi(history + p50s)[len(history):]
    series: list[dict[str, Any]] = []
    for i, row in enumerate(df.itertuples(index=False)):
        p50 = float(getattr(row, "p50"))
        aqi = rolled[i] if i < len(rolled) else None
        series.append(
            {
                "ts": getattr(row, "timestamp").strftime("%Y-%m-%dT%H:%M:%SZ")
                if hasattr(getattr(row, "timestamp"), "strftime")
                else str(getattr(row, "timestamp")),
                "pm25": round(p50, 1),
                "p10": round(float(getattr(row, "p10")), 1),
                "p90": round(float(getattr(row, "p90")), 1),
                "cams_pm25": _maybe_float(getattr(row, "cams_pm25")),
                "aqi": aqi,
                "band": band_for_aqi(aqi),
                "model_version": getattr(row, "model_version"),
            }
        )
    return series


def _persist(store: Store, city_id: str, series: list[dict[str, Any]]) -> None:
    now_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
    rows = [
        {
            "city_id": city_id,
            "run_ts": now_hour,
            "ts": item["ts"],
            "pm25": item["pm25"],
            "p10": item["p10"],
            "p90": item["p90"],
            "aqi": item["aqi"],
            "model_version": item["model_version"],
            "source": MODEL_SOURCE,
        }
        for item in series
    ]
    store.upsert_air_forecast(rows)


def _history_pm25(store: Store, city_id: str, now: datetime) -> list[float | None]:
    """Last 23 observed hourly PM2.5 values (gap-aware) to seed the 24h window."""
    from airsight.aqi.cpcb_naqi import hourly_grid

    since = (now - timedelta(hours=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = store.observations(city_id, since=since, limit=2000)
    measured = [r for r in rows if r.get("source") in ("cpcb", "openaq") and r.get("pm25") is not None]
    rows = measured or [r for r in rows if r.get("pm25") is not None]
    if not rows:
        return []
    sid = max(rows, key=lambda r: r["ts"])["station_id"]
    _, grid = hourly_grid([r for r in rows if r["station_id"] == sid], pollutants=("pm25",), hours=23)
    return grid["pm25"]


def _maybe_float(value: Any) -> float | None:
    try:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return None
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None
