"""Bake a Chhattisgarh DISTRICT choropleth for the dashboard's Risk Map.

Every district gets a predicted PM2.5 from the same no-lag SPATIAL model that the
LOSO test validated — the one that predicts a location with no sensor of its own.
That is deliberate: filling the map by interpolating between stations would
quietly contradict the project's central claim. Districts that do contain a CPCB
station are flagged so the UI can distinguish measured from predicted.

Geometry: geoBoundaries IND ADM2 (open licence), clipped to the Chhattisgarh
state polygon we already hold in data/boundaries/cg_divisions.geojson.

Run:  python scripts/bake/bake_districts.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import xarray as xr
from shapely.geometry import Point

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, get_cities, ok, say, warn  # noqa: E402


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / "models" / fname)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FC = _load("fc", "01_forecast_lgbm.py")
ENF = _load("enf", "04_enforcement.py")
ATTR = _load("attr", "03_attribution.py")

ADM2 = ROOT / "scratch_ind_adm2.geojson"
OUT = ROOT / "web" / "public" / "data" / "cg_districts.json"
CPCB_STD = 60.0


def cg_districts() -> gpd.GeoDataFrame:
    div = gpd.read_file(DATA / "boundaries" / "cg_divisions.geojson")
    div = div.set_crs(4326) if div.crs is None else div.to_crs(4326)
    state = div.union_all()

    d = gpd.read_file(ADM2).to_crs(4326)
    # keep districts whose representative point sits inside Chhattisgarh
    inside = d[d.geometry.representative_point().within(state)].copy()
    inside["name"] = inside["shapeName"].astype(str)
    say(f"{len(inside)} districts inside Chhattisgarh (of {len(d)} in India)")
    return inside[["name", "geometry"]].reset_index(drop=True)


def district_population(gdf: gpd.GeoDataFrame) -> list[float]:
    """WorldPop sum per district (windowed read, then mask)."""
    tif = DATA / "static" / "population" / "worldpop_india.tif"
    if not tif.exists():
        return [float("nan")] * len(gdf)
    from rasterio.mask import mask as rio_mask

    out = []
    with rasterio.open(tif) as src:
        for geom in gdf.geometry:
            try:
                arr, _ = rio_mask(src, [geom.__geo_interface__], crop=True, filled=True,
                                  nodata=0)
                a = np.where(arr < 0, 0, arr)
                out.append(float(a.sum()))
            except Exception:
                out.append(float("nan"))
    return out


def static_features(lats, lons) -> pd.DataFrame:
    """EDGAR + GPPD at each district centroid, matching 10_harmonize's columns."""
    df = pd.DataFrame({"lat": lats, "lon": lons})

    # --- EDGAR sector rasters ---
    import re

    root = DATA / "inventory" / "edgar"
    pat = re.compile(r"AP_(?P<sub>[A-Za-z0-9.]+)_\d{4}_(?P<sector>[A-Z_]+)_emi", re.I)
    la = xr.DataArray(df.lat.values, dims="cell")
    lo = xr.DataArray(df.lon.values, dims="cell")
    per_pm: dict[str, np.ndarray] = {}
    for f in sorted(root.rglob("*.nc")):
        m = pat.search(f.name)
        if not m:
            continue
        sub = m.group("sub").lower().replace(".", "")
        sector = m.group("sector").lower()
        with xr.open_dataset(f) as ds:
            var = "emissions" if "emissions" in ds else list(ds.data_vars)[0]
            vals = ds[var].sel(lat=la, lon=lo, method="nearest").values
        df[f"edgar_{sector}_{sub}"] = vals
        if sub == "pm25":
            per_pm[sector] = vals
    if per_pm:
        tot = np.sum(list(per_pm.values()), axis=0)
        with np.errstate(invalid="ignore", divide="ignore"):
            for sector, v in per_pm.items():
                df[f"edgar_share_{sector}"] = np.where(tot > 0, v / tot, np.nan)
        df["edgar_pm25_total"] = tot

    # --- GPPD plants ---
    g = pd.read_csv(DATA / "sources" / "gppd_india.csv", low_memory=False)
    g = g.dropna(subset=["latitude", "longitude"])
    g = g[g.longitude.between(78, 87) & g.latitude.between(16, 26)]
    clat = np.radians(df.lat.values[:, None])
    dx = (df.lon.values[:, None] - g.longitude.values[None, :]) * 111.32 * np.cos(clat)
    dy = (df.lat.values[:, None] - g.latitude.values[None, :]) * 110.57
    dist = np.sqrt(dx ** 2 + dy ** 2)
    idx = dist.argmin(axis=1)
    df["gppd_nearest_km"] = dist[np.arange(len(df)), idx]
    df["gppd_nearest_mw"] = g.capacity_mw.values[idx]
    df["gppd_cap_25km"] = np.where(dist <= 25, g.capacity_mw.values[None, :], 0).sum(axis=1)
    df["gppd_inv_dist_mw"] = (g.capacity_mw.values[None, :] / (dist + 1) ** 2).sum(axis=1)
    return df



