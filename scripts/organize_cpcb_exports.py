"""Register, unzip, identify-by-content, report, file, and verify CPCB exports.

Nothing here trusts a filename for data content: the date range in every report
comes from the timestamps where pm25 is actually non-null, which is routinely
years narrower than the range the filename claims.

Run:  python scripts/organize_cpcb_exports.py
      python scripts/organize_cpcb_exports.py --apply     # actually write
Default is a DRY RUN for steps 0 and 4 - it shows what it would change.
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

CPCB = DATA / "cpcb"
INCOMING = CPCB / "_incoming"
STATIONS = ROOT / "config" / "stations.csv"
OPENAQ = ROOT / "config" / "cg_openaq_stations.csv"
YEARS = [2021, 2022, 2023, 2024, 2025, 2026]
COORD_TOL = 0.001  # ~100 m - same station, slightly different rounding


def load_harmonizer():
    """Reuse the harmonizer's mojibake-safe token regex rather than restating it."""
    p = ROOT / "scripts" / "build" / "10_harmonize.py"
    spec = importlib.util.spec_from_file_location("harm", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = load_harmonizer()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")


def norm_name(s: str) -> str:
    """Normalize a station name for comparison: drop the agency suffix, punctuation."""
    n = re.sub(r"\s*-\s*[^-]+$", "", str(s))
    return re.sub(r"[^a-z0-9]", "", n.lower())


def parse_city_from_name(name: str) -> str:
    n = re.sub(r"\s*-\s*[^-]+$", "", str(name)).strip()
    return n.rsplit(",", 1)[-1].strip() if "," in n else n.strip()


# ------------------------------------------------------------------ STEP 0
def step0_register(apply: bool) -> pd.DataFrame:
    print("=" * 100)
    print("STEP 0 - REGISTER NEW STATIONS IN config/stations.csv")
    print("=" * 100)

    st = pd.read_csv(STATIONS)
    if not OPENAQ.exists():
        warn(f"{OPENAQ.relative_to(ROOT)} missing - skipping registration")
        return st
    aq = pd.read_csv(OPENAQ)
    say(f"stations.csv: {len(st)} rows | cg_openaq_stations.csv: {len(aq)} rows")

    added, present, flagged = [], [], []
    next_idx: dict[str, int] = {}
    for cid in st.city_id.unique():
        nums = [int(m.group(1)) for s in st[st.city_id == cid].station_id
                if (m := re.search(r"_(\d+)$", str(s)))]
        next_idx[cid] = max(nums, default=0)

    new_rows = []
    for _, r in aq.iterrows():
        if pd.isna(r.get("lat")) or pd.isna(r.get("lon")):
            flagged.append(r.get("station"))
            warn(f"NO COORDS, skipped (not invented): {r.get('station')}")
            continue

        by_name = st.station_name.map(norm_name) == norm_name(r["station"])
        by_coord = ((st.latitude - r["lat"]).abs() < COORD_TOL) & \
                   ((st.longitude - r["lon"]).abs() < COORD_TOL)
        hit = st[by_name | by_coord]
        if len(hit):
            present.append({
                "station_id": hit.iloc[0].station_id,
                "station_name": r["station"],
                "matched_by": "name" if by_name.any() else "coords",
            })
            continue

        cid = slug(r.get("city") or parse_city_from_name(r["station"]))
        next_idx[cid] = next_idx.get(cid, 0) + 1
        row = {
            "station_id": f"{cid}_{next_idx[cid]:02d}",
            "station_name": r["station"],
            "city_id": cid,
            "latitude": r["lat"],
            "longitude": r["lon"],
            "source_file": "",  # filled in step 4
        }
        new_rows.append(row)
        added.append(row)

    print()
    if added:
        print(f"{'station_id':<18}{'city_id':<14}{'lat':>12}{'lon':>12}  station_name")
        print("-" * 100)
        for a in added:
            print(f"{a['station_id']:<18}{a['city_id']:<14}{a['latitude']:>12.6f}"
                  f"{a['longitude']:>12.6f}  {a['station_name']}")
        if apply:
            shutil.copy2(STATIONS, STATIONS.with_suffix(".csv.bak"))
            ok(f"backed up -> {STATIONS.name}.bak")
            # Append only. Existing rows are never touched or reordered.
            st = pd.concat([st, pd.DataFrame(new_rows)], ignore_index=True)
            st.to_csv(STATIONS, index=False)
            ok(f"appended {len(added)} rows -> {STATIONS.relative_to(ROOT)}")
        else:
            say(f"DRY RUN - would append {len(added)} rows (use --apply)")
    else:
        ok("0 rows to add - every OpenAQ station is already registered.")

    print()
    print(f"ALREADY PRESENT ({len(present)}):")
    for p in present:
        print(f"  {p['station_id']:<18}matched by {p['matched_by']:<8}{p['station_name']}")
    if flagged:
        print()
        warn(f"{len(flagged)} station(s) skipped for missing coords: {flagged}")
    return st


# ------------------------------------------------------------------ STEP 1
def step1_unzip(apply: bool) -> list[Path]:
    print()
    print("=" * 100)
    print("STEP 1 - UNZIP + COLLECT LOOSE CSVs")
    print("=" * 100)

    zips = sorted(CPCB.rglob("*.zip"))
    if zips:
        say(f"found {len(zips)} zip(s):")
        for z in zips:
            print(f"  {z.relative_to(ROOT)}  ({z.stat().st_size / 1e6:.1f} MB)")
        if apply:
            ensure(INCOMING)
            for z in zips:
                with zipfile.ZipFile(z) as zf:
                    names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
                    zf.extractall(INCOMING)
                ok(f"extracted {len(names)} csv(s) from {z.name} -> _incoming/")
        else:
            say("DRY RUN - would extract into data/cpcb/_incoming/ (use --apply)")
    else:
        ok("no .zip found under data/cpcb/ - nothing to extract")

    cands: list[Path] = []
    if INCOMING.exists():
        cands += sorted(INCOMING.rglob("*.csv"))
    cands += sorted(CPCB.glob("*.csv"))  # loose at the cpcb root

    print()
    if cands:
        say(f"{len(cands)} unfiled csv(s):")
        for c in cands:
            print(f"  {c.relative_to(ROOT)}")
    else:
        ok("no unfiled csv - _incoming/ empty and no loose files at data/cpcb/")

    filed = sorted(p for p in CPCB.glob("*/*.csv") if p.parent.name != "_incoming")
    say(f"{len(filed)} csv(s) already filed in city folders (verified below)")
    return cands, filed


# ------------------------------------------------------------------ STEP 2
def identify(path: Path, st: pd.DataFrame) -> dict:
    """Identify one CSV purely from its contents + a filename->stations.csv lookup."""
    rec = {"file": path, "ok": False, "verdict": "NOT-CPCB", "city": "-",
           "station": "-", "note": ""}
    try:
        raw = pd.read_csv(path, low_memory=False)
    except Exception as e:
        rec["note"] = f"unreadable: {type(e).__name__}"
        return rec

    dt_col = H.find_datetime_col(raw)
    mapping = H.map_pollutants(list(raw.columns))
    pm_col = next((o for o, c in mapping.items() if c == "pm25"), None)
    if dt_col is None or not mapping:
        rec["note"] = f"no datetime ({dt_col}) or no pollutant cols"
        return rec
    rec["ok"] = True
    rec["dt_col"] = dt_col
    rec["pollutants"] = sorted(set(mapping.values()))

    ts = pd.to_datetime(raw[dt_col], errors="coerce", format="mixed")
    rec["total_rows"] = len(raw)
    rec["ts_range"] = (f"{ts.min():%Y-%m-%d}", f"{ts.max():%Y-%m-%d}") if ts.notna().any() else ("-", "-")

    # REAL range = where pm25 actually has a value.
    if pm_col is None:
        rec["note"] = "no pm25 column"
        rec["n_pm25"] = 0
        rec["real"] = ("-", "-")
        rec["per_year"] = {y: 0 for y in YEARS}
    else:
        pm = H.clean_numeric(raw[pm_col])
        good = ts.notna() & pm.notna()
        rec["n_pm25"] = int(good.sum())
        gts = ts[good]
        rec["real"] = (f"{gts.min():%Y-%m-%d}", f"{gts.max():%Y-%m-%d}") if len(gts) else ("-", "-")
        rec["per_year"] = {y: int((gts.dt.year == y).sum()) for y in YEARS}
        rec["months"] = int(gts.dt.to_period("M").nunique()) if len(gts) else 0
        if len(gts):
            span_h = max(1, (gts.max() - gts.min()).total_seconds() / 3600)
            rec["coverage"] = rec["n_pm25"] / span_h
        else:
            rec["coverage"] = 0.0

    # STATION: no station column exists in these files, so filename -> stations.csv.
    stem = re.sub(r"_\d{4}(_\d{4})?$", "", path.stem)
    hit = st[st.source_file.fillna("").str.lower() == path.name.lower()]
    if hit.empty:
        cand = st[st.source_file.fillna("").map(
            lambda s: bool(s) and re.sub(r"_\d{4}(_\d{4})?$", "", Path(s).stem).lower() == stem.lower())]
        hit = cand
    if hit.empty:
        toks = [t for t in slug(stem).split("_") if t not in ("cpcb",) and len(t) > 2]
        m = st[st.station_name.map(
            lambda n: sum(t in norm_name(n) for t in toks) >= max(1, len(toks) - 2))]
        hit = m
    if hit.empty:
        rec["verdict"] = "UNKNOWN-STATION"
        rec["note"] = "no stations.csv match"
        return rec

    rec["station"] = hit.iloc[0].station_id
    rec["city"] = hit.iloc[0].city_id
    rec["station_name"] = hit.iloc[0].station_name

    if rec.get("n_pm25", 0) == 0:
        rec["verdict"] = "HOLLOW"
    elif rec["coverage"] < 0.20:
        rec["verdict"] = "HOLLOW"
    elif rec["months"] < 6:
        rec["verdict"] = "THIN"
    else:
        rec["verdict"] = "KEEP"
    if rec["verdict"] == "KEEP" and rec["months"] < 6:
        rec["verdict"] = "THIN"
    return rec


# ------------------------------------------------------------------ STEP 3
def step3_report(recs: list[dict], title: str) -> None:
    print()
    print("=" * 170)
    print(f"STEP 3 - IDENTIFICATION REPORT ({title})")
    print("=" * 170)
    if not recs:
        say("nothing to report")
        return
    hdr = (f"{'file':<40}{'city':<11}{'station':<14}{'filename_range':<16}"
           f"{'REAL_pm25_range':<24}{'rows':>7}{'real':>7}  "
           + "".join(f"{y:>7}" for y in YEARS) + "  verdict")
    print(hdr)
    print("-" * 170)
    for r in recs:
        if not r["ok"]:
            print(f"{r['file'].name[:39]:<40}{'-':<11}{'-':<14}{'-':<16}{'-':<24}"
                  f"{'-':>7}{'-':>7}  " + "".join(f"{'-':>7}" for _ in YEARS)
                  + f"  {r['verdict']}  {r['note']}")
            continue
        fr = re.search(r"(\d{4})_(\d{4})", r["file"].stem)
        fr_s = f"{fr.group(1)}-{fr.group(2)}" if fr else "-"
        real = f"{r['real'][0]} .. {r['real'][1]}"
        py = "".join(f"{r['per_year'][y]:>7,}" for y in YEARS)
        print(f"{r['file'].name[:39]:<40}{r['city']:<11}{r['station']:<14}{fr_s:<16}"
              f"{real:<24}{r['total_rows']:>7,}{r['n_pm25']:>7,}  {py}  {r['verdict']}")

    c = pd.Series([r["verdict"] for r in recs]).value_counts().to_dict()
    print()
    say("SUMMARY: " + " | ".join(f"{k}={v}" for k, v in sorted(c.items())))


# ------------------------------------------------------------------ STEP 4
def step4_organize(recs: list[dict], st: pd.DataFrame, apply: bool) -> pd.DataFrame:
    print()
    print("=" * 100)
    print("STEP 4 - ORGANIZE INTO PER-CITY FOLDERS")
    print("=" * 100)
    unknown = [r for r in recs if r["verdict"] == "UNKNOWN-STATION"]
    filable = [r for r in recs if r["ok"] and r["verdict"] != "UNKNOWN-STATION"]

    if not filable:
        ok("no unfiled CSVs to organize")
    for r in filable:
        y0, y1 = r["real"][0][:4], r["real"][1][:4]
        stem = re.sub(r"_\d{4}(_\d{4})?$", "", r["file"].stem)
        dest_dir = CPCB / r["city"]
        dest = dest_dir / f"{stem}_{y0}_{y1}.csv"
        if dest.exists():
            dest = dest.with_name(f"{dest.stem}_v2.csv")
            warn(f"target existed - using {dest.name}")
        print(f"  {r['file'].name}  ->  {dest.relative_to(ROOT)}")
        if apply:
            ensure(dest_dir)
            shutil.copy2(r["file"], dest)  # copy, never move
            st.loc[st.station_id == r["station"], "source_file"] = dest.name
    if apply and filable:
        st.to_csv(STATIONS, index=False)
        ok("updated source_file in stations.csv")
    elif filable:
        say("DRY RUN - use --apply to copy and update source_file")

    if unknown:
        print()
        warn(f"{len(unknown)} UNKNOWN-STATION file(s) left in _incoming/ (add coords to stations.csv):")
        for r in unknown:
            print(f"  {r['file'].relative_to(ROOT)}")
    return st


# ------------------------------------------------------------------ STEP 5
def step5_verify(st: pd.DataFrame) -> None:
    print()
    print("=" * 100)
    print("STEP 5 - VERIFY FINAL TREE")
    print("=" * 100)
    total = 0
    for d in sorted(p for p in CPCB.iterdir() if p.is_dir() and p.name != "_incoming"):
        files = sorted(d.glob("*.csv"))
        stns = st[st.city_id == d.name]
        print(f"\n{d.name}/   ({len(files)} file(s), {len(stns)} station(s) registered)")
        if not files:
            print("    (empty)" + ("   <- zero-station city (expected)"
                                   if d.name == "jagdalpur" else "   <- NO DATA"))
        for f in files:
            try:
                n = sum(1 for _ in open(f, encoding="utf-8", errors="replace")) - 1
            except Exception:
                n = -1
            total += n
            print(f"    {f.name:<48}{n:>9,} rows")
    print()
    say(f"total rows across all filed CPCB csv: {total:,}")
    print()
    print("cities / stations now registered:")
    for cid, g in st.groupby("city_id"):
        have = (CPCB / cid).exists() and any((CPCB / cid).glob("*.csv"))
        print(f"  {cid:<12}{len(g):>2} station(s)   data={'YES' if have else 'no'}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="actually write (default is dry run for steps 0 and 4)")
    args = ap.parse_args()

    st = step0_register(args.apply)
    cands, filed = step1_unzip(args.apply)

    if cands:
        recs = [identify(p, st) for p in cands]
        step3_report(recs, "UNFILED / INCOMING")
        st = step4_organize(recs, st, args.apply)
    else:
        step4_organize([], st, args.apply)

    frecs = [identify(p, st) for p in filed]
    step3_report(frecs, "ALREADY FILED - content verification")

    step5_verify(st)
    print()
    say("_incoming/ and any zips are left untouched for your verification.")


if __name__ == "__main__":
    main()
