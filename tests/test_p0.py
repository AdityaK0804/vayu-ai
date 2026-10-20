"""P0 regression tests: auth, CORS, AQI method, safe errors, data fixes, freshness."""

from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import airsight.store as store_module
from airsight.aqi.cpcb_naqi import (
    compute_naqi,
    compute_naqi_rolling,
    hourly_grid,
    naqi_from_rows,
    rolling_pm25_aqi,
    sub_index,
)
from airsight.store import Store

TOKEN = "t" * 32
NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def db(tmp_path, monkeypatch):
    path = tmp_path / "p0.db"
    monkeypatch.setattr(store_module, "DB_PATH", path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with Store.open(path) as s:
        s.upsert_cities([{"id": "korba", "name": "Korba", "lat": 22.36, "lon": 82.75,
                          "bbox": [82.3, 22.0, 83.1, 22.7], "calibrated": True}])
        s.upsert_observations([
            {"station_id": "cams:korba", "city_id": "korba", "ts": _iso(NOW - timedelta(hours=23 - i)),
             "source": "open-meteo-cams", "pm25": 45.0, "pm10": 80.0, "no2": 20.0, "so2": 10.0,
             "o3": 60.0, "co": 0.5}
            for i in range(24)
        ])
    return path


def _client(monkeypatch, *, tokens: str | None = TOKEN, origins: str | None = None) -> TestClient:
    if tokens is None:
        monkeypatch.delenv("VAYU_ADMIN_TOKENS", raising=False)
    else:
        monkeypatch.setenv("VAYU_ADMIN_TOKENS", tokens)
    if origins is None:
        monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    else:
        monkeypatch.setenv("CORS_ALLOW_ORIGINS", origins)
    import api.main as main

    return TestClient(main.create_app(), raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_admin_disabled_without_configured_token(db, monkeypatch):
    c = _client(monkeypatch, tokens=None)
    r = c.post("/api/v2/admin/refresh", json={})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "admin_disabled"


def test_short_tokens_are_ignored(db, monkeypatch):
    c = _client(monkeypatch, tokens="short")
    r = c.post("/api/v2/admin/refresh", headers={"Authorization": "Bearer short"})
    assert r.status_code == 503


def test_refresh_requires_token(db, monkeypatch):
    c = _client(monkeypatch)
    assert c.post("/api/v2/admin/refresh", json={}).status_code == 401
    r = c.post("/api/v2/admin/refresh", json={}, headers={"Authorization": "Bearer " + "x" * 32})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"


def test_refresh_with_token_runs_cycle(db, monkeypatch):
    import airsight.live.jobs as jobs

    calls = {}

    def fake_cycle(store, city_ids, **kw):
        calls["ids"] = city_ids
        return {"ok": True, "n_ok": 1, "n_cities": 1}

    monkeypatch.setattr(jobs, "run_cycle", fake_cycle)
    c = _client(monkeypatch)
    r = c.post("/api/v2/admin/refresh", json={"city_ids": ["korba"]}, headers={"X-API-Key": TOKEN})
    assert r.status_code == 200, r.text
    assert calls["ids"] == ["korba"]


def test_token_rotation_accepts_any_listed_token(db, monkeypatch):
    other = "o" * 30
    c = _client(monkeypatch, tokens=f"{TOKEN},{other}")
    r = c.post("/api/v2/admin/alerts", json={"city_id": "korba", "title": "Dust event"},
               headers={"Authorization": f"Bearer {other}"})
    assert r.status_code == 201


def test_alert_injection_requires_token_and_is_listed(db, monkeypatch):
    c = _client(monkeypatch)
    body = {"city_id": "korba", "title": "Severe PM2.5 expected", "severity": "critical", "aqi": 320}
    assert c.post("/api/v2/admin/alerts", json=body).status_code == 401
    r = c.post("/api/v2/admin/alerts", json=body, headers={"Authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 201
    alert = r.json()["alert"]
    assert alert["severity"] == "critical" and "created_by" not in alert
    listed = c.get("/api/v2/alerts").json()
    assert listed["n"] == 1 and listed["alerts"][0]["title"] == body["title"]
    assert "created_by" not in listed["alerts"][0]


def test_surface_rebuild_is_admin_only(db, monkeypatch):
    c = _client(monkeypatch)
    assert c.get("/api/v2/cities/korba/surface?rebuild=true").status_code == 401


def test_retired_v1_inject_is_gone(db, monkeypatch):
    c = _client(monkeypatch)
    r = c.post("/api/v1/alerts/inject", json={})
    assert r.status_code == 410


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


def test_cors_allows_only_listed_origins(db, monkeypatch):
    c = _client(monkeypatch, origins="https://vayu.example.org, https://*.vercel.app")
    ok = c.get("/api/v2/cities", headers={"Origin": "https://vayu.example.org"})
    assert ok.headers.get("access-control-allow-origin") == "https://vayu.example.org"
    assert "access-control-allow-credentials" not in ok.headers
    bad = c.get("/api/v2/cities", headers={"Origin": "https://evil.vercel.app"})
    assert "access-control-allow-origin" not in bad.headers
    pre = c.options("/api/v2/admin/refresh", headers={
        "Origin": "https://evil.vercel.app", "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 400


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


def test_errors_use_one_envelope(db, monkeypatch):
    c = _client(monkeypatch)
    r = c.get("/api/v2/cities/nowhere")
    assert r.status_code == 404
    err = r.json()["error"]
    assert err["code"] == "unknown_city" and err["request_id"]
    assert r.headers["x-request-id"] == err["request_id"]

    v = c.get("/api/v2/air/point?lat=999&lon=0")
    assert v.status_code == 422
    assert v.json()["error"]["code"] == "invalid_request"
    assert v.json()["error"]["details"][0]["field"] == "lat"


def test_unhandled_exception_is_not_leaked(db, monkeypatch):
    import api.v2 as v2

    def boom(*a, **k):
        raise RuntimeError("connection to server at 10.0.0.5 failed: password=hunter2")

    monkeypatch.setattr(v2, "city_summary", boom)
    c = _client(monkeypatch)
    r = c.get("/api/v2/cities/korba")
    assert r.status_code == 500
    text = r.text
    assert "hunter2" not in text and "10.0.0.5" not in text and "RuntimeError" not in text
    assert r.json()["error"]["code"] == "internal_error"


def test_store_failure_returns_safe_503(db, monkeypatch):
    def broken(*a, **k):
        raise OSError("could not connect to postgresql://vayu:secret@db.internal/vayu")

    monkeypatch.setattr(Store, "open", classmethod(lambda cls, path=None: broken()))
    c = _client(monkeypatch)
    r = c.get("/api/v2/health")
    assert r.status_code == 503
    assert "secret" not in r.text and "db.internal" not in r.text
    assert r.json()["error"]["code"] == "store_unavailable"


def test_upstream_failure_is_sanitised(db, monkeypatch):
    import api.v2 as v2

    def fail(*a, **k):
        raise ConnectionError("HTTPSConnectionPool(host='geocoding-api.open-meteo.com')")

    monkeypatch.setattr(v2, "geocode", fail)
    r = _client(monkeypatch).get("/api/v2/search?q=korba")
    assert r.status_code == 503
    assert "open-meteo" not in r.text


def test_api_imports_without_optional_libs():
    # langgraph / torch / redis are optional: the API must import without them.
    import api.main as main

    importlib.reload(main)
    assert main.app is not None


# ---------------------------------------------------------------------------
# AQI (CPCB only)
# ---------------------------------------------------------------------------


def test_cpcb_breakpoints_not_us_epa():
    # 60 µg/m³ PM2.5 is the top of "Satisfactory" (100) in CPCB; US EPA would say ~153.
    assert sub_index("pm25", 60.0) == pytest.approx(100.0)
    assert compute_naqi({"pm25": 60.0})["aqi_basis"] == "cpcb_naqi"


def test_o3_uses_max_8h_rolling_mean_in_24h():
    o3 = [40.0] * 24
    o3[5:13] = [200.0] * 8  # an 8-hour episode earlier in the day
    res = compute_naqi_rolling({"o3": o3, "pm25": [20.0] * 24}, 23)
    # trailing-8h mean would be 40; CPCB uses the day's max 8h mean (200)
    assert res["averaging"]["o3"]["method"] == "max_8h_rolling_mean_in_24h"
    assert res["sub_indexes"]["o3"]["value"] == pytest.approx(200.0)


def test_cpcb_validity_needs_three_pollutants_with_pm():
    h = {"pm25": [40.0] * 24, "no2": [30.0] * 24, "so2": [10.0] * 24}
    assert compute_naqi_rolling(h, 23)["cpcb_valid"] is True
    assert compute_naqi_rolling({"pm25": [40.0] * 24}, 23)["cpcb_valid"] is False


def test_hourly_grid_respects_gaps():
    # 13 rows spread over 48 hours: the 24h window must see only rows in it.
    rows = [{"ts": _iso(NOW - timedelta(hours=4 * i)), "pm25": 100.0 if i < 6 else 10.0} for i in range(13)]
    stamps, grid = hourly_grid(rows, pollutants=("pm25",), hours=48)
    assert stamps[-1] == _iso(NOW) and len(grid["pm25"]) == 48
    assert sum(v is not None for v in grid["pm25"][-24:]) == 6
    # only 6/24 hours present -> below 50% coverage -> no PM2.5 24h mean
    assert "pm25" not in naqi_from_rows(rows)["averaging"]


def test_rolling_pm25_aqi_is_24h_mean():
    series = [30.0] * 23 + [300.0]
    aqi = rolling_pm25_aqi(series)
    mean = (30.0 * 23 + 300.0) / 24
    assert aqi[-1] == round(sub_index("pm25", mean))
    assert aqi[-1] < round(sub_index("pm25", 300.0))
    assert aqi[0] is None  # 1/24 coverage


def test_no_us_aqi_in_backend():
    from airsight.live.openmeteo import AQ_HOURLY

    assert not any("us_aqi" in v or "european" in v for v in AQ_HOURLY)


def test_city_endpoint_reports_cpcb_basis_and_freshness(db, monkeypatch):
    body = _client(monkeypatch).get("/api/v2/cities/korba").json()
    assert body["aqi_basis"] == "cpcb_naqi"
    # 24h means: PM2.5 45 -> 76, PM10 80 -> 80; the worst sub-index wins.
    assert body["aqi"] == 80 and body["dominant"] == "pm10"
    assert body["cpcb_valid"] is True
    fr = body["freshness"]
    assert set(fr) == {"cams", "openaq", "met", "forecast", "fires"}
    assert fr["cams"]["stale"] is False and fr["met"]["stale"] is True


# ---------------------------------------------------------------------------
# Data bugs
# ---------------------------------------------------------------------------


def test_stale_firms_rows_are_dropped():
    from airsight.live.fires import drop_stale_fires

    rows = [{"ts": "2021-01-03T05:00:00Z"}, {"ts": _iso(NOW - timedelta(hours=3))}]
    kept, n_old = drop_stale_fires(rows, max_age_hours=54)
    assert n_old == 1 and kept == [rows[1]]


def test_ingestor_local_csv_never_replays_archive(tmp_path, monkeypatch):
    pytest.importorskip("pydantic_settings")
    from services.ingestor import sources

    archive = "latitude,longitude,acq_date,acq_time,frp,confidence\n22.3,82.7,2021-01-05,0730,12.0,80\n"
    fake_root = tmp_path / "repo"
    (fake_root / "data" / "fire").mkdir(parents=True)
    (fake_root / "data" / "fire" / "firms_chhattisgarh.csv").write_text(archive)
    (fake_root / "services" / "ingestor").mkdir(parents=True)
    monkeypatch.setattr(sources, "__file__", str(fake_root / "services" / "ingestor" / "sources.py"))
    rows, detail = sources._firms_from_local_csv(sources.Settings())
    assert rows == [] and "archive only" in detail


def test_satellite_qa_masks_scales_and_dedupes():
    from airsight.io.satellite import qa_filter

    aod = pd.DataFrame({"cell_id": ["a", "a", "b", "c"], "date": ["2024-01-01"] * 4,
                        "mean": [450.0, 550.0, 9000.0, 300.0]})
    out, stats = qa_filter(aod, "aod")
    assert stats["scaled"] == 4 and stats["duplicates"] == 1
    a = out.set_index("cell_id")["mean"]
    assert a["a"] == pytest.approx(0.5) and np.isnan(a["b"])  # 9.0 AOD is masked

    no2 = pd.DataFrame({"cell_id": ["x", "y"], "date": ["2024-01-01"] * 2, "mean": [1e-4, -0.01]})
    out, stats = qa_filter(no2, "no2")
    assert stats["masked"] == 1


def test_gee_export_applies_qa_masks():
    src = open("scripts/04_gee_export.py", encoding="utf-8").read()
    assert "col = apply_qa(col, ch)" in src
    assert 'bitwiseAnd(0b111).eq(1)' in src and "cloud_fraction" in src


def test_empty_features_are_not_silent():
    from scripts.features_v2 import EmptyFeatureError, build_feature_frame, feature_matrix

    frame = build_feature_frame([{"unrelated": 1.0, "ts": "2026-01-01T00:00:00Z"}])
    with pytest.raises(EmptyFeatureError):
        feature_matrix(frame)
    good = build_feature_frame([{"temp_c": 25, "rh_pct": 50, "wind_speed": 2, "wind_dir": 90, "pm25": 40,
                                 "blh_m": 600, "precip_mm": 0, "cams_no2": 10, "cams_aod": 0.4,
                                 "cams_dust": 1, "population": 1000, "pm25_lag24": 35,
                                 "fire_frp": 0, "urban_frac": .5, "industry_frac": .1, "veg_frac": .2}])
    sparse = build_feature_frame([{"pm25": 40, "temp_c": 25, "ts": "2026-01-01T00:00:00Z"}])
    with pytest.raises(EmptyFeatureError):
        feature_matrix(sparse, required=["no2_column"])
    assert feature_matrix(good).shape == (1, len(good.columns))
    assert good.loc[0, "wind_u"] == pytest.approx(-2.0, abs=1e-6)


def test_predict_frame_refuses_mostly_empty_inputs():
    from airsight.models.registry import MissingFeaturesError, predict_frame

    class M:
        def predict(self, x):
            return np.full(len(x), 10.0)

    bundle = {"version": "t", "features": ["a", "b", "c"],
              "p10": {"model": M()}, "p50": {"model": M()}, "p90": {"model": M()}}
    with pytest.raises(MissingFeaturesError):
        predict_frame(bundle, pd.DataFrame({"z": [1.0, 2.0]}))
    out = predict_frame(bundle, pd.DataFrame({"a": [1.0], "b": [2.0]}))
    assert out.attrs["missing_features"] == ["c"]


# ---------------------------------------------------------------------------
# Storage / freshness / jobs
# ---------------------------------------------------------------------------


def test_postgres_adapter_sql_translation():
    from airsight.store import _PgConnection, _redact

    assert _PgConnection._sql("SELECT * FROM t WHERE a = ? AND b LIKE '5%'") == \
        "SELECT * FROM t WHERE a = %s AND b LIKE '5%%'"
    assert _PgConnection._sql("WHERE horizon_h IS ? AND x IS NULL") == \
        "WHERE horizon_h IS NOT DISTINCT FROM %s AND x IS NULL"
    assert _redact("postgresql://vayu:secret@db.example.com:5432/vayu") == "postgresql://db.example.com/vayu"


def test_database_url_selects_postgres(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost:1/x")
    assert store_module.database_url().startswith("postgresql://")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///foo.db")
    assert store_module.database_url() is None


def test_source_freshness_and_ingest_log(db):
    with Store.open(db) as s:
        s.log_ingest("firms", "empty", rows=0)
        fr = s.source_freshness("korba")
    assert fr["cams"]["stale"] is False
    assert fr["fires"]["stale"] is False  # synced just now, zero detections is fine
    assert fr["openaq"]["stale"] is True and fr["openaq"]["latest_data"] is None


def test_job_lock_prevents_overlap(db, monkeypatch):
    import airsight.live.jobs as jobs

    assert jobs._run_lock.acquire(blocking=False)
    try:
        with pytest.raises(jobs.JobAlreadyRunning):
            jobs.run_cycle(city_ids=["korba"])
    finally:
        jobs._run_lock.release()


def test_job_cycle_logs_forecast(db, monkeypatch):
    import airsight.forecast.service as fs
    import airsight.live.ingest as ing
    import airsight.live.jobs as jobs

    monkeypatch.setattr(ing, "ingest_cities", lambda store, ids, **kw: {
        "ok": True, "n_ok": 1, "n_cities": 1, "cities": [{"city_id": "korba", "ok": True, "error": "x"}],
        "fires": {"status": "not_configured", "detail": "secret detail"}})
    monkeypatch.setattr(fs, "forecast_city", lambda store, cid, hours=72: {"available": True, "hourly": [1]})
    with Store.open(db) as s:
        res = jobs.run_cycle(s, ["korba"])
        assert s.recent_ingests(1)[0]["source"] == "forecast"
    assert res["ok"] and res["forecasts"][0]["available"]
    assert "error" not in res["cities"][0] and "detail" not in res["fires"]
    assert jobs._next_run(datetime(2026, 1, 1, 10, 30, tzinfo=timezone.utc), 7).hour == 11


@pytest.mark.skipif(not __import__("os").environ.get("VAYU_TEST_DATABASE_URL"),
                    reason="set VAYU_TEST_DATABASE_URL to run against a real Postgres")
def test_postgres_roundtrip(monkeypatch):
    import os

    monkeypatch.setenv("DATABASE_URL", os.environ["VAYU_TEST_DATABASE_URL"])
    with Store.open() as s:
        assert s.backend == "postgres"
        s.upsert_cities([{"id": "pgtest", "name": "PG", "lat": 1.0, "lon": 2.0, "calibrated": True}])
        s.upsert_observations([{"station_id": "pg:1", "city_id": "pgtest", "ts": _iso(NOW),
                                "source": "open-meteo-cams", "pm25": 12.0}])
        assert s.city("pgtest")["name"] == "PG"
        assert s.latest_observations("pgtest")[0]["pm25"] == 12.0
        assert s.log_ingest("test", "ok") > 0
        assert s.insert_alert({"city_id": "pgtest", "title": "t"})["id"] > 0
        assert "cams" in s.source_freshness("pgtest")
        assert s.scalar("SELECT COUNT(*) FROM cities") >= 1
