"""CPCB (data.gov.in) parsing, weather throttle/push, config-driven sources."""

from datetime import datetime, timezone

import pytest

from airsight.aqi.cpcb_naqi import sub_index
from airsight.live import cpcb
from airsight.live.sources_config import cpcb_station_registry, section

NOW = datetime(2026, 10, 20, 14, 0, tzinfo=timezone.utc)


def _rec(station, pol, avg, when="20-10-2026 19:00:00", lat="21.258815", lon="81.578979"):
    return {"state": "Chhattisgarh", "station": station, "pollutant_id": pol,
            "avg_value": str(avg), "min_value": "1", "max_value": "999",
            "last_update": when, "latitude": lat, "longitude": lon}


def test_registry_has_14_configured_stations():
    reg = cpcb_station_registry()
    assert len(reg) == 14
    assert {r["city_id"] for r in reg} >= {"raipur", "korba", "bhilai", "kunjemara"}
    assert section("cpcb_datagov")["resource_id"]


@pytest.mark.parametrize("pol,conc", [("pm25", 45.0), ("pm10", 180.0), ("no2", 60.0), ("co", 1.4), ("o3", 75.0)])
def test_sub_index_inverse_roundtrip(pol, conc):
    idx = sub_index(pol, conc)
    back = cpcb.concentration_from_sub_index(pol, idx)
    assert back == pytest.approx(conc, rel=0.02)


def test_parse_records_groups_station_and_recomputes_aqi():
    recs = [_rec("AIIMS, Raipur - CECB", p, v) for p, v in
            [("PM2.5", 77), ("PM10", 98), ("NO2", 8), ("CO", 30), ("OZONE", 18), ("SO2", 5)]]
    rows, unmatched = cpcb.parse_records(recs, cpcb_station_registry(), now=NOW, fetched_at="2026-10-20T14:00:05Z")
    assert unmatched == []
    assert len(rows) == 1
    r = rows[0]
    assert r["station_id"] == "raipur_01" and r["city_id"] == "raipur"
    assert r["source"] == "cpcb" and r["fetched_at"] == "2026-10-20T14:00:05Z"
    assert r["ts"] == "2026-10-20T13:30:00Z"  # 19:00 IST
    # sub-index 77 for PM2.5 -> concentration in the 30-60 band
    assert 30 < r["pm25"] < 60
    # AQI is recomputed from concentrations: the max sub-index (PM10 98 / PM2.5 77)
    assert r["aqi"] == pytest.approx(98, abs=1)
    assert r["dominant"] == "pm10"


def test_parse_records_matches_renamed_station_by_coordinates_and_drops_stale():
    recs = [_rec("Thirty-Two Bungalow (renamed)", p, 60, lat="21.194815", lon="81.31477") for p in ("PM2.5", "PM10", "NO2")]
    recs += [_rec("Unknown Site", "PM2.5", 50, lat="10.0", lon="10.0")]
    recs += [_rec("AIIMS, Raipur - CECB", "PM2.5", 50, when="18-10-2026 10:00:00")]
    rows, unmatched = cpcb.parse_records(recs, cpcb_station_registry(), now=NOW)
    assert [r["station_id"] for r in rows] == ["bhilai_02"]
    assert unmatched == ["Unknown Site"]


def test_aqi_needs_three_pollutants_with_pm():
    recs = [_rec("AIIMS, Raipur - CECB", p, 40) for p in ("NO2", "SO2", "OZONE")]
    rows, _ = cpcb.parse_records(recs, cpcb_station_registry(), now=NOW)
    assert rows[0]["aqi"] is None


def test_fetch_without_key_is_not_configured(monkeypatch):
    monkeypatch.delenv("DATA_GOV_IN_API_KEY", raising=False)
    rows, status = cpcb.fetch_latest()
    assert rows == [] and status["status"] == "not_configured"


def test_weather_backoff_and_push(tmp_path, monkeypatch):
    from airsight.live import ingest
    from airsight.live.openmeteo import OpenMeteoError
    from airsight.store import Store

    monkeypatch.delenv("DATABASE_URL", raising=False)
    calls = []

    def boom(*a, **k):
        calls.append(1)
        raise OpenMeteoError("rate limited (429)")

    monkeypatch.setattr(ingest, "fetch_weather", boom)
    with Store.open(tmp_path / "t.db") as s:
        ingest.seed_registry(s)
        cities = s.cities()
        out = ingest._weather_batch(s, cities, past_days=1, forecast_days=1)
        assert out["_status"]["status"] == "error" and len(calls) == 1
        # second refresh inside the back-off window makes no request
        out = ingest._weather_batch(s, cities, past_days=1, forecast_days=1)
        assert out["_status"]["status"] == "backoff" and len(calls) == 1

        payload = [{"latitude": c["lat"], "longitude": c["lon"],
                    "hourly": {"time": ["2026-10-20T12:00", "2026-10-20T13:00"],
                               "temperature_2m": [30.1, 29.5], "wind_speed_10m": [2.0, 2.5]}}
                   for c in cities[:2]]
        res = ingest.ingest_weather_payload(s, payload, [c["id"] for c in cities[:2]])
        assert res["rows"] == 4
        with pytest.raises(ValueError):
            ingest.ingest_weather_payload(s, payload, [cities[0]["id"]])
