"""Shared feature engineering for AirSight multi-horizon PM2.5 forecast.

Improvements over the v1 trainer (proof target: beat forecast_metrics_v1):
  * Meteorology + multi-species CAMS joined at TARGET time t+h (forecastable)
  * Origin-time weather kept as *_now for state context
  * Longer lags (48/72/168h), rolling means/std, deltas, residual-to-CAMS
  * Traffic diurnal proxy = road_density x congestion_curve(hour, dow)
  * Aux co-pollutants at origin (pm10/no2/so2) when present
  * Explicit timestamp joins only — never positional shift across gaps

Used by: 01_forecast_lgbm.py, 06_forecast_catboost.py, 07_ensemble_proof.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import h3
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, say, warn  # noqa: E402

H3_RES = 8
TEST_FRAC = 0.20
VAL_FRAC = 0.15
LAGS = [0, 1, 3, 6, 12, 24, 48, 72, 168]

WEATHER = [
    "temp_c", "rh_pct", "wind_speed", "wind_dir", "wind_dir_sin",
    "wind_dir_cos", "blh_m", "surface_pressure", "precip_mm",
]
# Extra met columns present in some harmonized tables
WEATHER_EXTRA = ["dew_point_c"]

CAMS_SPECIES = [
    "cams_pm25", "cams_pm10", "cams_no2", "cams_so2", "cams_o3",
    "cams_co", "cams_dust", "cams_aod",
]

STATIC = [
    "population", "edgar_pm25_total", "edgar_share_ags", "edgar_share_awb",
    "edgar_share_ind", "edgar_share_ref_trf", "edgar_share_ene",
    "edgar_share_rco", "edgar_share_tro", "gppd_nearest_km",
    "gppd_nearest_mw", "gppd_cap_25km", "gppd_inv_dist_mw",
    "road_density_km_km2", "road_length_km",
]

AUX_POLLUTANTS = ["pm10", "no2", "so2", "o3", "co"]

# Default India urban congestion curve when TomTom samples are too sparse.
# Values in [0, 1]; peaks morning + evening commute.
_DEFAULT_CONGESTION = {
    0: 0.08, 1: 0.05, 2: 0.04, 3: 0.04, 4: 0.05, 5: 0.10,
    6: 0.25, 7: 0.45, 8: 0.70, 9: 0.65, 10: 0.45, 11: 0.40,
    12: 0.42, 13: 0.40, 14: 0.38, 15: 0.42, 16: 0.55, 17: 0.75,
    18: 0.80, 19: 0.70, 20: 0.50, 21: 0.35, 22: 0.22, 23: 0.12,
}


# ---------------------------------------------------------------------------
# Traffic diurnal curve
# ---------------------------------------------------------------------------

def build_congestion_curve() -> pd.DataFrame:
    """hour x dow -> congestion in [0,1], from TomTom samples when available."""
    frames = []
    traffic_dir = DATA / "traffic"
    if traffic_dir.exists():
        for f in sorted(traffic_dir.glob("*_flow_samples.csv")):
            try:
                d = pd.read_csv(f)
            except Exception:
                continue
            if "congestion_ratio" not in d.columns or "hour" not in d.columns:
                continue
            d = d.dropna(subset=["congestion_ratio", "hour"])
            if d.empty:
                continue
            frames.append(d[["hour", "dow", "congestion_ratio"]].copy()
                          if "dow" in d.columns
                          else d.assign(dow=-1)[["hour", "dow", "congestion_ratio"]])
    if frames:
        all_t = pd.concat(frames, ignore_index=True)
        # If nearly all zeros (free-flow snapshots), fall back to default shape
        # but scale by mean observed free-flow occupancy if any positive samples.
        pos = all_t[all_t.congestion_ratio > 0]
        if len(pos) >= 20:
            curve = (all_t.groupby(["hour", "dow"], as_index=False)["congestion_ratio"]
                     .mean().rename(columns={"congestion_ratio": "congestion"}))
            say(f"traffic curve: calibrated from {len(all_t):,} TomTom rows "
                f"({len(pos)} congested)")
            return curve

    # Synthetic but explicit: hour-only default, same for all dow
    rows = [{"hour": h, "dow": d, "congestion": _DEFAULT_CONGESTION[h]}
            for h in range(24) for d in range(7)]
    say("traffic curve: default India-urban diurnal (TomTom samples too sparse/flat)")
    return pd.DataFrame(rows)


def attach_traffic(df: pd.DataFrame, curve: pd.DataFrame) -> pd.DataFrame:
    """traffic_index = road_density * congestion(hour_t, dow_t)."""
    if "hour_t" not in df.columns:
        return df
    c = curve.copy()
    # Prefer hour+dow match; fall back to hour-mean
    hour_mean = c.groupby("hour", as_index=False)["congestion"].mean()
    hour_mean = hour_mean.rename(columns={"congestion": "cong_hour"})
    df = df.merge(
        c.rename(columns={"hour": "hour_t", "dow": "dow_t", "congestion": "cong_hd"}),
        on=["hour_t", "dow_t"], how="left",
    )
    df = df.merge(hour_mean.rename(columns={"hour": "hour_t"}), on="hour_t", how="left")
    df["congestion"] = df["cong_hd"].fillna(df["cong_hour"]).fillna(0.3)
    rd = df["road_density_km_km2"] if "road_density_km_km2" in df.columns else np.nan
    df["traffic_index"] = rd.fillna(0) * df["congestion"]
    df.drop(columns=[c for c in ("cong_hd", "cong_hour") if c in df.columns], inplace=True)
    return df


# ---------------------------------------------------------------------------
# Load pool + satellite (same contracts as v1)
# ---------------------------------------------------------------------------

def load_satellite() -> pd.DataFrame:
    frames = []
    for kind in ("aod", "no2", "so2"):
        files = sorted((DATA / "satellite" / kind).glob("*/*stations*.csv"))
        if not files:
            continue
        d = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
        d = d.rename(columns={"cell_id": "station_id", "mean": f"sat_{kind}"})
        d["date"] = pd.to_datetime(d["date"], errors="coerce").dt.normalize()
        d = d.dropna(subset=["date"]).groupby(
            ["station_id", "date"], as_index=False)[f"sat_{kind}"].mean()
        frames.append(d.set_index(["station_id", "date"]))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1).reset_index()


def load_pool() -> tuple[pd.DataFrame, dict]:
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    if "use_in_training" in st.columns:
        flag = st["use_in_training"].astype(str).str.strip().str.lower()
        for _, r in st[flag.isin(("false", "0", "no"))].iterrows():
            warn(f"excluded by use_in_training=FALSE: {r.station_id}")
        st = st[~flag.isin(("false", "0", "no"))]
    st["cell_id"] = [h3.latlng_to_cell(la, lo, H3_RES)
                     for la, lo in zip(st.latitude, st.longitude)]
    cell2st = dict(zip(st.cell_id, st.station_id))

    frames, per_city = [], {}
    for city in get_cities(include_optional=True):
        p = DATA / "processed" / f"{city['id']}_features.parquet"
        if not p.exists():
            continue
        d = pd.read_parquet(p)
        if "pm25" not in d.columns:
            say(f"{city['id']}: zero-station reveal city - not pooled")
            continue
        d = d[d.pm25.notna()].copy()
        d["station_id"] = d.cell_id.map(cell2st)
        d = d[d.station_id.notna()]
        if d.empty:
            continue
        d["city_id"] = city["id"]
        per_city[city["id"]] = len(d)
        frames.append(d)
    pool = pd.concat(frames, ignore_index=True)
    return pool.sort_values(["station_id", "timestamp"]).reset_index(drop=True), per_city


def mark_split(pool: pd.DataFrame) -> pd.DataFrame:
    out = []
    for _, g in pool.groupby("station_id", sort=False):
        g = g.sort_values("timestamp").copy()
        cut = int(len(g) * (1 - TEST_FRAC))
        g["split"] = "train"
        g.iloc[cut:, g.columns.get_loc("split")] = "test"
        out.append(g)
    return pd.concat(out, ignore_index=True)


# ---------------------------------------------------------------------------
# Rolling stats (gap-safe via hourly reindex)
# ---------------------------------------------------------------------------

def _station_rollups(g: pd.DataFrame) -> pd.DataFrame:
    """Per-station trailing roll stats on pm25, strictly causal (shifted)."""
    g = g.sort_values("timestamp").copy()
    s = g.set_index("timestamp")["pm25"].sort_index()
    # Deduplicate timestamps (cell-averaged can still collide)
    s = s[~s.index.duplicated(keep="last")]
    full = s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="h"))
    shifted = full.shift(1)
    out = pd.DataFrame({
        "timestamp": full.index,
        "pm25_roll6_mean": shifted.rolling(6, min_periods=3).mean(),
        "pm25_roll24_mean": shifted.rolling(24, min_periods=12).mean(),
        "pm25_roll24_std": shifted.rolling(24, min_periods=12).std(),
        "pm25_roll168_mean": shifted.rolling(168, min_periods=48).mean(),
    })
    return out


# ---------------------------------------------------------------------------
# Sample builder
# ---------------------------------------------------------------------------

def build_samples(pool: pd.DataFrame, sat: pd.DataFrame, h: int,
                  traffic_curve: pd.DataFrame | None = None) -> pd.DataFrame:
    """One row per (station, origin t) with target pm25(t+h)."""
    weather_cols = [c for c in WEATHER + WEATHER_EXTRA if c in pool.columns]
    cams_cols = [c for c in CAMS_SPECIES if c in pool.columns]
    static_cols = [c for c in STATIC if c in pool.columns]
    aux_cols = [c for c in AUX_POLLUTANTS if c in pool.columns]
    fire_cols = [c for c in ("fire_frp", "fire_count") if c in pool.columns]

    # Precompute rollups per station once
    roll_cache = {sid: _station_rollups(g)
                  for sid, g in pool.groupby("station_id", sort=False)}

    samples = []
    for sid, g in pool.groupby("station_id", sort=False):
        g = g.sort_values("timestamp")

        keep_now = (["station_id", "city_id", "timestamp", "pm25"]
                    + weather_cols + static_cols + aux_cols + fire_cols
                    + [c for c in cams_cols if c in g.columns])
        keep_now = list(dict.fromkeys([c for c in keep_now if c in g.columns]))
        base = g[keep_now].copy()
        base = base.rename(columns={"pm25": "pm25_lag0"})
        # Origin CAMS + weather aliases
        if "cams_pm25" in base.columns:
            base = base.rename(columns={"cams_pm25": "cams_now"})
        for c in weather_cols:
            if c in base.columns:
                base.rename(columns={c: f"{c}_now"}, inplace=True)
        for c in cams_cols:
            if c == "cams_pm25":
                continue
            if c in base.columns:
                base.rename(columns={c: f"{c}_now"}, inplace=True)
        for c in aux_cols:
            if c in base.columns:
                base.rename(columns={c: f"{c}_lag0"}, inplace=True)
        # fire_frp / fire_count stay as origin-day features (satellite fire is daily)

        # Lags via timestamp join
        lagsrc = g[["timestamp", "pm25"]]
        for L in LAGS:
            if L == 0:
                continue
            tmp = lagsrc.rename(columns={"pm25": f"pm25_lag{L}"}).copy()
            tmp["timestamp"] = tmp.timestamp + pd.Timedelta(hours=L)
            base = base.merge(tmp, on="timestamp", how="left")

        # Rolling stats at origin
        roll = roll_cache[sid]
        base = base.merge(roll, on="timestamp", how="left")

        # Target row: y, split, calendar@t+h, weather@t+h, cams@t+h
        tgt_cols = ["timestamp", "pm25", "split", "hour", "dow", "month", "is_weekend"]
        tgt_cols += [c for c in weather_cols if c in g.columns]
        tgt_cols += [c for c in cams_cols if c in g.columns]
        # hour_sin/cos at target if present
        for c in ("hour_sin", "hour_cos"):
            if c in g.columns:
                tgt_cols.append(c)
        tgt_cols = list(dict.fromkeys(tgt_cols))
        tgt = g[tgt_cols].copy()
        rename = {
            "timestamp": "target_time",
            "pm25": "y",
            "hour": "hour_t",
            "dow": "dow_t",
            "month": "month_t",
            "is_weekend": "is_weekend_t",
        }
        for c in weather_cols:
            if c in tgt.columns:
                rename[c] = f"{c}_t"
        for c in cams_cols:
            if c in tgt.columns:
                # cams_pm25 -> cams_target for back-compat; others cams_*_t
                if c == "cams_pm25":
                    rename[c] = "cams_target"
                else:
                    rename[c] = f"{c}_t"
        for c in ("hour_sin", "hour_cos"):
            if c in tgt.columns:
                rename[c] = f"{c}_t"
        tgt = tgt.rename(columns=rename)

        base["target_time"] = base.timestamp + pd.Timedelta(hours=h)
        m = base.merge(tgt, on="target_time", how="inner")
        m = m.dropna(subset=["y", "pm25_lag0"])
        if m.empty:
            continue
        samples.append(m)

    if not samples:
        return pd.DataFrame()
    df = pd.concat(samples, ignore_index=True)

    # Satellite: previous complete day only (no same-day leakage)
    if sat is not None and not sat.empty:
        df["sat_date"] = (df.timestamp - pd.Timedelta(days=1)).dt.normalize()
        df = df.merge(sat.rename(columns={"date": "sat_date"}),
                      on=["station_id", "sat_date"], how="left")
    for c in ("sat_aod", "sat_no2", "sat_so2"):
        if c not in df.columns:
            df[c] = np.nan

    # Engineered deltas / residuals (causal: only origin + forecastable cams)
    df["pm25_delta_1"] = df["pm25_lag0"] - df.get("pm25_lag1", np.nan)
    df["pm25_delta_24"] = df["pm25_lag0"] - df.get("pm25_lag24", np.nan)
    if "cams_now" in df.columns:
        df["pm25_cams_resid"] = df["pm25_lag0"] - df["cams_now"]
    if "cams_target" in df.columns:
        df["cams_delta"] = df["cams_target"] - df.get("cams_now", np.nan)

    # Met change origin -> target (what the atmosphere will do)
    for w in ("temp_c", "rh_pct", "wind_speed", "blh_m", "surface_pressure", "precip_mm"):
        cn, ct = f"{w}_now", f"{w}_t"
        if cn in df.columns and ct in df.columns:
            df[f"{w}_delta"] = df[ct] - df[cn]

    # Wind u/v at target (trees learn directional advection better than angle)
    if "wind_speed_t" in df.columns and "wind_dir_t" in df.columns:
        rad = np.deg2rad(df["wind_dir_t"])
        df["wind_u_t"] = -df["wind_speed_t"] * np.sin(rad)
        df["wind_v_t"] = -df["wind_speed_t"] * np.cos(rad)
    if "wind_speed_now" in df.columns and "wind_dir_now" in df.columns:
        rad = np.deg2rad(df["wind_dir_now"])
        df["wind_u_now"] = -df["wind_speed_now"] * np.sin(rad)
        df["wind_v_now"] = -df["wind_speed_now"] * np.cos(rad)

    # Stability proxy: low BLH + low wind = trapping nights
    if "blh_m_t" in df.columns and "wind_speed_t" in df.columns:
        df["trap_index_t"] = 1.0 / (1.0 + df["blh_m_t"].clip(lower=0) / 200.0) / (
            1.0 + df["wind_speed_t"].clip(lower=0)
        )

    # Traffic index at TARGET hour (when people will drive / idle)
    if traffic_curve is not None:
        df = attach_traffic(df, traffic_curve)
    else:
        df["traffic_index"] = np.nan
        df["congestion"] = np.nan

    df["horizon"] = h
    return df


def feature_cols(df: pd.DataFrame) -> list[str]:
    """Stable feature list present in df (no leakage columns)."""
    cols: list[str] = []
    # PM lags + rollups + deltas
    for L in LAGS:
        cols.append(f"pm25_lag{L}")
    cols += [
        "pm25_roll6_mean", "pm25_roll24_mean", "pm25_roll24_std", "pm25_roll168_mean",
        "pm25_delta_1", "pm25_delta_24", "pm25_cams_resid", "cams_delta",
        "temp_c_delta", "rh_pct_delta", "wind_speed_delta", "blh_m_delta",
        "surface_pressure_delta", "precip_mm_delta",
        "wind_u_t", "wind_v_t", "wind_u_now", "wind_v_now", "trap_index_t",
    ]
    # Weather now + target
    for w in WEATHER + WEATHER_EXTRA:
        cols.append(f"{w}_now")
        cols.append(f"{w}_t")
    # CAMS now + target
    cols += ["cams_now", "cams_target"]
    for c in CAMS_SPECIES:
        if c == "cams_pm25":
            continue
        cols.append(f"{c}_now")
        cols.append(f"{c}_t")
    # Static
    cols += STATIC
    # Satellite
    cols += ["sat_aod", "sat_no2", "sat_so2"]
    # Aux pollutants at origin
    for a in AUX_POLLUTANTS:
        cols.append(f"{a}_lag0")
    # Calendar @ target
    cols += ["hour_t", "dow_t", "month_t", "is_weekend_t", "hour_sin_t", "hour_cos_t"]
    # Traffic + fire
    cols += ["traffic_index", "congestion", "fire_frp", "fire_count"]
    # Keep only present + non-all-nan
    present = []
    for c in cols:
        if c not in df.columns:
            continue
        if df[c].notna().sum() == 0:
            continue
        present.append(c)
    return present


def train_val_test(df: pd.DataFrame):
    tr_all = df[df.split == "train"].sort_values("timestamp")
    te = df[df.split == "test"]
    vcut = int(len(tr_all) * (1 - VAL_FRAC))
    tr, va = tr_all.iloc[:vcut], tr_all.iloc[vcut:]
    return tr, va, te


def rmse(a, b) -> float:
    return float(np.sqrt(np.mean((np.asarray(a) - np.asarray(b)) ** 2)))


def mae(a, b) -> float:
    return float(np.mean(np.abs(np.asarray(a) - np.asarray(b))))


def stratified_metrics(y: np.ndarray, pred: np.ndarray, te: pd.DataFrame) -> dict:
    """Overall + severe hours + season + per-city skill."""
    out = {
        "rmse": rmse(y, pred),
        "mae": mae(y, pred),
        "n": int(len(y)),
    }
    # Severe (CPCB 24h standard 60, and 90)
    for thr, name in ((60, "severe_ge60"), (90, "severe_ge90")):
        m = y >= thr
        if m.sum() >= 20:
            out[f"{name}_rmse"] = rmse(y[m], pred[m])
            out[f"{name}_mae"] = mae(y[m], pred[m])
            out[f"{name}_n"] = int(m.sum())

    # Season from target month
    if "month_t" in te.columns:
        mon = te.month_t.to_numpy()
        seasons = {
            "winter_DJF": np.isin(mon, [12, 1, 2]),
            "pre_monsoon_MAM": np.isin(mon, [3, 4, 5]),
            "monsoon_JJAS": np.isin(mon, [6, 7, 8, 9]),
            "post_monsoon_ON": np.isin(mon, [10, 11]),
        }
        for sname, mask in seasons.items():
            if mask.sum() >= 50:
                out[f"{sname}_rmse"] = rmse(y[mask], pred[mask])
                out[f"{sname}_n"] = int(mask.sum())

    # Per-city
    by_city = {}
    for cid, idx in te.groupby("city_id").indices.items():
        idx = np.asarray(list(idx))
        by_city[cid] = {
            "n": int(len(idx)),
            "rmse": rmse(y[idx], pred[idx]),
            "mae": mae(y[idx], pred[idx]),
            "persistence_rmse": rmse(y[idx], te.pm25_lag0.to_numpy()[idx]),
        }
        pr = by_city[cid]["persistence_rmse"]
        by_city[cid]["vs_persist_pct"] = (
            100 * (pr - by_city[cid]["rmse"]) / pr if pr else None
        )
    out["by_city"] = by_city
    return out
