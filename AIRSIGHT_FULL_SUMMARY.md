# AirSight — Full Project Summary

**Document purpose:** Single source of truth for the team, judges, and **demo video narration**.  
**Project:** AirSight — Multi-source air-quality intelligence for Chhattisgarh  
**Repo:** `airsight-data`  
**Status snapshot:** Backend proven on **Korba** (panel → baselines → model → static features → attribution → FastAPI). Frontend pending. Parallel data collection ongoing.

---

## Table of contents

1. [Elevator pitch](#1-elevator-pitch)
2. [What we are making](#2-what-we-are-making)
3. [Problem statement](#3-problem-statement)
4. [Why this matters (hackathon + real world)](#4-why-this-matters-hackathon--real-world)
5. [What we are doing end-to-end](#5-what-we-are-doing-end-to-end)
6. [Cities and roles](#6-cities-and-roles)
7. [Datasets — complete catalogue](#7-datasets--complete-catalogue)
8. [How every layer becomes intelligence](#8-how-every-layer-becomes-intelligence)
9. [Architecture](#9-architecture)
10. [Tech stack](#10-tech-stack)
11. [Pipeline stages & proven results](#11-pipeline-stages--proven-results)
12. [Backend API](#12-backend-api)
13. [What the website will show](#13-what-the-website-will-show)
14. [Honest limits & judge lines](#14-honest-limits--judge-lines)
15. [What is done vs not done](#15-what-is-done-vs-not-done)
16. [Video narration outline](#16-video-narration-outline)
17. [Key numbers cheat sheet](#17-key-numbers-cheat-sheet)
18. [Repo map](#18-repo-map)

---

## 1. Elevator pitch

> **AirSight** turns sparse ground sensors, free satellites, weather, emissions inventories, fire detections, and map layers into a **city-scale air-quality intelligence platform**.  
> It **forecasts PM2.5**, maps risk where stations are missing, **prioritises likely sources** against a global emission inventory, and shows **who is exposed** — starting with **Korba**, India’s power capital, and designed to scale to any city via config.

**One line for the video open:**

> *Few sensors. Whole city. Honest science. Actionable priorities.*

---

## 2. What we are making

### Product name

**AirSight** — an air-quality **monitoring + forecasting + attribution prioritisation** platform for industrial and data-scarce cities in Chhattisgarh (and beyond).

### Product type

| Component | Description |
|-----------|-------------|
| **Data kit** | Scripts + manuals to collect open data for multiple cities |
| **Intelligence backend** | Clean → fuse → model → score → attribute → serve via API |
| **API** | FastAPI endpoints for metrics, stations, cities, attribution |
| **Web product (planned)** | Board dashboard + citizen view + zero-station reveal |

### What it is *not*

- Not a replacement for official CPCB AQI portals alone  
- Not a legal “who is guilty” court system  
- Not a paid traffic analytics product  
- Not a fake historical-traffic generator  

We build **evidence-backed prioritisation** and **forecast skill with baselines**.

---

## 3. Problem statement

### The real-world problem

1. **Sparse monitoring**  
   Cities like Korba may have only **1–2 continuous ambient stations**. Most of the map is invisible. Industrial corridors, residential belts, and downwind villages get no station reading.

2. **Reactive, not anticipatory**  
   Boards and citizens often see a pollution **spike after it happens**. There is little operational **short-horizon forecast** fused with weather and activity signals.

3. **Spatial blindness**  
   A single station cannot answer: *Which neighbourhood is worse right now? Where will it be bad tomorrow?*

4. **Weak source narrative**  
   Saying “it’s industry” without an inventory is hand-waving. Open **consent-to-operate registers** are often not machine-readable. Attribution needs a **ground-truth sector mix** (EDGAR) plus free proxies (fires, plants, OSM).

5. **Impact is missing**  
   A red cell means more if **tens of thousands of people** (and schools/hospitals) sit under it. Population must enter the product.

6. **Zero-station places exist**  
   **Jagdalpur** has no CPCB station in our setup. The platform must still produce intelligence from **satellite + meteorology** — that is the innovation story.

### The product statement (problem → solution)

| Problem | AirSight response |
|---------|-------------------|
| Few sensors | Fuse satellite + met + model → **virtual sensor field** |
| No forecast stack | Temporal ML + weather (Open-Meteo) + baselines |
| “Why is it high?” | EDGAR sector mix + fire + industrial registry proxies |
| Who is hurt? | WorldPop (and later OSM schools/hospitals) |
| How do we scale? | `config/cities.yaml` — add a city without rewriting code |
| Closed commercial data | Free **proxies** + named official ingestion path |

---

## 4. Why this matters (hackathon + real world)

### Hackathon-shaped value

| Theme | How AirSight scores it |
|-------|-------------------------|
| **Innovation** | Zero-station city (Jagdalpur); multi-source fusion |
| **Technical depth** | Time-safe ML, baselines, RMSE, attribution metric |
| **Impact** | Population exposure + enforcement-style prioritisation |
| **Scalability** | City registry config; same pipeline per city |
| **Honesty** | Named limits (traffic, permits, EDGAR resolution) |

### Real-world value

- Pollution control boards: **where to look first**  
- Municipal officers: ward/city-level language (boundaries when available)  
- Citizens: simple air risk + advisory  
- Future: plug in municipal ANPR / official industrial registers when shared  

---

## 5. What we are doing end-to-end

### Phase overview

```text
[1] COLLECT (open data)
        ↓
[2] CLEAN & JOIN (stations, panel, quality report)
        ↓
[3] BASELINES (persistence 1h / 24h / climatology)
        ↓
[4] TEMPORAL MODEL (LightGBM PM2.5)
        ↓
[5] CONTEXT LAYERS (FIRMS fire, EDGAR, WorldPop)
        ↓
[6] ATTRIBUTION PROTOTYPE (sector mix vs EDGAR)
        ↓
[7] API (FastAPI serves artifacts)
        ↓
[8] FRONTEND (map, forecast, impact, enforcement)  ← next product surface
        ↓
[9] MULTI-CITY + JAGDALPUR REVEAL (satellite-dependent)
```

### Concrete workstreams

| Workstream | Owner pattern | Goal |
|------------|---------------|------|
| Manual downloads M1–M5 | Team | CPCB, EDGAR, FIRMS, WorldPop, boundaries |
| Free proxies for closed data | Persons 1–3 | Industry registry, traffic curve, construction, waste |
| Backend experiments | Coding track | Korba metrics green |
| API | Coding track | Localhost docs live |
| Frontend | Later | Video + demo UI |
| Satellite / OSM / met fill | Parallel | Unblock Jagdalpur + map |

---

## 6. Cities and roles

Defined in `config/cities.yaml` (the **scalability story**).

| City | Role | CPCB stations? | Why |
|------|------|----------------|-----|
| **Korba** | **Hero / full build** | Yes (2 in config) | Power capital, coal, hard sparse-sensor case |
| **Jagdalpur** | **Reveal** | **No** | Predict without ground station |
| **Raipur** | Validation | Yes (most stations) | Best-behaved check city |
| **Bhilai** | Optional | Yes | Steel plant signal |
| **Bilaspur** | Optional | Yes | Secondary validation |

**Why hero first:** Finish one city end-to-end for the demo. Multi-city is **architecture**, not day-one scope.

**Training window (defaults):** 2021-01-01 → 2024-12-31  
**Target grid story:** H3 (config `h3_resolution: 8` for product narrative; satellite sampling often res 7 for sensor physics).

---

## 7. Datasets — complete catalogue

### 7.1 Ground truth & stations

| Dataset | Source | Status | Why we need it | How it helps intelligence |
|---------|--------|--------|----------------|---------------------------|
| **CPCB CAAQMS hourly CSVs** | CPCB portal | **In repo** (Korba, Raipur, Bhilai, Bilaspur) | Real PM2.5/PM10/gases + local met | Train/eval models; official-style monitoring backbone |
| **`config/stations.csv`** | Manual lat/lon | **Done** | Place stations on map/grid | Without coords, no H3 join, no spatial story |
| **OpenAQ (optional)** | OpenAQ API | Key optional | Live public readings | Demo-day live badge; **not required for training** |

### 7.2 Emission inventory (attribution ground truth)

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **EDGAR v8.1_AP** | EU JRC | **In repo** (~20 NetCDF sector files) | Global gridded emissions by sector | Sector mix at stations; **score attribution**; power vs industry vs transport story |

**Sectors we use:** Power, Industry, Transport, residential, agriculture (PM2.5; also NOx/SO2 files present for expansion).

**Honest limit:** EDGAR is **annual**, ~0.1° (~11 km). Validates **sector mix**, not hourly dynamics.

### 7.3 Fire & thermal activity

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **NASA FIRMS VIIRS** | NASA FIRMS archive | **In repo** (2021–mid-2024) | Crop burning + industrial heat | Spike explanation; feature `fire_frp_sum_25km` in model; waste-burning proxy later |

### 7.4 Population & impact

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **WorldPop India 100m** | WorldPop | **In repo** (~724 MB GeoTIFF) | Who lives under pollution | Business impact: exposure, prioritise human-dense cells |

### 7.5 Boundaries

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **Chhattisgarh divisions TopoJSON → GeoJSON** | Community / converted | **Done** | Admin context | Coarse division map; city→admin mapping |
| **City polygons (OSM)** | OSM via script | Pending pull | City frame | Map framing; fallback if wards missing |
| **Ward shapefiles** | datameet / data.gov | Optional timebox | Officer language | Ward aggregation when available |

### 7.6 Meteorology & forecast (scripted)

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **Open-Meteo archive** | open-meteo.com | **Folder empty — run script** | Historical wind, RH, BLH, etc. | Richer forecast features than CPCB met alone |
| **Open-Meteo forecast** | open-meteo.com | Pending | True **future** weather | 24–72h AQ forecast needs future met |
| **CAMS air quality** | via Open-Meteo | Pending | Strong operational baseline | “We beat CAMS” is a high bar |

### 7.7 Satellite virtual sensors (scripted GEE)

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **MODIS AOD** | GEE | Empty | Best free PM2.5 proxy wall-to-wall | Between stations + Jagdalpur |
| **Sentinel-5P NO₂** | GEE | Empty | Combustion / traffic column | Spatial patterns |
| **Sentinel-5P SO₂** | GEE | Empty | Coal / smelting | Korba industry signature |
| **Dynamic World land cover** | GEE | Empty | Built-up change | Construction proxy (permits closed) |

### 7.8 Map & sources (scripted)

| Dataset | Source | Status | Why | Intelligence use |
|---------|--------|--------|-----|------------------|
| **OSM roads** | Overpass/osmnx | Empty | Road density & class | Traffic proxy; freight weighting |
| **OSM POIs** | hospitals, schools, industrial, stacks, kilns | Empty | Vulnerability + industry | Impact + enforcement map |
| **GPPD power plants** | WRI Global Power Plant DB | Empty (script ready) | Geolocated plants | “Inspect this plant” points |
| **TomTom live flow** | TomTom API | **Sampling started (Korba)** | Historical traffic is paid | Diurnal congestion curve |

### 7.9 Free proxies for data that is *not* open

| Wanted but closed | Free substitute we use | Product language |
|-------------------|------------------------|------------------|
| CECB industry consent register | GPPD + OSM industrial + FIRMS thermal + S5P SO₂ | Ingest official register when shared |
| Historical traffic | OSM road density × live TomTom diurnal curve | Ingest municipal ANPR/probe feeds when available |
| Construction permits | Dynamic World built-up / bare-soil change | Ingest permits when published |
| Waste burning feed | Low-FRP FIRMS near OSM landfills | Infer open burning clusters |
| Diesel / ANPR fleets | Freight road weights + industrial proximity | Designed as ingestion point |

---

## 8. How every layer becomes intelligence

```text
                    ┌─────────────────────────────┐
                    │     DECISION / UI LAYER     │
                    │  Map · Forecast · Alerts    │
                    │  Enforcement · Citizens     │
                    └─────────────▲───────────────┘
                                  │ FastAPI
                    ┌─────────────┴───────────────┐
                    │      INTELLIGENCE CORE      │
                    │  Baselines · LightGBM       │
                    │  Attribution · Exposure     │
                    └─────────────▲───────────────┘
                                  │ features
     ┌──────────────┬─────────────┼─────────────┬──────────────┐
     │              │             │             │              │
  GROUND         WEATHER      ACTIVITY      EMISSIONS      IMPACT
  CPCB           Open-Meteo   FIRMS fire    EDGAR          WorldPop
  stations       CAMS         TomTom×OSM    GPPD/OSM       Schools*
  (truth)        (forecast)   Satellite     (sectors)      Hospitals*
                                              (*OSM pending)
```

| Layer | Answers the question |
|-------|----------------------|
| CPCB | What did the air **actually** measure at this point? |
| Model + met | What will PM2.5 be **next hours**? |
| Satellite | What about **everywhere else** on the map? |
| FIRMS | Was there **fire / thermal** activity nearby? |
| EDGAR | What **sector mix** is expected here long-term? |
| GPPD/OSM | **Which facility** is on the map? |
| WorldPop | **How many people** are under this risk? |
| Traffic proxy | Is **mobility** a plausible driver at this hour? |

---

## 9. Architecture

### 9.1 Logical architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│   Demo video · Swagger UI · Future React/Next web app            │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS / localhost
┌────────────────────────────▼─────────────────────────────────────┐
│                    API LAYER (FastAPI)                           │
│  /health  /cities  /stations  /metrics/{city}                    │
│  /panel/{city}/summary  /attribution/{city}                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads
┌────────────────────────────▼─────────────────────────────────────┐
│                 ARTIFACTS (outputs/)                             │
│  metrics/*.json · models/* · reports/* · parquet panels          │
└────────────────────────────┬─────────────────────────────────────┘
                             │ produced by
┌────────────────────────────▼─────────────────────────────────────┐
│              AIRSIGHT LIBRARY (src/airsight/)                    │
│  io/  features/  models/  attribution/  grid/  impact/ pipeline/ │
└────────────────────────────┬─────────────────────────────────────┘
                             │ reads
┌────────────────────────────▼─────────────────────────────────────┐
│                    RAW DATA (data/) + CONFIG                     │
│  cpcb · fire · inventory/edgar · static/population · traffic     │
│  met · osm · satellite · sources · landuse · boundaries          │
│  config/cities.yaml · config/stations.csv                        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ filled by
┌────────────────────────────▼─────────────────────────────────────┐
│              COLLECTION LAYER (scripts/)                         │
│  00_setup · 01_openmeteo · 02_osm · 03_sources                   │
│  04_gee · 05_tomtom · 14_boundaries · 99_verify                  │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Modelling architecture (Korba hero path)

```text
CPCB hourly CSVs + stations.csv
        │
        ▼
 station_panel_korba.parquet   (tidy, hourly, multi-station)
        │
        ├──► Baselines: y(t-1), y(t-24), hour climatology
        │
        ├──► Temporal features:
        │      lags 1/24/168h, roll24 mean/std,
        │      calendar (hour/dow/month + sin/cos),
        │      station met (T, RH, wind), station_id
        │
        ├──► LightGBM temporal model  ──► RMSE vs baselines
        │
        ├──► + FIRMS daily FRP near station
        │    + EDGAR sector PM2.5 at lat/lon
        │    + WorldPop density
        │         └──► LightGBM features_static
        │
        └──► Attribution: EDGAR sector fractions
             vs proxy fractions ──► prioritisation metric
```

### 9.3 Target spatial architecture (next build)

```text
City bbox → H3 cells (res 7 sample / res 8 product story)
        │
        ├── Station cells: supervised labels from CPCB
        ├── All cells: satellite AOD/NO2/SO2 + met + fire + roads
        └── Transfer / sat-only path → Jagdalpur reveal
```

### 9.4 Design principles

1. **Config-driven cities** — no hard-coded single-city product  
2. **Time-safe ML** — chronological split; no shuffle of time series  
3. **Baselines first** — never claim skill without persistence (and later CAMS)  
4. **Graceful missing data** — empty folders should not crash loaders  
5. **Honest proxies** — name commercial gaps; show free substitutes  
6. **Artifacts over notebooks** — JSON metrics the API and deck can cite  

---

## 10. Tech stack

### 10.1 Data & backend (current)

| Layer | Technology | Role |
|-------|------------|------|
| Language | **Python 3.11+** | All pipeline + API |
| Config | **YAML** (`cities.yaml`), **CSV** (`stations.csv`) | Cities & stations |
| Tabular | **pandas**, **pyarrow** (parquet) | Panels & features |
| ML | **LightGBM** (+ sklearn metrics / fallback HGBR) | PM2.5 regression |
| Geo / raster | **rasterio**, **xarray**, **netCDF4**, **geopandas** | WorldPop, EDGAR, OSM |
| Spatial index (planned) | **h3** | Grid cells |
| API | **FastAPI**, **uvicorn** | Serve metrics & config |
| HTTP fetch | **requests** | Open-Meteo, GPPD, TomTom |
| OSM | **osmnx** | Roads & POIs |
| Satellite | **earthengine-api** (GEE) | AOD, NO₂, SO₂, Dynamic World |
| Validation script | `scripts/99_verify.py` | Collection stop rule |

### 10.2 Frontend (planned — not built yet)

| Option | Notes |
|--------|--------|
| **Next.js / React** + map (MapLibre / Leaflet / deck.gl) | Common hackathon choice |
| Charts | Recharts / ECharts for RMSE & time series |
| Deploy | Vercel (note free-tier non-commercial caveats for GEE/etc.) |

API already has **CORS open** for local frontend.

### 10.3 Tooling / process

| Tool | Use |
|------|-----|
| Anti-Gravity / IDE agents | Implement stages via prompts |
| TomTom developer key | Live traffic sampling |
| GEE + GCP project | Satellite exports |
| Git repo structure | `data/`, `src/airsight/`, `api/`, `outputs/`, `scripts/` |

### 10.4 Package layout

```text
airsight-data/
├── api/main.py                 # FastAPI
├── config/
│   ├── cities.yaml
│   └── stations.csv
├── data/                       # raw inputs
├── scripts/                    # collection (00–05, 14, 99)
├── src/airsight/
│   ├── io/                     # cpcb, stations, fire, edgar, population
│   ├── features/               # temporal, spatial
│   ├── models/                 # baselines, temporal, evaluate
│   ├── attribution/            # edgar_compare
│   ├── pipeline/               # build_station_panel, run_korba_experiment
│   ├── grid/ impact/           # expanding
│   └── config.py
├── outputs/
│   ├── metrics/                # JSON scorecards
│   ├── models/                 # LightGBM artifacts
│   └── reports/                # parquet, md, importance
├── tests/
├── PERSON_*_TASKS.md
├── BACKEND_BUILD_PLAN.md
└── AIRSIGHT_FULL_SUMMARY.md    # this document
```

---

## 11. Pipeline stages & proven results

### Stage map

| Stage | Command / artifact | Result |
|-------|-------------------|--------|
| **A — Panel** | `build_station_panel --city korba` | 70,128 rows; 2 stations; 2021–2024; ~58% PM2.5 missing (reported) |
| **B — Baselines** | `--stage baselines` | Persistence floors established |
| **C1 — Temporal** | `--stage temporal` | Beats 1h and 24h persistence |
| **D1 — Static+fire** | `--stage features_static` | Fire/EDGAR/pop joined; fire in top features |
| **G1 — Attribution** | `--stage attribution` | Sector fractions vs EDGAR JSON + MD table |
| **H1 — API** | `uvicorn api.main:app --reload` | Swagger at `/docs` |

### Korba scorecard (for video & judges)

| Model | Test RMSE | Test MAE | Notes |
|-------|-----------|----------|--------|
| Persistence 1h | **10.85** | 3.05 | Strong short-term floor |
| Persistence 24h | **18.27** | 8.31 | Credibility bar |
| Hour climatology | 21.61 | 15.52 | Weak |
| **LightGBM temporal (C1)** | **9.45** | 3.56 | **Beats both persistence baselines** |
| LightGBM + fire/EDGAR/pop (D1) | 9.54 | 3.58 | Same skill class; fire ranks high |

**Split:** chronological ~70/30; split point **2023-10-20 16:00**.  
**Train rows (model):** 11,610 · **Test rows:** 16,965 (rows with valid target + lag1).

### Attribution prototype (Korba)

| Station | Top EDGAR sector | Share (Power) | Notes |
|---------|------------------|---------------|--------|
| korba_01 | **Power** | ~67% | Matches power-capital narrative |
| korba_02 | **Power** | ~59% | Industry also material (~31%) |

**Disclaimer (always say this):**  
*Evidence-backed prioritisation prototype — **not** court-ready liability assignment.*

> Implementation note for sophisticated judges: current proxy is closely aligned to EDGAR sector structure with a small fire adjustment to agriculture. The valuable demo claim is **transparent sector fractions from an open inventory at station locations**, plus model skill and fire dynamics — not magic inverse modelling.

### Feature importance story (C1/D1)

Dominant for forecast: **PM2.5 lag1, lag24, rolling mean/std, lag168**.  
Meteorology: RH, temperature, wind.  
D1 adds **fire FRP within 25 km** as a meaningful dynamic feature.  
Static EDGAR/population barely move RMSE with only **two** stations (near-constant per station) — they power **attribution & impact**, not lag-based forecast.

---

## 12. Backend API

**Run:**

```bash
uvicorn api.main:app --reload
```

**Docs:** `http://127.0.0.1:8000/docs`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| GET | `/cities` | City registry from YAML |
| GET | `/stations?city_id=korba` | Station metadata + coords |
| GET | `/metrics/korba` | Merged baselines + temporal + features_static |
| GET | `/panel/korba/summary` | Panel quality JSON |
| GET | `/attribution/korba` | EDGAR comparison prototype |

This is what the **website** will call. Video can screen-record Swagger + JSON responses.

---

## 13. What the website will show

### 13.1 Board / operations dashboard

1. **City selector** (Korba live first; others as data lands)  
2. **Map** — stations, optional H3 hex grid, AQI/PM colours  
3. **Time series** — observed vs predicted PM2.5 at stations  
4. **Forecast strip** — next 24–72h when Open-Meteo is wired  
5. **Hotspot list** — worst cells / stations  
6. **Source panel** — EDGAR sector bars; fire markers; plant points (GPPD)  
7. **Model card** — RMSE vs persistence (credibility)  
8. **Enforcement candidates** — ranked points (not guilt labels)

### 13.2 Citizen view

- Simple status: Good / Moderate / Poor / Severe  
- Short advisory text  
- Optional: “nearest station” vs “model estimate for your area”

### 13.3 Innovation reveal (Jagdalpur)

- Banner: **No ground monitoring station**  
- Map still populated from **satellite + weather + model**  
- Message: *AirSight is designed for places sensors never reached*

### 13.4 Scalability proof

- Show `cities.yaml` in the video  
- Same API routes with different `city_id`  
- Adding a city = config + data, not a rewrite  

---

## 14. Honest limits & judge lines

| Limit | What we say |
|-------|-------------|
| Historical traffic not free | Calibrate diurnal model from **live** TomTom + OSM roads; ingest municipal feeds when available |
| Construction permits closed | Dynamic World land-cover change detection |
| CECB register not clean/open | GPPD + OSM industrial + thermal/SO₂ signatures |
| EDGAR annual ~11 km | Validates **sector mix**, not hourly guilt |
| PM2.5 missing ~58% in raw panel | Report missingness; train/score on valid hours only |
| Attribution not legal | *Prioritisation and evidence*, not court-ready liability |
| GEE / some free tiers | Non-commercial; production would license |

**Never do:** invent historical traffic speeds or fake industrial coordinates.

---

## 15. What is done vs not done

### Done (as of this document)

| Item | Evidence |
|------|----------|
| CPCB + stations for Korba | Panel parquet + quality JSON |
| EDGAR, FIRMS, WorldPop on disk | `data/inventory`, `data/fire`, `data/static` |
| Division boundaries | `cg_divisions.geojson` |
| Baselines + C1 model + D1 static | metrics + model files |
| Attribution JSON + table | `korba_attribution_*` |
| FastAPI serving metrics | `api/main.py`, `/docs` live |
| TomTom sampling started | `data/traffic/korba_flow_samples.csv` |
| Team collection task packs | PERSON_1/2/3, manuals |

### In progress / pending

| Item | Blocker / action |
|------|------------------|
| Open-Meteo / CAMS in `data/met` | Run `01_fetch_openmeteo.py` |
| OSM roads/POIs | Run `02_fetch_osm.py` |
| GPPD sources | Run `03_fetch_sources.py` |
| Satellite AOD/NO2/SO2/landuse | GEE approval + `04_gee_export.py` |
| Multi-day TomTom curve | Keep `--loop 30` running |
| H3 spatial model | After satellite |
| Jagdalpur reveal | After satellite grid |
| Frontend website | After API stable (now) |
| Raipur full metrics | Reuse pipeline when ready |

---

## 16. Video narration outline

Use this as a **voice-over script structure** (~3–5 minutes).

### Scene 1 — Hook (15–20s)

> “In industrial Chhattisgarh cities like Korba, a handful of air stations cannot watch every neighbourhood. AirSight turns open data into city-scale air intelligence.”

**Visual:** map of Korba / power plants silhouette / few station pins.

### Scene 2 — Problem (20–30s)

> “Sparse sensors. Late reaction. No clear story of sources. No view where stations don’t exist.”

**Visual:** empty map vs one station; Jagdalpur labelled “no CPCB”.

### Scene 3 — Solution architecture (30–40s)

> “We fuse ground truth, weather, satellite, fire detections, emission inventories, and population — served through a modern API to a decision dashboard.”

**Visual:** architecture diagram from §9.

### Scene 4 — Data (30–40s)

> “CPCB teaches the model the truth. EDGAR scores sector mix. FIRMS catches fires. WorldPop shows who is exposed. Free proxies replace closed traffic and permit feeds.”

**Visual:** dataset icons / folder tree.

### Scene 5 — Proof (40–50s)

> “On Korba, our LightGBM model beats hour and day persistence baselines — RMSE 9.45 versus 10.85 and 18.27. Fire enters the model. Power dominates the EDGAR sector mix — consistent with a power-capital city.”

**Visual:** scorecard table; Swagger `/metrics/korba`; attribution table.

### Scene 6 — Product (30s)

> “The API is live. The website will show forecasts, maps, exposure, and inspection priorities for officers — and simple advisories for citizens. Jagdalpur will demonstrate prediction without any ground station.”

**Visual:** mock UI frames + `/docs`.

### Scene 7 — Close (15s)

> “Config-scalable. Baseline-honest. Built for places sensors never reached. This is AirSight.”

---

## 17. Key numbers cheat sheet

| Metric | Value |
|--------|--------|
| Korba panel rows | 70,128 |
| Stations | 2 (`korba_01`, `korba_02`) |
| Date range | 2021-01-01 → 2024-12-31 |
| PM2.5 missing (raw) | ~58% |
| Persistence 1h RMSE | 10.85 |
| Persistence 24h RMSE | 18.27 |
| LightGBM C1 test RMSE | **9.45** (beats both) |
| D1 test RMSE | 9.54 |
| Dominant EDGAR sector | **Power** |
| API | `http://127.0.0.1:8000/docs` |
| Hero city | Korba |
| Reveal city | Jagdalpur |

---

## 18. Repo map

| Path | Role |
|------|------|
| `README.md` | Collection kit entry |
| `MANUAL_DOWNLOADS.md` | M1–M5 click path |
| `M5_fix_and_free_alternatives.md` | Proxies for closed data |
| `BACKEND_BUILD_PLAN.md` | Prompted backend phases |
| `PERSON_1_TASKS.md` | Met + industry registry + waste |
| `PERSON_2_TASKS.md` | GEE satellite + construction |
| `PERSON_3_TASKS.md` | OSM + TomTom + boundaries |
| `TEAM_COLLECTION_OVERVIEW.md` | Who owns what |
| `AIRSIGHT_FULL_SUMMARY.md` | **This document** |
| `api/main.py` | Live backend API |
| `src/airsight/` | Core library |
| `outputs/` | Proof artifacts for deck & API |
| `data/` | Raw datasets |
| `scripts/` | Fetch & verify |

---

## Closing statement (for decks / video end card)

**AirSight** is a **config-scalable air-quality intelligence platform** that:

1. **Measures** with CPCB where sensors exist  
2. **Forecasts** with time-safe ML that **beats honest baselines**  
3. **Contextualises** with fire, emissions, and population  
4. **Prioritises** sources transparently against EDGAR  
5. **Serves** results via API for a board + citizen product  
6. **Aims** to see **entire cities** — including places **with no station at all**

---

*Generated for the AirSight hackathon team. Update the “done vs pending” section as Person 1–3 fill `data/met`, `data/osm`, `data/satellite`, and as the frontend ships.*
