"""External live data sources (httpx). Failures never raise out of fetch_* wrappers."""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from services.ingestor.config import Settings, get_settings
from services.ingestor.models import CamsPointIn, FireEventIn, MeteoPointIn, StationReadingIn

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _client(settings: Settings) -> httpx.Client:
    return httpx.Client(timeout=settings.http_timeout_s, follow_redirects=True)


def _nearest_city(lat: float, lon: float, settings: Settings) -> str | None:
    best, best_d = None, 1e18
    for cid, clat, clon in settings.seed_cities:
        d = (lat - clat) ** 2 + (lon - clon) ** 2
        if d < best_d:
            best, best_d = cid, d
    return best


def _h3_cell(lat: float, lon: float, res: int = 7) -> str | None:
    try:
        import h3

        try:
            return h3.latlng_to_cell(lat, lon, res)
        except AttributeError:
            return h3.geo_to_h3(lat, lon, res)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# OpenAQ / CPCB-like stations
# ---------------------------------------------------------------------------


def fetch_openaq_stations(settings: Settings | None = None) -> tuple[list[StationReadingIn], str]:
    """Pull recent PM measurements in the CG bbox. Degrades to CAMS-proxy cities on failure."""
    cfg = settings or get_settings()
    headers = {"Accept": "application/json"}
    if cfg.openaq_api_key:
        headers["X-API-Key"] = cfg.openaq_api_key

    urls = [
        f"{cfg.openaq_base}/v3/locations?coordinates=21.25,81.63&radius=250000&limit=100",
        f"{cfg.openaq_base}/v2/latest?coordinates=21.25,81.63&radius=250000&limit=100",
    ]
    detail = ""
    with _client(cfg) as client:
        for url in urls:
            try:
                r = client.get(url, headers=headers)
                if r.status_code >= 400:
                    detail = f"HTTP {r.status_code} on {url}"
                    continue
                data = r.json()
                parsed = _parse_openaq_payload(data, cfg)
                if parsed:
                    return parsed, f"ok via {url} n={len(parsed)}"
                detail = f"empty parse for {url}"
            except Exception as exc:
                detail = f"{url}: {exc}"
                log.warning("openaq fetch failed: %s", exc)

    # Fallback: Open-Meteo AQ as city stations (multi-pollutant)
    cams_rows, cams_detail = fetch_cams_proxy(cfg)
    fallback = [
        StationReadingIn(
            ts=r.ts,
            station_id=f"om-aq:{r.city_id}",
            city_id=r.city_id,
            source="open-meteo-aq",
            pm25=r.pm25,
            pm10=r.pm10,
            no2=r.no2,
            so2=r.so2,
            o3=r.o3,
            co=r.co,
            lat=r.lat,
            lon=r.lon,
            aqi_basis="cpcb",
        )
        for r in cams_rows
        if r.pm25 is not None or r.pm10 is not None or r.no2 is not None
    ]
    if fallback:
        return fallback, f"degraded openaq={detail}; fallback {cams_detail}"
    return [], detail or "no station data"


