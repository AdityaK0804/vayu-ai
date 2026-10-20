from datetime import datetime, timezone

from airsight.forecast.service import CAMS_SOURCE, MODEL_SOURCE
from airsight.forecast.skill import city_skill
from airsight.store import Store


def test_city_skill_scores_runs_against_later_readings(tmp_path):
    store = Store.open(tmp_path / "s.db")
    run, ts = "2026-10-19T00:00:00Z", "2026-10-19T12:00:00Z"
    store.upsert_air_forecast([
        {"city_id": "x", "run_ts": run, "ts": ts, "pm25": 40, "p10": 30, "p90": 50,
         "model_version": "m1", "source": MODEL_SOURCE},
        {"city_id": "x", "run_ts": run, "ts": ts, "pm25": 70, "model_version": "cams-direct",
         "source": CAMS_SOURCE},
    ])
    store.upsert_observations([
        {"station_id": "s1", "city_id": "x", "ts": ts, "source": "cpcb", "pm25": 45},
        {"station_id": "s1", "city_id": "x", "ts": run, "source": "cpcb", "pm25": 20},
    ])
    out = city_skill(store, "x", days=3, now=datetime(2026, 10, 20, tzinfo=timezone.utc))
    b = out["by_lead"][0]
    assert b["lead_bucket_h"] == 24 and b["n"] == 1
    assert b["model"]["mae"] == 5.0 and b["interval_coverage"] == 1.0
    assert b["vs_cams"]["cams"]["mae"] == 25.0
    assert b["vs_persistence"]["persistence"]["mae"] == 25.0
