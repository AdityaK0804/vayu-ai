from datetime import datetime, timedelta, timezone

import pytest

from airsight.impact.dossier import build_dossier, load_rules
from airsight.store import Store


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture()
def world(tmp_path):
    store = Store.open(tmp_path / "d.db")
    rules = {**load_rules(), "industry_registry": str(tmp_path / "none.geojson")}
    t1 = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    t0 = t1 - timedelta(hours=5)
    store.upsert_stations([{"station_id": "st1", "city_id": "c", "lat": 22.0, "lon": 82.0, "source": "cpcb"}])
    store.upsert_observations([
        {"station_id": "st1", "city_id": "c", "ts": _iso(t0 + timedelta(hours=h)), "source": "cpcb", "pm25": 150.0}
        for h in range(6)
    ])
    look0 = t0 - timedelta(hours=rules["lookback_hours"])
    hours = int((t1 - look0).total_seconds() // 3600) + 1
    store.upsert_met([
        {"city_id": "c", "ts": _iso(look0 + timedelta(hours=h)), "wind_speed_10m": 3.0,
         "wind_direction_10m": 90.0, "source": "open-meteo"} for h in range(hours)
    ])
    store.upsert_fires([
        {"fire_key": "east", "ts": _iso(t0 - timedelta(hours=3)), "lat": 22.0, "lon": 82.2, "frp": 12.0,
         "source": "firms", "satellite": "N20", "city_id": "c"},
        {"fire_key": "west", "ts": _iso(t0 - timedelta(hours=3)), "lat": 22.0, "lon": 81.8, "frp": 30.0,
         "source": "firms", "satellite": "N20", "city_id": "c"},
    ])
    return store, rules, _iso(t0), _iso(t1)


def test_supported_dossier_cites_evidence_and_scores_upwind_fire(world):
    store, rules, s, e = world
    d = build_dossier(store, "c", start=s, end=e, rules=rules)
    assert d["status"] == "evidence_supported", d["insufficient"]
    assert len(d["candidates"]) == 1
    cand = d["candidates"][0]
    assert cand["kind"] == "fire" and cand["offset_from_upwind_deg"] < 5
    ev_ids = {x["id"] for x in d["evidence"]}
    for claim in d["claims"]:
        assert claim["evidence"] and set(claim["evidence"]) <= ev_ids
    for item in d["evidence"]:
        assert item.get("source") and item.get("ts") or item["kind"] == "facility_record"
    comps = cand["confidence_components"]
    assert set(comps) == {"exceedance_persistence", "met_coverage", "wind_steadiness", "upwind_alignment"}
    assert 0 < cand["confidence"] <= 1


def test_ids_are_stable(world):
    store, rules, s, e = world
    a = build_dossier(store, "c", start=s, end=e, rules=rules)
    b = build_dossier(store, "c", start=s, end=e, rules=rules)
    assert a["id"] == b["id"] and a["content_hash"] == b["content_hash"]
    assert [c["id"] for c in a["claims"]] == [c["id"] for c in b["claims"]]


def test_insufficient_when_wind_unsteady(world):
    store, rules, s, e = world
    strict = {**rules, "min_wind_steadiness": 1.01}
    d = build_dossier(store, "c", start=s, end=e, rules=strict)
    assert d["status"] == "insufficient_evidence" and "wind_steadiness" in d["insufficient"]
    assert d["candidates"] == [] and not [c for c in d["claims"] if c["type"] == "upwind_source"]


def test_insufficient_without_exceedance(world):
    store, rules, s, e = world
    d = build_dossier(store, "c", start=s, end=e, rules={**rules, "exceedance_min_aqi": 1000})
    assert d["status"] == "insufficient_evidence"
    assert {"exceedance_present", "receptor_located"} <= set(d["insufficient"])
