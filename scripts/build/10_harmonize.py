"""Harmonize raw AirSight collections into ONE model-ready table per city.

Two outputs, deliberately:

  data/grid/<city>.parquet              STATIC per-H3-cell layers (the inference
                                        surface: every cell in the bbox).
  data/processed/<city>_features.parquet TRAINING table: station-cell x hour, with
                                        the pm25 target attached.

Why split? A full res-8 grid x hourly clock for Korba is ~8,360 cells x 35,064
hours = 293M rows, and the pm25 target exists at 2 cells only. Materializing 293M
rows of ~100% NaN target is not a model-ready table. The static grid carries the
per-cell features; the training table is the subset where a target exists. To
predict a cell with no station, join grid[cell] x weather[hour] at inference.

Run:  python scripts/build/10_harmonize.py --city korba
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import rasterio
import xarray as xr
from shapely.geometry import Polygon

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, get_cities, ok, say, warn  # noqa: E402

H3_RES = 8

# --- CPCB column normalization -------------------------------------------------
# Match on the pollutant TOKEN, never the full header. Real headers carry unicode
# units ("PM2.5 (ug/m3)" with micro+superscript) that arrive mojibake'd depending
# on the console codepage, so any full-string comparison is a coin flip.
POLLUTANT_PATTERNS = [
    ("pm25", r"pm\s*[-_]?\s*2\s*[.,]?\s*5"),
    ("pm10", r"pm\s*[-_]?\s*10"),
    ("no2", r"\bno\s*[-_]?\s*2\b"),
    ("so2", r"\bso\s*[-_]?\s*2\b"),
    ("o3", r"\bo\s*[-_]?\s*3\b|ozone"),
    ("co", r"\bco\b"),
]
# Checked in order; NOx/NH3/CO2 must not be captured by the looser \bco\b / no2
# patterns, so they are excluded up front.
EXCLUDE = r"nox|nh3|co2|vws|tot"

# CPCB/CECB sentinels for "no reading". These are real values in the file, not NaN.
# 0.0 is deliberately NOT here: a true 0 ug/m3 reading is rare but legal, and the
# Korba files contain zero of them anyway - so treating 0 as a sentinel would buy
# nothing and silently delete real data the day a cleaner city is added.
SENTINELS = (-999, -9999, 999, 9999, -99)


def normalize(col: str) -> str:
    """Lowercase, strip, collapse whitespace. Unit suffixes are left alone -
    we only ever regex the token out of this, never compare the whole string."""
    return re.sub(r"\s+", " ", str(col).strip().lower())


def map_pollutants(cols: list[str]) -> dict[str, str]:
    """Original column name -> canonical pollutant name."""
    out: dict[str, str] = {}
    for c in cols:
        n = normalize(c)
        if re.search(EXCLUDE, n):
            continue
        for canon, pat in POLLUTANT_PATTERNS:
            if canon in out.values():
                continue
            if re.search(pat, n):
                out[c] = canon
                break
    return out


def find_datetime_col(df: pd.DataFrame, thresh: float = 0.90) -> str | None:
    """Pick the column that parses as datetime for >thresh of rows.

    Beats name-matching: works whether the header says Timestamp, From Date,
    date, or something mojibake'd.
    """
    best, best_frac = None, 0.0
    for c in df.columns:
        s = df[c]
        if s.dtype.kind in "if":  # numeric columns are readings, not clocks
            continue
        parsed = pd.to_datetime(s, errors="coerce", format="mixed")
        frac = parsed.notna().mean()
        if frac > best_frac:
            best, best_frac = c, frac
    return best if best_frac > thresh else None


def clean_numeric(s: pd.Series) -> pd.Series:
    """Coerce to float, drop negatives and known sentinels."""
    v = pd.to_numeric(s, errors="coerce")
    v = v.where(v >= 0)
    return v.where(~v.isin(SENTINELS))


# --- grid ----------------------------------------------------------------------
def build_grid(city: dict) -> pd.DataFrame:
    w, s, e, n = city["bbox"]
    poly = h3.LatLngPoly([(s, w), (s, e), (n, e), (n, w)])
    cells = sorted(h3.h3shape_to_cells(poly, H3_RES))
    lat, lon = zip(*(h3.cell_to_latlng(c) for c in cells))
    return pd.DataFrame({
        "cell_id": cells,
        "lat": lat,
        "lon": lon,
        # res-7 parent: satellite (AOD/NO2/SO2) and landuse exports are keyed at
        # res 7, so this is the join key for those layers later.
        "cell_id_res7": [h3.cell_to_parent(c, 7) for c in cells],
    })


def cell_polygons(cells: pd.Series) -> gpd.GeoDataFrame:
    geoms = [Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in cells]
    return gpd.GeoDataFrame({"cell_id": cells.values}, geometry=geoms, crs="EPSG:4326")


# --- static layers -------------------------------------------------------------
def add_population(grid: pd.DataFrame, city: dict) -> pd.DataFrame:
    tif = DATA / "static" / "population" / "worldpop_india.tif"
    if not tif.exists():
        warn("population: worldpop tif missing, skipping")
        grid["population"] = np.nan
        return grid

    w, s, e, n = city["bbox"]
    with rasterio.open(tif) as src:
        win = rasterio.windows.from_bounds(w, s, e, n, src.transform)
        arr = src.read(1, window=win)
        tf = src.window_transform(win)
        nodata = src.nodata

    arr = np.where((arr == nodata) | (arr < 0), 0.0, arr).astype("float64")
    rows, cols = np.nonzero(arr)
    if rows.size == 0:
        warn("population: no pixels in bbox")
        grid["population"] = np.nan
        return grid

    xs, ys = rasterio.transform.xy(tf, rows, cols)
    vals = arr[rows, cols]
    # Sum every ~90 m pixel into its H3 cell (true zonal sum, not a centroid probe).
    cid = [h3.latlng_to_cell(y, x, H3_RES) for x, y in zip(xs, ys)]
    pop = pd.DataFrame({"cell_id": cid, "population": vals}).groupby("cell_id", as_index=False).sum()
    say(f"population: summed {rows.size:,} pixels into {len(pop):,} cells")
    return grid.merge(pop, on="cell_id", how="left")


def add_edgar(grid: pd.DataFrame, city: dict) -> pd.DataFrame:
    root = DATA / "inventory" / "edgar"
    files = sorted(root.rglob("*.nc"))
    if not files:
        warn("edgar: no .nc files, skipping")
        return grid

    lats = xr.DataArray(grid["lat"].values, dims="cell")
    lons = xr.DataArray(grid["lon"].values, dims="cell")
    pat = re.compile(r"AP_(?P<sub>[A-Za-z0-9.]+)_\d{4}_(?P<sector>[A-Z_]+)_emi", re.I)

    per_sector_pm: dict[str, np.ndarray] = {}
    added = 0
    for f in files:
        m = pat.search(f.name)
        if not m:
            warn(f"edgar: unparsed filename {f.name}")
            continue
        sub = m.group("sub").lower().replace(".", "")
        sector = m.group("sector").lower()
        with xr.open_dataset(f) as ds:
            var = "emissions" if "emissions" in ds else list(ds.data_vars)[0]
            # EDGAR lon is 0..360 in some builds; these are -180..180. Nearest-
            # neighbour is right here: the 0.1deg grid is ~11km vs 0.74km2 cells.
            vals = ds[var].sel(lat=lats, lon=lons, method="nearest").values
        col = f"edgar_{sector}_{sub}"
        grid[col] = vals
        added += 1
        if sub == "pm25":
            per_sector_pm[sector] = vals

    if per_sector_pm:
        total = np.sum(list(per_sector_pm.values()), axis=0)
        with np.errstate(invalid="ignore", divide="ignore"):
            for sector, v in per_sector_pm.items():
                grid[f"edgar_share_{sector}"] = np.where(total > 0, v / total, np.nan)
        grid["edgar_pm25_total"] = total
        say(f"edgar: {added} rasters -> {len(per_sector_pm)} sector shares "
            f"({', '.join(sorted(per_sector_pm))})")
    return grid


def add_gppd(grid: pd.DataFrame, city: dict) -> pd.DataFrame:
    f = DATA / "sources" / "gppd_india.csv"
    if not f.exists():
        warn("gppd: missing, skipping")
        return grid
    g = pd.read_csv(f, low_memory=False)
    # Pad the bbox ~0.5deg: a plant just outside the box still affects cells inside.
    w, s, e, n = city["bbox"]
    g = g[g.longitude.between(w - 0.5, e + 0.5) & g.latitude.between(s - 0.5, n + 0.5)]
    if g.empty:
        warn("gppd: no plants near bbox")
        grid["gppd_nearest_km"] = np.nan
        grid["gppd_nearest_mw"] = np.nan
        return grid

    # Equirectangular approx is fine at this latitude/extent and avoids a CRS dance.
    clat = np.radians(grid["lat"].values[:, None])
    dx = (grid["lon"].values[:, None] - g.longitude.values[None, :]) * 111.32 * np.cos(clat)
    dy = (grid["lat"].values[:, None] - g.latitude.values[None, :]) * 110.57
    dist = np.sqrt(dx ** 2 + dy ** 2)

    idx = dist.argmin(axis=1)
    grid["gppd_nearest_km"] = dist[np.arange(len(grid)), idx]
    grid["gppd_nearest_mw"] = g.capacity_mw.values[idx]
    # Capacity-weighted exposure: sum(MW / (d+1)^2) captures many-plants-nearby,
    # which nearest-only misses. Korba has 12 coal plants stacked together.
    grid["gppd_cap_25km"] = np.where(dist <= 25, g.capacity_mw.values[None, :], 0).sum(axis=1)
    grid["gppd_inv_dist_mw"] = (g.capacity_mw.values[None, :] / (dist + 1) ** 2).sum(axis=1)
    say(f"gppd: {len(g)} plants near bbox, nearest {grid['gppd_nearest_km'].min():.1f} km")
    return grid


def add_roads(grid: pd.DataFrame, city: dict, skipped: list[str]) -> pd.DataFrame:
    d = DATA / "osm" / "roads" / city["id"]
    f = d / "road_edges.geojson"
    if not f.exists() or f.stat().st_size == 0:
        warn(f"roads: {city['id']} has no road_edges.geojson - road_density_km_km2 = NaN")
        skipped.append(city["id"])
        grid["road_density_km_km2"] = np.nan
        grid["road_length_km"] = np.nan
        return grid

    roads = gpd.read_file(f).to_crs(4326)
    cells = cell_polygons(grid["cell_id"])
    # Intersect so a road crossing 3 cells contributes its share to each, rather
    # than being credited wholly to whichever cell holds its midpoint.
    inter = gpd.overlay(
        gpd.GeoDataFrame(geometry=roads.geometry, crs=4326), cells, how="intersection",
        keep_geom_type=False,
    )
    if inter.empty:
        warn("roads: no intersection with grid")
        grid["road_density_km_km2"] = np.nan
        grid["road_length_km"] = np.nan
        return grid
    # Project to a metric CRS for honest lengths (UTM 44N covers Chhattisgarh).
    inter["km"] = inter.to_crs(32644).length / 1000.0
    agg = inter.groupby("cell_id", as_index=False)["km"].sum().rename(columns={"km": "road_length_km"})
    grid = grid.merge(agg, on="cell_id", how="left")
    area = h3.cell_area(grid["cell_id"].iloc[0], "km^2")
    grid["road_length_km"] = grid["road_length_km"].fillna(0.0)
    grid["road_density_km_km2"] = grid["road_length_km"] / area
    say(f"roads: {len(roads):,} edges -> {(grid.road_length_km > 0).sum():,} cells with road")
    return grid


# --- time series ---------------------------------------------------------------
def load_cpcb(city: dict) -> pd.DataFrame:
    """Return long-format station x hour observations, target NOT filled."""
    d = DATA / "cpcb" / city["id"]
    files = sorted(d.glob("*.csv")) if d.exists() else []
    if not files:
        warn(f"cpcb: no files for {city['id']} (zero-station city?) - no target")
        return pd.DataFrame()

    stations = pd.read_csv(ROOT / "config" / "stations.csv")
    stations = stations[stations.city_id == city["id"]]

    # Honour use_in_training: a station flagged FALSE is a known-bad feed (e.g. a
    # mislabelled duplicate). Its file stays on disk; it just never reaches training.
    if "use_in_training" in stations.columns:
        flag = stations["use_in_training"].astype(str).str.strip().str.lower()
        excluded = stations[flag.isin(("false", "0", "no"))]
        for _, r in excluded.iterrows():
            warn(f"cpcb: EXCLUDED {r.station_id} ({r.station_name}) - use_in_training=FALSE")
        stations = stations[~flag.isin(("false", "0", "no"))]
    if stations.empty:
        warn(f"cpcb: every station in {city['id']} is excluded - no target")
        return pd.DataFrame()

    # Only read files that a live station actually points at. Stale/superseded
    # exports left in the folder must not silently re-enter the target.
    keep = set(stations.source_file.dropna())
    skipped = [f.name for f in files if f.name not in keep]
    files = [f for f in files if f.name in keep]
    for n in skipped:
        say(f"cpcb: ignoring unreferenced file {n}")
    if not files:
        warn(f"cpcb: no referenced files for {city['id']}")
        return pd.DataFrame()

    by_file = dict(zip(stations.source_file, stations.station_id))

    frames = []
    for f in files:
        raw = pd.read_csv(f, low_memory=False)
        dt_col = find_datetime_col(raw)
        if dt_col is None:
            warn(f"cpcb: {f.name} - no datetime column found, skipping")
            continue
        mapping = map_pollutants(list(raw.columns))
        if not mapping:
            warn(f"cpcb: {f.name} - no pollutant columns matched, skipping")
            continue

        sid = by_file.get(f.name, f.stem)
        print(f"    {f.name}")
        print(f"      datetime col : {dt_col!r}")
        for orig, canon in mapping.items():
            print(f"      {canon:<5} <- {orig!r}")

        out = pd.DataFrame({"timestamp": pd.to_datetime(raw[dt_col], errors="coerce", format="mixed")})
        for orig, canon in mapping.items():
            out[canon] = clean_numeric(raw[orig])
        out = out.dropna(subset=["timestamp"])
        out["station_id"] = sid
        # Hourly IST clock; the files are already IST-local and tz-naive.
        out["timestamp"] = out["timestamp"].dt.floor("h")
        frames.append(out)

    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    df = df.merge(stations[["station_id", "latitude", "longitude"]], on="station_id", how="left")
    df["cell_id"] = [
        h3.latlng_to_cell(la, lo, H3_RES) if pd.notna(la) else None
        for la, lo in zip(df.latitude, df.longitude)
    ]
    return df


def load_met(city: dict) -> pd.DataFrame:
    f = DATA / "met" / city["id"] / "archive.csv"
    if not f.exists():
        warn("weather: archive.csv missing")
        return pd.DataFrame()
    df = pd.read_csv(f)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce").dt.floor("h")
    keep = {
        "temperature_2m": "temp_c",
        "relative_humidity_2m": "rh_pct",
        "dew_point_2m": "dew_point_c",
        "wind_speed_10m": "wind_speed",
        "wind_direction_10m": "wind_dir",
        "boundary_layer_height": "blh_m",
        "surface_pressure": "surface_pressure",
        "precipitation": "precip_mm",
    }
    have = {k: v for k, v in keep.items() if k in df.columns}
    miss = set(keep) - set(have)
    if miss:
        warn(f"weather: absent columns {sorted(miss)}")
    out = df[["timestamp"] + list(have)].rename(columns=have)
    # Wind direction is circular: 359deg and 1deg are 2deg apart, but a tree
    # splitting on the raw number sees them as opposite extremes.
    if "wind_dir" in out:
        rad = np.radians(out["wind_dir"])
        out["wind_dir_sin"], out["wind_dir_cos"] = np.sin(rad), np.cos(rad)
    say(f"weather: {len(out):,} hourly rows, {len(have)} vars")
    return out


def load_cams(city: dict) -> pd.DataFrame:
    f = DATA / "met" / city["id"] / "cams_archive.csv"
    if not f.exists():
        warn("cams: cams_archive.csv missing")
        return pd.DataFrame()
    df = pd.read_csv(f)
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce").dt.floor("h")
    keep = {
        "pm2_5": "cams_pm25",
        "pm10": "cams_pm10",
        "nitrogen_dioxide": "cams_no2",
        "sulphur_dioxide": "cams_so2",
        "ozone": "cams_o3",
        "carbon_monoxide": "cams_co",
        "dust": "cams_dust",
        "aerosol_optical_depth": "cams_aod",
    }
    have = {k: v for k, v in keep.items() if k in df.columns}
    miss = set(keep) - set(have)
    if miss:
        say(f"cams: columns not present in export: {sorted(miss)}")
    out = df[["timestamp"] + list(have)].rename(columns=have)
    say(f"cams: {len(out):,} hourly rows, {len(have)} vars")
    return out


def add_calendar(df: pd.DataFrame) -> pd.DataFrame:
    ts = df["timestamp"]
    df["hour"] = ts.dt.hour
    df["dow"] = ts.dt.dayofweek
    df["month"] = ts.dt.month
    df["is_weekend"] = (df["dow"] >= 5).astype("int8")
    # Cyclical encodings so hour 23 sits next to hour 0.
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    return df


_FIRE_CACHE: dict | None = None


def _load_fire_daily(radius_km: float = 25.0) -> tuple[pd.DataFrame, pd.Timestamp, pd.Timestamp]:
    """City-level daily FRP totals (all detections in city bbox), plus archive span.

    Station cells share city weather; fire is similarly city-local at this radius.
    Returns (daily frame with columns date, city_id, fire_frp, fire_count),
    archive_min, archive_max.
    """
    global _FIRE_CACHE
    if _FIRE_CACHE is not None:
        return _FIRE_CACHE["daily"], _FIRE_CACHE["lo"], _FIRE_CACHE["hi"]

    f = DATA / "fire" / "firms_chhattisgarh.csv"
    if not f.exists():
        empty = pd.DataFrame(columns=["date", "city_id", "fire_frp", "fire_count"])
        _FIRE_CACHE = {"daily": empty, "lo": None, "hi": None}
        return empty, None, None

    raw = pd.read_csv(f, usecols=lambda c: c in {
        "latitude", "longitude", "frp", "acq_date", "acq_time", "confidence",
    })
    raw["acq_date"] = pd.to_datetime(raw["acq_date"], errors="coerce")
    raw = raw.dropna(subset=["acq_date", "latitude", "longitude", "frp"])
    lo, hi = raw["acq_date"].min(), raw["acq_date"].max()

    cities = get_cities(include_optional=True)
    parts = []
    for city in cities:
        w, s, e, n = city["bbox"]
        # pad bbox slightly so edge cells still see nearby fires
        pad = 0.25
        sub = raw[
            raw.longitude.between(w - pad, e + pad)
            & raw.latitude.between(s - pad, n + pad)
        ].copy()
        if sub.empty:
            continue
        sub["date"] = sub["acq_date"].dt.normalize()
        g = sub.groupby("date", as_index=False).agg(
            fire_frp=("frp", "sum"),
            fire_count=("frp", "size"),
        )
        g["city_id"] = city["id"]
        parts.append(g)

    daily = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(
        columns=["date", "city_id", "fire_frp", "fire_count"]
    )
    _FIRE_CACHE = {"daily": daily, "lo": lo, "hi": hi}
    say(f"fire archive: {lo:%Y-%m-%d} .. {hi:%Y-%m-%d}  "
        f"({len(raw):,} detections, {len(daily):,} city-days)")
    return daily, lo, hi


def add_fire_frp(df: pd.DataFrame, city: dict) -> pd.DataFrame:
    """Attach daily fire_frp for this city. Outside archive → NaN; inside no fire → 0."""
    daily, lo, hi = _load_fire_daily()
    if lo is None or daily.empty:
        warn("fire: no firms_chhattisgarh.csv — fire_frp = NaN")
        df["fire_frp"] = np.nan
        df["fire_count"] = np.nan
        return df

    cid = city["id"]
    sub = daily[daily.city_id == cid][["date", "fire_frp", "fire_count"]].copy()
    df = df.copy()
    df["date"] = pd.to_datetime(df["timestamp"]).dt.normalize()
    df = df.merge(sub, on="date", how="left")

    # Inside archive but no detections that day → 0 (true absence)
    in_range = (df["date"] >= lo.normalize()) & (df["date"] <= hi.normalize())
    df.loc[in_range & df["fire_frp"].isna(), "fire_frp"] = 0.0
    df.loc[in_range & df["fire_count"].isna(), "fire_count"] = 0.0
    # Outside archive → leave NaN
    n_in = int(in_range.sum())
    n_pos = int((df["fire_frp"].fillna(0) > 0).sum())
    say(f"fire_frp: {n_in:,}/{len(df):,} rows inside archive, {n_pos:,} with FRP>0")
    df.drop(columns=["date"], inplace=True, errors="ignore")
    return df


# --- report --------------------------------------------------------------------
def report(df: pd.DataFrame, city: dict, path: Path) -> None:
    print()
    print("=" * 78)
    print(f"FEATURE TABLE - {city['id']}")
    print("=" * 78)
    print(f"  path  : {path.relative_to(ROOT)}")
    print(f"  shape : {df.shape[0]:,} rows x {df.shape[1]} cols")
    print()
    print(f"  {'column':<28}{'non-null %':>12}{'dtype':>12}")
    print("  " + "-" * 52)
    n = len(df)
    for c in df.columns:
        pct = df[c].notna().mean() * 100 if n else 0.0
        flag = "  <- ALL NaN" if pct == 0 else ""
        print(f"  {c:<28}{pct:>11.1f}%{str(df[c].dtype):>12}{flag}")

    print()
    if "pm25" in df.columns:
        t = df["pm25"].dropna()
        print(f"  TARGET pm25 : {len(t):,} non-null of {n:,} rows ({len(t) / n * 100:.1f}%)")
        if len(t):
            ts = df.loc[t.index, "timestamp"]
            print(f"  target range: {ts.min()} .. {ts.max()}")
            print(f"  target stats: min={t.min():.1f} med={t.median():.1f} "
                  f"max={t.max():.1f} mean={t.mean():.1f} ug/m3")
    else:
        print("  TARGET pm25 : ABSENT (zero-station city - inference only)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="korba")
    ap.add_argument("--all", action="store_true", help="build every city in cities.yaml")
    args = ap.parse_args()

    if args.all:
        cities = get_cities(include_optional=True)
        totals = []
        for c in cities:
            try:
                n = build_city(c)
            except Exception as e:  # noqa: BLE001 - one city must not sink the rest
                warn(f"{c['id']}: FAILED - {type(e).__name__}: {e}")
                n = None
            totals.append((c, n))
        summarize_all(totals)
        return

    cities = get_cities(only=[args.city], include_optional=True)
    if not cities:
        sys.exit(f"unknown city: {args.city}")
    build_city(cities[0])


def summarize_all(totals: list[tuple[dict, int | None]]) -> None:
    print()
    print("=" * 78)
    print("POOLED TRAINING TOTALS")
    print("=" * 78)
    print(f"{'city':<14}{'role':<22}{'real pm25 rows':>16}")
    print("-" * 78)
    pooled = 0
    for c, n in totals:
        if n is None:
            shown = "FAILED"
        elif n < 0:
            shown = "no target (reveal)"
        else:
            shown = f"{n:,}"
            pooled += n
        print(f"{c['id']:<14}{c['role']:<22}{shown:>16}")
    print("-" * 78)
    print(f"{'TOTAL':<14}{'':<22}{pooled:>16,}")
    print()
    say("headline: total pooled real-pm25 training rows across all stations "
        f"= {pooled:,}")


def build_city(city: dict) -> int:
    skipped_roads: list[str] = []

    print("=" * 78)
    print(f"HARMONIZE - {city['id']} (h3 res {H3_RES})")
    print("=" * 78)

    print("\n[1] grid")
    grid = build_grid(city)
    say(f"{len(grid):,} cells over bbox {city['bbox']}")

    print("\n[2] static per-cell layers")
    grid = add_population(grid, city)
    grid = add_edgar(grid, city)
    grid = add_gppd(grid, city)
    grid = add_roads(grid, city, skipped_roads)

    gpath = ensure(DATA / "grid") / f"{city['id']}.parquet"
    grid.to_parquet(gpath, index=False)
    ok(f"grid -> {gpath.relative_to(ROOT)}  ({grid.shape[0]:,} x {grid.shape[1]})")

    print("\n[3] cpcb target (column mapping inferred per file)")
    cpcb = load_cpcb(city)

    print("\n[4] weather + cams")
    met = load_met(city)
    cams = load_cams(city)

    print("\n[5] assemble")
    if cpcb.empty:
        # Zero-station city: no target, so emit the hourly frame for every cell in
        # the grid is still too large - emit weather x cams only, cell-joined at
        # inference. Keeps the contract honest instead of faking a target.
        warn(f"{city['id']} has no CPCB - emitting weather/cams table with no target")
        df = met.merge(cams, on="timestamp", how="outer") if not cams.empty else met
        df["cell_id"] = np.nan
    else:
        # Several stations can land in one cell; average them into the cell target.
        agg = {c: "mean" for c in ("pm25", "pm10", "no2", "so2", "o3", "co") if c in cpcb.columns}
        df = cpcb.groupby(["cell_id", "timestamp"], as_index=False).agg(agg)
        say(f"cpcb: {cpcb.station_id.nunique()} stations -> "
            f"{df.cell_id.nunique()} cells, {len(df):,} cell-hours")
        if not met.empty:
            df = df.merge(met, on="timestamp", how="left")
        if not cams.empty:
            df = df.merge(cams, on="timestamp", how="left")
        static_cols = [c for c in grid.columns if c not in ("lat", "lon")]
        df = df.merge(grid[static_cols], on="cell_id", how="left")

    # Clip to the configured training window (cities.yaml defaults).
    if "timestamp" in df.columns:
        lo = pd.Timestamp(city["start_date"])
        hi = pd.Timestamp(city["end_date"]) + pd.Timedelta(days=1)
        n_before = len(df)
        df = df[(df.timestamp >= lo) & (df.timestamp < hi)].reset_index(drop=True)
        say(f"window {city['start_date']}..{city['end_date']}: "
            f"{n_before:,} -> {len(df):,} rows")

    df = add_calendar(df)

    # Fire radiative power near the station cell (daily sum within ~25 km).
    # Dates outside the FIRMS archive are left NaN (not zero) so a chronological
    # test tail without fire coverage is "missing", not "fires stopped".
    df = add_fire_frp(df, city)

    ppath = ensure(DATA / "processed") / f"{city['id']}_features.parquet"
    df.to_parquet(ppath, index=False)

    report(df, city, ppath)

    print()
    if skipped_roads:
        warn(f"cities skipped for roads (empty dir): {', '.join(skipped_roads)}")
    say("satellite AOD/NO2/SO2 and landuse are keyed at h3 res 7; join them on "
        "'cell_id_res7' (already in the grid) when you add them.")

    # -1 signals "built fine, but carries no target" (the zero-station reveal city).
    if "pm25" not in df.columns:
        return -1
    return int(df["pm25"].notna().sum())


if __name__ == "__main__":
    main()