def _parse_openaq_payload(data: Any, settings: Settings) -> list[StationReadingIn]:
    out: list[StationReadingIn] = []
    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return out

    for item in results:
        if not isinstance(item, dict):
            continue
        # v2 latest shape — multi-pollutant measurements
        if "measurements" in item:
            loc = str(item.get("location") or item.get("locationId") or "unknown")
            coords = item.get("coordinates") or {}
            lat = coords.get("latitude")
            lon = coords.get("longitude")
            city = item.get("city") or (_nearest_city(float(lat), float(lon), settings) if lat and lon else None)
            vals: dict[str, float | None] = {
                "pm25": None,
                "pm10": None,
                "no2": None,
                "so2": None,
                "o3": None,
                "co": None,
            }
            ts = _now()
            for m in item.get("measurements") or []:
                param = str(m.get("parameter") or "").lower().replace(" ", "")
                val = m.get("value")
                if val is None:
                    continue
                try:
                    fval = float(val)
                except (TypeError, ValueError):
                    continue
                unit = str(m.get("unit") or "").lower()
                if param in {"pm25", "pm2.5"}:
                    vals["pm25"] = fval
                elif param == "pm10":
                    vals["pm10"] = fval
                elif param in {"no2", "nitrogendioxide"}:
                    vals["no2"] = fval
                elif param in {"so2", "sulphurdioxide", "sulfurdioxide"}:
                    vals["so2"] = fval
                elif param in {"o3", "ozone"}:
                    vals["o3"] = fval
                elif param in {"co", "carbonmonoxide"}:
                    # OpenAQ often µg/m³; CPCB NAQI wants mg/m³
                    vals["co"] = fval / 1000.0 if ("µg" in unit or "ug" in unit or fval > 50) else fval
                if m.get("lastUpdated"):
                    try:
                        ts = datetime.fromisoformat(str(m["lastUpdated"]).replace("Z", "+00:00"))
                    except Exception:
                        pass
            if vals["pm25"] is None and vals["pm10"] is None and vals["no2"] is None:
                continue
            out.append(
                StationReadingIn(
                    ts=ts,
                    station_id=f"openaq:{loc}",
                    city_id=str(city).lower().replace(" ", "_") if city else None,
                    source="openaq",
                    pm25=vals["pm25"],
                    pm10=vals["pm10"],
                    no2=vals["no2"],
                    so2=vals["so2"],
                    o3=vals["o3"],
                    co=vals["co"],
                    aqi_basis="cpcb",
                    lat=float(lat) if lat is not None else None,
                    lon=float(lon) if lon is not None else None,
                )
            )
            continue

        # v3 locations (sensors nested)
        name = str(item.get("name") or item.get("id") or "loc")
        sid = f"openaq:{item.get('id', name)}"
        coords = item.get("coordinates") or {}
        lat = coords.get("latitude")
        lon = coords.get("longitude")
        sensors = item.get("sensors") or []
        vals = {"pm25": None, "pm10": None, "no2": None, "so2": None, "o3": None, "co": None}
        ts = _now()
        for s in sensors:
            p = str((s.get("parameter") or {}).get("name") or s.get("parameter") or "").lower()
            latest = s.get("latest") or {}
            if latest.get("value") is None:
                continue
            try:
                fval = float(latest["value"])
            except (TypeError, ValueError):
                continue
            if "pm25" in p or "pm2.5" in p:
                vals["pm25"] = fval
            elif "pm10" in p:
                vals["pm10"] = fval
            elif "no2" in p:
                vals["no2"] = fval
            elif "so2" in p:
                vals["so2"] = fval
            elif p in {"o3", "ozone"} or "ozone" in p:
                vals["o3"] = fval
            elif p == "co" or "carbon" in p:
                vals["co"] = fval / 1000.0 if fval > 50 else fval
            if latest.get("datetime"):
                try:
                    ts = datetime.fromisoformat(str(latest["datetime"]).replace("Z", "+00:00"))
                except Exception:
                    pass
        if all(v is None for v in vals.values()):
            continue
        out.append(
            StationReadingIn(
                ts=ts,
                station_id=sid,
                city_id=_nearest_city(float(lat), float(lon), settings) if lat and lon else None,
                source="openaq",
                pm25=vals["pm25"],
                pm10=vals["pm10"],
                no2=vals["no2"],
                so2=vals["so2"],
                o3=vals["o3"],
                co=vals["co"],
                aqi_basis="cpcb",
                lat=float(lat) if lat is not None else None,
                lon=float(lon) if lon is not None else None,
            )
        )
    return out


# ---------------------------------------------------------------------------
# Open-Meteo weather
# ---------------------------------------------------------------------------


