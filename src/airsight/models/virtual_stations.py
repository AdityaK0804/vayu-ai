"""Virtual stations + MQTT IoT stub (Phase 4.5).

Virtual stations expose model-calibrated H3 / city predictions as soft stations
in the live API. MQTT hook is a no-op stub ready for low-cost sensors.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Sequence

log = logging.getLogger(__name__)

# Seed soft stations (city centroids) — predictions filled when observed empty
_SOFT_SEEDS: list[tuple[str, str, float, float]] = [
    ("virtual:korba-center", "korba", 22.3595, 82.7501),
    ("virtual:raipur-center", "raipur", 21.2514, 81.6296),
    ("virtual:bhilai-center", "bhilai", 21.1938, 81.3509),
    ("virtual:jagdalpur-center", "jagdalpur", 19.0748, 82.0080),
]


def list_virtual_stations(
    observed: Sequence[dict[str, Any]] | None = None,
    predictor: Callable[[str, float, float], float | None] | None = None,
) -> list[dict[str, Any]]:
    """Return soft stations. Optional predictor(city_id, lat, lon)->pm25."""
    observed = list(observed or [])
    # city mean pm25 from observed as naive calibration anchor
    city_vals: dict[str, list[float]] = {}
    for row in observed:
        cid = (row.get("city_id") or "").lower()
        pm = row.get("pm25")
        if cid and pm is not None:
            try:
                city_vals.setdefault(cid, []).append(float(pm))
            except Exception:
                pass
    city_mean = {k: sum(v) / len(v) for k, v in city_vals.items() if v}

    out: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).isoformat()
    for sid, city, lat, lon in _SOFT_SEEDS:
        pm: float | None = None
        if predictor is not None:
            try:
                pm = predictor(city, lat, lon)
            except Exception as exc:
                log.debug("predictor failed %s: %s", sid, exc)
        if pm is None:
            pm = city_mean.get(city)
        if pm is None:
            pm = 35.0  # neutral prior
        # light quantile-map-ish shrink toward city mean if both exist
        if city in city_mean:
            pm = 0.7 * float(pm) + 0.3 * city_mean[city]
        out.append(
            {
                "ts": now,
                "station_id": sid,
                "city_id": city,
                "source": "virtual",
                "pm25": round(float(pm), 2),
                "aqi_basis": "model",
                "lat": lat,
                "lon": lon,
                "quality_flag": 0,
                "is_virtual": True,
            }
        )
    return out


# ---------------------------------------------------------------------------
# MQTT stub
# ---------------------------------------------------------------------------


@dataclass
class MqttIngestStub:
    """Placeholder for future low-cost IoT sensors.

    Wire a real client (e.g. paho-mqtt) later; quantile-map vs CPCB reference
    belongs in calibration.py once paired samples exist.
    """

    host: str = "localhost"
    port: int = 1883
    topic: str = "vayu/sensors/#"
    connected: bool = False

    def connect(self) -> None:
        log.info("MQTT stub connect %s:%s (no-op)", self.host, self.port)
        self.connected = True

    def disconnect(self) -> None:
        self.connected = False

    def publish_test(self, payload: dict[str, Any]) -> None:
        if not self.connected:
            self.connect()
        log.info("MQTT stub publish %s %s", self.topic, payload)

    def quantile_map(
        self,
        sensor_values: Sequence[float],
        reference_values: Sequence[float],
    ) -> list[float]:
        """Empirical CDF match sensor → CPCB reference (simple piecewise)."""
        s = np_sorted(sensor_values)
        r = np_sorted(reference_values)
        if len(s) < 2 or len(r) < 2:
            return list(map(float, sensor_values))
        # map each sensor value via rank in sensor dist → reference quantile
        out: list[float] = []
        for x in sensor_values:
            # percentile rank
            rank = sum(1 for v in s if v <= x) / len(s)
            idx = min(len(r) - 1, max(0, int(rank * (len(r) - 1))))
            out.append(float(r[idx]))
        return out


def np_sorted(vals: Sequence[float]) -> list[float]:
    return sorted(float(v) for v in vals)
