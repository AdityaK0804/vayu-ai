"""CPCB National Air Quality Index (NAQI) — 8 sub-indexes.

Breakpoints follow CPCB National AQI (2014) linear segments.
Overall AQI = max(sub-indexes) among available pollutants.
Units:
  PM2.5, PM10, NO2, SO2, O3, NH3 → µg/m³
  CO → mg/m³
  Pb → µg/m³
"""

from __future__ import annotations

from typing import Any, Iterable

# (C_lo, C_hi, I_lo, I_hi)
Breakpoint = tuple[float, float, float, float]

# CPCB 2014 tables
BP: dict[str, list[Breakpoint]] = {
    "pm25": [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500),
    ],
    "pm10": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 250, 101, 200),
        (250, 350, 201, 300),
        (350, 430, 301, 400),
        (430, 600, 401, 500),
    ],
    "no2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 180, 101, 200),
        (180, 280, 201, 300),
        (280, 400, 301, 400),
        (400, 1000, 401, 500),
    ],
    "so2": [
        (0, 40, 0, 50),
        (40, 80, 51, 100),
        (80, 380, 101, 200),
        (380, 800, 201, 300),
        (800, 1600, 301, 400),
        (1600, 2000, 401, 500),
    ],
    "co": [  # mg/m³
        (0, 1.0, 0, 50),
        (1.0, 2.0, 51, 100),
        (2.0, 10.0, 101, 200),
        (10.0, 17.0, 201, 300),
        (17.0, 34.0, 301, 400),
        (34.0, 50.0, 401, 500),
    ],
    "o3": [
        (0, 50, 0, 50),
        (50, 100, 51, 100),
        (100, 168, 101, 200),
        (168, 208, 201, 300),
        (208, 748, 301, 400),
        (748, 1000, 401, 500),
    ],
    "nh3": [
        (0, 200, 0, 50),
        (200, 400, 51, 100),
        (400, 800, 101, 200),
        (800, 1200, 201, 300),
        (1200, 1800, 301, 400),
        (1800, 2400, 401, 500),
    ],
    "pb": [
        (0, 0.5, 0, 50),
        (0.5, 1.0, 51, 100),
        (1.0, 2.0, 101, 200),
        (2.0, 3.0, 201, 300),
        (3.0, 3.5, 301, 400),
        (3.5, 5.0, 401, 500),
    ],
}

POLLUTANT_UNITS: dict[str, str] = {
    "pm25": "µg/m³",
    "pm10": "µg/m³",
    "no2": "µg/m³",
    "so2": "µg/m³",
    "o3": "µg/m³",
    "nh3": "µg/m³",
    "pb": "µg/m³",
    "co": "mg/m³",
}

BANDS: list[tuple[float, float, str, str]] = [
    (0, 50, "Good", "अच्छा"),
    (51, 100, "Satisfactory", "संतोषजनक"),
    (101, 200, "Moderate", "मध्यम"),
    (201, 300, "Poor", "खराब"),
    (301, 400, "Very Poor", "बहुत खराब"),
    (401, 500, "Severe", "गंभीर"),
]

# Field aliases from various feeds
ALIASES: dict[str, tuple[str, ...]] = {
    "pm25": ("pm25", "pm2_5", "pm2.5"),
    "pm10": ("pm10",),
    "no2": ("no2", "nitrogen_dioxide"),
    "so2": ("so2", "sulphur_dioxide", "sulfur_dioxide"),
    "co": ("co", "carbon_monoxide"),
    "o3": ("o3", "ozone"),
    "nh3": ("nh3", "ammonia"),
    "pb": ("pb", "lead"),
}


def band_for_aqi(aqi: float | None) -> dict[str, Any]:
    if aqi is None:
        return {"code": "unknown", "label_en": "Unknown", "label_hi": "अज्ञात", "aqi": None}
    v = max(0.0, min(500.0, float(aqi)))
    for lo, hi, en, hi_lbl in BANDS:
        if lo <= v <= hi or (hi == 500 and v >= lo):
            return {"code": en.lower().replace(" ", "_"), "label_en": en, "label_hi": hi_lbl, "aqi": round(v)}
    return {"code": "severe", "label_en": "Severe", "label_hi": "गंभीर", "aqi": round(v)}


