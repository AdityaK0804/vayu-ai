# AirSight — Team Dataset Collection Overview

**Deadline mindset:** Korba + Jagdalpur green in `python scripts/99_verify.py` → **stop collecting, start building.**  
**Hero city:** Korba first, completely. **Reveal city:** Jagdalpur (no CPCB — by design).

---

## What this project is

AirSight fuses **ground sensors + satellite + weather + emission inventory + source maps** on an H3 grid for Chhattisgarh cities. Judges score:

- Virtual sensors where stations are missing (Jagdalpur)
- Source attribution vs EDGAR inventory
- Enforcement dossiers (real map points, not vague “industry”)
- Honest free **proxies** where paid/closed data does not exist

---

## Already collected (DO NOT re-download)

| Item | Status | Location |
| --- | --- | --- |
| M1 CPCB hourly | ✅ Done | `data/cpcb/<city>/` |
| M1 stations lat/lon | ✅ Done | `config/stations.csv` |
| M2 EDGAR v8.1_AP | ✅ Done | `data/inventory/edgar/` |
| M3 FIRMS 2021–24 | ✅ Done | `data/fire/` |
| M4 WorldPop India | ✅ Done | `data/static/population/worldpop_india.tif` |
| M5 divisions GeoJSON | ✅ Done | `data/boundaries/cg_divisions.geojson` |

---

## Still empty (this is your work)

| Folder / need | Why the system needs it | Owner |
| --- | --- | --- |
| `data/met/*` | Weather archive + forecast + CAMS baseline | **Person 1** |
| `data/sources/*` | Power plants for enforcement map | **Person 1** |
| Industry registry + waste proxies | Free substitute for closed CECB register + waste burning | **Person 1** |
| `data/satellite/*` | AOD / NO2 / SO2 virtual sensors | **Person 2** |
| `data/landuse/*` | Dynamic World = construction proxy | **Person 2** |
| GEE signup | Gates all satellite + land-use | **Person 2** (do first hour) |
| `data/osm/*` | Roads, POIs, industrial polygons | **Person 3** |
| `data/traffic/*` | Live TomTom → diurnal curve (needs wall-clock days) | **Person 3** |
| City boundaries | `data/boundaries/<city>.geojson` | **Person 3** |

---

## Why M6+ has no “download the official dataset”

From `M5_fix_and_free_alternatives.md` — these are **not free / not machine-readable**. We **never leave them blank**; we collect free proxies and name the real ingestion path for judges:

| PS-named source | Free? | What we collect instead |
| --- | --- | --- |
| CECB industry register (M6) | No clean open file | GPPD + OSM industrial + FIRMS thermal + S5P SO2 |
| Historical traffic | Paid | OSM road density × live TomTom diurnal curve |
| Construction permits | Closed | Dynamic World built-up change 2021→2024 |
| Waste burning | No feed | FIRMS low-FRP near OSM landfills |
| Diesel / ANPR | Municipal-private | Freight road weights + industrial proximity |

---

## Who does what (one sentence each)

| Person | Theme | File |
| --- | --- | --- |
| **Person 1** | Weather + power plants + industrial registry + waste-burning proxy | `PERSON_1_TASKS.md` |
| **Person 2** | Google Earth Engine satellite + construction land-use | `PERSON_2_TASKS.md` |
| **Person 3** | OSM map layers + TomTom traffic sampling + city boundaries | `PERSON_3_TASKS.md` |

**Priority order for the whole team**

1. Person 2: **GEE signup** (approval can lag hours–days).
2. Person 3: **TomTom loop started today** (cannot backfill history later).
3. Person 1: Open-Meteo + GPPD (no keys, unblocks baselines).
4. Everyone: finish **Korba** completely before optional cities (Bhilai / Bilaspur).

---

## Shared setup (any person can do once)

```bash
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
pip install -r requirements.txt
python scripts/00_setup.py
```

**Stop rule (team lead runs):**

```bash
python scripts/99_verify.py
```

When Korba + Jagdalpur are green and `stations.csv` is clean → **STOP COLLECTING.**

---

## Cities (from `config/cities.yaml`)

| City | Role | CPCB? |
| --- | --- | --- |
| Korba | Hero / demo | Yes |
| Jagdalpur | Zero-station reveal | **No — skip CPCB** |
| Raipur | Validation | Yes |
| Bhilai / Bilaspur | Optional only if Day 5 green | Yes |

---

## Handoff

When your checklist is done, put files only in the folders listed in your task file and ping the team in chat:  
`Person X done — run 99_verify.py`.
