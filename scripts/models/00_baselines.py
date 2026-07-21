"""Reference baselines the AirSight forecast model must beat. NO ML HERE.

Two baselines:
  PERSISTENCE  pred pm25(t+h) = pm25(t)      - the "nothing changes" null model
  CAMS         pred pm25(t+h) = cams_pm25(t+h) - a real operational forecast

Beating persistence proves the model learned something. Beating CAMS proves it is
worth using. CAMS is the harder and more meaningful bar.

Run:  python scripts/models/00_baselines.py
      python scripts/models/00_baselines.py --horizons 1 24 48 72
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import h3
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, get_cities, ok, say, warn  # noqa: E402

H3_RES = 8
TEST_FRAC = 0.20
MIN_PAIRS = 50          # per station per horizon; below this the station is skipped
OUT_JSON = DATA / "processed" / "baseline_metrics.json"


def rmse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def mae(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean(np.abs(a - b)))


def load_pool() -> tuple[pd.DataFrame, dict]:
    """Pooled target rows across all training cities, tagged with station_id."""
    st = pd.read_csv(ROOT / "config" / "stations.csv")
    if "use_in_training" in st.columns:
        flag = st["use_in_training"].astype(str).str.strip().str.lower()
        dropped = st[flag.isin(("false", "0", "no"))]
        for _, r in dropped.iterrows():
            warn(f"excluded by use_in_training=FALSE: {r.station_id} ({r.station_name})")
        st = st[~flag.isin(("false", "0", "no"))]

    # The feature tables key on cell_id, not station_id. Rebuild the link the same
    # way the harmonizer made it, so a station excluded above really is absent.
    st["cell_id"] = [h3.latlng_to_cell(la, lo, H3_RES)
                     for la, lo in zip(st.latitude, st.longitude)]
    cell2st = dict(zip(st.cell_id, st.station_id))

    frames, per_city = [], {}
    for city in get_cities(include_optional=True):
        p = DATA / "processed" / f"{city['id']}_features.parquet"
        if not p.exists():
            warn(f"{city['id']}: no features parquet, skipped")
            continue
        d = pd.read_parquet(p)
        if "pm25" not in d.columns:
            say(f"{city['id']}: no target (zero-station reveal city) - not pooled")
            continue
        d = d[d.pm25.notna()].copy()          # never fabricate or fill the target
        d["station_id"] = d.cell_id.map(cell2st)
        unknown = d.station_id.isna().sum()
        if unknown:
            warn(f"{city['id']}: {unknown:,} rows in cells with no enabled station - dropped")
            d = d[d.station_id.notna()]
        if d.empty:
            continue
        d["city_id"] = city["id"]
        per_city[city["id"]] = len(d)
        frames.append(d[["city_id", "station_id", "timestamp", "pm25", "cams_pm25"]])

    pool = pd.concat(frames, ignore_index=True).sort_values(
        ["station_id", "timestamp"]).reset_index(drop=True)
    return pool, per_city


def split(pool: pd.DataFrame) -> pd.DataFrame:
    """Time-ordered per-station split. Last TEST_FRAC of each station's own
    timeline is test. No shuffling: this is a forecast, so any random split
    would train on the future and leak."""
    parts = []
    for sid, g in pool.groupby("station_id", sort=False):
        g = g.sort_values("timestamp").copy()
        cut = int(len(g) * (1 - TEST_FRAC))
        g["split"] = "train"
        g.iloc[cut:, g.columns.get_loc("split")] = "test"
        parts.append(g)
    return pd.concat(parts, ignore_index=True)


def build_pairs(df: pd.DataFrame, h: int) -> tuple[pd.DataFrame, list[str]]:
    """(t, t+h) pairs where BOTH ends carry a real target, per station.

    Built by joining on an explicit timestamp key rather than shift(h): the
    series has real gaps, and a positional shift would silently bridge a
    two-month hole and call it a 1-hour-ahead pair.
    """
    out, skipped = [], []
    for sid, g in df.groupby("station_id", sort=False):
        g = g.sort_values("timestamp")
        left = g[["timestamp", "pm25"]].rename(columns={"pm25": "pm25_t"}).copy()
        left["target_time"] = left.timestamp + pd.Timedelta(hours=h)
        right = g[["timestamp", "pm25", "cams_pm25", "cams_bc", "split"]].rename(
            columns={"timestamp": "target_time", "pm25": "pm25_th",
                     "cams_pm25": "cams_th", "cams_bc": "cams_bc_th"})
        m = left.merge(right, on="target_time", how="inner")
        m = m[m.split == "test"]                       # score on test only
        m = m.dropna(subset=["pm25_t", "pm25_th"])     # both ends real
        if len(m) < MIN_PAIRS:
            skipped.append(f"{sid} (h={h}, {len(m)} pairs)")
            continue
        m["station_id"] = sid
        out.append(m)
    if not out:
        return pd.DataFrame(), skipped
    return pd.concat(out, ignore_index=True), skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizons", nargs="*", type=int, default=[1, 24, 48, 72])
    args = ap.parse_args()

    print("=" * 96)
    print("AIRSIGHT REFERENCE BASELINES  (persistence vs CAMS) - no ML")
    print("=" * 96)

    pool, per_city = load_pool()
    df = split(pool)

    # Raw CAMS runs ~1.6x high over Chhattisgarh, so scoring it untouched measures
    # its offset rather than its skill - and nobody deploys CAMS uncorrected.
    # Bias is the per-station mean error on TRAIN ONLY, then applied to test.
    df["cams_bc"] = np.nan
    bias_tbl = {}
    for sid, g in df.groupby("station_id", sort=False):
        tr = g[(g.split == "train") & g.cams_pm25.notna()]
        b = float((tr.cams_pm25 - tr.pm25).mean()) if len(tr) else 0.0
        bias_tbl[sid] = b
        df.loc[g.index, "cams_bc"] = (g.cams_pm25 - b).clip(lower=0)
    print()
    say("CAMS additive bias removed (fitted on TRAIN split only, per station):")
    for sid, b in sorted(bias_tbl.items(), key=lambda kv: -kv[1])[:14]:
        print(f"    {sid:<16}{b:+7.2f} ug/m3")

    n_tr = int((df.split == "train").sum())
    n_te = int((df.split == "test").sum())
    print()
    say(f"pooled target rows : {len(df):,}")
    say(f"train / test       : {n_tr:,} / {n_te:,}  "
        f"({100 * n_te / len(df):.1f}% test, time-ordered per station)")
    say(f"stations           : {df.station_id.nunique()}   "
        f"window {df.timestamp.min():%Y-%m-%d} .. {df.timestamp.max():%Y-%m-%d}")

    print()
    print("  rows contributed per city:")
    print(f"    {'city':<12}{'target rows':>13}{'share':>9}")
    print("    " + "-" * 34)
    tot = sum(per_city.values())
    for c, n in sorted(per_city.items(), key=lambda kv: -kv[1]):
        print(f"    {c:<12}{n:>13,}{100 * n / tot:>8.1f}%")
    print(f"    {'TOTAL':<12}{tot:>13,}")

    results, all_skipped = [], []
    for h in args.horizons:
        pairs, skipped = build_pairs(df, h)
        all_skipped += skipped
        if pairs.empty:
            warn(f"h={h}: no station had >= {MIN_PAIRS} pairs - skipped")
            continue
        y = pairs.pm25_th.to_numpy()
        p_pers = pairs.pm25_t.to_numpy()

        # CAMS is only scored where it exists; report the overlap so a smaller
        # CAMS sample can't quietly flatter it against persistence.
        has_cams = pairs.cams_th.notna().to_numpy()
        r = {
            "horizon_h": h,
            "n_pairs": int(len(pairs)),
            "n_stations": int(pairs.station_id.nunique()),
            "persistence_rmse": rmse(y, p_pers),
            "persistence_mae": mae(y, p_pers),
            "n_pairs_cams": int(has_cams.sum()),
            "cams_rmse": rmse(y[has_cams], pairs.cams_th.to_numpy()[has_cams]) if has_cams.any() else None,
            "cams_mae": mae(y[has_cams], pairs.cams_th.to_numpy()[has_cams]) if has_cams.any() else None,
            "cams_bc_rmse": rmse(y[has_cams], pairs.cams_bc_th.to_numpy()[has_cams]) if has_cams.any() else None,
            "cams_bc_mae": mae(y[has_cams], pairs.cams_bc_th.to_numpy()[has_cams]) if has_cams.any() else None,
        }
        cands = {k: r[f"{k}_rmse"] for k in ("persistence", "cams", "cams_bc")
                 if r.get(f"{k}_rmse") is not None}
        r["winner"] = min(cands, key=cands.get)
        r["target_to_beat_rmse"] = min(cands.values())
        results.append(r)

    print()
    print("=" * 108)
    print("BASELINE COMPARISON  (test rows only, pooled across stations)")
    print("=" * 108)
    print(f"{'horizon':>8}{'n_pairs':>9}{'stns':>5}{'pers_RMSE':>11}{'pers_MAE':>10}"
          f"{'cams_RMSE':>11}{'cams_MAE':>10}{'camsBC_RMSE':>13}{'camsBC_MAE':>12}{'winner':>13}")
    print("-" * 108)
    for r in results:
        f2 = lambda k: f"{r[k]:.2f}" if r.get(k) is not None else "-"  # noqa: E731
        print(f"{r['horizon_h']:>7}h{r['n_pairs']:>9,}{r['n_stations']:>5}"
              f"{r['persistence_rmse']:>11.2f}{r['persistence_mae']:>10.2f}"
              f"{f2('cams_rmse'):>11}{f2('cams_mae'):>10}"
              f"{f2('cams_bc_rmse'):>13}{f2('cams_bc_mae'):>12}{r['winner']:>13}")

    if all_skipped:
        print()
        warn(f"{len(all_skipped)} station/horizon combo(s) below {MIN_PAIRS} pairs, skipped:")
        for s in all_skipped[:12]:
            print(f"      {s}")

    payload = {
        "generated_from": "data/processed/*_features.parquet",
        "test_fraction": TEST_FRAC,
        "split": "time-ordered per station, last 20% = test, no shuffling",
        "min_pairs_per_station": MIN_PAIRS,
        "window": [str(df.timestamp.min()), str(df.timestamp.max())],
        "n_stations": int(df.station_id.nunique()),
        "rows_train": n_tr,
        "rows_test": n_te,
        "rows_per_city": per_city,
        "skipped": all_skipped,
        "results": results,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print()
    ok(f"wrote {OUT_JSON.relative_to(ROOT)}")

    h24 = next((r for r in results if r["horizon_h"] == 24), None)
    if h24:
        print()
        print("*" * 96)
        print(f"  Target to beat at 24h: min(persistence, cams) RMSE = "
              f"{h24['target_to_beat_rmse']:.2f} ug/m3   "
              f"(winner: {h24['winner']})")
        print("*" * 96)


if __name__ == "__main__":
    main()
