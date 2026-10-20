"""Evidence-backed enforcement dossiers for PM2.5 exceedance events.

Every claim cites evidence items by id; every evidence item names its source
and timestamp. Confidence is built only from measured quantities (exceedance
persistence, data coverage, wind steadiness, upwind alignment) and each
component is reported. When a precondition fails the dossier says
``insufficient_evidence`` with the failed checks instead of guessing.
Policy thresholds come from ``config/enforcement.yaml``.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml

from airsight.aqi.cpcb_naqi import sub_index
from airsight.config import CONFIG, ROOT
from airsight.store import Store

EARTH_KM = 6371.0088
MS_TO_KMH = 3.6  # met.wind_speed_10m is stored in m/s (Open-Meteo wind_speed_unit=ms)


def load_rules(path: Path | None = None) -> dict[str, Any]:
    return yaml.safe_load((path or CONFIG / "enforcement.yaml").read_text(encoding="utf-8"))


def _sid(*parts: Any) -> str:
    """Stable id: same inputs -> same id across runs and deploys."""
    blob = json.dumps(parts, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def _bearing_deg(lat1, lon1, lat2, lon2) -> float:
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _angle_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def _wind_summary(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Mean 'from' direction, steadiness (mean resultant length) and speed."""
    pts = [(float(r["wind_direction_10m"]), float(r["wind_speed_10m"]))
           for r in rows if r.get("wind_direction_10m") is not None and r.get("wind_speed_10m") is not None]
    if not pts:
        return None
    s = sum(math.sin(math.radians(d)) for d, _ in pts) / len(pts)
    c = sum(math.cos(math.radians(d)) for d, _ in pts) / len(pts)
    return {"from_deg": round((math.degrees(math.atan2(s, c)) + 360) % 360, 1),
            "steadiness": round(math.hypot(s, c), 3),
            "mean_speed_ms": round(sum(v for _, v in pts) / len(pts), 2), "n_hours": len(pts)}


def _back_trajectory(lat: float, lon: float, rows: list[dict[str, Any]], hours: int) -> list[dict[str, Any]]:
    """Walk upwind hour by hour from the receptor using the observed wind."""
    path, cur_lat, cur_lon = [], lat, lon
    for r in sorted(rows, key=lambda r: r["ts"], reverse=True)[:hours]:
        if r.get("wind_direction_10m") is None or r.get("wind_speed_10m") is None:
            continue
        km = float(r["wind_speed_10m"]) * MS_TO_KMH  # distance covered in one hour
        brg = math.radians(float(r["wind_direction_10m"]))  # air came FROM this bearing
        cur_lat += (km * math.cos(brg)) / 111.32
        cur_lon += (km * math.sin(brg)) / (111.32 * max(math.cos(math.radians(cur_lat)), 1e-6))
        path.append({"ts": r["ts"], "lat": round(cur_lat, 5), "lon": round(cur_lon, 5)})
    return path


def _industries(rules: dict[str, Any]) -> list[dict[str, Any]]:
    p = ROOT / rules["industry_registry"]
    if not p.exists():
        return []
    out = []
    for f in json.loads(p.read_text(encoding="utf-8")).get("features", []):
        pr = f.get("properties") or {}
        lat, lon = pr.get("latitude"), pr.get("longitude")
        if lat is None or lon is None:
            coords = (f.get("geometry") or {}).get("coordinates") or [None, None]
            lon, lat = coords[0], coords[1]
        if lat is None or lon is None:
            continue
        out.append({"name": pr.get("name"), "lat": float(lat), "lon": float(lon),
                    "registry_source": pr.get("source"), "notes": pr.get("notes")})
    return out