# EPA PM2.5 -> US AQI breakpoints (24h)
_AQI = [(0.0, 12.0, 0, 50), (12.1, 35.4, 51, 100), (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200), (150.5, 250.4, 201, 300), (250.5, 500.4, 301, 500)]


def aqi_from_pm25(pm: float) -> int:
    for lo, hi, alo, ahi in _AQI:
        if pm <= hi:
            return int(round((ahi - alo) / (hi - lo) * (pm - lo) + alo))
    return 500


def station_observations(gdf, st: pd.DataFrame) -> list[dict]:
    """Latest measured pollutant values per district, from the CPCB feed the
    model was trained on. Only districts that actually contain a station get these."""
    import h3
    from shapely.geometry import Point

    POLL = ["pm25", "pm10", "no2", "so2", "co", "o3"]
    # station_id -> latest reading of each pollutant
    latest: dict[str, dict] = {}
    for city in get_cities(include_optional=True):
        fp = DATA / "processed" / f"{city['id']}_features.parquet"
        if not fp.exists():
            continue
        d = pd.read_parquet(fp)
        if "pm25" not in d.columns:
            continue
        rows = st[st.city_id == city["id"]]
        for _, r in rows.iterrows():
            cell = h3.latlng_to_cell(r.latitude, r.longitude, FC.H3_RES)
            sub = d[d.cell_id == cell]
            if sub.empty:
                continue
            vals = {}
            for pol in POLL:
                if pol in sub.columns:
                    nn = sub[sub[pol].notna()].sort_values("timestamp")
                    if len(nn):
                        vals[pol] = round(float(nn.iloc[-1][pol]), 1)
                        vals["_t"] = str(nn.iloc[-1]["timestamp"])
            if vals:
                latest[r.station_id] = vals

    out = []
    for geom in gdf.geometry:
        inside = [r.station_id for _, r in st.iterrows()
                  if geom.contains(Point(r.longitude, r.latitude))]
        got = [latest[s] for s in inside if s in latest]
        if not got:
            out.append({})
            continue
        agg = {}
        for pol in POLL:
            xs = [g[pol] for g in got if pol in g]
            if xs:
                agg[pol] = round(sum(xs) / len(xs), 1)
        agg["as_of"] = max((g.get("_t", "") for g in got), default="")
        out.append(agg)
    return out


def source_shares(model, feats, X: pd.DataFrame) -> list[dict]:
    """SHAP over the spatial model, bucketed into the same source groups the
    attribution agent uses — i.e. what the model actually leans on per district."""
    import shap

    expl = shap.TreeExplainer(model)
    sv = expl.shap_values(X[feats].astype(float))
    sv = sv[0] if isinstance(sv, list) else sv
    sv = np.asarray(sv)
    out = []
    for i in range(sv.shape[0]):
        row = pd.Series(sv[i], index=feats)
        raw = {}
        for src, cols in ATTR.SOURCE_MAP.items():
            cs = [c for c in cols if c in row.index]
            raw[src] = float(np.abs(row[cs]).sum()) if cs else 0.0
        tot = sum(raw.values()) or 1.0
        out.append({k: round(v / tot, 3) for k, v in raw.items()})
    return out


