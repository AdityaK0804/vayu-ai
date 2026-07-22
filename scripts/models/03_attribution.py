"""Source-attribution agent: decompose predicted PM2.5 into source shares.

get_attribution(city, cell, time) -> {shares, confidence, top_source, edgar_agreement}

Method
------
1. SHAP on the trained t+24h LightGBM model gives each feature's push on THIS
   prediction. Features are bucketed into sources (traffic / industry / fire /
   dust). Persistence (pm25 lags, CAMS) and meteorology are NOT sources - they
   carry the overall level and are reported separately, so the source shares are
   computed over source-attributable features only and are not swamped by the
   autocorrelation term that dominates raw importance.
2. Wind-cone: given wind_dir that hour, if a real source (GPPD plant or OSM/registry
   industrial point) sits UPWIND within N km, the industry share is boosted.
3. EDGAR validation: model's anthropogenic shares vs EDGAR's own sector shares for
   that cell (cosine agreement + top-source match). EDGAR is anthropogenic-only, so
   dust is excluded from that comparison - stated, not hidden.

Run:  python scripts/models/03_attribution.py
"""
from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path

import h3
import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

MODEL_PATH = DATA / "models" / "lgbm_pm25_h24.joblib"
H3_RES = 8
WIND_CONE_KM = 15.0
WIND_CONE_DEG = 35.0     # half-angle tolerance around the upwind bearing

# Feature -> source bucket. Anything not listed is a modulator, not a source.
SOURCE_MAP = {
    "traffic":  ["road_density_km_km2", "road_length_km", "edgar_share_tro",
                 "traffic_index", "congestion"],
    "industry": ["edgar_share_ind", "edgar_share_ref_trf", "edgar_share_ene",
                 "edgar_pm25_total", "gppd_nearest_km", "gppd_nearest_mw",
                 "gppd_cap_25km", "gppd_inv_dist_mw", "sat_so2", "sat_no2",
                 "cams_so2_t", "cams_so2_now", "cams_no2_t", "cams_no2_now"],
    "fire":     ["edgar_share_awb", "edgar_share_ags", "edgar_share_rco", "fire_frp"],
    "dust":     ["sat_aod", "cams_dust_t", "cams_dust_now", "cams_aod_t", "cams_aod_now"],
}
# v2 feature names (now/t suffixes) + legacy names for older models
METEO = [
    "temp_c", "rh_pct", "wind_speed", "wind_dir", "wind_dir_sin", "wind_dir_cos",
    "blh_m", "surface_pressure", "precip_mm",
    "temp_c_now", "temp_c_t", "rh_pct_now", "rh_pct_t", "wind_speed_now", "wind_speed_t",
    "wind_dir_now", "wind_dir_t", "wind_dir_sin_now", "wind_dir_sin_t",
    "wind_dir_cos_now", "wind_dir_cos_t", "blh_m_now", "blh_m_t",
    "surface_pressure_now", "surface_pressure_t", "precip_mm_now", "precip_mm_t",
    "blh_m_delta", "wind_speed_delta", "temp_c_delta", "trap_index_t",
    "wind_u_t", "wind_v_t",
]
PERSISTENCE = [
    "pm25_lag0", "pm25_lag1", "pm25_lag3", "pm25_lag6", "pm25_lag12",
    "pm25_lag24", "pm25_lag48", "pm25_lag72", "pm25_lag168",
    "pm25_roll6_mean", "pm25_roll24_mean", "pm25_roll24_std", "pm25_roll168_mean",
    "pm25_delta_1", "pm25_delta_24", "pm25_cams_resid", "cams_delta",
    "cams_now", "cams_target", "population", "hour_t", "dow_t",
    "month_t", "is_weekend_t",
]

# EDGAR sector shares mapped to the same anthropogenic buckets (no dust: EDGAR is
# an anthropogenic inventory and has no windblown-dust sector).
EDGAR_BUCKET = {
    "traffic":  ["edgar_share_tro"],
    "industry": ["edgar_share_ind", "edgar_share_ref_trf", "edgar_share_ene"],
    "fire":     ["edgar_share_awb", "edgar_share_ags", "edgar_share_rco"],
}


