"""Leave-one-station-out validation: the evidence behind the zero-station reveal.

For each of the 14 training stations we hold it out ENTIRELY, train on the other
13, and predict the held-out station's pm25 using ONLY features a station-less
location actually has: satellite (aod/no2/so2), weather, CAMS, static per-cell,
calendar. The held-out station's OWN pm25 history is never a feature - that is
the whole point. A city like Jagdalpur has no past readings of itself.

This is a NOWCAST (predict pm25(t) from features at t), not a t+h forecast - the
Jagdalpur question is "what is the air like at this unmonitored place right now",
not "what will this station read tomorrow". So the reference bar here is a CAMS
nowcast on the identical held-out rows, bias-corrected with a GLOBAL offset fit on
the 13 training stations (a zero-station city cannot know its own bias).

Run:  python scripts/models/02_loso_validation.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

H3_RES = 8
OUT_JSON = DATA / "processed" / "loso_metrics.json"

WEATHER = ["temp_c", "rh_pct", "wind_speed", "wind_dir", "wind_dir_sin",
           "wind_dir_cos", "blh_m", "surface_pressure", "precip_mm"]
STATIC = ["population", "edgar_pm25_total", "edgar_share_ags", "edgar_share_awb",
          "edgar_share_ind", "edgar_share_ref_trf", "edgar_share_ene",
          "edgar_share_rco", "edgar_share_tro", "gppd_nearest_km",
          "gppd_nearest_mw", "gppd_cap_25km", "gppd_inv_dist_mw",
          "road_density_km_km2", "road_length_km"]
CALENDAR = ["hour", "dow", "month", "is_weekend", "hour_sin", "hour_cos"]
SATELLITE = ["sat_aod", "sat_no2", "sat_so2"]
# NB: no pm25 lags anywhere. That exclusion IS the experiment.

LGB_PARAMS = dict(objective="regression", metric="rmse", learning_rate=0.05,
                  num_leaves=127, min_data_in_leaf=40, feature_fraction=0.85,
                  bagging_fraction=0.85, bagging_freq=1, lambda_l2=1.0,
                  verbosity=-1, n_jobs=-1, seed=42)


def rmse(a, b):
    return float(np.sqrt(np.mean((a - b) ** 2)))


def mae(a, b):
    return float(np.mean(np.abs(a - b)))


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
    return pd.concat(frames, axis=1).reset_index() if frames else pd.DataFrame()


def load() -> pd.DataFrame:
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    if "use_in_training" in st.columns:
        flag = st["use_in_training"].astype(str).str.strip().str.lower()
        for _, r in st[flag.isin(("false", "0", "no"))].iterrows():
            warn(f"excluded by use_in_training=FALSE: {r.station_id}")
        st = st[~flag.isin(("false", "0", "no"))]
    st["cell_id"] = [h3.latlng_to_cell(la, lo, H3_RES)
                     for la, lo in zip(st.latitude, st.longitude)]
    cell2st = dict(zip(st.cell_id, st.station_id))

    frames = []
    for city in get_cities(include_optional=True):
        p = DATA / "processed" / f"{city['id']}_features.parquet"
        if not p.exists():
            continue
        d = pd.read_parquet(p)
        if "pm25" not in d.columns:
            continue
        d = d[d.pm25.notna()].copy()
        d["station_id"] = d.cell_id.map(cell2st)
        d = d[d.station_id.notna()]
        d["city_id"] = city["id"]
        frames.append(d)
    pool = pd.concat(frames, ignore_index=True)

    sat = load_satellite()
    if not sat.empty:
        # Same-day satellite: the overpass is an independent column measurement,
        # not derived from ground PM, so it is a legitimate contemporaneous
        # predictor rather than leakage.
        pool["sat_date"] = pool.timestamp.dt.normalize()
        pool = pool.merge(sat.rename(columns={"date": "sat_date"}),
                          on=["station_id", "sat_date"], how="left")
    for c in SATELLITE:
        if c not in pool.columns:
            pool[c] = np.nan
    return pool


def main() -> None:
    print("=" * 96)
    print("LEAVE-ONE-STATION-OUT VALIDATION  (zero-station capability)")
    print("=" * 96)

    pool = load()
    feats = ([c for c in WEATHER if c in pool.columns] + ["cams_pm25"] +
             [c for c in STATIC if c in pool.columns] + SATELLITE +
             [c for c in CALENDAR if c in pool.columns])
    stations = sorted(pool.station_id.unique())
    sat_have = {s for s in stations
                if pool.loc[pool.station_id == s, "sat_aod"].notna().any()}

    say(f"{len(pool):,} rows, {len(stations)} stations, {len(feats)} features "
        f"(NO pm25 lags - that is the point)")
    say(f"stations WITH satellite: {len(sat_have)}/{len(stations)} "
        f"({', '.join(sorted(sat_have))})")
    say(f"stations WITHOUT satellite: {', '.join(sorted(set(stations) - sat_have)) or 'none'}")

    # Global CAMS bias fit across ALL stations - stands in for the fact that a
    # zero-station city cannot fit its own correction.
    global_bias = float((pool.cams_pm25 - pool.pm25).mean())
    say(f"global CAMS bias (all stations): {global_bias:+.2f} ug/m3")

    per_station = []
    for held in stations:
        tr = pool[pool.station_id != held]
        te = pool[pool.station_id == held]
        if len(te) < 50:
            warn(f"{held}: only {len(te)} rows - skipped")
            continue

        # early-stopping val = time tail of the 13 training stations, so no
        # held-out information and no future leak within training
        tr_sorted = tr.sort_values("timestamp")
        vcut = int(len(tr_sorted) * 0.85)
        trn, val = tr_sorted.iloc[:vcut], tr_sorted.iloc[vcut:]

        ds_tr = lgb.Dataset(trn[feats], trn.pm25)
        ds_va = lgb.Dataset(val[feats], val.pm25, reference=ds_tr)
        model = lgb.train(LGB_PARAMS, ds_tr, num_boost_round=2000,
                          valid_sets=[ds_va],
                          callbacks=[lgb.early_stopping(80, verbose=False)])
        pred = np.clip(model.predict(te[feats], num_iteration=model.best_iteration), 0, None)

        # fair CAMS nowcast on the identical held-out rows, global bias removed
        cams_bc = np.clip(te.cams_pm25.to_numpy() - global_bias, 0, None)
        has_c = te.cams_pm25.notna().to_numpy()

        per_station.append({
            "station_id": held,
            "city_id": te.city_id.iloc[0],
            "has_satellite": held in sat_have,
            "n": int(len(te)),
            "loso_rmse": rmse(te.pm25.to_numpy(), pred),
            "loso_mae": mae(te.pm25.to_numpy(), pred),
            "cams_bc_rmse": rmse(te.pm25.to_numpy()[has_c], cams_bc[has_c]) if has_c.any() else None,
            "obs_mean": float(te.pm25.mean()),
        })
        say(f"held out {held:<14} ({te.city_id.iloc[0]:<10}) "
            f"n={len(te):>6,}  LOSO RMSE={per_station[-1]['loso_rmse']:6.2f}  "
            f"CAMS_bc={per_station[-1]['cams_bc_rmse']:6.2f}"
            + ("" if held in sat_have else "   [no satellite]"))

    # --- pooled: weight by n, computed from per-row errors for honesty --------
    # Recompute pooled RMSE from the squared errors, not a mean-of-RMSEs.
    def pooled(rows, key_rmse):
        num = sum(r[key_rmse] ** 2 * r["n"] for r in rows if r[key_rmse] is not None)
        den = sum(r["n"] for r in rows if r[key_rmse] is not None)
        return float(np.sqrt(num / den)) if den else None

    all_rows = per_station
    sat_rows = [r for r in per_station if r["has_satellite"]]
    pooled_loso = pooled(all_rows, "loso_rmse")
    pooled_loso_sat = pooled(sat_rows, "loso_rmse")
    pooled_cams = pooled(all_rows, "cams_bc_rmse")
    pooled_cams_sat = pooled(sat_rows, "cams_bc_rmse")

    # reference numbers from earlier stages
    fm = json.loads((DATA / "processed" / "forecast_metrics.json").read_text()) \
        if (DATA / "processed" / "forecast_metrics.json").exists() else {"results": []}
    bm = json.loads((DATA / "processed" / "baseline_metrics.json").read_text()) \
        if (DATA / "processed" / "baseline_metrics.json").exists() else {"results": []}
    full_24 = next((r["model_rmse"] for r in fm.get("results", []) if r["horizon_h"] == 24), None)
    persist_24 = next((r["persistence_rmse"] for r in bm.get("results", []) if r["horizon_h"] == 24), None)
    cams_bc_24 = next((r["cams_bc_rmse"] for r in bm.get("results", []) if r["horizon_h"] == 24), None)

    print()
    print("=" * 96)
    print("PER-STATION HELD-OUT RESULTS")
    print("=" * 96)
    print(f"{'station':<14}{'city':<11}{'sat':>4}{'n':>8}{'LOSO_RMSE':>11}{'LOSO_MAE':>10}"
          f"{'CAMS_bc_RMSE':>14}{'obs_mean':>10}")
    print("-" * 96)
    for r in sorted(per_station, key=lambda x: x["loso_rmse"]):
        c = f"{r['cams_bc_rmse']:.2f}" if r["cams_bc_rmse"] else "-"
        print(f"{r['station_id']:<14}{r['city_id']:<11}{'Y' if r['has_satellite'] else '-':>4}"
              f"{r['n']:>8,}{r['loso_rmse']:>11.2f}{r['loso_mae']:>10.2f}{c:>14}{r['obs_mean']:>10.1f}")

    print()
    print("=" * 96)
    print("POOLED (row-weighted RMSE)")
    print("=" * 96)
    print(f"  LOSO, all {len(all_rows)} stations              : {pooled_loso:.2f} ug/m3")
    print(f"  LOSO, {len(sat_rows)} satellite-covered stations : {pooled_loso_sat:.2f} ug/m3"
          "   <- the honest Jagdalpur analog")
    print(f"  CAMS_bc nowcast, same held-out rows   : {pooled_cams:.2f} ug/m3 (all) / "
          f"{pooled_cams_sat:.2f} (satellite subset)")
    print()
    print("  reference (t+24h forecast task, WITH local lags):")
    print(f"    full model normal RMSE : {full_24}")
    print(f"    persistence            : {persist_24}")
    print(f"    bias-corrected CAMS    : {cams_bc_24}")

    vs_cams = (100 * (pooled_cams - pooled_loso) / pooled_cams) if pooled_cams else None
    vs_cams_sat = (100 * (pooled_cams_sat - pooled_loso_sat) / pooled_cams_sat) if pooled_cams_sat else None

    print()
    print("=" * 96)
    print("VERDICT")
    print("=" * 96)
    verdict = "BEATS" if vs_cams and vs_cams > 0 else "does NOT beat"
    print(f"  Zero-station LOSO {verdict} a CAMS nowcast: "
          f"{pooled_loso:.2f} vs {pooled_cams:.2f} ug/m3 "
          f"({vs_cams:+.1f}% all stations)")
    if vs_cams_sat is not None:
        print(f"  On satellite-covered stations only: {pooled_loso_sat:.2f} vs "
              f"{pooled_cams_sat:.2f} ug/m3 ({vs_cams_sat:+.1f}%)")
    print()
    print("*" * 96)
    print(f"  Predicting a station we have NEVER seen, from satellite + weather alone:")
    print(f"  RMSE = {pooled_loso_sat:.2f} ug/m3  (satellite-covered stations, the Jagdalpur analog)")
    print(f"  RMSE = {pooled_loso:.2f} ug/m3  (all 14 stations, incl. 4 without satellite)")
    print("*" * 96)

    payload = {
        "method": "leave-one-station-out, nowcast pm25(t), NO local pm25 lags",
        "features": feats,
        "n_stations": len(per_station),
        "stations_with_satellite": sorted(sat_have),
        "global_cams_bias": global_bias,
        "pooled_loso_rmse_all": pooled_loso,
        "pooled_loso_rmse_satellite": pooled_loso_sat,
        "pooled_cams_bc_rmse_all": pooled_cams,
        "pooled_cams_bc_rmse_satellite": pooled_cams_sat,
        "vs_cams_pct_all": vs_cams,
        "vs_cams_pct_satellite": vs_cams_sat,
        "reference_t24h": {"full_model": full_24, "persistence": persist_24,
                           "cams_bc": cams_bc_24},
        "per_station": per_station,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, default=float), encoding="utf-8")
    print()
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
