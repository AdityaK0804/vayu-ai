"""Shared paths and configuration loader for the AirSight backend.

Discovers the repository root from this file's location and provides
helpers to load ``config/cities.yaml`` and ``config/stations.csv``.

Usage::

    from airsight.config import ROOT, DATA, load_cities, load_stations

"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# Path constants — derived from *this* file so they work after pip install -e .
# ---------------------------------------------------------------------------

# src/airsight/config.py  →  two levels up = repo root
ROOT: Path = Path(__file__).resolve().parents[2]
DATA: Path = ROOT / "data"
CONFIG: Path = ROOT / "config"
OUTPUTS: Path = ROOT / "outputs"


# ---------------------------------------------------------------------------
# Configuration loaders
# ---------------------------------------------------------------------------

def load_cities_yaml() -> dict[str, Any]:
    """Return the full parsed ``config/cities.yaml`` dict."""
    with open(CONFIG / "cities.yaml") as fh:
        return yaml.safe_load(fh)


def load_cities(only: list[str] | None = None,
                include_optional: bool = False) -> list[dict[str, Any]]:
    """Return a list of city dicts, each merged with defaults.

    Parameters
    ----------
    only : list[str] | None
        Restrict to these city ids (e.g. ``["korba"]``).
    include_optional : bool
        Include cities with ``role == "validation_optional"``.
    """
    cfg = load_cities_yaml()
    defaults = cfg.get("defaults", {})
    out: list[dict[str, Any]] = []
    for city in cfg["cities"]:
        if only and city["id"] not in only:
            continue
        if (not only
                and not include_optional
                and city.get("role") == "validation_optional"):
            continue
        out.append({**defaults, **city})
    return out


def load_stations(city_id: str | None = None) -> list[dict[str, Any]]:
    """Load ``config/stations.csv`` and optionally filter by *city_id*.

    Each row is returned as a dict with keys matching the CSV header.
    Rows whose ``city_id`` is empty or that start with ``#`` are skipped.
    """
    path = CONFIG / "stations.csv"
    rows: list[dict[str, Any]] = []
    with open(path, newline="") as fh:
        reader = csv.DictReader(
            (line for line in fh if not line.strip().startswith("#"))
        )
        for row in reader:
            cid = (row.get("city_id") or "").strip()
            if not cid:
                continue
            # Validate lat/lon are parseable floats
            try:
                row["latitude"] = float(row["latitude"])
                row["longitude"] = float(row["longitude"])
            except (ValueError, KeyError, TypeError):
                continue
            if city_id and cid != city_id:
                continue
            rows.append(row)
    return rows