def fetch_open_meteo(settings: Settings | None = None) -> tuple[list[MeteoPointIn], str]:
    cfg = settings or get_settings()
    out: list[MeteoPointIn] = []
    errors: list[str] = []
    with _client(cfg) as client:
        for city_id, lat, lon in cfg.seed_cities:
            url = (
                f"{cfg.open_meteo_base}/v1/forecast"
                f"?latitude={lat}&longitude={lon}"
                f"&current=temperature_2m,relative_humidity_2m,wind_speed_10m,"
                f"wind_direction_10m,precipitation"
                f"&hourly=boundary_layer_height&forecast_days=1&timezone=UTC"
            )
            try:
                r = client.get(url)
                r.raise_for_status()
                j = r.json()
                cur = j.get("current") or {}
                blh = None
                hourly = j.get("hourly") or {}
                blh_series = hourly.get("boundary_layer_height") or []
                hourly_times = hourly.get("time") or []
                cur_time = cur.get("time")

                if cur_time and cur_time in hourly_times:
                    idx = hourly_times.index(cur_time)
                    if idx < len(blh_series):
                        blh = blh_series[idx]
                elif blh_series:
                    blh = blh_series[0]
                ts_raw = cur.get("time") or _now().isoformat()
                try:
                    ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                except Exception:
                    ts = _now()
                out.append(
                    MeteoPointIn(
                        ts=ts,
                        city_id=city_id,
                        lat=lat,
                        lon=lon,
                        temperature_2m=_f(cur.get("temperature_2m")),
                        relative_humidity_2m=_f(cur.get("relative_humidity_2m")),
                        wind_speed_10m=_f(cur.get("wind_speed_10m")),
                        wind_direction_10m=_f(cur.get("wind_direction_10m")),
                        precipitation=_f(cur.get("precipitation")),
                        boundary_layer_height=_f(blh),
                    )
                )
            except Exception as exc:
                errors.append(f"{city_id}:{exc}")
                log.warning("open-meteo %s failed: %s", city_id, exc)
    status = "ok" if out and not errors else ("degraded" if out else "error")
    return out, f"{status} n={len(out)} err={len(errors)}"


# ---------------------------------------------------------------------------
# FIRMS fires
# ---------------------------------------------------------------------------


def fetch_firms_fires(settings: Settings | None = None) -> tuple[list[FireEventIn], str]:
    """Pull active fires for CG. Degrades to local sample CSV if no key or API error."""
    cfg = settings or get_settings()
    if not cfg.nasa_firms_map_key:
        rows, detail = _firms_from_local_csv(cfg)
        return rows, f"no_key; {detail}"

    url = (
        f"{cfg.nasa_firms_base}/api/area/csv/"
        f"{cfg.nasa_firms_map_key}/VIIRS_SNPP_NRT/"
        f"{cfg.cg_bbox_firms}/1"
    )
    try:
        r = httpx.get(url, timeout=30.0)
        if r.status_code == 403 or "Invalid MAP_KEY" in r.text:
            rows, detail = _firms_from_local_csv(cfg)
            return rows, f"invalid_key; {detail}"
        r.raise_for_status()
        rows = _parse_firms_csv(r.text, cfg, max_rows=500)
        return rows, f"live n={len(rows)}"
    except Exception as exc:
        log.warning("FIRMS API call failed: %s; falling back to local CSV", exc)
        rows, detail = _firms_from_local_csv(cfg)
        return rows, f"degraded api={exc}; {detail}"


def _firms_from_local_csv(settings: Settings) -> tuple[list[FireEventIn], str]:
    from pathlib import Path
    import pandas as pd

    path = Path(__file__).resolve().parents[2] / "data" / "fire" / "firms_chhattisgarh.csv"
    if not path.exists():
        return [], "no FIRMS key and no local CSV"
    try:
        df = pd.read_csv(path, low_memory=False)
        date_col = "acq_date" if "acq_date" in df.columns else ("acq_datetime" if "acq_datetime" in df.columns else None)
        if date_col:
            df_recent = df.sort_values(date_col, ascending=False).head(200)
        else:
            df_recent = df.tail(200)
        csv_text = df_recent.to_csv(index=False)
        rows = _parse_firms_csv(csv_text, settings, max_rows=200)
        return rows, f"local csv tail n={len(rows)}"
    except Exception as exc:
        return [], f"local csv error: {exc}"