def _load_forecast_module():
    spec = importlib.util.spec_from_file_location(
        "fc", Path(__file__).parent / "01_forecast_lgbm.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _load_forecast_module()
_BUNDLE = joblib.load(MODEL_PATH)
_MODEL, _FEATS = _BUNDLE["model"], _BUNDLE["features"]
_TARGET_MODE = _BUNDLE.get("target_mode", "raw")  # v2.1 deploy uses log1p


def _decode_pm25(raw: float) -> float:
    if _TARGET_MODE == "log1p":
        return float(np.clip(np.expm1(raw), 0, None))
    return float(np.clip(raw, 0, None))


import shap  # noqa: E402
_EXPLAINER = shap.TreeExplainer(_MODEL)

# lazily-built per-city sample tables (features already assembled exactly as the
# forecast model saw them) + source geometry
_SAMPLE_CACHE: dict[str, pd.DataFrame] = {}
_POOL = None
_SAT = None
_GPPD = None
_INDUSTRY = None


def _pool():
    global _POOL, _SAT
    if _POOL is None:
        _POOL, _ = FC.load_pool()
        _POOL = FC.mark_split(_POOL)
        _SAT = FC.load_satellite()
    return _POOL, _SAT


def _station_cell_map() -> dict:
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    return {r.station_id: h3.latlng_to_cell(r.latitude, r.longitude, H3_RES)
            for _, r in st.iterrows()}


def _samples(city_id: str) -> pd.DataFrame:
    if city_id not in _SAMPLE_CACHE:
        pool, sat = _pool()
        sub = pool[pool.city_id == city_id]
        # Prefer v2 feature builder with traffic curve when available
        try:
            import importlib.util
            _ff = Path(__file__).parent / "forecast_features.py"
            spec = importlib.util.spec_from_file_location("ff_attr", _ff)
            ffm = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(ffm)
            curve = ffm.build_congestion_curve()
            df = ffm.build_samples(sub, sat, 24, traffic_curve=curve)
        except Exception:
            try:
                df = FC.build_samples(sub, sat, 24)
            except TypeError:
                df = FC.build_samples(sub, sat, 24)
        # build_samples keys on station_id; re-attach the H3 cell so callers can
        # address a location by cell (one station == one cell in this data).
        df["cell_id"] = df.station_id.map(_station_cell_map())
        _SAMPLE_CACHE[city_id] = df
    return _SAMPLE_CACHE[city_id]


def _sources():
    global _GPPD, _INDUSTRY
    if _GPPD is None:
        g = pd.read_csv(DATA / "sources" / "gppd_india.csv", low_memory=False)
        _GPPD = g[["name", "latitude", "longitude", "capacity_mw"]].dropna(
            subset=["latitude", "longitude"])
        import geopandas as gpd
        ind = gpd.read_file(DATA / "sources" / "industry_registry.geojson")
        _INDUSTRY = ind[["name", "city_id", "latitude", "longitude"]].dropna(
            subset=["latitude", "longitude"])
    return _GPPD, _INDUSTRY


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bearing(lat1, lon1, lat2, lon2):
    """Initial bearing from point1 to point2, degrees from north (0..360)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _angular_diff(a, b):
    d = abs((a - b) % 360)
    return min(d, 360 - d)


def wind_cone(lat, lon, wind_dir, km=WIND_CONE_KM):
    """Sources UPWIND within `km`. wind_dir is the meteorological direction the
    wind blows FROM, so an upwind source lies along that bearing from the cell."""
    if wind_dir is None or (isinstance(wind_dir, float) and math.isnan(wind_dir)):
        return {"checked": False, "upwind": []}
    gppd, ind = _sources()
    hits = []
    for _, r in gppd.iterrows():
        d = _haversine_km(lat, lon, r.latitude, r.longitude)
        if d > km:
            continue
        br = _bearing(lat, lon, r.latitude, r.longitude)
        if _angular_diff(br, wind_dir) <= WIND_CONE_DEG:
            hits.append({"type": "power_plant", "name": str(r["name"])[:40],
                         "km": round(d, 1), "bearing": round(br),
                         "capacity_mw": float(r.capacity_mw) if pd.notna(r.capacity_mw) else None})
    for _, r in ind.iterrows():
        d = _haversine_km(lat, lon, r.latitude, r.longitude)
        if d > km:
            continue
        br = _bearing(lat, lon, r.latitude, r.longitude)
        if _angular_diff(br, wind_dir) <= WIND_CONE_DEG:
            hits.append({"type": "industry", "name": str(r["name"])[:40],
                         "km": round(d, 1), "bearing": round(br)})
    hits.sort(key=lambda h: h["km"])
    return {"checked": True, "wind_from_deg": round(float(wind_dir)), "upwind": hits[:8]}


def get_attribution(city: str, cell: str, time) -> dict:
    """Source shares + confidence + top source + EDGAR agreement for one cell-hour."""
    df = _samples(city)
    ts = pd.Timestamp(time)
    row = df[(df.cell_id == cell) & (df.timestamp == ts)]
    if row.empty:
        # fall back to nearest available hour for that cell
        cand = df[df.cell_id == cell]
        if cand.empty:
            return {"error": f"no samples for cell {cell} in {city}"}
        row = cand.iloc[[(cand.timestamp - ts).abs().argmin()]]
        ts = row.timestamp.iloc[0]

    # Features may be missing on older sample rows after v2 upgrade — fill NaN
    present = [c for c in _FEATS if c in row.columns]
    X = row.reindex(columns=_FEATS).astype(float)
    raw_pred = float(_MODEL.predict(X, num_iteration=_MODEL.best_iteration)[0])
    pred = _decode_pm25(raw_pred)
    sv = _EXPLAINER.shap_values(X)
    sv = sv[0] if isinstance(sv, list) else sv
    shap_row = pd.Series(np.ravel(sv)[:len(_FEATS)], index=_FEATS)

    # magnitude of each source group's SHAP push (abs = influence, sign-agnostic)
    raw = {}
    for src, cols in SOURCE_MAP.items():
        raw[src] = float(np.abs(shap_row[[c for c in cols if c in shap_row.index]]).sum())
    meteo_infl = float(np.abs(shap_row[[c for c in METEO if c in shap_row.index]]).sum())
    persist_infl = float(np.abs(shap_row[[c for c in PERSISTENCE if c in shap_row.index]]).sum())

    total_src = sum(raw.values())
    shares = {k: (v / total_src if total_src else 0.0) for k, v in raw.items()}

    # --- wind-cone boost ---
    lat, lon = h3.cell_to_latlng(cell)
    if "wind_dir_t" in row.columns and pd.notna(row["wind_dir_t"].iloc[0]):
        wd = row["wind_dir_t"].iloc[0]
    elif "wind_dir_now" in row.columns:
        wd = row["wind_dir_now"].iloc[0]
    elif "wind_dir" in row.columns:
        wd = row["wind_dir"].iloc[0]
    else:
        wd = np.nan
    cone = wind_cone(lat, lon, wd)
    boosted = dict(shares)
    if cone["checked"] and cone["upwind"]:
        # additive boost proportional to how much upwind mass there is, capped
        boost = min(0.25, 0.06 * len(cone["upwind"]))
        boosted["industry"] = boosted.get("industry", 0) + boost
        s = sum(boosted.values())
        boosted = {k: v / s for k, v in boosted.items()}
    shares = boosted
    top = max(shares, key=shares.get)

    # --- EDGAR validation (anthropogenic buckets only) ---
    edgar_shares = {}
    for b, cols in EDGAR_BUCKET.items():
        edgar_shares[b] = float(row[[c for c in cols if c in row.columns]].iloc[0].sum())
    es = sum(edgar_shares.values())
    edgar_shares = {k: (v / es if es else 0.0) for k, v in edgar_shares.items()}
    model_anth = {k: shares[k] for k in EDGAR_BUCKET}
    ma = sum(model_anth.values())
    model_anth = {k: (v / ma if ma else 0.0) for k, v in model_anth.items()}
    mv = np.array([model_anth[k] for k in EDGAR_BUCKET])
    ev = np.array([edgar_shares[k] for k in EDGAR_BUCKET])
    cos = float(mv @ ev / (np.linalg.norm(mv) * np.linalg.norm(ev))) \
        if mv.any() and ev.any() else 0.0
    edgar_top = max(edgar_shares, key=edgar_shares.get)
    edgar_agreement = {
        "cosine": round(cos, 3),
        "model_anthropogenic": {k: round(v, 3) for k, v in model_anth.items()},
        "edgar_sector": {k: round(v, 3) for k, v in edgar_shares.items()},
        "top_source_match": bool(top == edgar_top or (top == "dust" and False)),
        "edgar_top": edgar_top,
        "note": "dust excluded: EDGAR is anthropogenic-only",
    }

    # --- confidence: concentration x completeness x wind-corroboration ---
    concentration = max(shares.values())                  # 0.25..1
    src_cols = [c for grp in SOURCE_MAP.values() for c in grp if c in X.columns]
    completeness = float(X[src_cols].notna().mean(axis=1).iloc[0])
    wind_corr = 1.0 if (cone["checked"] and cone["upwind"] and top == "industry") else \
        (0.85 if cone["checked"] else 0.6)
    edgar_corr = 1.0 if edgar_agreement["top_source_match"] else 0.8
    confidence = round(float(np.clip(
        0.4 * concentration + 0.25 * completeness + 0.2 * wind_corr + 0.15 * edgar_corr,
        0, 1)), 3)

    return {
        "city": city, "cell": cell, "time": str(ts),
        "predicted_pm25": round(pred, 1),
        "shares": {k: round(v, 3) for k, v in shares.items()},
        "top_source": top,
        "confidence": confidence,
        "wind_cone": cone,
        "edgar_agreement": edgar_agreement,
        "context": {
            "source_influence": {k: round(v, 3) for k, v in raw.items()},
            "meteorology_influence": round(meteo_infl, 3),
            "persistence_influence": round(persist_infl, 3),
            "note": ("shares are over source features only; persistence + meteo "
                     "carry the overall level and are shown for context"),
        },
    }


def _pick_korba_industrial_cell():
    """A Korba station cell with strong industrial signal, at a high-PM windy hour."""
    df = _samples("korba")
    # cell nearest the big coal cluster = highest gppd_inv_dist_mw
    cell = df.loc[df.gppd_inv_dist_mw.idxmax(), "cell_id"]
    sub = df[(df.cell_id == cell) & df.wind_dir.notna()].copy()
    sub = sub[sub.pm25_lag0 > sub.pm25_lag0.median()]
    row = sub.sort_values("pm25_lag0", ascending=False).iloc[0]
    return cell, row.timestamp


def main():
    print("=" * 96)
    print("SOURCE ATTRIBUTION AGENT")
    print("=" * 96)
    say(f"model: {MODEL_PATH.name} (t+24h, {len(_FEATS)} features)")

    cell, t = _pick_korba_industrial_cell()
    lat, lon = h3.cell_to_latlng(cell)
    say(f"example: Korba industrial cell {cell} ({lat:.4f},{lon:.4f}) @ {t}")
    print()

    res = get_attribution("korba", cell, t)
    print(json.dumps(res, indent=2))

    print()
    print("=" * 96)
    print("SUMMARY")
    print("=" * 96)
    sh = res["shares"]
    print(f"  predicted PM2.5   : {res['predicted_pm25']} ug/m3")
    print(f"  source shares     : " +
          "  ".join(f"{k}={v:.0%}" for k, v in sorted(sh.items(), key=lambda x: -x[1])))
    print(f"  TOP SOURCE        : {res['top_source'].upper()}  (confidence {res['confidence']})")
    ea = res["edgar_agreement"]
    print(f"  EDGAR agreement   : cosine={ea['cosine']}  "
          f"model_top={res['top_source']} vs edgar_top={ea['edgar_top']}  "
          f"match={ea['top_source_match']}")
    up = res["wind_cone"]["upwind"]
    if up:
        print(f"  wind cone (from {res['wind_cone']['wind_from_deg']} deg): "
              f"{len(up)} upwind source(s), nearest:")
        for u in up[:3]:
            cap = f", {u['capacity_mw']:.0f}MW" if u.get("capacity_mw") else ""
            print(f"      {u['type']:<12}{u['name']:<42}{u['km']}km @ {u['bearing']}deg{cap}")
    else:
        print(f"  wind cone         : no known source upwind within {WIND_CONE_KM}km")

    out = DATA / "processed" / "attribution_example.json"
    out.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print()
    ok(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
