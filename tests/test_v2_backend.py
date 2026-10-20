"""Tests for the v2 backend: store, NAQI averaging, H3 surface and API.

These run fully offline. The network-dependent ingest is exercised by
``scripts/ingest_live.py`` rather than in CI.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

import airsight.store as store_module
from airsight.aqi.cpcb_naqi import (
    compute_naqi,
    compute_naqi_rolling,
    sub_index,
)
from airsight.grid.surface import (
    bbox_for_center,
    build_surface,
    emission_index,
    idw_value,
    resolution_for_bbox,
)
from airsight.store import Store


# ---------------------------------------------------------------------------
# NAQI
# ---------------------------------------------------------------------------


def test_pm25_sub_index_breakpoints():
    assert sub_index("pm25", 0) == 0
    assert sub_index("pm25", 30) == pytest.approx(50, abs=0.5)
    assert sub_index("pm25", 60) == pytest.approx(100, abs=0.5)
    assert sub_index("pm25", 500) == pytest.approx(500, abs=1)
    # Above the last breakpoint the index saturates rather than extrapolating.
    assert sub_index("pm25", 900) <= 500


def test_naqi_is_dominated_by_the_worst_pollutant():
    result = compute_naqi({"pm25": 20, "pm10": 45, "o3": 180})
    assert result["dominant_pollutant"] == "o3"
    assert result["aqi"] == pytest.approx(result["sub_indexes"]["o3"]["sub_index"], abs=1)


def test_rolling_aqi_uses_official_averaging_windows():
    """A single ozone spike must not define the city index."""
    hours = 30
    flat_o3 = [60.0] * hours
    spiky_o3 = list(flat_o3)
    spiky_o3[-1] = 400.0  # one-hour spike
    pm25 = [20.0] * hours

    calm = compute_naqi_rolling({"o3": flat_o3, "pm25": pm25}, hours - 1)
    spiked = compute_naqi_rolling({"o3": spiky_o3, "pm25": pm25}, hours - 1)

    # The spike lifts the 8h mean but far less than an instantaneous read would.
    assert spiked["aqi"] > calm["aqi"]
    instantaneous = compute_naqi({"o3": 400.0, "pm25": 20.0})["aqi"]
    assert spiked["aqi"] < instantaneous
    assert spiked["averaging"]["o3"]["window_hours"] == 8
    assert spiked["averaging"]["pm25"]["window_hours"] == 24


def test_rolling_aqi_needs_enough_history():
    result = compute_naqi_rolling({"pm25": [30.0]}, 0)
    # One hour of a 24-hour window is not enough to publish a 24h mean.
    assert "pm25" not in (result.get("averaging") or {})


# ---------------------------------------------------------------------------
# Store
# ---------------------------------------------------------------------------


def _obs(station: str, ts: str, pm25: float, source: str = "open-meteo-cams") -> dict:
    return {
        "station_id": station,
        "city_id": "korba",
        "ts": ts,
        "source": source,
        "pm25": pm25,
        "aqi": 100,
        "h3_r8": "883c848001fffff",
    }


def test_store_upserts_are_idempotent(tmp_path):
    with Store.open(tmp_path / "t.db") as store:
        rows = [_obs("cams:korba", "2026-10-20T00:00:00Z", 40.0)]
        store.upsert_observations(rows)
        store.upsert_observations(rows)
        assert store.scalar("SELECT COUNT(*) FROM observations") == 1

        store.upsert_observations([_obs("cams:korba", "2026-10-20T00:00:00Z", 55.0)])
        assert store.scalar("SELECT pm25 FROM observations") == 55.0


def test_latest_observations_one_row_per_station_and_source(tmp_path):
    with Store.open(tmp_path / "t.db") as store:
        store.upsert_observations(
            [
                _obs("cams:korba", "2026-10-20T00:00:00Z", 40.0),
                _obs("cams:korba", "2026-10-20T01:00:00Z", 44.0),
                _obs("openaq:1", "2026-10-20T01:00:00Z", 30.0, source="openaq"),
            ]
        )
        latest = store.latest_observations("korba")
        by_station = {r["station_id"]: r for r in latest}
        assert by_station["cams:korba"]["pm25"] == 44.0
        assert by_station["openaq:1"]["pm25"] == 30.0


def test_forecast_rows_are_separable_by_source(tmp_path):
    with Store.open(tmp_path / "t.db") as store:
        ts = "2026-10-20T05:00:00Z"
        run = "2026-10-20T00:00:00Z"
        store.upsert_air_forecast(
            [
                {"city_id": "korba", "run_ts": run, "ts": ts, "pm25": 40.0,
                 "source": "open-meteo-cams", "model_version": "cams-direct"},
                {"city_id": "korba", "run_ts": run, "ts": ts, "pm25": 31.0,
                 "source": "model", "model_version": "pm25-v4"},
            ]
        )
        cams = store.air_forecast("korba", source="open-meteo-cams")
        model = store.air_forecast("korba", source="model")
        assert cams[0]["pm25"] == 40.0
        assert model[0]["pm25"] == 31.0


def test_hex_snapshot_roundtrip(tmp_path):
    with Store.open(tmp_path / "t.db") as store:
        store.upsert_hex_snapshot(
            [
                {"city_id": "korba", "ts": "2026-10-20T06:00:00Z", "h3": "883c848001fffff",
                 "lat": 22.1, "lon": 82.9, "pm25": 42.0, "aqi": 100,
                 "population": 1200, "emission_index": 0.4, "detail": {"edgar_pm25": 12}},
            ]
        )
        ts, cells = store.hex_snapshot("korba")
        assert ts == "2026-10-20T06:00:00Z"
        assert cells[0]["detail"]["edgar_pm25"] == 12


def test_replace_hex_snapshot_drops_previous_resolution(tmp_path):
    """Rebuilding at a finer resolution must not leave the old cells behind."""
    ts = "2026-10-20T06:00:00Z"
    with Store.open(tmp_path / "t.db") as store:
        old = [
            {"city_id": "korba", "ts": ts, "h3": "873c848001fffff", "lat": 22.1,
             "lon": 82.9, "pm25": 40.0, "aqi": 100}
        ]
        new = [
            {"city_id": "korba", "ts": ts, "h3": "883c848001fffff", "lat": 22.1,
             "lon": 82.9, "pm25": 40.0, "aqi": 100},
            {"city_id": "korba", "ts": ts, "h3": "883c848003fffff", "lat": 22.2,
             "lon": 83.0, "pm25": 42.0, "aqi": 104},
        ]
        store.upsert_hex_snapshot(old)
        assert len(store.hex_snapshot("korba")[1]) == 1

        store.replace_hex_snapshot("korba", ts, new)
        _, cells = store.hex_snapshot("korba")
        assert len(cells) == 2
        assert {c["h3"] for c in cells} == {"883c848001fffff", "883c848003fffff"}


def test_prune_hex_snapshots_keeps_newest(tmp_path):
    with Store.open(tmp_path / "t.db") as store:
        for hour in ("04", "05", "06"):
            store.replace_hex_snapshot(
                "korba",
                f"2026-10-20T{hour}:00:00Z",
                [{"city_id": "korba", "ts": f"2026-10-20T{hour}:00:00Z",
                  "h3": "883c848001fffff", "lat": 22.1, "lon": 82.9, "pm25": 40.0}],
            )
        store.prune_hex_snapshots("korba", keep=2)
        timestamps = {
            r["ts"]
            for r in store.query("SELECT DISTINCT ts FROM hex_snapshot WHERE city_id='korba'")
        }
        assert timestamps == {"2026-10-20T05:00:00Z", "2026-10-20T06:00:00Z"}


def test_store_stats_does_not_close_a_borrowed_store(tmp_path):
    from airsight.store import store_stats

    with Store.open(tmp_path / "t.db") as store:
        store_stats(store)
        # Still usable afterwards — regression for the closed-database bug.
        assert store.scalar("SELECT 1") == 1


# ---------------------------------------------------------------------------
# Surface
# ---------------------------------------------------------------------------


def test_resolution_scales_with_area():
    small = resolution_for_bbox(bbox_for_center(22.36, 82.75, radius_km=8), target_cells=3500)
    large = resolution_for_bbox([80.0, 17.0, 84.5, 24.5], target_cells=3500)
    assert small >= large


def test_idw_matches_the_anchor_exactly():
    anchors = [{"lat": 22.36, "lon": 82.75, "pm25": 60.0}]
    assert idw_value(22.36, 82.75, anchors) == 60.0


def test_idw_decays_with_distance():
    anchors = [
        {"lat": 22.36, "lon": 82.75, "pm25": 100.0},
        {"lat": 22.36, "lon": 82.95, "pm25": 10.0},
    ]
    near = idw_value(22.36, 82.76, anchors)
    far = idw_value(22.36, 82.94, anchors)
    assert near > far


def test_surface_varies_between_two_anchors():
    anchors = [
        {"lat": 22.36, "lon": 82.68, "pm25": 80.0},
        {"lat": 22.36, "lon": 82.84, "pm25": 20.0},
    ]
    surface = build_surface(
        "korba",
        anchors,
        bbox=bbox_for_center(22.36, 82.75, radius_km=9),
        ts="2026-10-20T06:00:00Z",
        res=8,
        use_statics=False,
    )
    values = [c["pm25"] for c in surface.cells if c["pm25"] is not None]
    assert len(values) > 50
    assert min(values) < max(values)
    assert all(v >= 0.5 for v in values)
    assert surface.n_anchors == 2
    # The west side sits on the 80 µg/m³ monitor, the east on the 20 one.
    west = min(surface.cells, key=lambda c: c["lon"])["pm25"]
    east = max(surface.cells, key=lambda c: c["lon"])["pm25"]
    assert west > east


def test_single_anchor_without_statics_is_flat_not_invented():
    """One monitor cannot justify spatial texture: the field stays constant."""
    surface = build_surface(
        "korba",
        [{"lat": 22.36, "lon": 82.75, "pm25": 50.0}],
        bbox=bbox_for_center(22.36, 82.75, radius_km=6),
        ts="2026-10-20T06:00:00Z",
        res=8,
        use_statics=False,
    )
    values = {c["pm25"] for c in surface.cells if c["pm25"] is not None}
    assert values == {50.0}


def test_surface_without_anchors_is_empty_not_fabricated():
    surface = build_surface(
        "korba", [], bbox=bbox_for_center(22.36, 82.75, radius_km=5), ts="2026-10-20T06:00:00Z"
    )
    assert all(c["pm25"] is None for c in surface.cells)
    assert any("No anchors" in note for note in surface.notes)


def test_emission_index_is_bounded_and_ordered():
    cells = ["a", "b", "c"]
    statics = {
        "a": {"edgar_pm25_total": 1.0, "population": 10, "road_density_km_km2": 1.0,
              "gppd_cap_25km": 0.0, "gppd_nearest_km": 50.0},
        "b": {"edgar_pm25_total": 50.0, "population": 20, "road_density_km_km2": 2.0,
              "gppd_cap_25km": 0.0, "gppd_nearest_km": 50.0},
        "c": {"edgar_pm25_total": 100.0, "population": 30, "road_density_km_km2": 3.0,
              "gppd_cap_25km": 1000.0, "gppd_nearest_km": 1.0},
    }
    index = emission_index(cells, statics)
    assert 0 <= index["a"] < index["b"] < index["c"] <= 1


# ---------------------------------------------------------------------------
# Model math
# ---------------------------------------------------------------------------


def test_regression_metrics_and_interval_scaling():
    from airsight.models.registry import _fit_interval_scale, regression_metrics

    y = np.array([10.0, 20.0, 30.0, 40.0])
    perfect = regression_metrics(y, y)
    assert perfect["rmse"] == 0 and perfect["r2"] == 1.0

    p50 = np.array([12.0, 18.0, 33.0, 37.0])
    p10 = np.array([9.0, 15.0, 30.0, 34.0])
    p90 = np.array([15.0, 21.0, 36.0, 40.0])
    calibration = _fit_interval_scale(y, p50, p10, p90, target_coverage=0.75)
    assert calibration["scale"] >= 1.0


def test_predict_frame_enforces_monotone_band():
    from airsight.models.registry import predict_frame

    class Stub:
        def __init__(self, value):
            self.value = value

        def predict(self, x):
            return np.full(len(x), self.value)

    import pandas as pd

    bundle = {
        "features": ["a"],
        "p10": {"model": Stub(30.0)},
        "p50": {"model": Stub(20.0)},
        "p90": {"model": Stub(25.0)},
        "calibration": {"scale": 1.0},
    }
    out = predict_frame(bundle, pd.DataFrame({"a": [1.0, 2.0]}))
    assert (out["p10"] <= out["p50"]).all()
    assert (out["p90"] >= out["p50"]).all()


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """TestClient backed by a temporary, pre-seeded database."""
    db = tmp_path / "api.db"
    monkeypatch.setattr(store_module, "DB_PATH", db)

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    with Store.open(db) as store:
        store.upsert_cities(
            [
                {"id": "korba", "name": "Korba", "state": "Chhattisgarh",
                 "lat": 22.3595, "lon": 82.7501, "bbox": [82.3, 22.0, 83.1, 22.7],
                 "calibrated": True, "role": "hero"},
            ]
        )
        store.upsert_stations(
            [{"station_id": "cams:korba", "city_id": "korba", "name": "CAMS grid",
              "lat": 22.3595, "lon": 82.7501, "source": "open-meteo-cams"}]
        )
        rows = []
        for i in range(30):
            ts = (now - timedelta(hours=29 - i)).strftime("%Y-%m-%dT%H:%M:%SZ")
            rows.append(
                {"station_id": "cams:korba", "city_id": "korba", "ts": ts,
                 "source": "open-meteo-cams", "pm25": 40.0 + i, "pm10": 70.0,
                 "no2": 12.0, "so2": 8.0, "o3": 80.0, "co": 0.6, "aqi": 120}
            )
        store.upsert_observations(rows)
        store.upsert_met(
            [
                {"city_id": "korba", "ts": (now + timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "temperature_2m": 25.0, "boundary_layer_height": 400.0,
                 "wind_speed_10m": 3.0, "wind_direction_10m": 180.0,
                 "surface_pressure": 980.0, "precipitation": 0.0,
                 "relative_humidity_2m": 60.0, "dew_point_2m": 15.0, "source": "open-meteo"}
                for h in range(1, 30)
            ]
        )

    from api.main import app

    return TestClient(app)


def test_health_reports_freshness_and_models(client):
    body = client.get("/api/v2/health").json()
    # Observations are fresh; no forecast run yet, so the health is "stale".
    assert body["status"] in {"ok", "stale"}
    assert body["freshness"]["stale"] is False
    sources = body["freshness"]["sources"]
    assert sources["cams"]["stale"] is False
    assert sources["forecast"]["stale"] is True
    assert "db_path" not in body["store"]
    assert body["store"]["counts"]["observations"] > 0


def test_cities_index(client):
    body = client.get("/api/v2/cities").json()
    assert body["n"] == 1
    city = body["cities"][0]
    assert city["id"] == "korba"
    assert city["available"] is True
    assert city["aqi"] is not None
    assert city["quality"]["kind"] == "modelled"


def test_unknown_city_returns_404(client):
    assert client.get("/api/v2/cities/nowhere").status_code == 404


def test_surface_endpoint_returns_varying_cells(client):
    body = client.get("/api/v2/cities/korba/surface").json()
    assert body["n_cells"] > 0
    values = [c["pm25"] for c in body["cells"] if c["pm25"] is not None]
    assert values and min(values) < max(values)
    assert body["resolution"] >= 6


def test_surface_geojson_has_closed_rings(client):
    body = client.get("/api/v2/cities/korba/surface?fmt=geojson").json()
    assert body["type"] == "FeatureCollection"
    ring = body["features"][0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1]