def build_dossier(store: Store, city_id: str, *, start: str, end: str,
                  station_id: str | None = None, rules: dict[str, Any] | None = None) -> dict[str, Any]:
    rules = rules or load_rules()
    t0, t1 = _parse(start), _parse(end)
    look0 = t0 - timedelta(hours=int(rules["lookback_hours"]))
    pol = rules["pollutant"]
    stations = {s["station_id"]: s for s in store.stations(city_id)} if hasattr(store, "stations") else {}
    obs = [r for r in store.observations(city_id, station_id, since=_iso(t0), until=_iso(t1))
           if r.get("source") in rules["measured_sources"] and r.get(pol) is not None]
    evidence: dict[str, dict[str, Any]] = {}
    checks: list[dict[str, Any]] = []

    def add(kind: str, key: tuple, **item) -> str:
        eid = f"{kind}:{_sid(kind, *key)}"
        evidence[eid] = {"id": eid, "kind": kind, **item}
        return eid

    readings = []
    for r in obs:
        si = sub_index(pol, float(r[pol]))
        eid = add("station_reading", (r["station_id"], r["ts"], r["source"]), station_id=r["station_id"],
                  ts=r["ts"], value=float(r[pol]), unit="µg/m³", sub_index=si, source=r["source"],
                  ingested_at=r.get("ingested_at"))
        readings.append((eid, r, si))
    exceed = [x for x in readings if x[2] is not None and x[2] >= rules["exceedance_min_aqi"]]
    hours_measured = len({r["ts"] for _, r, _ in readings})
    checks.append({"check": "measured_hours", "value": hours_measured,
                   "required": rules["min_measured_hours"], "ok": hours_measured >= rules["min_measured_hours"]})
    checks.append({"check": "exceedance_present", "value": len(exceed), "required": 1, "ok": bool(exceed)})

    # Receptor = the exceeding station with the most exceedance hours.
    receptor = None
    if exceed:
        counts: dict[str, int] = {}
        for _, r, _ in exceed:
            counts[r["station_id"]] = counts.get(r["station_id"], 0) + 1
        receptor_id = max(sorted(counts), key=counts.get)
        st = stations.get(receptor_id) or {}
        if st.get("lat") is not None:
            receptor = {"station_id": receptor_id, "lat": float(st["lat"]), "lon": float(st["lon"]),
                        "source": st.get("source")}
    checks.append({"check": "receptor_located", "value": bool(receptor), "required": True, "ok": bool(receptor)})

    met = store.met(city_id, since=_iso(look0), until=_iso(t1))
    expected_h = max(1, int((t1 - look0).total_seconds() // 3600) + 1)
    wind_rows = [m for m in met if m.get("wind_direction_10m") is not None]
    for m in wind_rows:
        m["_eid"] = add("wind_hour", (city_id, m["ts"]), ts=m["ts"], from_deg=m["wind_direction_10m"],
                        speed_ms=m.get("wind_speed_10m"), source=m.get("source"))
    met_cov = round(len(wind_rows) / expected_h, 3)
    wind = _wind_summary(wind_rows)
    checks.append({"check": "met_coverage", "value": met_cov, "required": rules["min_met_coverage"],
                   "ok": met_cov >= rules["min_met_coverage"]})
    steady = wind["steadiness"] if wind else 0.0
    checks.append({"check": "wind_steadiness", "value": steady, "required": rules["min_wind_steadiness"],
                   "ok": steady >= rules["min_wind_steadiness"]})

    candidates: list[dict[str, Any]] = []
    trajectory: list[dict[str, Any]] = []
    if receptor and wind:
        trajectory = _back_trajectory(receptor["lat"], receptor["lon"], wind_rows, int(rules["trajectory_hours"]))
        half = float(rules["upwind_half_angle_deg"])
        radius = float(rules["search_radius_km"])

        def consider(kind, ident, lat, lon, eids, meta):
            d = _haversine_km(receptor["lat"], receptor["lon"], lat, lon)
            if d > radius:
                return
            off = _angle_diff(_bearing_deg(receptor["lat"], receptor["lon"], lat, lon), wind["from_deg"])
            if off > half:
                return
            candidates.append({"id": f"candidate:{_sid(kind, ident)}", "kind": kind, "lat": lat, "lon": lon,
                               "distance_km": round(d, 2), "offset_from_upwind_deg": round(off, 1),
                               "alignment": round(math.cos(math.radians(off)), 3), "evidence": eids, **meta})

        hours_back = int((t1 - look0).total_seconds() // 3600) + 1
        for f in store.fires(hours=hours_back + int((datetime.now(timezone.utc) - t1).total_seconds() // 3600) + 1):
            if not (_iso(look0) <= f["ts"] <= _iso(t1)):
                continue
            eid = add("fire_detection", (f["fire_key"],), fire_key=f["fire_key"], ts=f["ts"], lat=f["lat"],
                      lon=f["lon"], frp_mw=f.get("frp"), confidence=f.get("confidence"),
                      satellite=f.get("satellite"), source=f.get("source"))
            consider("fire", f["fire_key"], float(f["lat"]), float(f["lon"]), [eid],
                     {"ts": f["ts"], "frp_mw": f.get("frp")})
        for ind in _industries(rules):
            consider("facility", (ind["name"], ind["lat"], ind["lon"]), ind["lat"], ind["lon"],
                     [add("facility_record", (ind["name"], ind["lat"], ind["lon"]), name=ind["name"],
                          lat=ind["lat"], lon=ind["lon"], source=ind["registry_source"], notes=ind["notes"],
                          registry=rules["industry_registry"])],
                     {"name": ind["name"]})
        # Drop facility evidence that did not become a candidate.
        keep = {e for c in candidates for e in c["evidence"]}
        evidence = {k: v for k, v in evidence.items() if v["kind"] not in ("facility_record", "fire_detection") or k in keep}
    checks.append({"check": "upwind_candidates", "value": len(candidates), "required": 1, "ok": bool(candidates)})

    # Confidence components, all measured; overall = geometric mean (no weights).
    persistence = round(len({r["ts"] for _, r, _ in exceed}) / max(hours_measured, 1), 3)
    components = {"exceedance_persistence": persistence, "met_coverage": min(met_cov, 1.0),
                  "wind_steadiness": steady}
    for c in candidates:
        parts = [*components.values(), max(c["alignment"], 0.0)]
        c["confidence"] = round(math.prod(parts) ** (1 / len(parts)), 3) if all(p > 0 for p in parts) else 0.0
        c["confidence_components"] = {**components, "upwind_alignment": c["alignment"]}
    candidates.sort(key=lambda c: (-c["confidence"], c["distance_km"], c["id"]))

    failed = [c["check"] for c in checks if not c["ok"]]
    status = "insufficient_evidence" if failed else "evidence_supported"
    claims = []
    if exceed:
        claims.append({"id": f"claim:{_sid('exceedance', receptor and receptor['station_id'], start, end)}",
                       "type": "exceedance",
                       "statement": f"{len(exceed)} measured hour(s) at or above CPCB NAQI "
                                    f"{rules['exceedance_min_aqi']} for {pol}",
                       "evidence": sorted(e for e, _, _ in exceed)})
    if wind and receptor:
        claims.append({"id": f"claim:{_sid('wind', city_id, start, end)}", "type": "wind_transport",
                       "statement": f"mean wind from {wind['from_deg']}° (steadiness {wind['steadiness']})",
                       "evidence": sorted(m["_eid"] for m in wind_rows), "trajectory": trajectory})
    if not failed:
        for c in candidates:
            claims.append({"id": f"claim:{_sid('upwind_source', c['id'], start, end)}", "type": "upwind_source",
                           "statement": f"{c['kind']} {c.get('name') or c['id']} lies "
                                        f"{c['distance_km']} km upwind ({c['offset_from_upwind_deg']}° off axis)",
                           "candidate": c["id"], "confidence": c["confidence"],
                           "evidence": sorted(set(c["evidence"]) | {e for e, _, _ in exceed})})
    # id is stable for the same question; content_hash changes only if the evidence does.
    dossier_id = f"dossier:{_sid(city_id, station_id, _iso(t0), _iso(t1), rules['rules_version'])}"
    content_hash = _sid(sorted(evidence), [c["id"] for c in claims])
    return {"id": dossier_id, "content_hash": content_hash, "city_id": city_id, "station_id": station_id, "window": {"start": start, "end": end},
            "lookback_start": _iso(look0), "rules_version": rules["rules_version"], "status": status,
            "insufficient": failed, "checks": checks, "receptor": receptor, "wind": wind,
            "candidates": candidates if not failed else [], "claims": claims,
            "evidence": [evidence[k] for k in sorted(evidence)],
            "note": "Attribution claims are only emitted when every check passes. Upwind proximity is "
                    "circumstantial evidence, not proof of emission."}
