"""TASK A: register the 4 cluster cities in cities.yaml.
TASK B: verify the Bhilai pair by content and set use_in_training accordingly.

Run:  python scripts/fix_cities_and_bhilai.py
      python scripts/fix_cities_and_bhilai.py --apply
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA, ROOT, ok, say, warn  # noqa: E402

CITIES_YAML = ROOT / "config" / "cities.yaml"
STATIONS = ROOT / "config" / "stations.csv"
BBOX_HALF = 0.2  # -> ~0.4 degree box

# id must match the on-disk folder so the harmonizer join works; name is the
# real-world spelling. kunjemara/Kunjemura is the known mismatch.
NEW_CITIES = [
    ("chhal", "Chhal"),
    ("kunjemara", "Kunjemura"),
    ("milupara", "Milupara"),
    ("tumidih", "Tumidih"),
]

DUP_ROW_PCT = 1.0   # <1% of rows differing => same feed
DIFF_TOL = 1.0      # ug/m3


def load_harmonizer():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "harm", ROOT / "scripts" / "build" / "10_harmonize.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


H = load_harmonizer()


def read_pm25(path: Path) -> pd.Series:
    """Timestamp-indexed pm25, using the mojibake-safe token regex."""
    raw = pd.read_csv(path, low_memory=False)
    dt = H.find_datetime_col(raw)
    pm_col = next((o for o, c in H.map_pollutants(list(raw.columns)).items() if c == "pm25"), None)
    ts = pd.to_datetime(raw[dt], errors="coerce", format="mixed")
    pm = H.clean_numeric(raw[pm_col])
    s = pd.Series(pm.values, index=ts).dropna()
    return s[~s.index.duplicated(keep="first")].sort_index()


def series_hash(s: pd.Series) -> str:
    """sha256 over the sorted (timestamp, pm25) pairs - identity of the DATA,
    independent of file encoding, column order or row order."""
    buf = "\n".join(f"{t:%Y-%m-%dT%H}:{v:.4f}" for t, v in s.items())
    return hashlib.sha256(buf.encode()).hexdigest()


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------- TASK A
def task_a(apply: bool) -> None:
    print("=" * 96)
    print("TASK A - ADD THE 4 CLUSTER CITIES TO config/cities.yaml")
    print("=" * 96)

    st = pd.read_csv(STATIONS)
    cfg = yaml.safe_load(CITIES_YAML.read_text(encoding="utf-8"))
    existing = {c["id"] for c in cfg["cities"]}

    raw = CITIES_YAML.read_text(encoding="utf-8")

    # --- integrity checks on the file as it stands -----------------------
    import re as _re
    from collections import Counter
    top = Counter(_re.findall(r"^([a-zA-Z_]+):", raw, _re.M))
    dupes = {k: v for k, v in top.items() if v > 1}
    n_comments = len([l for l in raw.splitlines() if l.strip().startswith("#")])
    problems = []
    if dupes:
        problems.append(f"duplicate top-level key(s) {dupes} - YAML keeps only the LAST, "
                        f"silently discarding the first")
    merged_defaults = dict(cfg.get("defaults") or {})
    for need in ("h3_resolution", "timezone"):
        if need not in merged_defaults:
            problems.append(f"defaults.{need} is MISSING - get_cities() merges defaults "
                            f"into every city, so city['{need}'] now raises KeyError")
    if n_comments < 5:
        problems.append(f"only {n_comments} comment line(s) left - the file was rewritten by a "
                        f"yaml.dump round-trip and the explanatory header was lost")

    if problems:
        print("  FILE INTEGRITY PROBLEMS DETECTED:")
        for p in problems:
            print(f"    !! {p}")
        print()

    # Recover anything the round-trip dropped from the committed version.
    import subprocess
    try:
        orig = subprocess.run(["git", "show", "HEAD:config/cities.yaml"],
                              cwd=ROOT, capture_output=True, text=True, timeout=30).stdout
        od = yaml.safe_load(orig) if orig.strip() else {}
    except Exception:
        od = {}
    for k, v in (od.get("defaults") or {}).items():
        if k not in merged_defaults:
            merged_defaults[k] = v
            say(f"recovered defaults.{k} = {v!r} from git HEAD")

    # --- corrections to the 4 cluster cities ------------------------------
    cities = [dict(c) for c in cfg["cities"]]
    fixes: list[str] = []
    for cid, name in NEW_CITIES:
        cur = next((c for c in cities if c["id"] == cid), None)
        rows = st[st.city_id == cid]
        if rows.empty:
            warn(f"{cid}: no station in stations.csv - skipped (no coords to invent)")
            continue
        lat, lon = float(rows.latitude.mean()), float(rows.longitude.mean())
        want_bbox = [round(lon - BBOX_HALF, 4), round(lat - BBOX_HALF, 4),
                     round(lon + BBOX_HALF, 4), round(lat + BBOX_HALF, 4)]
        if cur is None:
            cities.append({"id": cid, "name": name, "role": "validation",
                           "lat": lat, "lon": lon, "bbox": want_bbox,
                           "has_stations": True,
                           "notes": "Discovered via OpenAQ (scripts/discover)."})
            fixes.append(f"{cid}: ADDED")
            continue
        for k, v in (("name", name), ("role", "validation"), ("bbox", want_bbox)):
            old = cur.get(k)
            same = ([round(x, 4) for x in old] == v) if k == "bbox" else (old == v)
            if not same:
                fixes.append(f"{cid}.{k}: {old!r} -> {v!r}")
                cur[k] = v

    if fixes:
        print("  CORRECTIONS:")
        for f in fixes:
            print(f"    {f}")
    else:
        ok("all 4 cluster cities already correct")

    # --- render as text, with the comments restored -----------------------
    L = []
    L.append("# AirSight — city registry")
    L.append("# THIS FILE IS THE SCALABILITY STORY.")
    L.append("# Adding a city = adding ~8 lines here. No code changes anywhere.")
    L.append("# Show this file to the judges when they ask \"does it scale to other cities?\"")
    L.append("")
    L.append("defaults:")
    L.append("  # Training window: CPCB pm25 is empty before Oct 2022 regardless of what")
    L.append("  # the filenames claim, and now runs through 2025.")
    L.append(f"  start_date: \"{merged_defaults.get('start_date', '2022-10-01')}\"")
    L.append(f"  end_date: \"{merged_defaults.get('end_date', '2025-12-31')}\"")
    L.append(f"  h3_resolution: {merged_defaults.get('h3_resolution', 8)}"
             "      # ~0.74 km2 per cell ≈ the PS's \"1km grid\"")
    L.append(f"  timezone: \"{merged_defaults.get('timezone', 'Asia/Kolkata')}\"")
    L.append("")
    L.append("cities:")
    for c in cities:
        bb = ", ".join(str(x) for x in c["bbox"])
        L.append(f"  - id: {c['id']}")
        L.append(f"    name: \"{c['name']}\"")
        L.append(f"    role: {c['role']}")
        L.append(f"    lat: {c['lat']}")
        L.append(f"    lon: {c['lon']}")
        L.append(f"    bbox: [{bb}]      # [W, S, E, N]")
        L.append(f"    has_stations: {str(bool(c.get('has_stations'))).lower()}")
        if c.get("notes"):
            L.append(f"    notes: \"{str(c['notes']).strip()}\"")
        L.append("")
    L.append("# State-wide bbox — used for FIRMS fire + EDGAR clipping (one download covers all)")
    L.append("state:")
    L.append(f"  name: \"{cfg['state']['name']}\"")
    L.append(f"  bbox: [{', '.join(str(x) for x in cfg['state']['bbox'])}]")
    text = "\n".join(L) + "\n"

    print()
    print("  --- the 4 cluster-city entries as they will be written ---")
    for cid, _ in NEW_CITIES:
        c = next((x for x in cities if x["id"] == cid), None)
        if not c:
            continue
        print(f"  - id: {c['id']}")
        print(f"    name: \"{c['name']}\"")
        print(f"    role: {c['role']}")
        print(f"    lat: {c['lat']}")
        print(f"    lon: {c['lon']}")
        print(f"    bbox: [{', '.join(str(x) for x in c['bbox'])}]")
        print(f"    has_stations: true")
        print()

    if not apply:
        say("DRY RUN - use --apply to write (backs up to cities.yaml.bak)")
        return

    shutil.copy2(CITIES_YAML, CITIES_YAML.with_suffix(".yaml.bak"))
    ok(f"backed up -> {CITIES_YAML.name}.bak")
    CITIES_YAML.write_text(text, encoding="utf-8")
    chk = yaml.safe_load(CITIES_YAML.read_text(encoding="utf-8"))
    kept = len([l for l in text.splitlines() if l.strip().startswith("#")])
    ok(f"wrote {CITIES_YAML.relative_to(ROOT)} - {len(chk['cities'])} cities, "
       f"{kept} comment lines, defaults={chk['defaults']}")
    dup2 = {k: v for k, v in Counter(
        _re.findall(r"^([a-zA-Z_]+):", text, _re.M)).items() if v > 1}
    ok(f"duplicate top-level keys after fix: {dup2 or 'none'}")


# --------------------------------------------------------------- TASK B
def task_b(apply: bool) -> None:
    print()
    print("=" * 96)
    print("TASK B - VERIFY THE BHILAI PAIR BY CONTENT")
    print("=" * 96)

    st = pd.read_csv(STATIONS)

    def path_for(sid: str) -> Path | None:
        r = st[st.station_id == sid]
        if r.empty or pd.isna(r.iloc[0].source_file):
            return None
        p = DATA / "cpcb" / r.iloc[0].city_id / str(r.iloc[0].source_file)
        return p if p.exists() else None

    a_id, b_id = "bhilai_01", "bhilai_03"      # hathkhoj, civic_center
    pa, pb = path_for(a_id), path_for(b_id)
    if pa is None or pb is None:
        warn(f"missing file(s): {a_id}={pa}, {b_id}={pb}")
        return

    sa, sb = read_pm25(pa), read_pm25(pb)
    ha, hb = series_hash(sa), series_hash(sb)

    print(f"  {a_id} (hathkhoj)     : {pa.name}")
    print(f"    file sha256   : {file_sha(pa)[:32]}")
    print(f"    pm25 series   : {ha[:32]}   n={len(sa):,}")
    print(f"  {b_id} (civic_center) : {pb.name}")
    print(f"    file sha256   : {file_sha(pb)[:32]}")
    print(f"    pm25 series   : {hb[:32]}   n={len(sb):,}")
    print()

    byte_identical = file_sha(pa) == file_sha(pb)
    series_identical = ha == hb

    common = sa.index.intersection(sb.index)
    va, vb = sa.loc[common], sb.loc[common]
    diff = (va - vb).abs()
    n_diff = int((diff > DIFF_TOL).sum())
    pct_diff = 100.0 * n_diff / max(1, len(common))
    corr = float(np.corrcoef(va, vb)[0, 1]) if len(common) > 1 and va.std() > 0 else float("nan")

    print(f"  byte-identical files       : {byte_identical}")
    print(f"  identical pm25 series hash : {series_identical}")
    print(f"  overlapping timestamps     : {len(common):,}")
    print(f"  correlation                : {corr:.6f}")
    print(f"  mean abs difference        : {diff.mean():.6f} ug/m3")
    print(f"  rows differing by >{DIFF_TOL} ug/m3: {n_diff:,}  ({pct_diff:.3f}% of overlap)")
    print()

    duplicate = series_identical or pct_diff < DUP_ROW_PCT
    if duplicate:
        print("  " + "!" * 88)
        print("  DUPLICATE CONFIRMED - one file is a copy. To train on both physical")
        print("  stations, re-download Hathkhoj fresh from the CPCB portal; current")
        print("  Hathkhoj file is not usable.")
        print("  " + "!" * 88)
        flags = {a_id: False, b_id: True}
    else:
        ok("DISTINCT STATIONS - both retained.")
        flags = {a_id: True, b_id: True}

    if "use_in_training" not in st.columns:
        st["use_in_training"] = True
    st["use_in_training"] = st["use_in_training"].fillna(True).astype(bool)
    for sid, val in flags.items():
        st.loc[st.station_id == sid, "use_in_training"] = val

    if apply:
        bak = STATIONS.with_suffix(".csv.bak")
        if not bak.exists():
            shutil.copy2(STATIONS, bak)
            ok(f"backed up -> {bak.name}")
        st.to_csv(STATIONS, index=False)
        ok("wrote use_in_training flags to stations.csv (no file deleted)")
    else:
        say("DRY RUN - would write use_in_training flags (use --apply)")

    print()
    print("=" * 96)
    print("FINAL TRAINING-STATION LIST")
    print("=" * 96)
    print(f"{'station_id':<16}{'city_id':<12}{'use_in_training':<18}station_name")
    print("-" * 96)
    for _, r in st.iterrows():
        mark = "TRUE" if r.use_in_training else "FALSE  <-- excluded"
        print(f"{r.station_id:<16}{r.city_id:<12}{mark:<18}{r.station_name}")
    n_on = int(st.use_in_training.sum())
    print()
    say(f"{n_on} of {len(st)} stations enabled for training")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    task_a(args.apply)
    task_b(args.apply)


if __name__ == "__main__":
    main()
