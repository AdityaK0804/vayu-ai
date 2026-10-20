"""H3 hexagon surface: turn sparse point readings into a real spatial field.

Why this exists
---------------
The previous bake wrote the *same* value into every hexagon ("nearest station"
with no falloff), which is why the map looked fake: a district-wide flat colour
with no structure. This module builds a defensible surface instead:

1. **Anchor** — inverse-distance weighting (IDW) from actual measurement points,
   so a monitor's value decays with real distance instead of being copied.
2. **Downscale** — multiply by an emission index built from the local EDGAR
   inventory, population, road density and power-plant proximity, so industrial
   clusters run hotter than farmland. This is an explicitly *modelled* surface;
   we never claim per-cell ground truth.
3. **Report** — every payload carries the anchor count, the method and the
   static-layer provenance so the UI can be honest about it.

The grid is H3 (``uber/h3``), which is what makes cross-city, cross-resolution
aggregation possible: a cell id is stable, its children can be rolled up, and
neighbourhood queries are O(1) instead of a distance scan.

Usage::

    from airsight.grid.surface import build_surface, resolution_for_bbox

    res = resolution_for_bbox([82.3, 22.0, 83.1, 22.7])
    surface = build_surface("korba", [{"lat": 22.36, "lon": 82.75, "pm25": 44.2}], res=res)
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Sequence

import h3

from airsight.aqi.cpcb_naqi import band_for_aqi, sub_index
from airsight.config import DATA
from airsight.grid.h3_utils import cells_for_bbox

# Mean H3 cell area in km² by resolution (from the H3 docs).
CELL_AREA_KM2: dict[int, float] = {
    5: 252.9,
    6: 36.13,
    7: 5.161,
    8: 0.7373,
    9: 0.10533,
}

# Root-mean-square radius used by IDW, by resolution. A cell is ~1 km across at
# res 8, so a monitor should influence its own neighbourhood strongly and fade
# out over roughly 8-10 km.
IDW_POWER = 2.0
IDW_FALLOFF_KM = 9.0

# How strongly the emission index reshapes the anchor field. 0 = flat IDW,
# 1 = strong industrial hot-spotting. Tuned against the Korba/Urja Nagar pair,
# which differ by ~2x in observed PM2.5 and sit in different land-use contexts.
EMISSION_GAIN = 0.75

STATIC_COLUMNS = (
    "population",
    "edgar_pm25_total",
    "road_density_km_km2",
    "gppd_cap_25km",
    "gppd_nearest_km",
)


@dataclass
class SurfaceResult:
    city_id: str
    resolution: int
    ts: str
    cells: list[dict[str, Any]]
    method: str
    n_anchors: int
    stats: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "city_id": self.city_id,
            "resolution": self.resolution,
            "ts": self.ts,
            "method": self.method,
            "n_anchors": self.n_anchors,
            "n_cells": len(self.cells),
            "stats": self.stats,
            "notes": self.notes,
            "cells": self.cells,
        }

    def to_geojson(self) -> dict[str, Any]:
        features = []
        for cell in self.cells:
            boundary = h3.cell_to_boundary(cell["h3"])
            ring = [[round(lng, 5), round(lat, 5)] for lat, lng in boundary]
            ring.append(ring[0])
            features.append(
                {
                    "type": "Feature",
                    "id": cell["h3"],
                    "properties": {k: v for k, v in cell.items() if k != "h3"},
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                }
            )
        return {"type": "FeatureCollection", "features": features}


# ---------------------------------------------------------------------------
# Grid sizing
# ---------------------------------------------------------------------------


def resolution_for_bbox(
    bbox: Sequence[float], *, target_cells: int = 3500, min_res: int = 6, max_res: int = 9
) -> int:
    """Pick the finest H3 resolution that keeps a bbox under *target_cells*.

    ``bbox`` is ``[W, S, E, N]``. Chosen so a district-wide request returns a
    payload that can actually be rendered and diffed, while a city-scale bbox
    still gets sub-kilometre hexagons.
    """
    west, south, east, north = (float(v) for v in bbox)
    # Equirectangular area estimate; accurate enough at district scale.
    lat_mid = math.radians((south + north) / 2.0)
    width_km = abs(east - west) * 111.320 * math.cos(lat_mid)
    height_km = abs(north - south) * 110.574
    area = max(width_km * height_km, 0.01)
    for res in range(max_res, min_res - 1, -1):
        if area / CELL_AREA_KM2[res] <= target_cells:
            return res
    return min_res


def bbox_for_center(lat: float, lon: float, radius_km: float = 18.0) -> list[float]:
    """A square bbox around a point, used for cities without a polygon."""
    dlat = radius_km / 110.574
    dlon = radius_km / (111.320 * max(0.15, math.cos(math.radians(lat))))
    return [lon - dlon, lat - dlat, lon + dlon, lat + dlat]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


# ---------------------------------------------------------------------------
# Static layers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=32)
def load_static_grid(city_id: str) -> dict[str, dict[str, Any]]:
    """Load the res-8 static feature table for a city, keyed by H3 cell.

    Returns an empty dict when the city has no precomputed grid; the surface
    then falls back to a pure IDW field and records that in ``notes``.
    """
    path = DATA / "grid" / f"{city_id.lower()}.parquet"
    if not path.exists():
        return {}
    try:
        import pandas as pd

        df = pd.read_parquet(path)
    except Exception:
        return {}
    if "cell_id" not in df.columns:
        return {}
    cols = [c for c in STATIC_COLUMNS if c in df.columns]
    out: dict[str, dict[str, Any]] = {}
    for row in df[["cell_id", *cols]].to_dict(orient="records"):
        out[str(row["cell_id"])] = row
    return out


def _percentile_ranks(values: list[float]) -> list[float]:
    """Map values to [0, 1] percentile ranks, robust to ties and outliers."""
    n = len(values)
    if n <= 1:
        return [0.5] * n
    order = sorted(range(n), key=lambda i: values[i])
    ranks = [0.0] * n
    for position, idx in enumerate(order):
        ranks[idx] = position / (n - 1)
    return ranks


def emission_index(cells: list[str], statics: dict[str, dict[str, Any]]) -> dict[str, float]:
    """Composite 0-1 emission intensity per H3 cell.

    Combines annual PM2.5 emissions (EDGAR), population exposure, road density
    and nearby power-plant capacity. Each component is percentile-ranked within
    the city before averaging so no single layer dominates by unit scale.
    """
    if not statics:
        return {}
    emis: list[float] = []
    pop: list[float] = []
    roads: list[float] = []
    plants: list[float] = []
    for cell in cells:
        row = statics.get(cell) or {}
        emis.append(_num(row.get("edgar_pm25_total")))
        pop.append(_num(row.get("population")))
        roads.append(_num(row.get("road_density_km_km2")))
        cap = _num(row.get("gppd_cap_25km"))
        nearest = _num(row.get("gppd_nearest_km"))
        # Capacity discounted by how far the cluster is: 25 km reference ring.
        plants.append(cap / (1.0 + (nearest / 25.0)))

    e_rank = _percentile_ranks(emis)
    p_rank = _percentile_ranks(pop)
    r_rank = _percentile_ranks(roads)
    g_rank = _percentile_ranks(plants)

    out: dict[str, float] = {}
    for i, cell in enumerate(cells):
        score = 0.55 * e_rank[i] + 0.20 * p_rank[i] + 0.12 * r_rank[i] + 0.13 * g_rank[i]
        out[cell] = round(score, 4)
    return out


# ---------------------------------------------------------------------------
# Interpolation
# ---------------------------------------------------------------------------


def idw_value(
    lat: float,
    lon: float,
    anchors: Sequence[dict[str, Any]],
    *,
    power: float = IDW_POWER,
    falloff_km: float = IDW_FALLOFF_KM,
) -> float | None:
    """Inverse-distance-weighted estimate at a point.

    Anchors need ``lat``/``lon`` and either ``pm25`` or ``value``. A hard
    ``falloff_km`` cutoff keeps a distant monitor from bleeding into an
    unrelated valley; anything beyond it contributes nothing.
    """
    weighted = 0.0
    weights = 0.0
    exact: float | None = None
    for anchor in anchors:
        value = anchor.get("pm25", anchor.get("value"))
        if value is None:
            continue
        try:
            alat = float(anchor["lat"])
            alon = float(anchor["lon"])
            aval = float(value)
        except (KeyError, TypeError, ValueError):
            continue
        distance = _haversine_km(lat, lon, alat, alon)
        quality = float(anchor.get("weight") or 1.0)
        if distance < 0.05:
            exact = aval
            break
        if distance > falloff_km:
            continue
        w = quality / (distance**power)
        weighted += w * aval
        weights += w
    if exact is not None:
        return exact
    if weights <= 0:
        return None
    return weighted / weights


def _pm25_to_aqi(pm25: float | None) -> int | None:
    if pm25 is None:
        return None
    idx = sub_index("pm25", pm25)
    return None if idx is None else int(round(idx))


def build_surface(
    city_id: str,
    anchors: Iterable[dict[str, Any]],
    *,
    bbox: Sequence[float],
    ts: str,
    res: int | None = None,
    boundary: dict[str, Any] | None = None,
    use_statics: bool = True,
    max_emission_gain: float = EMISSION_GAIN,
    target_cells: int | None = None,
) -> SurfaceResult:
    """Build an H3 PM2.5 surface for one city at one timestamp.

    Parameters
    ----------
    city_id:
        Registry id (used to look up the static grid parquet).
    anchors:
        Measurement points: ``{lat, lon, pm25, weight?, source?}``.
    bbox:
        ``[W, S, E, N]`` used when no polygon is supplied.
    ts:
        ISO timestamp the snapshot describes.
    boundary:
        Optional GeoJSON geometry (Polygon / MultiPolygon) to clip the grid.
    """
    anchor_list = [a for a in anchors if a.get("pm25") is not None]
    resolution = int(res or resolution_for_bbox(bbox, target_cells=target_cells or 3500))

    cells = (
        _cells_for_geometry(boundary, resolution)
        if boundary
        else cells_for_bbox(list(bbox), resolution)
    )

    # A district polygon can be far larger than the city bbox used to pick the
    # resolution, which silently produced 50k-hexagon payloads. Step up a
    # resolution until the actual cell count fits the budget.
    if target_cells and not res:
        budget = int(target_cells * 1.4)
        while len(cells) > budget and resolution > 5:
            resolution -= 1
            cells = (
                _cells_for_geometry(boundary, resolution)
                if boundary
                else cells_for_bbox(list(bbox), resolution)
            )

    notes: list[str] = []
    statics = load_static_grid(city_id) if use_statics else {}
    if statics and resolution != 8:
        # Static grid is res 8; roll up to the parent resolution so every cell
        # still gets a static profile instead of silently losing it.
        statics = _rollup_statics(statics, resolution)
    if not statics:
        notes.append(
            "No static emission grid for this area — surface is pure IDW from "
            "measurement anchors, so it is smoother than reality."
        )

    emis = emission_index(cells, statics) if statics else {}
    has_emission = bool(emis)

    # City-mean fallback so remote hexagons are not blank.
    mean_pm25: float | None = None
    if anchor_list:
        mean_pm25 = sum(float(a["pm25"]) for a in anchor_list) / len(anchor_list)
        notes.append(
            f"{len(anchor_list)} anchor(s) interpolated with IDW (power {IDW_POWER}, "
            f"{IDW_FALLOFF_KM:.0f} km falloff)."
        )
    else:
        notes.append("No anchors available — surface cannot be computed.")

    out: list[dict[str, Any]] = []
    total_pop = 0.0
    weighted_sum = 0.0
    for cell in cells:
        clat, clon = h3.cell_to_latlng(cell)
        base = idw_value(clat, clon, anchor_list) if anchor_list else None
        if base is None:
            base = mean_pm25

        row = statics.get(cell) or {}
        ei = emis.get(cell)
        value = base
        if value is not None and ei is not None:
            # Log-space modulation: keeps low backgrounds low and lets
            # industrial cells climb without exploding.
            value = value * math.exp(max_emission_gain * (ei - 0.5))
        if value is not None:
            value = float(max(0.5, min(value, 900.0)))

        pop = _num(row.get("population"))
        if value is not None and pop > 0:
            weighted_sum += value * pop
            total_pop += pop

        detail = {}
        if row:
            detail = {
                "edgar_pm25": _round(row.get("edgar_pm25_total")),
                "roads": _round(row.get("road_density_km_km2")),
                "plant_mw": _round(row.get("gppd_cap_25km")),
            }

        out.append(
            {
                "h3": cell,
                "lat": round(clat, 5),
                "lon": round(clon, 5),
                "pm25": _round(value),
                "aqi": _pm25_to_aqi(value),
                "ei": ei,
                "pop": int(pop) if pop else 0,
                **({"detail": detail} if detail else {}),
            }
        )

    values = [c["pm25"] for c in out if c.get("pm25") is not None]
    stats: dict[str, Any] = {
        "n_cells": len(out),
        "mean_pm25": _round(sum(values) / len(values)) if values else None,
        "max_pm25": _round(max(values)) if values else None,
        "min_pm25": _round(min(values)) if values else None,
        "population_weighted_pm25": _round(weighted_sum / total_pop) if total_pop else None,
        "population_total": int(total_pop),
        "p90_pm25": _round(_quantile(values, 0.9)) if values else None,
        "cells_above_60": sum(1 for v in values if v > 60),
        "method": "idw+emission" if has_emission else "idw",
    }
    if values:
        stats["band"] = band_for_aqi(_pm25_to_aqi(stats["mean_pm25"]))

    return SurfaceResult(
        city_id=city_id.lower(),
        resolution=resolution,
        ts=ts,
        cells=out,
        method="idw+emission" if has_emission else "idw",
        n_anchors=len(anchor_list),
        stats=stats,
        notes=notes,
    )


def _cells_for_geometry(geometry: dict[str, Any], res: int) -> list[str]:
    try:
        return list(h3.geo_to_cells(geometry, res))
    except Exception:
        # Geometry may be a Feature; fall back to its bbox.
        coords = _flatten_coords(geometry)
        if not coords:
            return []
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return cells_for_bbox([min(lons), min(lats), max(lons), max(lats)], res)


def _flatten_coords(obj: Any) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "coordinates":
                out.extend(_flatten_coords(value))
            elif isinstance(value, (dict, list)):
                out.extend(_flatten_coords(value))
    elif isinstance(obj, list):
        if len(obj) >= 2 and all(isinstance(v, (int, float)) for v in obj[:2]):
            out.append((float(obj[0]), float(obj[1])))
        else:
            for item in obj:
                out.extend(_flatten_coords(item))
    return out


def _rollup_statics(statics: dict[str, dict[str, Any]], res: int) -> dict[str, dict[str, Any]]:
    """Aggregate res-8 static rows onto a coarser parent resolution."""
    if res >= 8:
        return statics
    buckets: dict[str, dict[str, float]] = {}
    for cell, row in statics.items():
        try:
            parent = h3.cell_to_parent(cell, res)
        except Exception:
            continue
        acc = buckets.setdefault(parent, {})
        for col in STATIC_COLUMNS:
            if col in row and row[col] is not None:
                acc[col] = acc.get(col, 0.0) + float(row[col])
        acc["_n"] = acc.get("_n", 0.0) + 1.0
    out: dict[str, dict[str, Any]] = {}
    for parent, acc in buckets.items():
        n = acc.pop("_n", 1.0) or 1.0
        # Sums for stocks, means for density/nearest-distance style fields.
        mean_cols = {"road_density_km_km2", "gppd_nearest_km"}
        out[parent] = {
            k: (v / n if k in mean_cols else v) for k, v in acc.items()
        }
    return out


def _quantile(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    pos = min(len(ordered) - 1, max(0, int(round(q * (len(ordered) - 1)))))
    return ordered[pos]


def _num(value: Any, default: float = 0.0) -> float:
    """Coerce to a finite float; NaN/None/inf all become *default*."""
    if value is None:
        return default
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if math.isfinite(out) else default


def _round(value: Any, digits: int = 1) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return round(out, digits) if math.isfinite(out) else None


def load_boundary(city_id: str) -> dict[str, Any] | None:
    """Load a city polygon from ``data/boundaries/<city>.geojson`` if present."""
    path = DATA / "boundaries" / f"{city_id.lower()}.geojson"
    if not path.exists():
        return None
    try:
        import json

        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return None
    if payload.get("type") == "FeatureCollection":
        features = payload.get("features") or []
        if not features:
            return None
        geometry = features[0].get("geometry")
        return geometry if isinstance(geometry, dict) else None
    if payload.get("type") == "Feature":
        geometry = payload.get("geometry")
        return geometry if isinstance(geometry, dict) else None
    return payload if payload.get("type") in {"Polygon", "MultiPolygon"} else None