def main() -> None:
    print("=" * 90)
    print("BAKE CHHATTISGARH DISTRICT RISK MAP")
    print("=" * 90)
    if not ADM2.exists():
        warn(f"missing {ADM2.name} — download geoBoundaries IND ADM2 first")
        sys.exit(1)

    gdf = cg_districts()
    cen = gdf.geometry.representative_point()
    lats = [p.y for p in cen]
    lons = [p.x for p in cen]

    model, feats = ENF._spatial_model()

    # weather/cams from the NEAREST city we hold met for, at the demo origin hour
    cities = get_cities(include_optional=True)
    hourly = {}
    for c in cities:
        p = DATA / "processed" / f"{c['id']}_features.parquet"
        if not p.exists():
            continue
        d = pd.read_parquet(p)
        cols = [x for x in FC.WEATHER if x in d.columns] + ["cams_pm25"]
        hourly[c["id"]] = (c["lat"], c["lon"], d[["timestamp"] + cols].drop_duplicates("timestamp"))

    origin = pd.Timestamp(
        json.loads((DATA / "processed" / "baseline_metrics.json").read_text())["window"][1]
    ).floor("h")
    say(f"scoring at {origin}")

    rows = []
    for la, lo in zip(lats, lons):
        best, bd = None, 1e9
        for cid, (cla, clo, _) in hourly.items():
            dd = np.hypot(la - cla, lo - clo)
            if dd < bd:
                best, bd = cid, dd
        _, _, h = hourly[best]
        at = h[h.timestamp == origin]
        r = at.iloc[0] if len(at) else h.iloc[(h.timestamp - origin).abs().argmin()]
        rows.append({**{k: r[k] for k in r.index if k != "timestamp"}, "_src_city": best})
    wx = pd.DataFrame(rows)

    X = static_features(lats, lons)
    for c in wx.columns:
        if c != "_src_city":
            X[c] = wx[c].values
    X["hour"], X["dow"] = origin.hour, origin.dayofweek
    X["month"], X["is_weekend"] = origin.month, int(origin.dayofweek >= 5)
    for c in ("sat_aod", "sat_no2", "sat_so2", "road_density_km_km2", "road_length_km"):
        if c not in X.columns:
            X[c] = np.nan
    X["population"] = district_population(gdf)

    missing = [f for f in feats if f not in X.columns]
    for f in missing:
        X[f] = np.nan
    if missing:
        say(f"features absent at district scale (left NaN): {missing}")

    pred = np.clip(model.predict(X[feats]), 0, None)
    gdf["pm25"] = np.round(pred, 1)

    # --- which districts actually contain a CPCB station ---
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    st_pts = [Point(r.longitude, r.latitude) for _, r in st.iterrows()]
    names, counts = [], []
    for geom in gdf.geometry:
        hit = [st.iloc[i].station_name for i, p in enumerate(st_pts) if geom.contains(p)]
        names.append(hit)
        counts.append(len(hit))
    gdf["stations"] = names
    gdf["n_stations"] = counts

    # risk index 0-100: 0 at clean air, 100 at 2x the CPCB 24h standard
    gdf["risk"] = np.round(np.clip(gdf.pm25 / (CPCB_STD * 2) * 100, 0, 100), 1)
    gdf["population"] = np.round(X["population"].values).astype("int64")
    gdf["source"] = np.where(gdf.n_stations > 0, "measured+model", "model only")

    # --- AQI, measured pollutants, model-side detail ---
    gdf["us_aqi"] = [aqi_from_pm25(float(v)) for v in gdf.pm25]
    gdf["measured"] = station_observations(gdf, st)
    gdf["shares"] = source_shares(model, feats, X)

    # emissions the model actually consumed, per district
    def col(name):
        return X[name].values if name in X.columns else np.full(len(X), np.nan)

    gdf["edgar_nox"] = np.round(
        sum(col(c) for c in X.columns if c.startswith("edgar_") and c.endswith("_nox")), 6)
    gdf["edgar_so2"] = np.round(
        sum(col(c) for c in X.columns if c.startswith("edgar_") and c.endswith("_so2")), 6)
    gdf["edgar_pm25"] = np.round(col("edgar_pm25_total"), 6)
    for k in ("edgar_share_ene", "edgar_share_ind", "edgar_share_tro",
              "edgar_share_rco", "edgar_share_awb", "edgar_share_ags"):
        gdf[k] = np.round(col(k), 3)
    gdf["gppd_nearest_km"] = np.round(col("gppd_nearest_km"), 1)
    gdf["gppd_nearest_mw"] = np.round(col("gppd_nearest_mw"), 0)
    gdf["gppd_cap_25km"] = np.round(col("gppd_cap_25km"), 0)

    # the meteorology the model was given
    gdf["temp_c"] = np.round(col("temp_c"), 1)
    gdf["rh_pct"] = np.round(col("rh_pct"), 0)
    gdf["wind_speed"] = np.round(col("wind_speed"), 1)
    gdf["blh_m"] = np.round(col("blh_m"), 0)
    gdf["cams_pm25"] = np.round(col("cams_pm25"), 1)

    # --- per-CITY predictions (the cities the project actually models) ---
    cities_out = []
    for c in cities:
        fpath = DATA / "processed" / f"{c['id']}_features.parquet"
        if not fpath.exists():
            continue
        cx = static_features([c["lat"]], [c["lon"]])
        _, _, h = hourly[c["id"]]
        at = h[h.timestamp == origin]
        rr = at.iloc[0] if len(at) else h.iloc[(h.timestamp - origin).abs().argmin()]
        for k in rr.index:
            if k != "timestamp":
                cx[k] = rr[k]
        cx["hour"], cx["dow"] = origin.hour, origin.dayofweek
        cx["month"], cx["is_weekend"] = origin.month, int(origin.dayofweek >= 5)
        for k in feats:
            if k not in cx.columns:
                cx[k] = np.nan
        pm = float(np.clip(model.predict(cx[feats])[0], 0, None))
        ns = int((st.city_id == c["id"]).sum())
        cities_out.append({
            "id": c["id"], "name": c["name"], "role": c.get("role"),
            "lat": c["lat"], "lon": c["lon"],
            "pm25": round(pm, 1), "us_aqi": aqi_from_pm25(pm),
            "risk": round(min(100.0, pm / (CPCB_STD * 2) * 100), 1),
            "n_stations": ns,
            "has_stations": bool(c.get("has_stations")),
        })
    say(f"{len(cities_out)} city-level predictions")

    ensure(OUT.parent)
    gj = json.loads(gdf.to_json())
    gj["cities"] = cities_out
    gj["meta"] = {
        "generated_for": str(origin),
        "model": "spatial no-lag LightGBM (same basis as the LOSO test)",
        "threshold_ug_m3": CPCB_STD,
        "risk_scale": "0 = clean, 100 = 2x the CPCB 24h PM2.5 standard",
        "geometry": "geoBoundaries IND ADM2, clipped to Chhattisgarh",
        "n_districts": int(len(gdf)),
        "n_with_station": int((gdf.n_stations > 0).sum()),
    }
    OUT.write_text(json.dumps(gj, separators=(",", ":")), encoding="utf-8")

    print()
    print(f"{'district':<24}{'pm25':>7}{'risk':>7}{'stations':>10}{'population':>13}")
    print("-" * 64)
    for _, r in gdf.sort_values("pm25", ascending=False).iterrows():
        print(f"{r['name'][:23]:<24}{r.pm25:>7.1f}{r.risk:>7.1f}{r.n_stations:>10}{r.population:>13,}")
    print()
    ok(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size/1024:.0f} KB)")
    say(f"{gj['meta']['n_with_station']} of {len(gdf)} districts contain a CPCB station; "
        f"the rest are predicted with no local sensor at all")


if __name__ == "__main__":
    main()
