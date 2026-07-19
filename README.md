# AirSight — Data Collection Kit

**Everything you need to go from zero to "data complete" in 48 hours.**
Deadline: 22 Jul 2026. Stop collecting when `99_verify.py` goes green.

---

## Install (2 min)

```bash
pip install -r requirements.txt --break-system-packages
python scripts/00_setup.py
```

---

## DO THESE THREE THINGS IN THE FIRST 30 MINUTES

They're first because **each one has a delay you cannot compress later.**

| # | Action | Why it's first |
|---|---|---|
| 1 | **Sign up for Google Earth Engine** → https://earthengine.google.com/ | Approval can lag hours–days. It gates *every* satellite layer. Nothing else unblocks it. |
| 2 | **Fill `config/stations.csv`** (see MANUAL_DOWNLOADS.md §M1) | 🔴 **THE BLOCKER.** No lat/lon = no H3 join = no pipeline. Your CPCB CSVs are useless without it. |
| 3 | **Start TomTom sampling** → `05_tomtom_sample.py --loop 30` | Needs **wall-clock days** to build the diurnal curve. **You cannot backfill this on Day 6.** |

---

## Run order

```bash
# --- STEP 0: scaffold (creates /data tree + stations.csv template)
python scripts/00_setup.py

# --- STEP 1: Open-Meteo — NO SIGNUP. Start here while GEE approval processes.
#     Fixes the fatal gap: ERA5 is reanalysis, you CANNOT forecast with it.
#     Also grabs CAMS = your second, much stronger baseline to beat.
python scripts/01_fetch_openmeteo.py --cities korba
python scripts/01_fetch_openmeteo.py                    # all cities

# --- STEP 2: OpenStreetMap — roads, hospitals, schools, industrial land
python scripts/02_fetch_osm.py --cities korba
python scripts/02_fetch_osm.py

# --- STEP 3: Source registry — power plants (+ optional live fire)
python scripts/03_fetch_sources.py
python scripts/03_fetch_sources.py --firms-key YOUR_MAP_KEY   # optional live layer

# --- STEP 4: Earth Engine (needs approval + auth)
earthengine authenticate
export EE_PROJECT=your-project-id

python scripts/04_gee_export.py --mode stations --cities korba      # fast, do first
python scripts/04_gee_export.py --mode grid     --cities korba jagdalpur --h3-res 7
python scripts/04_gee_export.py --mode landuse  --cities korba
# -> exports land in Google Drive/AirSight_exports. Download into data/satellite/<ch>/<city>/

# --- STEP 5: TomTom live traffic — START TODAY, LEAVE RUNNING
export TOMTOM_KEY=your_key
python scripts/05_tomtom_sample.py --cities korba --once     # test
python scripts/05_tomtom_sample.py --cities korba --loop 30  # leave it running

# --- STEP 99: THE STOP RULE
python scripts/99_verify.py
```

**Plus the 5 manual downloads → see `MANUAL_DOWNLOADS.md`** (CPCB stations, EDGAR, FIRMS
archive, WorldPop, boundaries). ~2 hours total.

---

## Why `--h3-res 7` for satellite (measured, not guessed)

| H3 res | cells over Korba bbox | × 1,461 days | verdict |
|---|---|---|---|
| 6 | 175 | 256k rows | too coarse |
| **7** | **1,195** | **1.75M** (436k/yr) | ✅ **default — exportable** |
| 8 | 8,360 | **12.2M rows** | ❌ **GEE will time out** |

Satellite is coarse anyway (Sentinel-5P is ~3.5×5.5km native), so sampling at res 8 is
**false precision** — you'd be inventing detail the sensor never saw. Sample at res 7,
upsample in harmonisation, and *say that out loud* — it's a rigour point, not a shortcut.

The **`stations` mode** is separate and fast: it samples only at CPCB station points, which
is all the temporal model needs. Run it first to prove your auth works before queuing hours
of grid exports.

---

## The stop rule

```bash
python scripts/99_verify.py
```

**Korba + Jagdalpur green → STOP COLLECTING. START BUILDING.**

- **Korba** = hero city, full build, live demo
- **Jagdalpur** = zero-station reveal (everything **except** CPCB — that's the point)
- **Raipur** = if time
- **Bhilai / Bilaspur** = only if Day 5 is green

> Polish doesn't score if the demo isn't finished. With 7 days, subtraction is the skill.

---

## What's automated vs manual

| Scripted (a loop — never hand-download per city) | Manual (portal clicks, one-time) |
|---|---|
| Open-Meteo met + CAMS *(no key)* | CPCB hourly + **stations.csv** 🔴 |
| OSM roads / POIs / industrial *(no key)* | EDGAR sector gridmaps 🔴 |
| GPPD power plants *(no key)* | FIRMS 2021–24 archive |
| GEE: AOD, NO2, SO2, land cover | WorldPop raster |
| TomTom live traffic | Ward boundaries |

> If you catch yourself manually downloading something from the left column five times for
> five cities — **stop.** It's a `for` loop. **That loop is the scalability story you're
> being scored on (15%).**

---

## Known honest limits — put these in the deck, don't hide them

| Thing | Reality | Your line |
|---|---|---|
| Historical traffic | not free anywhere | calibrated diurnal curve from live sampling; ingestion-ready for municipal feeds |
| Construction permits | not open data | Dynamic World built-up change detection |
| EDGAR resolution | annual, ~11km | validates **sector mix**, not hourly dynamics |
| GPPD freshness | unmaintained since 2022 | fine as a static registry — plants don't move |
| GEE / Vercel free tier | **non-commercial** | production would license |
| TomTom free tier | **pricing revised Jul 2026** | verify before demo day |
| Attribution | SHAP + geometry | *"evidence-backed prioritisation"*, **not** *"court-ready guilt"* |

---

## Next: the build

Once verify is green:
1. `config/cities.yaml` is already your scalability proof — show the file to judges.
2. H3 harmonizer → one grid, one hourly axis.
3. Baselines **first**: persistence RMSE **and** CAMS RMSE, before your own model.
   *You cannot claim to beat a baseline you never computed.*
4. LightGBM temporal → beat both.
5. Spatial + leave-one-station-out → **bake Jagdalpur** → the reveal.
6. Attribution + EDGAR validation → Enforcement dossiers → Citizen advisories.
7. **Freeze Day 7. Record the demo video even if imperfect — an unsubmitted deliverable is a zero.**
