"""What-if scenario engine — apply feature deltas → per-H3 PM2.5 field.

No GPU required. Uses a transparent linear source-mix model so demos are
deterministic and auditable; STGNN/ensemble can replace `_predict_cell` later.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# Approx city centroids (CG demo cities)
_CITY_CENTERS: dict[str, tuple[float, float]] = {
    "korba": (22.3595, 82.7501),
    "raipur": (21.2514, 81.6296),
    "bhilai": (21.1938, 81.3509),
    "bilaspur": (22.0796, 82.1391),
    "jagdalpur": (19.0748, 82.0080),
    "ambikapur": (23.12, 83.2),
    "durg": (21.19, 81.28),
}

# Rough school + pop density priors (demo) — WorldPop/OSM would replace these
_CITY_EXPOSURE: dict[str, dict[str, float]] = {
    "raipur": {"pop": 1_200_000, "schools": 420, "base_pm25": 72.0},
    "bhilai": {"pop": 650_000, "schools": 180, "base_pm25": 68.0},
    "korba": {"pop": 420_000, "schools": 95, "base_pm25": 85.0},
    "bilaspur": {"pop": 480_000, "schools": 140, "base_pm25": 60.0},
    "jagdalpur": {"pop": 180_000, "schools": 55, "base_pm25": 42.0},
    "ambikapur": {"pop": 150_000, "schools": 48, "base_pm25": 45.0},
    "durg": {"pop": 320_000, "schools": 90, "base_pm25": 65.0},
}


@dataclass
class Scenario:
    traffic_delta: float = 0.0  # e.g. -0.3 = −30% traffic emissions
    industry_delta: float = 0.0
    construction_dust_delta: float = 0.0
    fire_reduction: float = 0.0  # 0..1 fraction reduced
    ward_sprinkling: bool = False
    ward: str | None = None
    city_id: str = "raipur"
    n_hex: int = 37  # ~hex disk for map


@dataclass
class HexDelta:
    h3: str
    lat: float
    lon: float
    baseline_pm25: float
    scenario_pm25: float
    delta_pm25: float
    source_mix: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "h3": self.h3,
            "lat": self.lat,
            "lon": self.lon,
            "baseline_pm25": round(self.baseline_pm25, 2),
            "scenario_pm25": round(self.scenario_pm25, 2),
            "delta_pm25": round(self.delta_pm25, 2),
            "source_mix": {k: round(v, 3) for k, v in self.source_mix.items()},
        }


def _ring_offsets(n: int) -> list[tuple[float, float]]:
    """Pseudo-H3 disk around city centre (lat/lon degrees)."""
    pts: list[tuple[float, float]] = [(0.0, 0.0)]
    # rings of ~0.04°
    r = 1
    while len(pts) < n:
        steps = max(6, r * 6)
        for i in range(steps):
            ang = 2 * math.pi * i / steps
            pts.append((r * 0.035 * math.cos(ang), r * 0.04 * math.sin(ang)))
            if len(pts) >= n:
                break
        r += 1
    return pts[:n]


def _fake_h3(lat: float, lon: float, i: int) -> str:
    """Stable demo cell id when h3 lib missing."""
    return f"demo{i:02d}_{abs(hash((round(lat, 3), round(lon, 3)))) % 10**10:010x}"


def _cell_id(lat: float, lon: float, i: int) -> str:
    try:
        import h3

        try:
            return h3.latlng_to_cell(lat, lon, 7)
        except AttributeError:
            return h3.geo_to_h3(lat, lon, 7)
    except Exception:
        return _fake_h3(lat, lon, i)


def _baseline_mix(city_id: str) -> dict[str, float]:
    # industrial cities skew industry/fire; capitals skew traffic
    if city_id in {"korba", "bhilai"}:
        return {"industry": 0.42, "traffic": 0.18, "fire": 0.15, "dust": 0.15, "other": 0.10}
    if city_id in {"raipur", "durg"}:
        return {"industry": 0.22, "traffic": 0.35, "fire": 0.12, "dust": 0.21, "other": 0.10}
    return {"industry": 0.18, "traffic": 0.25, "fire": 0.20, "dust": 0.22, "other": 0.15}


def _scaled_components(mix: dict[str, float], sc: Scenario) -> dict[str, float]:
    """Absolute emission scales (do NOT renormalize — total mass should fall)."""
    out = {
        "traffic": max(0.0, mix["traffic"] * (1.0 + sc.traffic_delta)),
        "industry": max(0.0, mix["industry"] * (1.0 + sc.industry_delta)),
        "dust": max(0.0, mix["dust"] * (1.0 + sc.construction_dust_delta)),
        "fire": max(0.0, mix["fire"] * (1.0 - min(1.0, max(0.0, sc.fire_reduction)))),
        "other": mix["other"],
    }
    if sc.ward_sprinkling:
        out["dust"] *= 0.72
        out["traffic"] *= 0.95
    return out


def _load(components: dict[str, float]) -> float:
    return (
        1.15 * components["industry"]
        + 1.05 * components["traffic"]
        + 1.25 * components["fire"]
        + 1.10 * components["dust"]
        + 0.85 * components["other"]
    )


def _pm_from_load(base_pm: float, load: float, load0: float, radial: float) -> float:
    fade = math.exp(-radial * 8.0)
    ratio = load / max(load0, 1e-6)
    return max(5.0, base_pm * ratio * (0.55 + 0.45 * fade))


def run_whatif(scenario: Scenario) -> dict[str, Any]:
    city = (scenario.city_id or "raipur").lower().strip()
    if city not in _CITY_CENTERS:
        city = "raipur"
    clat, clon = _CITY_CENTERS[city]
    exp = _CITY_EXPOSURE.get(city, {"pop": 200_000, "schools": 40, "base_pm25": 55.0})
    base_pm = float(exp["base_pm25"])
    mix0 = _baseline_mix(city)
    comp0 = dict(mix0)
    comp1 = _scaled_components(mix0, scenario)
    load0 = _load(comp0)
    load1 = _load(comp1)
    # display mixes as shares
    def as_share(c: dict[str, float]) -> dict[str, float]:
        s = sum(c.values()) or 1.0
        return {k: v / s for k, v in c.items()}

    mix0_s, mix1_s = as_share(comp0), as_share(comp1)

    hexes: list[HexDelta] = []
    for i, (dlat, dlon) in enumerate(_ring_offsets(scenario.n_hex)):
        lat, lon = clat + dlat, clon + dlon
        radial = math.hypot(dlat, dlon)
        b = _pm_from_load(base_pm, load0, load0, radial)
        s = _pm_from_load(base_pm, load1, load0, radial)
        if scenario.ward and radial < 0.05 and scenario.ward_sprinkling:
            s *= 0.88
        hexes.append(
            HexDelta(
                h3=_cell_id(lat, lon, i),
                lat=lat,
                lon=lon,
                baseline_pm25=b,
                scenario_pm25=s,
                delta_pm25=s - b,
                source_mix=mix1_s,
            )
        )

    mean_base = sum(h.baseline_pm25 for h in hexes) / len(hexes)
    mean_sc = sum(h.scenario_pm25 for h in hexes) / len(hexes)
    mean_delta = mean_sc - mean_base
    improved = [h for h in hexes if h.delta_pm25 < -0.25]
    frac = len(improved) / max(len(hexes), 1)
    # population protected scales with mean improvement
    rel = max(0.0, -mean_delta) / max(mean_base, 1.0)
    intensity = min(1.0, max(frac, rel * 2.5))
    pop_prot = int(exp["pop"] * intensity)
    schools_prot = max(1, int(exp["schools"] * intensity)) if intensity > 0.02 else 0

    return {
        "city_id": city,
        "ward": scenario.ward,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scenario": {
            "traffic_delta": scenario.traffic_delta,
            "industry_delta": scenario.industry_delta,
            "construction_dust_delta": scenario.construction_dust_delta,
            "fire_reduction": scenario.fire_reduction,
            "ward_sprinkling": scenario.ward_sprinkling,
            "ward": scenario.ward,
        },
        "baseline_mix": mix0_s,
        "scenario_mix": mix1_s,
        "city_mean_baseline_pm25": round(mean_base, 2),
        "city_mean_scenario_pm25": round(mean_sc, 2),
        "city_mean_delta_pm25": round(mean_delta, 2),
        "hex_deltas": [h.as_dict() for h in hexes],
        "population_protected_est": pop_prot,
        "schools_protected_est": schools_prot,
        "notes": [
            "Linear source-mix what-if (demo). Replace with STGNN/ensemble for production.",
            "Exposure priors are static placeholders for WorldPop + school points.",
        ],
    }
