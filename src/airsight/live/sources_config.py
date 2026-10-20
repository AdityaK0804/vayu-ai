"""Load ``config/live_sources.yaml`` (endpoints, ids, areas for live feeds)."""

from __future__ import annotations

import csv
from functools import lru_cache
from typing import Any

import yaml

from airsight.config import CONFIG


@lru_cache(maxsize=1)
def live_sources() -> dict[str, Any]:
    path = CONFIG / "live_sources.yaml"
    if not path.exists():
        return {}
    with open(path) as fh:
        return yaml.safe_load(fh) or {}


def section(name: str) -> dict[str, Any]:
    return dict(live_sources().get(name) or {})


def cpcb_station_registry() -> list[dict[str, Any]]:
    """Rows of the CPCB station file named in ``cpcb_datagov.stations_file``."""
    fname = section("cpcb_datagov").get("stations_file") or "cpcb_stations.csv"
    path = CONFIG / fname
    if not path.exists():
        return []
    with open(path, newline="") as fh:
        return [
            {**r, "lat": float(r["lat"]), "lon": float(r["lon"])}
            for r in csv.DictReader(fh)
            if r.get("station_id")
        ]
