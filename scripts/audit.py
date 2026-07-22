"""AirSight pre-build repo audit. Read-only: inspects, verifies, reports.

Run:  python scripts/audit.py
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = []


def say(line: str = "") -> None:
    OUT.append(line)


def rule(title: str) -> None:
    say()
    say("=" * 78)
    say(title)
    say("=" * 78)


def human(nbytes: int) -> str:
    val = float(nbytes)
    for unit in ("B", "KB", "MB", "GB"):
        if val < 1024 or unit == "GB":
            return f"{val:.1f}{unit}"
        val /= 1024
    return f"{val:.1f}GB"


def scan(path: Path) -> dict:
    """File count + total size for a directory (recursive) or single file."""
    if not path.exists():
        return {"exists": False, "n": 0, "bytes": 0, "files": []}
    if path.is_file():
        return {"exists": True, "n": 1, "bytes": path.stat().st_size, "files": [path]}
    files = [p for p in path.rglob("*") if p.is_file()]
    return {
        "exists": True,
        "n": len(files),
        "bytes": sum(p.stat().st_size for p in files),
        "files": files,
    }


def date_range(files: list[Path]) -> str:
    """Best-effort min/max of the first date-ish column across CSVs."""
    lo = hi = None
    for f in files:
        if f.suffix.lower() != ".csv":
            continue
        # Read the header first, then re-read ONLY the date column over the FULL
        # file. Never row-cap here: a truncated read reports the cap's date as the
        # max and silently invents a data gap.
        try:
            head = pd.read_csv(f, nrows=0)
        except Exception:
            continue
        col = next(
            (c for c in head.columns
             if str(c).strip().lower() in
             ("timestamp", "date", "time", "acq_date", "datetime", "system:time_start")),
            None,
        )
        if col is None:
            continue
        try:
            s = pd.read_csv(f, usecols=[col], low_memory=False)[col]
        except Exception:
            continue
        s = pd.to_datetime(s, errors="coerce", format="mixed").dropna()
        if s.empty:
            continue
        lo = s.min() if lo is None else min(lo, s.min())
        hi = s.max() if hi is None else max(hi, s.max())
    if lo is None:
        return "-"
    return f"{lo:%Y-%m-%d} .. {hi:%Y-%m-%d}"


def verdict_word(info: dict) -> str:
    if not info["exists"]:
        return "missing"
    if info["n"] == 0 or info["bytes"] == 0:
        return "looks empty"
    return "looks OK"


# ---------------------------------------------------------------- 1. STRUCTURE
rule("1. REPO STRUCTURE")

cfg = yaml.safe_load((ROOT / "config" / "cities.yaml").read_text(encoding="utf-8"))
cities = cfg["cities"]
ids = [c["id"] for c in cities]

say(f"config/cities.yaml -> {len(cities)} cities")
say(f"{'id':<12}{'role':<22}{'stations':<10}bbox [W,S,E,N]")
for c in cities:
    say(f"{c['id']:<12}{c['role']:<22}{str(c.get('has_stations')):<10}{c['bbox']}")
say(f"state bbox: {cfg['state']['bbox']}   window: "
    f"{cfg['defaults']['start_date']} .. {cfg['defaults']['end_date']}  h3={cfg['defaults']['h3_resolution']}")

say()
counts: dict[str, int] = {i: 0 for i in ids}
bad = 0
with open(ROOT / "config" / "stations.csv", newline="", encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        try:
            lat, lon = float(row["latitude"]), float(row["longitude"])
        except (TypeError, ValueError):
            bad += 1
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            bad += 1
            continue
        counts[row["city_id"]] = counts.get(row["city_id"], 0) + 1

say(f"config/stations.csv -> valid numeric lat/lon by city_id (invalid rows: {bad})")
for c in cities:
    n = counts.get(c["id"], 0)
    flag = ""
    if c.get("has_stations") and n == 0:
        flag = "  <<< FLAG: has_stations=true but ZERO valid stations"
    if not c.get("has_stations") and n == 0:
        flag = "  (expected: zero-station city)"
    say(f"  {c['id']:<12}{n:>3}{flag}")

# --------------------------------------------------------------- 2. INVENTORY
rule("2. DATASET INVENTORY")

say(f"{'path':<40}{'exist':<7}{'files':>6}{'size':>10}  {'date range':<26}status")
say("-" * 110)


def report(rel: str, want_dates: bool = False) -> dict:
    info = scan(DATA / rel)
    dr = date_range(info["files"]) if (want_dates and info["exists"]) else "-"
    say(f"{'data/' + rel:<40}{str(info['exists']):<7}{info['n']:>6}"
        f"{human(info['bytes']):>10}  {dr:<26}{verdict_word(info)}")
    return info


inv: dict[str, dict] = {}
for c in ids:
    inv[f"cpcb/{c}"] = report(f"cpcb/{c}", want_dates=True)
say("-" * 110)
for c in ids:
    inv[f"met/{c}"] = report(f"met/{c}", want_dates=True)
say("-" * 110)
# Open-Meteo air-quality / CAMS lives as cams_*.csv inside data/met/<city>/
for c in ids:
    aq = [p for p in (DATA / f"met/{c}").glob("cams_*.csv")] if (DATA / f"met/{c}").exists() else []
    info = {"exists": bool(aq), "n": len(aq),
            "bytes": sum(p.stat().st_size for p in aq), "files": aq}
    inv[f"airquality/{c}"] = info
    say(f"{'data/met/' + c + '/cams_* (airquality)':<40}{str(info['exists']):<7}{info['n']:>6}"
        f"{human(info['bytes']):>10}  {date_range(aq) if aq else '-':<26}{verdict_word(info)}")
say("-" * 110)
for kind in ("aod", "no2", "so2"):
    for c in ids:
        inv[f"satellite/{kind}/{c}"] = report(f"satellite/{kind}/{c}", want_dates=True)
    say("-" * 110)
for c in ids:
    inv[f"landuse/{c}"] = report(f"landuse/{c}")
say("-" * 110)
for c in ids:
    inv[f"osm/roads/{c}"] = report(f"osm/roads/{c}")
for c in ids:
    inv[f"osm/pois/{c}"] = report(f"osm/pois/{c}")
say("-" * 110)
for rel, dates in (("inventory/edgar", False), ("fire", True), ("sources", False),
                   ("static/population", False), ("boundaries", False),
                   ("processed", False), ("grid", False), ("traffic", False)):
    inv[rel] = report(rel, want_dates=dates)

bnd = DATA / "boundaries" / "cg_divisions.geojson"
say(f"  cg_divisions.geojson present: {bnd.exists()}")

# --------------------------------------------------------- 3. READINESS MATRIX
rule("3. PER-CITY READINESS MATRIX")


def cell(key: str, min_files: int = 1) -> str:
    i = inv.get(key, {"exists": False, "n": 0})
    if not i["exists"] or i["n"] == 0:
        return "MISSING"
    return "OK" if i["n"] >= min_files else "partial"


shared = {
    "Population": cell("static/population"),
    "Fire": cell("fire"),
    "EDGAR": cell("inventory/edgar"),
}
cols = ["CPCB", "Weather", "AQ/AOD", "Satellite", "LandUse", "Roads", "POIs",
        "Population", "Fire", "EDGAR", "Boundary"]
say(f"{'city':<12}" + "".join(f"{c:<17}" for c in cols))
say("-" * (12 + 17 * len(cols)))

matrix: dict[str, dict[str, str]] = {}
for c in cities:
    cid = c["id"]
    cpcb = cell(f"cpcb/{cid}")
    if not c.get("has_stations"):
        cpcb = "N/A (zero-station)"
    sat = [cell(f"satellite/{k}/{cid}") for k in ("aod", "no2", "so2")]
    sat_v = "OK" if all(s == "OK" for s in sat) else ("MISSING" if all(s == "MISSING" for s in sat) else "partial")
    row = {
        "CPCB": cpcb,
        "Weather": cell(f"met/{cid}"),
        "AQ/AOD": cell(f"airquality/{cid}"),
        "Satellite": sat_v,
        "LandUse": cell(f"landuse/{cid}"),
        "Roads": cell(f"osm/roads/{cid}"),
        "POIs": cell(f"osm/pois/{cid}"),
        **shared,
        "Boundary": "OK" if (DATA / "boundaries" / f"{cid}.geojson").exists() else "MISSING",
    }
    matrix[cid] = row
    say(f"{cid:<12}" + "".join(f"{row[c]:<17}" for c in cols))

# ------------------------------------------------------ 4. COLUMN-LEVEL SANITY
rule("4. COLUMN-LEVEL SANITY")

kor_cpcb = sorted((DATA / "cpcb" / "korba").glob("*.csv")) if (DATA / "cpcb" / "korba").exists() else []
if kor_cpcb:
    f = kor_cpcb[0]
    df = pd.read_csv(f, low_memory=False)
    say(f"[CPCB sample] {f.relative_to(ROOT)}  rows={len(df):,}  cols={len(df.columns)}")
    say("columns: " + ", ".join(map(str, df.columns)))
    say("first 2 rows:")
    say(df.head(2).to_string())
    nn = df.notna().sum()
    say("non-null counts (top 12): " +
        ", ".join(f"{k}={v}" for k, v in nn.sort_values(ascending=False).head(12).items()))
else:
    say("[CPCB sample] no CSVs in data/cpcb/korba")

say()
arch = DATA / "met" / "korba" / "archive.csv"
if arch.exists():
    df = pd.read_csv(arch)
    ts = pd.to_datetime(df["timestamp"], errors="coerce")
    say(f"[Open-Meteo archive] {arch.relative_to(ROOT)}  rows={len(df):,}")
    say("columns: " + ", ".join(df.columns))
    say(f"date range: {ts.min()} .. {ts.max()}")
else:
    say("[Open-Meteo archive] MISSING data/met/korba/archive.csv")

say()
ed = DATA / "inventory" / "edgar"
say(f"[EDGAR] files under {ed.relative_to(ROOT)}:")
if ed.exists():
    for p in sorted(ed.rglob("*")):
        if p.is_file():
            say(f"  {p.relative_to(ed).as_posix():<60}{human(p.stat().st_size)}")
else:
    say("  MISSING")

say()
gppd = DATA / "sources" / "gppd_india.csv"
kor = next(c for c in cities if c["id"] == "korba")
w, s, e, n = kor["bbox"]
if gppd.exists():
    g = pd.read_csv(gppd, low_memory=False)
    m = g[(g.longitude.between(w, e)) & (g.latitude.between(s, n))]
    say(f"[GPPD] {len(g):,} plants in India; {len(m)} inside Korba bbox {kor['bbox']}")
    if len(m):
        say(f"  total capacity: {m.capacity_mw.sum():,.0f} MW  |  fuels: "
            f"{dict(m.primary_fuel.value_counts())}")
        for _, r in m.sort_values("capacity_mw", ascending=False).head(10).iterrows():
            say(f"  {r['name'][:44]:<46}{r['capacity_mw']:>8.0f} MW  {r['primary_fuel']}")
else:
    say("[GPPD] MISSING data/sources/gppd_india.csv")

# ------------------------------------------------------------------ 5. VERDICT
rule("5. VERDICT")

req = {
    "CPCB": inv["cpcb/korba"]["n"] > 0,
    "Weather": inv["met/korba"]["n"] > 0,
    "AOD or Satellite": inv["airquality/korba"]["n"] > 0 or inv["satellite/aod/korba"]["n"] > 0,
    "Roads": inv["osm/roads/korba"]["n"] > 0,
    "Population": inv["static/population"]["n"] > 0,
    "EDGAR": inv["inventory/edgar"]["n"] > 0,
}
missing = [k for k, ok in req.items() if not ok]
if missing:
    say("NOT READY. Korba is missing:")
    for k in missing:
        say(f"  - {k}")
else:
    say("READY TO BUILD  (Korba: CPCB + Weather + AOD/Satellite + Roads + Population + EDGAR all present)")

say()
jag = matrix["jagdalpur"]
jag_missing = [k for k, v in jag.items() if v == "MISSING"]
if not jag_missing:
    say("Jagdalpur: has everything EXCEPT CPCB (zero-station by design). REVEAL IS VIABLE.")
else:
    say("Jagdalpur: reveal blocked. Missing (beyond the expected CPCB gap): " + ", ".join(jag_missing))

print("\n".join(OUT))
