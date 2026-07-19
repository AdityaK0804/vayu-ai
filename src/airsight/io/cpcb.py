"""CPCB CAAQMS hourly data loader.

Reads raw CPCB CSVs from ``data/cpcb/<city_id>/`` and normalises them into
a tidy DataFrame with consistent column names.

**Timestamp convention**: All timestamps are returned as **tz-naive** in
**Asia/Kolkata (IST)**.  The raw files already contain IST timestamps
without timezone info; we parse them as-is and document this choice so
downstream code knows the convention.

**Column naming scheme**:

* Core pollutants (always present, coerced to float):
  ``pm25``, ``pm10``, ``no2``, ``so2``, ``co``, ``o3``
* Secondary pollutants kept with cleaned names:
  ``no``, ``nox``, ``nh3``, ``benzene``, ``toluene``, ``xylene``,
  ``o_xylene``, ``eth_benzene``, ``mp_xylene``
* Meteorological columns kept with cleaned names:
  ``at_degc``, ``rh_pct``, ``ws_ms``, ``wd_deg``, ``rf_mm``,
  ``tot_rf_mm``, ``sr_wm2``, ``bp_mmhg``, ``vws_ms``
* Metadata columns attached from ``stations.csv``:
  ``station_id``, ``city_id``, ``latitude``, ``longitude``
"""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from airsight.config import DATA
from airsight.io.stations import load_stations

# ---------------------------------------------------------------------------
# Header normalisation map
# ---------------------------------------------------------------------------

# Map raw CPCB column name prefixes (lowered, unit-stripped) → clean name.
# Order matters: first match wins.
_COLUMN_MAP: dict[str, str] = {
    "timestamp": "timestamp",
    "pm2.5":     "pm25",
    "pm10":      "pm10",
    "nox":       "nox",
    "no2":       "no2",
    "no":        "no",          # must come after nox / no2
    "nh3":       "nh3",
    "so2":       "so2",
    "co":        "co",
    "ozone":     "o3",
    "benzene":   "benzene",
    "toluene":   "toluene",
    "o xylene":  "o_xylene",
    "xylene":    "xylene",
    "eth-benzene":"eth_benzene",
    "mp-xylene": "mp_xylene",
    "at":        "at_degc",
    "rh":        "rh_pct",
    "ws":        "ws_ms",
    "wd":        "wd_deg",
    "rf":        "rf_mm",
    "tot-rf":    "tot_rf_mm",
    "sr":        "sr_wm2",
    "bp":        "bp_mmhg",
    "vws":       "vws_ms",
}

# Columns that must be coerced to numeric (invalid → NaN).
_NUMERIC_COLS = [
    "pm25", "pm10", "no", "no2", "nox", "nh3", "so2", "co", "o3",
    "benzene", "toluene", "xylene", "o_xylene", "eth_benzene", "mp_xylene",
    "at_degc", "rh_pct", "ws_ms", "wd_deg", "rf_mm", "tot_rf_mm",
    "sr_wm2", "bp_mmhg", "vws_ms",
]


def _clean_column_name(raw: str) -> str:
    """Normalise a raw CPCB column header to a clean snake_case name.

    Strategy: lowercase, strip the unit suffix (anything in parentheses),
    strip whitespace, then match against ``_COLUMN_MAP``.
    """
    cleaned = raw.strip().lower()
    # Remove unit suffixes like "(µg/m³)" or "(°C)"
    cleaned = re.sub(r"\s*\(.*?\)\s*", "", cleaned).strip()
    # Exact lookup
    if cleaned in _COLUMN_MAP:
        return _COLUMN_MAP[cleaned]
    # Fallback: slugify
    return re.sub(r"[^a-z0-9]+", "_", cleaned).strip("_")