def sub_index(pollutant: str, concentration: float | None) -> float | None:
    if concentration is None:
        return None
    try:
        c = float(concentration)
    except (TypeError, ValueError):
        return None
    if c < 0 or pollutant not in BP:
        return None
    table = BP[pollutant]
    # clamp above last
    if c >= table[-1][1]:
        c_lo, c_hi, i_lo, i_hi = table[-1]
        if c_hi == c_lo:
            return float(i_hi)
        # extrapolate within last segment, cap 500
        frac = min(1.0, (c - c_lo) / (c_hi - c_lo))
        return min(500.0, i_lo + (i_hi - i_lo) * frac)
    for c_lo, c_hi, i_lo, i_hi in table:
        if c_lo <= c <= c_hi or (c_lo == 0 and c <= c_hi):
            if c_hi == c_lo:
                return float(i_hi)
            # CPCB formula: I = ((I_hi - I_lo)/(C_hi - C_lo)) * (C - C_lo) + I_lo
            return ((i_hi - i_lo) / (c_hi - c_lo)) * (c - c_lo) + i_lo
    return None


def _pick(raw: dict[str, Any], keys: Iterable[str]) -> float | None:
    for k in keys:
        if k in raw and raw[k] is not None and raw[k] != "":
            try:
                return float(raw[k])
            except (TypeError, ValueError):
                continue
    return None


def extract_concentrations(raw: dict[str, Any]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for pol, keys in ALIASES.items():
        out[pol] = _pick(raw, keys)
    # CO sometimes comes as µg/m³ from OpenAQ — if value looks huge, convert
    co = out.get("co")
    if co is not None and co > 50:  # clearly µg/m³ scale
        out["co"] = co / 1000.0
    return out


def compute_naqi(raw: dict[str, Any]) -> dict[str, Any]:
    """Return full NAQI package for a station-like dict."""
    conc = extract_concentrations(raw)
    sub: dict[str, Any] = {}
    for pol, val in conc.items():
        idx = sub_index(pol, val)
        if idx is None and val is None:
            continue
        sub[pol] = {
            "value": None if val is None else round(val, 3),
            "unit": POLLUTANT_UNITS[pol],
            "sub_index": None if idx is None else round(idx, 1),
            "band": band_for_aqi(idx) if idx is not None else None,
        }

    valid = [(p, s["sub_index"]) for p, s in sub.items() if s.get("sub_index") is not None]
    if not valid:
        overall = None
        dominant = None
    else:
        dominant, overall = max(valid, key=lambda x: x[1])
        overall = float(overall)

    band = band_for_aqi(overall)
    return {
        "aqi": None if overall is None else round(overall),
        "aqi_basis": "cpcb_naqi",
        "band": band,
        "dominant_pollutant": dominant,
        "sub_indexes": sub,
        "pollutants": {
            p: {"value": c, "unit": POLLUTANT_UNITS[p]}
            for p, c in conc.items()
            if c is not None
        },
        "units_note": "µg/m³ except CO (mg/m³); AQI is unitless CPCB NAQI 0–500",
    }


def enrich_station_row(row: dict[str, Any]) -> dict[str, Any]:
    """Attach multi-pollutant NAQI fields onto a live station dict (copy)."""
    out = dict(row)
    naqi = compute_naqi(out)
    out["naqi"] = naqi
    if naqi["aqi"] is not None:
        out["aqi"] = naqi["aqi"]
        out["aqi_basis"] = "cpcb"
        out["aqi_band"] = naqi["band"]["label_en"]
        out["aqi_band_hi"] = naqi["band"]["label_hi"]
        out["dominant_pollutant"] = naqi["dominant_pollutant"]
    # promote pollutant values for API consumers
    for p, meta in (naqi.get("pollutants") or {}).items():
        if out.get(p) is None and meta.get("value") is not None:
            out[p] = meta["value"]
    return out