def _parse_firms_csv(text: str, settings: Settings, max_rows: int = 500) -> list[FireEventIn]:
    out: list[FireEventIn] = []
    reader = csv.DictReader(io.StringIO(text))
    for i, row in enumerate(reader):
        if i >= max_rows:
            break
        try:
            lat = float(row.get("latitude") or row.get("lat"))
            lon = float(row.get("longitude") or row.get("lon"))
            frp = _f(row.get("frp"))
            conf = _f(row.get("confidence"))
            acq_date = row.get("acq_date") or row.get("acq_datetime") or ""
            acq_time = row.get("acq_time") or "0000"
            ts = _parse_firms_ts(str(acq_date), str(acq_time))
            out.append(
                FireEventIn(
                    ts=ts,
                    lat=lat,
                    lon=lon,
                    frp=frp,
                    confidence=conf,
                    bright_ti4=_f(row.get("bright_ti4")),
                    source="firms",
                    h3_cell=_h3_cell(lat, lon),
                    city_id=_nearest_city(lat, lon, settings),
                    raw={k: row[k] for k in row if k},
                )
            )
        except Exception:
            continue
    return out


def _parse_firms_ts(acq_date: str, acq_time: str) -> datetime:
    acq_time = acq_time.zfill(4)
    try:
        if "T" in acq_date:
            return datetime.fromisoformat(acq_date.replace("Z", "+00:00"))
        y, m, d = acq_date[:10].split("-")
        hh, mm = int(acq_time[:2]), int(acq_time[2:4])
        return datetime(int(y), int(m), int(d), hh, mm, tzinfo=timezone.utc)
    except Exception:
        return _now()


# ---------------------------------------------------------------------------
# CAMS / S5P proxy via Open-Meteo Air Quality (daily cadence)
# ---------------------------------------------------------------------------


def fetch_cams_proxy(settings: Settings | None = None) -> tuple[list[CamsPointIn], str]:
    cfg = settings or get_settings()
    out: list[CamsPointIn] = []
    errors = 0
    with _client(cfg) as client:
        for city_id, lat, lon in cfg.seed_cities:
            url = (
                f"{cfg.open_meteo_air_quality_base}/v1/air-quality"
                f"?latitude={lat}&longitude={lon}"
                f"&current=pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide,dust"
                f"&timezone=UTC"
            )
            try:
                r = client.get(url)
                r.raise_for_status()
                cur = (r.json() or {}).get("current") or {}
                ts_raw = cur.get("time") or _now().isoformat()
                try:
                    ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
                except Exception:
                    ts = _now()
                co = _f(cur.get("carbon_monoxide"))
                # Open-Meteo CO is µg/m³ → mg/m³ for CPCB
                if co is not None:
                    co = co / 1000.0
                out.append(
                    CamsPointIn(
                        ts=ts,
                        city_id=city_id,
                        lat=lat,
                        lon=lon,
                        pm25=_f(cur.get("pm2_5")),
                        pm10=_f(cur.get("pm10")),
                        no2=_f(cur.get("nitrogen_dioxide")),
                        so2=_f(cur.get("sulphur_dioxide")),
                        o3=_f(cur.get("ozone")),
                        co=co,
                        dust=_f(cur.get("dust")),
                    )
                )
            except Exception as exc:
                errors += 1
                log.warning("cams proxy %s failed: %s", city_id, exc)
    return out, f"n={len(out)} errors={errors}"


def _f(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except Exception:
        return None