def _read_single_csv(path: Path) -> pd.DataFrame:
    """Read one CPCB CSV with encoding fallback and column normalisation."""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(path, encoding=enc, dtype=str)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"Cannot decode {path} with utf-8/latin-1/cp1252")

    # Normalise column names
    df.columns = [_clean_column_name(c) for c in df.columns]

    # Parse timestamp — IST-naive
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")

    # Coerce pollutant + met columns to numeric
    for col in _NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Track source file
    df["_source_file"] = path.name

    return df


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_cpcb_station(
    city_id: str,
    *,
    station_id: str | None = None,
    source_file: str | None = None,
) -> pd.DataFrame:
    """Load CPCB data for a single station.

    You must provide either *station_id* **or** *source_file* to identify the
    station.  The station metadata from ``stations.csv`` is used to resolve
    the CSV filename and attach coordinates.

    Parameters
    ----------
    city_id : str
        City identifier (e.g. ``"korba"``).
    station_id : str | None
        Station ID from ``stations.csv``.
    source_file : str | None
        CSV filename (basename) as listed in ``stations.csv``.

    Returns
    -------
    pd.DataFrame
        Normalised hourly data with station metadata columns.
    """
    stations = load_stations(city_id=city_id)
    if stations.empty:
        raise ValueError(f"No stations found for city_id={city_id!r}")

    if station_id is not None:
        match = stations[stations["station_id"] == station_id]
    elif source_file is not None:
        match = stations[stations["source_file"] == source_file]
    else:
        raise ValueError("Provide either station_id or source_file")

    if match.empty:
        raise ValueError(
            f"Station not found: station_id={station_id!r}, "
            f"source_file={source_file!r}"
        )

    row = match.iloc[0]
    csv_path = DATA / "cpcb" / city_id / row["source_file"]
    if not csv_path.exists():
        raise FileNotFoundError(f"CPCB CSV not found: {csv_path}")

    df = _read_single_csv(csv_path)
    df["station_id"] = row["station_id"]
    df["city_id"] = city_id
    df["latitude"] = row["latitude"]
    df["longitude"] = row["longitude"]
    # Drop the internal helper column
    df.drop(columns=["_source_file"], inplace=True, errors="ignore")

    return df


def load_cpcb_city(city_id: str) -> pd.DataFrame:
    """Load and concatenate all CPCB CSVs under ``data/cpcb/<city_id>/``.

    Each CSV is matched to a station in ``stations.csv`` via filename.
    Unmatched CSVs are loaded but tagged with ``station_id = "unknown"``.

    Parameters
    ----------
    city_id : str
        City identifier (e.g. ``"korba"``).

    Returns
    -------
    pd.DataFrame
        Concatenated, normalised hourly data for all stations in the city.
        Sorted by ``(station_id, timestamp)``.
    """
    city_dir = DATA / "cpcb" / city_id
    if not city_dir.exists():
        print(f"  [!] No CPCB directory for {city_id}: {city_dir}")
        return pd.DataFrame()

    csvs = sorted(city_dir.glob("*.csv"))
    if not csvs:
        print(f"  [!] No CSV files in {city_dir}")
        return pd.DataFrame()

    stations = load_stations(city_id=city_id)
    # Build a lookup: source_file → station row
    stn_lookup = {}
    for _, srow in stations.iterrows():
        stn_lookup[srow["source_file"]] = srow

    frames: list[pd.DataFrame] = []
    for csv_path in csvs:
        df = _read_single_csv(csv_path)
        fname = csv_path.name

        if fname in stn_lookup:
            srow = stn_lookup[fname]
            df["station_id"] = srow["station_id"]
            df["city_id"] = city_id
            df["latitude"] = srow["latitude"]
            df["longitude"] = srow["longitude"]
        else:
            print(f"  [!] CSV {fname} not in stations.csv — tagging as unknown")
            df["station_id"] = "unknown"
            df["city_id"] = city_id
            df["latitude"] = float("nan")
            df["longitude"] = float("nan")

        df.drop(columns=["_source_file"], inplace=True, errors="ignore")
        frames.append(df)

    if not frames:
        return pd.DataFrame()

    panel = pd.concat(frames, ignore_index=True)
    panel.sort_values(["station_id", "timestamp"], inplace=True)
    panel.reset_index(drop=True, inplace=True)

    return panel
