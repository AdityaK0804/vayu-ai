"""H3 feature expansion v2 — AOD/NO2/FRP/PBLH/wind/humidity/pop/land-use ready.

Used by training jobs; works on plain dict rows or DataFrames.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

import numpy as np
import pandas as pd


log = logging.getLogger(__name__)


class EmptyFeatureError(ValueError):
    """Raised when required features are entirely missing (DATA-01)."""


FEATURE_V2_COLS: list[str] = [
    "pm25_lag1",
    "pm25_lag24",
    "temp_2m",
    "rh_2m",
    "wind_u",
    "wind_v",
    "wind_speed",
    "precip",
    "pblh",
    "frp_hex_24h",
    "no2_column",
    "aod550",
    "dust",
    "pop_density",
    "landuse_urban_frac",
    "landuse_industry_frac",
    "landuse_veg_frac",
    "hour_sin",
    "hour_cos",
    "doy_sin",
    "doy_cos",
]


def wind_uv(speed: float, direction_deg: float) -> tuple[float, float]:
    """Met direction (from) → u east, v north."""
    rad = np.deg2rad(direction_deg + 180.0)
    return float(speed * np.sin(rad)), float(speed * np.cos(rad))


def cyclic_time(ts: pd.Timestamp | Any) -> dict[str, float]:
    t = pd.Timestamp(ts)
    hour = t.hour + t.minute / 60.0
    doy = float(t.dayofyear)
    return {
        "hour_sin": float(np.sin(2 * np.pi * hour / 24.0)),
        "hour_cos": float(np.cos(2 * np.pi * hour / 24.0)),
        "doy_sin": float(np.sin(2 * np.pi * doy / 365.25)),
        "doy_cos": float(np.cos(2 * np.pi * doy / 365.25)),
    }


def build_feature_row(raw: dict[str, Any]) -> dict[str, float]:
    """Normalize a heterogeneous raw dict into FEATURE_V2_COLS (missing → nan)."""
    out: dict[str, float] = {c: float("nan") for c in FEATURE_V2_COLS}

    def take(*keys: str) -> float | None:
        for k in keys:
            if k in raw and raw[k] is not None and raw[k] != "":
                try:
                    return float(raw[k])
                except Exception:
                    continue
        return None

    mapping = {
        "pm25_lag1": ("pm25_lag1", "pm25", "pm2_5"),
        "pm25_lag24": ("pm25_lag24",),
        "temp_2m": ("temp_2m", "temperature_2m", "temp", "temp_c", "temp_c_now", "temp_c_t"),
        "rh_2m": ("rh_2m", "relative_humidity_2m", "humidity", "rh_pct", "rh_pct_now", "rh_pct_t"),
        "precip": ("precip", "precipitation", "precip_mm", "precip_mm_now", "precip_mm_t"),
        "pblh": ("pblh", "boundary_layer_height", "blh_m", "blh_m_now", "blh_m_t"),
        "frp_hex_24h": ("frp_hex_24h", "frp", "frp_sum", "fire_frp"),
        "no2_column": ("no2_column", "no2", "nitrogen_dioxide", "cams_no2", "sat_no2"),
        "aod550": ("aod550", "aod", "cams_aod", "sat_aod"),
        "dust": ("dust", "cams_dust"),
        "pop_density": ("pop_density", "population_density", "worldpop", "population"),
        "landuse_urban_frac": ("landuse_urban_frac", "urban_frac", "edgar_share_tro"),
        "landuse_industry_frac": ("landuse_industry_frac", "industry_frac", "edgar_share_ind"),
        "landuse_veg_frac": ("landuse_veg_frac", "veg_frac", "edgar_share_ags"),
    }
    for col, keys in mapping.items():
        v = take(*keys)
        if v is not None:
            out[col] = v

    spd = take("wind_speed_10m", "wind_speed", "wind_speed_ms")
    direction = take("wind_direction_10m", "wind_direction", "wind_dir")
    if spd is not None and direction is not None:
        u, v = wind_uv(spd, direction)
        out["wind_u"], out["wind_v"], out["wind_speed"] = u, v, spd
    else:
        u = take("wind_u")
        v = take("wind_v")
        if u is not None:
            out["wind_u"] = u
        if v is not None:
            out["wind_v"] = v
        if spd is not None:
            out["wind_speed"] = spd

    if "timestamp" in raw or "ts" in raw:
        out.update(cyclic_time(raw.get("timestamp") or raw.get("ts")))

    return out


# Time features are always derivable; everything else must come from the data.
_DATA_COLS = [c for c in FEATURE_V2_COLS if c not in {"hour_sin", "hour_cos", "doy_sin", "doy_cos"}]


def empty_feature_columns(df: pd.DataFrame, cols: list[str] | None = None) -> list[str]:
    """Columns that are entirely NaN/absent - the DATA-01 failure signature."""
    use = cols or _DATA_COLS
    x = df.reindex(columns=use)
    return [c for c in use if x[c].isna().all()]


def build_feature_frame(rows: Iterable[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame([build_feature_row(r) for r in rows], columns=FEATURE_V2_COLS)
    empty = empty_feature_columns(df) if len(df) else []
    if empty:
        # Never silent: an unmapped column name shows up here, not as a quiet
        # accuracy drop after zero-imputation.
        log.warning("features_v2: %d feature(s) entirely empty: %s", len(empty), ", ".join(empty))
    return df


def feature_matrix(
    df: pd.DataFrame,
    cols: list[str] | None = None,
    *,
    required: Iterable[str] | None = None,
    max_empty_share: float = 0.5,
) -> np.ndarray:
    """Model matrix. Raises :class:`EmptyFeatureError` instead of silently
    zero-filling when a required feature, or more than ``max_empty_share`` of
    the data features, is entirely missing."""
    use = cols or FEATURE_V2_COLS
    data_cols = [c for c in use if c in _DATA_COLS]
    empty = empty_feature_columns(df, data_cols) if data_cols else []
    missing_required = [c for c in (required or []) if c in empty]
    if missing_required:
        raise EmptyFeatureError(f"required features entirely empty: {missing_required}")
    if data_cols and len(df) and len(empty) / len(data_cols) > max_empty_share:
        raise EmptyFeatureError(
            f"{len(empty)}/{len(data_cols)} features entirely empty: {empty}"
        )
    if empty:
        log.warning("feature_matrix: zero-filling empty features %s", empty)
    x = df.reindex(columns=use).astype(float)
    return np.nan_to_num(x.to_numpy(), nan=0.0, posinf=0.0, neginf=0.0)
