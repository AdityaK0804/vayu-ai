"""Enforcement agent: forecast + attribution + vulnerability -> ranked action list.

get_priority_wards(city, time) -> ranked cells, each a dossier the frontend/agents
consume. The dossier is assembled ONLY from deterministic tool outputs (the model,
SHAP, the wind cone, WorldPop, OSM POIs, EDGAR); the recommended_action is a fixed
template with named slots filled from those outputs - nothing is free-generated.

Priority score per cell:
    exceedance(pred_pm25 over CPCB 60 ug/m3)
  x population (WorldPop, per cell)
  x vulnerability (1 + schools + hospitals in/adjacent to the cell)
  x actionable_conf (confidence the driver is an actionable source - industry/
                     traffic/fire - not windblown dust)

Every cell is scored via a single no-lag SPATIAL model (the same feature basis the
LOSO test validated), so this works for cells with no station of their own - which
is the whole "predict + act everywhere" point.

Run:  python scripts/models/04_enforcement.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time as _time
from datetime import datetime, timezone
from pathlib import Path

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

CPCB_PM25_24H = 60.0     # CPCB national 24-h PM2.5 standard (ug/m3)
TOP_N = 5


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / fname)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _load("fc", "01_forecast_lgbm.py")
ATTR = _load("attr", "03_attribution.py")   # wind_cone, _sources, SOURCE_MAP, SHAP helpers

SPATIAL_FEATS = ([c for c in FC.WEATHER] + ["cams_pm25"] +
                 [c for c in FC.STATIC] + ["sat_aod", "sat_no2", "sat_so2"] +
                 ["hour", "dow", "month", "is_weekend"])

_STATE: dict = {}


def _spatial_model():
    """One no-lag LGBM trained on all stations. Predicts pm25(t) from cell +
    weather + cams, so it generalises to cells with no local history."""
    if "model" in _STATE:
        return _STATE["model"], _STATE["feats"]
    pool, _ = FC.load_pool()
    sat = FC.load_satellite()
    if not sat.empty:
        pool["sat_date"] = pool.timestamp.dt.normalize()
        pool = pool.merge(sat.rename(columns={"date": "sat_date"}),
                          on=["station_id", "sat_date"], how="left")
    for c in ("sat_aod", "sat_no2", "sat_so2"):
        if c not in pool.columns:
            pool[c] = np.nan
    feats = [c for c in SPATIAL_FEATS if c in pool.columns]
    ds = lgb.Dataset(pool[feats], pool.pm25)
    model = lgb.train({**FC.LGB_PARAMS}, ds, num_boost_round=400)
    _STATE.update(model=model, feats=feats, pool=pool)
    say(f"spatial model trained: {len(pool):,} rows, {len(feats)} features (no lags)")
    return model, feats


def _city_weather_at(city_id: str, ts: pd.Timestamp) -> dict:
    """City-level weather + cams at ts (Open-Meteo is one point per city, so every
    cell shares it). Falls back to the nearest available hour.

    Zero-station cities (jagdalpur) are absent from the trained pool, so read
    their weather straight from the processed feature table - this is exactly the
    reveal path: predict a city with no ground sensors from its met + satellite."""
    pool = _STATE["pool"]
    sub = pool[pool.city_id == city_id]
    if sub.empty:
        p = DATA / "processed" / f"{city_id}_features.parquet"
        sub = pd.read_parquet(p).drop_duplicates("timestamp")
    exact = sub[sub.timestamp == ts]
    row = exact.iloc[0] if len(exact) else sub.iloc[(sub.timestamp - ts).abs().argmin()]
    cols = [c for c in FC.WEATHER if c in sub.columns] + ["cams_pm25"]
    return {c: row[c] for c in cols}, pd.Timestamp(row.timestamp)


def _vulnerability(city_id: str) -> dict:
    """schools+hospitals -> count per H3 cell, spread to the cell and its ring-1
    neighbours so a site just over a cell edge still counts as 'near'."""
    import geopandas as gpd
    counts: dict[str, int] = {}
    pdir = DATA / "osm" / "pois" / city_id
    for kind in ("schools", "hospitals"):
        f = pdir / f"{kind}.geojson"
        if not f.exists():
            continue
        g = gpd.read_file(f)
        for geom in g.geometry:
            if geom is None or geom.is_empty:
                continue
            pt = geom if geom.geom_type == "Point" else geom.centroid
            c = h3.latlng_to_cell(pt.y, pt.x, FC.H3_RES)
            for cell in [c] + list(h3.grid_disk(c, 1)):
                counts[cell] = counts.get(cell, 0) + 1
    return counts


def _grid(city_id: str) -> pd.DataFrame:
    return pd.read_parquet(DATA / "grid" / f"{city_id}.parquet")


# tiered upwind search radii: try tight first, widen only as a fallback
_CONE_TIGHT = (15.0, 35.0)     # km, half-angle deg
_CONE_WIDE = (25.0, 45.0)
_HOTSPOT_PREFIXES = ("Thermal hotspot", "SO2 hotspot", "Unnamed")


def _scan_cone(lat, lon, wind_dir, km, deg):
    """Upwind sources within (km, deg) of the direction the wind blows FROM.
    GPPD plants (gppd_india.csv) are type 'power_plant'; registry points are
    type 'industry'. Returns list sorted by distance."""
    if wind_dir is None or (isinstance(wind_dir, float) and math.isnan(wind_dir)):
        return []
    gppd, ind = ATTR._sources()
    hits = []
    for _, r in gppd.iterrows():
        d = ATTR._haversine_km(lat, lon, r.latitude, r.longitude)
        if d > km:
            continue
        br = ATTR._bearing(lat, lon, r.latitude, r.longitude)
        if ATTR._angular_diff(br, wind_dir) <= deg:
            hits.append({"type": "power_plant", "name": str(r["name"])[:48],
                         "km": round(d, 1), "bearing": round(br),
                         "capacity_mw": float(r.capacity_mw) if pd.notna(r.capacity_mw) else None})
    for _, r in ind.iterrows():
        d = ATTR._haversine_km(lat, lon, r.latitude, r.longitude)
        if d > km:
            continue
        br = ATTR._bearing(lat, lon, r.latitude, r.longitude)
        if ATTR._angular_diff(br, wind_dir) <= deg:
            hits.append({"type": "industry", "name": str(r["name"])[:48],
                         "km": round(d, 1), "bearing": round(br)})
    hits.sort(key=lambda h: h["km"])
    return hits


def _select_and_cone(lat, lon, wind_dir):
    """Pick the source to name in the dossier. Preference order:
      1. named GPPD power plant in the TIGHT cone
      2. named GPPD power plant in the WIDE cone (fallback only)
      3. named (non-hotspot) registry source in the wide cone
      4. nearest upwind of anything
    Returns (chosen, upwind_list, widened_bool)."""
    import math as _m

    def named_gppd(hits):
        return next((h for h in hits if h["type"] == "power_plant"), None)

    tight = _scan_cone(lat, lon, wind_dir, *_CONE_TIGHT)
    g = named_gppd(tight)
    if g:
        return g, tight, False
    wide = _scan_cone(lat, lon, wind_dir, *_CONE_WIDE)
    g = named_gppd(wide)
    if g:
        return g, wide, True
    named = next((h for h in wide
                  if not str(h["name"]).startswith(_HOTSPOT_PREFIXES)), None)
    if named:
        return named, wide, True
    return (wide[0] if wide else None), wide, bool(wide)


def get_priority_wards(city: str, time, top_n: int = TOP_N) -> dict:
    t0 = _time.perf_counter()
    gen_start = datetime.now(timezone.utc)

    model, feats = _spatial_model()
    grid = _grid(city).copy()
    ts = pd.Timestamp(time)
    wx, ts_used = _city_weather_at(city, ts)

    # broadcast city weather/cams + calendar to every cell; satellite stays NaN
    # off-station (we have no per-cell satellite yet) and LightGBM tolerates it
    for k, v in wx.items():
        grid[k] = v
    grid["hour"] = ts_used.hour
    grid["dow"] = ts_used.dayofweek
    grid["month"] = ts_used.month
    grid["is_weekend"] = int(ts_used.dayofweek >= 5)
    for c in ("sat_aod", "sat_no2", "sat_so2"):
        if c not in grid.columns:
            grid[c] = np.nan

    grid["pred_pm25"] = np.clip(model.predict(grid[feats]), 0, None)
    grid["exceedance"] = np.clip(grid.pred_pm25 - CPCB_PM25_24H, 0, None)
    grid["population"] = grid.population.fillna(0.0)

    vuln = _vulnerability(city)
    grid["vuln_sites"] = grid.cell_id.map(vuln).fillna(0).astype(int)

    # actionable confidence from per-cell EDGAR: cells whose local emissions are
    # dominated by industry/power/transport are confidently actionable; low-
    # anthropogenic cells (more likely natural/dust) get a floor of ~0.5.
    anth = (grid.get("edgar_share_ind", 0) + grid.get("edgar_share_ref_trf", 0) +
            grid.get("edgar_share_ene", 0) + grid.get("edgar_share_tro", 0))
    grid["actionable_conf"] = np.clip(0.5 + 0.5 * anth, 0, 1)

    grid["score"] = (grid.exceedance * grid.population *
                     (1 + grid.vuln_sites) * grid.actionable_conf)

    ranked = grid.sort_values("score", ascending=False).reset_index(drop=True)
    dossiers = [_dossier(city, r, i + 1, ts_used)
                for i, (_, r) in enumerate(ranked.head(top_n).iterrows())]

    elapsed = _time.perf_counter() - t0
    return {
        "city": city,
        "forecast_time": str(ts_used),
        "generated_at_utc": gen_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "signal_to_dossier_seconds": round(elapsed, 2),
        "threshold_ug_m3": CPCB_PM25_24H,
        "cells_scored": int(len(grid)),
        "cells_over_threshold": int((grid.exceedance > 0).sum()),
        "top_n": top_n,
        "dossiers": dossiers,
    }


ACTION_TEMPLATES = {
    "industry": ("Dispatch industrial inspection to {source}, {km} km {compass} "
                 "(upwind) of {ward}. Forecast PM2.5 {pm} ug/m3 ({exc} over the "
                 "{thr} standard) at {time}. Exposure zone: {pop} residents, "
                 "{sites} schools/hospitals."),
    "traffic":  ("Deploy traffic/idling controls around {ward}. Forecast PM2.5 "
                 "{pm} ug/m3 ({exc} over the {thr} standard) at {time}. Exposure "
                 "zone: {pop} residents, {sites} schools/hospitals."),
    "fire":     ("Trigger open-burning / biomass response for {ward}. Forecast "
                 "PM2.5 {pm} ug/m3 ({exc} over the {thr} standard) at {time}. "
                 "Exposure zone: {pop} residents, {sites} schools/hospitals."),
    "dust":     ("Dust-dominated ({ward}): apply water-spraying / road-paving "
                 "mitigation. NOT an inspection target. Forecast PM2.5 {pm} "
                 "ug/m3 at {time}; {pop} residents affected."),
}
_COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _dossier(city: str, r: pd.Series, rank: int, ts: pd.Timestamp) -> dict:
    lat, lon = float(r.lat), float(r.lon)
    # SHAP source shares on the spatial model for THIS cell
    X = pd.DataFrame([{c: r[c] for c in _STATE["feats"]}])[_STATE["feats"]].astype(float)
    import shap
    expl = shap.TreeExplainer(_STATE["model"])
    sv = expl.shap_values(X)
    sv = sv[0] if isinstance(sv, list) else sv
    shap_row = pd.Series(np.ravel(sv)[:len(_STATE["feats"])], index=_STATE["feats"])
    raw = {}
    for src, cols in ATTR.SOURCE_MAP.items():
        raw[src] = float(np.abs(shap_row[[c for c in cols if c in shap_row.index]]).sum())
    tot = sum(raw.values()) or 1.0
    shares = {k: round(v / tot, 3) for k, v in raw.items()}

    chosen, upwind, widened = _select_and_cone(lat, lon, r.get("wind_dir"))
    cone = {"checked": r.get("wind_dir") is not None,
            "wind_from_deg": round(float(r.wind_dir)) if pd.notna(r.get("wind_dir")) else None,
            "widened_to_25km": widened, "upwind": upwind[:8]}
    gppd_hit = chosen if (chosen and chosen["type"] == "power_plant") else None
    named = chosen["name"] if chosen else None

    top_source = max(shares, key=shares.get)
    if chosen and shares.get("industry", 0) > 0.15:
        top_source = "industry"          # corroborated by a real upwind source

    # EDGAR agreement (anthropogenic buckets)
    eb = {b: float(sum(r.get(c, 0) for c in cols)) for b, cols in ATTR.EDGAR_BUCKET.items()}
    es = sum(eb.values()) or 1.0
    eb = {k: round(v / es, 3) for k, v in eb.items()}
    edgar_top = max(eb, key=eb.get)

    # H3 cell ids share the trailing 'fffff'; the distinguishing bits are in the
    # middle, so slice there for a readable, collision-free ward label.
    ward = f"{city}-{r.cell_id[4:11]}"
    compass = _COMPASS[int((chosen["bearing"] + 22.5) // 45) % 8] if chosen else "-"
    action = ACTION_TEMPLATES[top_source].format(
        source=named or "nearest registered emitter",
        km=chosen["km"] if chosen else "?",
        compass=compass, ward=ward, pm=round(float(r.pred_pm25), 1),
        exc=round(float(r.exceedance), 1), thr=int(CPCB_PM25_24H),
        time=ts.strftime("%Y-%m-%d %H:%M"), pop=int(round(r.population)),
        sites=int(r.vuln_sites))

    conf = round(float(np.clip(
        0.4 * max(shares.values()) +
        0.25 * (1.0 if gppd_hit else (0.6 if cone.get("upwind") else 0.4)) +
        0.2 * (1.0 if top_source == edgar_top else 0.7) +
        0.15 * float(r.actionable_conf), 0, 1)), 3)
    # named_upwind_source in the return reflects `chosen`

    return {
        "rank": rank,
        "cell": r.cell_id,
        "ward": ward,
        "lat": round(lat, 4), "lon": round(lon, 4),
        "predicted_pm25": round(float(r.pred_pm25), 1),
        "exceedance_over_60": round(float(r.exceedance), 1),
        "top_source": top_source,
        "attribution_shares": shares,
        "edgar_agreement": {"edgar_top": edgar_top, "edgar_shares": eb,
                            "match": bool(top_source == edgar_top),
                            "note": "dust excluded (EDGAR is anthropogenic-only)"},
        "population_affected": int(round(float(r.population))),
        "vulnerable_sites": int(r.vuln_sites),
        "upwind_sources": cone.get("upwind", [])[:5],
        "named_upwind_source": named,
        "recommended_action": action,
        "confidence": conf,
        "priority_score": round(float(r.score), 1),
    }


def main():
    print("=" * 96)
    print("ENFORCEMENT AGENT - ranked, evidence-backed action list")
    print("=" * 96)

    # worst forecast time = the hour with the highest city-mean CAMS in korba
    # (a defensible, data-driven 'bad air day' rather than a hand-picked date)
    _spatial_model()
    kor = _STATE["pool"]
    kor = kor[kor.city_id == "korba"]
    worst = kor.loc[kor.cams_pm25.idxmax(), "timestamp"]
    say(f"worst-air forecast hour for korba: {worst}")
    print()

    res = get_priority_wards("korba", worst)

    d = res["dossiers"][0]
    print("=" * 96)
    print(f"SAMPLE DOSSIER - Korba worst cell (rank 1 of {res['cells_scored']:,} cells)")
    print("=" * 96)
    print(f"  generated_at        : {res['generated_at_utc']}")
    print(f"  SIGNAL -> DOSSIER    : {res['signal_to_dossier_seconds']} s")
    print(f"  forecast time        : {res['forecast_time']}")
    print(f"  cells over 60 ug/m3  : {res['cells_over_threshold']:,} / {res['cells_scored']:,}")
    print()
    print(f"  rank {d['rank']}  ward {d['ward']}  cell {d['cell']}")
    print(f"  predicted PM2.5      : {d['predicted_pm25']} ug/m3  (exceedance {d['exceedance_over_60']} over 60)")
    print(f"  top source           : {d['top_source'].upper()}   confidence {d['confidence']}")
    print(f"  attribution shares   : " +
          "  ".join(f"{k}={v:.0%}" for k, v in sorted(d['attribution_shares'].items(), key=lambda x: -x[1])))
    print(f"  EDGAR agreement      : model={d['top_source']} vs edgar={d['edgar_agreement']['edgar_top']}  "
          f"match={d['edgar_agreement']['match']}")
    print(f"  population affected  : {d['population_affected']:,}")
    print(f"  vulnerable sites     : {d['vulnerable_sites']} (schools+hospitals in/near cell)")
    print(f"  named upwind source  : {d['named_upwind_source']}")
    if d["upwind_sources"]:
        for u in d["upwind_sources"][:3]:
            cap = f", {u['capacity_mw']:.0f}MW" if u.get("capacity_mw") else ""
            print(f"      {u['type']:<12}{u['name']:<42}{u['km']}km @ {u['bearing']}deg{cap}")
    print()
    print(f"  RECOMMENDED ACTION:")
    print(f"    {d['recommended_action']}")
    print()
    print("  --- ranked top 5 ---")
    print(f"  {'#':>2}  {'ward':<16}{'pred':>7}{'exc':>7}{'pop':>9}{'sites':>6}  {'top_source':<10}{'score':>12}")
    for x in res["dossiers"]:
        print(f"  {x['rank']:>2}  {x['ward']:<16}{x['predicted_pm25']:>7.1f}{x['exceedance_over_60']:>7.1f}"
              f"{x['population_affected']:>9,}{x['vulnerable_sites']:>6}  {x['top_source']:<10}{x['priority_score']:>12,.0f}")

    out = DATA / "processed" / "enforcement_example.json"
    out.write_text(json.dumps(res, indent=2, default=float), encoding="utf-8")
    print()
    ok(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
