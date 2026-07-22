"""Stitch CPCB per-period exports into one clean hourly series per station.

The CPCB portal exports one file per station per period ("raw_data_hourly_<station>_1H (n).csv").
This walks those raw folders, groups files by STATION (matched against config/stations.csv
by normalized name, not by folder name), concatenates, de-duplicates overlapping
timestamps, and writes one canonical CSV per station into data/cpcb/<city_id>/.

Run:  python scripts/build/09_concat_cpcb.py
      python scripts/build/09_concat_cpcb.py --apply
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

CPCB = DATA / "cpcb"
STATIONS = ROOT / "config" / "stations.csv"
GAP_DAYS = 7

_spec = importlib.util.spec_from_file_location("harm", ROOT / "scripts" / "build" / "10_harmonize.py")
H = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(H)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def station_key_from_filename(p: Path) -> str:
    """'raw_data_hourly_hathkhoj,_bhilai_-_cecb_1H (3).csv' -> 'hathkhojbhilaicecb'."""
    s = p.stem
    s = re.sub(r"^raw_data_hourly_", "", s, flags=re.I)
    s = re.sub(r"_1H(\s*\(\d+\))?$", "", s, flags=re.I)
    return norm(s)


def match_station(key: str, st: pd.DataFrame) -> pd.Series | None:
    """Match a filename-derived key against stations.csv station_name."""
    for _, r in st.iterrows():
        if norm(r.station_name) == key:
            return r
    # fall back to token overlap (agency suffix may differ: CECB vs BSP)
    best, score = None, 0
    for _, r in st.iterrows():
        n = norm(r.station_name)
        common = sum(1 for t in re.findall(r"[a-z]+", str(r.station_name).lower())
                     if t in key)
        if common > score:
            best, score = r, common
    return best if score >= 2 else None


def read_one(p: Path) -> pd.DataFrame | None:
    raw = pd.read_csv(p, low_memory=False)
    dt = H.find_datetime_col(raw)
    mapping = H.map_pollutants(list(raw.columns))
    if dt is None or not mapping:
        warn(f"{p.name}: not CPCB format, skipped")
        return None
    raw = raw.rename(columns={dt: "Timestamp"})
    raw["Timestamp"] = pd.to_datetime(raw["Timestamp"], errors="coerce", format="mixed")
    return raw.dropna(subset=["Timestamp"])


def concat_station(files: list[Path]) -> tuple[pd.DataFrame, dict]:
    frames = [f for f in (read_one(p) for p in sorted(files)) if f is not None]
    if not frames:
        return pd.DataFrame(), {}
    df = pd.concat(frames, ignore_index=True)

    # Numeric coercion + drop negatives/sentinels on every pollutant column.
    mapping = H.map_pollutants(list(df.columns))
    for orig in mapping:
        df[orig] = H.clean_numeric(df[orig])

    # De-duplicate overlapping timestamps: portal re-downloads overlap, and the
    # better row is the one with more actual readings - not simply the first.
    before = len(df)
    df["_n"] = df.notna().sum(axis=1)
    df = (df.sort_values(["Timestamp", "_n"], ascending=[True, False])
            .drop_duplicates("Timestamp", keep="first")
            .drop(columns="_n")
            .sort_values("Timestamp")
            .reset_index(drop=True))
    dropped = before - len(df)

    pm_col = next((o for o, c in mapping.items() if c == "pm25"), None)
    pm = df[pm_col] if pm_col else pd.Series(dtype=float)
    good = df.loc[pm.notna(), "Timestamp"] if pm_col else pd.Series(dtype="datetime64[ns]")

    gaps = []
    if len(good) > 1:
        # Positional throughout: `good` carries the original row labels, so
        # label-based lookup on a positional offset raises KeyError.
        g = good.reset_index(drop=True)
        d = g.diff()
        for pos in d.index[d > pd.Timedelta(days=GAP_DAYS)]:
            gaps.append((g.iloc[pos - 1], g.iloc[pos], d.iloc[pos].days))

    stats = {
        "files": len(files),
        "rows": len(df),
        "dropped_dupes": dropped,
        "n_pm25": int(pm.notna().sum()) if pm_col else 0,
        "range": (df.Timestamp.min(), df.Timestamp.max()),
        "real": (good.min(), good.max()) if len(good) else (None, None),
        "pct_pm25": (100.0 * pm.notna().sum() / len(df)) if len(df) and pm_col else 0.0,
        "gaps": gaps,
        "per_year": (good.dt.year.value_counts().sort_index().to_dict() if len(good) else {}),
    }
    return df, stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    st = pd.read_csv(STATIONS)
    city_ids = set(st.city_id)
    # Raw folders = anything under data/cpcb that is not a known city folder.
    raw_dirs = [d for d in CPCB.iterdir()
                if d.is_dir() and d.name not in city_ids and d.name != "_incoming"]

    print("=" * 100)
    print("CONCAT CPCB PER-PERIOD EXPORTS")
    print("=" * 100)
    if not raw_dirs:
        ok("no raw export folders found under data/cpcb/")
        return
    for d in raw_dirs:
        say(f"raw folder: {d.name}/  ({len(list(d.glob('*.csv')))} csv)")

    results = []
    for d in sorted(raw_dirs):
        files = sorted(d.glob("*.csv"))
        if not files:
            continue
        keys = {station_key_from_filename(p) for p in files}
        if len(keys) > 1:
            warn(f"{d.name}/: files map to {len(keys)} different stations - grouping each")
        for key in sorted(keys):
            grp = [p for p in files if station_key_from_filename(p) == key]
            row = match_station(key, st)
            if row is None:
                warn(f"{d.name}/ key '{key}': NO stations.csv match - skipped")
                continue
            df, stats = concat_station(grp)
            if df.empty:
                warn(f"{row.station_id}: nothing readable")
                continue
            results.append((row, df, stats))

    print()
    print("=" * 118)
    print("PER-STATION MERGE REPORT")
    print("=" * 118)
    print(f"{'station':<14}{'city':<10}{'files':>6}{'rows':>8}{'dupes':>7}{'pm25':>8}"
          f"{'%pm25':>7}  {'REAL pm25 range':<26}gaps>7d")
    print("-" * 118)
    for row, df, s in results:
        rr = (f"{s['real'][0]:%Y-%m-%d} .. {s['real'][1]:%Y-%m-%d}"
              if s["real"][0] is not None else "-")
        print(f"{row.station_id:<14}{row.city_id:<10}{s['files']:>6}{s['rows']:>8,}"
              f"{s['dropped_dupes']:>7,}{s['n_pm25']:>8,}{s['pct_pm25']:>6.1f}%  {rr:<26}"
              f"{len(s['gaps'])}")
    print()
    for row, df, s in results:
        if s["gaps"]:
            warn(f"{row.station_id}: {len(s['gaps'])} gap(s) > {GAP_DAYS} days "
                 f"(missing period downloads):")
            for a, b, days in s["gaps"][:8]:
                print(f"      {a:%Y-%m-%d} -> {b:%Y-%m-%d}   ({days} days)")
        say(f"{row.station_id} per-year pm25: {s['per_year']}")

    # --- write ---------------------------------------------------------
    print()
    print("=" * 100)
    print("WRITE CANONICAL PER-STATION FILES")
    print("=" * 100)
    for row, df, s in results:
        y0, y1 = s["real"][0].year, s["real"][1].year
        slug = re.sub(r"[^a-z0-9]+", "_",
                      str(row.station_name).split(",")[0].lower()).strip("_")
        dest = CPCB / row.city_id / f"cpcb_{row.city_id}_{slug}_{y0}_{y1}.csv"
        print(f"  {row.station_id:<14} -> {dest.relative_to(ROOT)}  ({len(df):,} rows)")
        if args.apply:
            ensure(dest.parent)
            if dest.exists():
                bak = dest.with_suffix(".csv.superseded")
                shutil.copy2(dest, bak)
                warn(f"    existing file backed up -> {bak.name}")
            df.to_csv(dest, index=False)
            st.loc[st.station_id == row.station_id, "source_file"] = dest.name
            st.loc[st.station_id == row.station_id, "use_in_training"] = True

    if args.apply:
        st.to_csv(STATIONS, index=False)
        ok("updated stations.csv (source_file + use_in_training)")
    else:
        say("DRY RUN - use --apply to write")

    # --- re-verify the Bhilai pair --------------------------------------
    print()
    print("=" * 100)
    print("RE-VERIFY: are the two Bhilai stations now distinct?")
    print("=" * 100)
    pairs = {r.station_id: (df, s) for r, df, s in results}
    if "bhilai_01" in pairs and "bhilai_03" in pairs:
        import hashlib

        def h(df):
            m = H.map_pollutants(list(df.columns))
            pmc = next(o for o, c in m.items() if c == "pm25")
            ser = pd.Series(df[pmc].values, index=df.Timestamp).dropna().sort_index()
            buf = "\n".join(f"{t:%Y-%m-%dT%H}:{v:.4f}" for t, v in ser.items())
            return hashlib.sha256(buf.encode()).hexdigest(), ser

        ha, sa = h(pairs["bhilai_01"][0])
        hb, sb = h(pairs["bhilai_03"][0])
        common = sa.index.intersection(sb.index)
        print(f"  bhilai_01 (Hathkhoj)     pm25 sha256 {ha[:32]}  n={len(sa):,}")
        print(f"  bhilai_03 (Civic Center) pm25 sha256 {hb[:32]}  n={len(sb):,}")
        print(f"  identical series : {ha == hb}")
        print(f"  overlapping hours: {len(common):,}")
        if len(common) > 1:
            va, vb = sa.loc[common], sb.loc[common]
            d = (va - vb).abs()
            import numpy as np
            print(f"  correlation      : {np.corrcoef(va, vb)[0, 1]:.6f}")
            print(f"  mean abs diff    : {d.mean():.3f} ug/m3")
            print(f"  rows differing >1: {int((d > 1).sum()):,} ({100 * (d > 1).mean():.1f}%)")
        print()
        if ha == hb:
            warn("STILL DUPLICATE - do not enable both.")
        else:
            ok("DISTINCT STATIONS - both retained, use_in_training=TRUE for both.")

    print()
    print("final training-station list:")
    for _, r in st.iterrows():
        flag = "TRUE " if r.get("use_in_training", True) else "FALSE"
        print(f"  {r.station_id:<14}{r.city_id:<11}{flag}  {r.source_file}")


if __name__ == "__main__":
    main()
