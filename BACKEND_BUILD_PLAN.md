# AirSight — Backend Build Plan (Hackathon Mode)

**How we work:** You paste **one prompt at a time** into Anti-Gravity → run/test → paste the next.  
**Do not** implement the whole stack in one shot.  
**Frontend is later.** Backend must prove numbers on Korba first.

---

## 1. What we are building (shared mental model)

**AirSight** = multi-city air-quality intelligence for Chhattisgarh that:

1. **Fuses** ground CAAQMS (CPCB) + satellite + meteorology + emissions + map sources  
2. **Predicts** PM2.5 (and related pollutants) on an **H3 grid** (≈1 km story; train/sample carefully)  
3. **Works where stations are missing** (Jagdalpur = zero-station reveal)  
4. **Attributes** pollution to sectors using geometry + model evidence, validated against **EDGAR**  
5. **Outputs** enforcement-style priorities and citizen-facing risk language  
6. **Scales by config** — `config/cities.yaml` is the “add a city” story  

This repo today is the **data kit** (`scripts/00–05`, `99_verify`, manuals).  
**Backend code does not exist yet** — that is what we start now.

### Scoring-shaped product pieces (hackathon)

| Layer | Backend job | Demo punchline |
| --- | --- | --- |
| Ingest / clean | Load CPCB, join stations | “Real sensors, not CSV theater” |
| Harmonize | One time axis + H3 | “Common grid for all sources” |
| Baselines | Persistence + CAMS RMSE | “We beat something real” |
| Temporal model | LightGBM (or similar) at stations | Forecast skill |
| Spatial / transfer | Features that work without local CPCB | Jagdalpur reveal |
| Attribution | Sector shares vs EDGAR | “Scored, not asserted” |
| Impact | WorldPop × high cells | Business Impact |
| Sources | GPPD/OSM/FIRMS registry | Enforcement map points |
| API | FastAPI (or similar) | Frontend plugs in later |

### Honest limits (never fake these)

- Historical traffic → diurnal proxy (Person 3)  
- Construction permits → Dynamic World (Person 2)  
- CECB register → free registry merge (Person 1)  
- EDGAR → annual sector mix, not hourly dynamics  

---

## 2. Are we ready to code?

### Ready now (enough to start backend)

| Asset | Ready? | Use in first backend slices |
| --- | --- | --- |
| `config/cities.yaml` | ✅ | City registry, bboxes, dates, roles |
| `config/stations.csv` | ✅ | Lat/lon join — #1 blocker already solved |
| CPCB hourly CSVs (4 cities) | ✅ | Train/eval temporal model |
| EDGAR `.nc` (PM2.5/NOx/SO2 sectors) | ✅ | Attribution ground truth |
| FIRMS fire CSVs | ✅ | Fire / industrial thermal features |
| WorldPop `.tif` | ✅ | Population exposure layer |
| Division GeoJSON | ✅ | Admin context (coarse) |
| Fetch scripts 01–05 | ✅ | Teammates fill gaps in parallel |

### Not ready (do not block coding — design for plug-in)

| Gap | Who fills | Backend stance until present |
| --- | --- | --- |
| Open-Meteo / CAMS | Person 1 | Stub loader; temporal model can use CPCB met columns first |
| GPPD / industry registry | Person 1 | Stub path `data/sources/` |
| Satellite AOD/NO2/SO2 | Person 2 | Jagdalpur full story waits; Korba station model proceeds |
| Dynamic World landuse | Person 2 | Construction module optional |
| OSM roads/POIs | Person 3 | Spatial features partial |
| TomTom traffic | Person 3 | Traffic module optional; start sampling now |

### Verdict

| Question | Answer |
| --- | --- |
| Ready for full product (API + Jagdalpur + attribution + FE)? | **Not yet** — satellite/OSM/met still empty |
| Ready to **start backend coding**? | **YES** |
| First proof of efficiency? | **Korba station-level PM2.5 model + baselines + clean pipeline** on data you already have |
| Wait for all three people? | **No** — parallelize: you code pipeline; they fill folders |

**You do not need a Claude architecture doc to start.**  
Optional: paste the PS later to tighten scoring language — not required for Phase A–C.

---

## 3. Target backend layout (create as you go)

Suggested tree under repo root (Anti-Gravity should create incrementally):

```
airsight-data/
  config/
    cities.yaml          # exists
    stations.csv         # exists
  data/                  # exists (raw)
  scripts/               # exists (fetch only)
  src/airsight/          # NEW — library
    __init__.py
    config.py            # load cities.yaml + stations
    io/
      cpcb.py
      stations.py
      fire.py
      edgar.py
      population.py
      met.py             # graceful if missing
      satellite.py       # graceful if missing
      osm.py             # graceful if missing
    grid/
      h3_utils.py
    features/
      temporal.py
      spatial.py
    models/
      baselines.py
      train_temporal.py
      evaluate.py
    attribution/
      edgar_compare.py
    impact/
      population_exposure.py
    pipeline/
      build_station_panel.py
      run_korba_experiment.py
  api/                   # NEW — later phase
    main.py              # FastAPI
  tests/
  outputs/               # metrics, plots, model artifacts
    metrics/
    models/
    reports/
  requirements-backend.txt
```

**Principle:** every loader returns a clean DataFrame or empty + warning.  
Missing `data/met/` must not crash Phase A.

---

## 4. Build phases (order is non-negotiable)

| Phase | Goal | Data needed | Efficiency proof |
| --- | --- | --- | --- |
| **A** | CPCB clean + station panel | CPCB + stations | Row counts, missingness report |
| **B** | Baselines on Korba | Panel only | Persistence RMSE / MAE |
| **C** | Temporal ML beats persistence | Panel (+ met if any) | Holdout metrics table |
| **D** | FIRMS + EDGAR + WorldPop join | Fire, EDGAR, pop | Feature importance / exposure map CSV |
| **E** | Plug met/OSM/sat when folders fill | New files | Retrain; show lift |
| **F** | Spatial / Jagdalpur path | Satellite + OSM | Transfer or sat-only model |
| **G** | Attribution vs EDGAR | EDGAR + model | Sector mix error metric |
| **H** | FastAPI read-only | outputs + parquet | `/health`, `/cities`, `/forecast` stubs |
| **I** | Frontend | API stable | Later |

**Hackathon stop rule for backend v1:** Phase C green on Korba + Phase D partial + Phase H stub.  
Jagdalpur is Phase F — depends on Person 2.

---

## 5. Anti-Gravity prompts (paste ONE at a time)

Copy everything inside each `PROMPT` block. After each phase: run the commands, fix failures, only then next prompt.

---

### PROMPT A0 — Scaffold only

```
You are working in the AirSight hackathon repo (airsight-data).

Context: Air quality intelligence for Chhattisgarh cities. Config is in config/cities.yaml and config/stations.csv. Raw data is under data/. Fetch scripts are under scripts/ — DO NOT rewrite fetch scripts unless broken. We are building BACKEND library code only (no frontend).

Create package scaffold only (empty modules with docstrings + minimal imports):

- src/airsight/ with subpackages: io, grid, features, models, attribution, impact, pipeline
- outputs/metrics, outputs/models, outputs/reports
- tests/ placeholder
- requirements-backend.txt with: pandas, numpy, pyyaml, h3, scikit-learn, lightgbm, xarray, netCDF4, rasterio, geopandas, fastapi, uvicorn, pyarrow, matplotlib (optional)

Rules:
- Python 3.11+ compatible
- Use pathlib; ROOT discovered from package location
- No fake data generators
- Do not download anything
- Do not implement logic yet beyond package __init__ and a shared paths helper in src/airsight/config.py that loads cities.yaml and stations.csv

After creating files, print the tree and how to pip install -e . if you add a minimal pyproject.toml or setup.cfg.
```

**You run:** install deps; confirm imports.

---

### PROMPT A1 — CPCB + stations loaders

```
Continue AirSight backend in this repo.

Implement:

1) src/airsight/io/stations.py
   - load_stations() from config/stations.csv
   - validate lat/lon float
   - filter by city_id

2) src/airsight/io/cpcb.py
   - load_cpcb_station(city_id, station_id or source_file)
   - load_cpcb_city(city_id) concatenating all CSVs under data/cpcb/<city_id>/
   - Parse Timestamp to pandas datetime (Asia/Kolkata naive or tz-aware consistently — pick one and document)
   - Normalize column names to: timestamp, pm25, pm10, no2, so2, co, o3, and keep extra columns under a clear scheme
   - CPCB headers look like: "Timestamp,PM2.5 (µg/m³),PM10..." — handle encoding quirks and unit suffixes
   - Coerce pollutants to numeric; invalid -> NaN
   - Attach station_id, city_id, latitude, longitude from stations.csv via source_file match

3) src/airsight/pipeline/build_station_panel.py
   - CLI: python -m airsight.pipeline.build_station_panel --city korba
   - Writes outputs/reports/station_panel_korba.parquet (or csv if parquet issues)
   - Writes outputs/reports/station_panel_korba_quality.json with: rows, date_range, % missing pm25, stations count

4) tests/test_cpcb_load.py that runs on real Korba files if present

Do not invent missing files. If a city folder is empty, skip with a clear message.
Run mentally against data/cpcb/korba/ and config/stations.csv.
```

**You run:**

```bash
python -m airsight.pipeline.build_station_panel --city korba
```

**Pass criteria:** quality JSON shows multi-year range, multiple stations, pm25 not 100% missing.

---

### PROMPT B1 — Baselines

```
Continue AirSight backend.

Implement src/airsight/models/baselines.py and evaluation:

Baselines for hourly PM2.5 per station:
1) persistence_1h: y_hat(t) = y(t-1)
2) persistence_24h: y_hat(t) = y(t-24)
3) (optional) station_climatology_hour: mean pm25 by hour-of-day on train split

Implement src/airsight/models/evaluate.py:
- metrics: RMSE, MAE, R2 (sklearn)
- time-based split: train on earlier 70% of timestamps globally or per station — document choice
- NEVER random-shuffle time series

CLI: python -m airsight.pipeline.run_korba_experiment --stage baselines
- Input: outputs/reports/station_panel_korba.parquet
- Output: outputs/metrics/korba_baselines.json and a small markdown table outputs/reports/korba_baselines.md

Only Korba for now. Drop rows where pm25 is NaN for metric computation (but report how many dropped).
```

**Pass criteria:** JSON with RMSE for persistence_1h and persistence_24h. 1h should usually beat 24h.

---

### PROMPT C1 — Temporal model (must beat persistence_24h)

```
Continue AirSight backend.

Implement temporal PM2.5 model for Korba stations:

Features (v1 — only from CPCB panel, no satellite yet):
- lags: pm25_lag1, pm25_lag24, pm25_lag168 (if enough history)
- rolling: pm25_roll24_mean, pm25_roll24_std
- calendar: hour, dayofweek, month (cyclical sin/cos optional)
- if available in CPCB columns: temperature, RH, wind speed, wind direction (from same CSV met fields AT/RH/WS/WD)
- station_id as categorical (LightGBM categorical or one-hot)

Model: LightGBM regressor (fallback sklearn HistGradientBoosting if lightgbm missing)

Rules:
- Same time-based split as baselines
- Compare to persistence_1h and persistence_24h on the SAME test set
- Save model to outputs/models/korba_temporal_lgbm.txt or .joblib
- Save feature importance CSV
- Save metrics to outputs/metrics/korba_temporal.json including beat_persistence_24h: true/false

CLI: python -m airsight.pipeline.run_korba_experiment --stage temporal

Print a clear scorecard to stdout.
Do not use future information (no lag -1 from the future).
```

**Pass criteria:** `beat_persistence_24h: true` OR documented near-miss with next feature plan. For hackathon, beating 24h is the credibility bar; beating 1h is harder and optional.

---

### PROMPT D1 — FIRMS + EDGAR + WorldPop loaders (join-ready)

```
Continue AirSight backend. Use real files already in the repo:

- data/fire/firms_chhattisgarh.csv (and/or fire_archive_*.csv)
- data/inventory/edgar/**/*.nc
- data/static/population/worldpop_india.tif
- config/cities.yaml bboxes

Implement:

1) src/airsight/io/fire.py
   - load_firms(), clip to city bbox, optional daily aggregate near each station (radius_km default 25)
   - feature idea: sum FRP within radius in last 24h / 72h for each timestamp-station (start with daily join if hourly is heavy)

2) src/airsight/io/edgar.py
   - open EDGAR netCDF with xarray
   - for PM2.5 sectors under data/inventory/edgar/{Power,Industry,Transport,residential,agriculture}
   - sample or average emission value at station lat/lon (nearest grid cell)
   - return per-station sector vector (static annual 2022 is fine)

3) src/airsight/io/population.py
   - sample WorldPop raster at station points with rasterio
   - return population density / count proxy per station

4) Extend Korba experiment --stage features_static
   - merge static EDGAR + population onto panel
   - optional fire daily features
   - retrain temporal model; report lift vs C1 metrics

Be memory-safe with WorldPop (724MB): windowed sample at points, do NOT load full India into RAM if possible.
If a library is missing, fail with pip install hint.
```

**Pass criteria:** static feature table for Korba stations; metrics file updated; no full-RAM crash on WorldPop.

---

### PROMPT E1 — Graceful loaders for data not yet collected

```
Continue AirSight backend.

Add loaders that DO NOT crash when folders are empty:

- src/airsight/io/met.py → data/met/<city>/*.csv
- src/airsight/io/satellite.py → data/satellite/{aod,no2,so2}/<city>/*.csv
- src/airsight/io/osm.py → data/osm/...
- src/airsight/io/sources.py → data/sources/*.csv

Each: exists() check, returns empty DataFrame with expected columns + warning log.

Add python -m airsight.pipeline.data_readiness --city korba
that prints a readiness table similar to scripts/99_verify.py but also lists which FEATURE GROUPS are available for modeling.

Do not modify scripts/99_verify.py behavior except optionally calling into airsight if clean.
```

**Pass criteria:** readiness command works today with partial data.

---

### PROMPT F1 — H3 grid utilities (prep for spatial; no fake sat)

```
Continue AirSight backend.

Implement src/airsight/grid/h3_utils.py:
- cells_for_bbox(bbox, res)
- station_to_h3(lat, lon, res)
- aggregate_points_to_h3

Use h3 v3/v4 compatible code (try/except API differences like scripts/04_gee_export.py).

Default modeling res: document res 7 for satellite alignment later; res 8 for product story — keep configurable from cities.yaml h3_resolution.

Write outputs/reports/korba_h3_station_map.csv mapping station_id → h3 cells at res 7 and 8.

No satellite required yet.
```

---

### PROMPT G1 — Attribution stub vs EDGAR

```
Continue AirSight backend.

Implement a FIRST attribution prototype (hackathon-honest, not court-ready):

- For each Korba station, take EDGAR sector mix (PM2.5 sector fractions normalized to sum 1)
- Build simple proxy shares from available signals:
  - power/industry: high SO2 (if any) or proximity placeholder + fire FRP
  - transport: (placeholder equal or from road density when OSM exists)
  - residential: remainder
- Metric: cosine similarity or MAE between proxy vector and EDGAR vector
- Output outputs/metrics/korba_attribution_vs_edgar.json
- Clearly label method as "evidence-backed prioritisation prototype, not legal liability"

CLI: python -m airsight.pipeline.run_korba_experiment --stage attribution
```

---

### PROMPT H1 — FastAPI skeleton

```
Continue AirSight backend. Frontend comes later — API only.

Create api/main.py with FastAPI:

GET /health
GET /cities → from cities.yaml
GET /stations?city_id=korba
GET /metrics/korba → serve outputs/metrics/*.json if present
GET /panel/korba/summary → date range, row count from quality json

CORS open for local frontend later.

Run: uvicorn api.main:app --reload
No auth. No database required — read parquet/json from outputs/.

Do not build React/HTML UI.
```

---

## 6. Parallelism with the three data collectors

| You (backend) | Person 1 | Person 2 | Person 3 |
| --- | --- | --- | --- |
| Phases A–C now | Open-Meteo + GPPD | GEE signup | TomTom loop |
| Phase D | Industry registry | Station sat export | OSM Korba |
| Phase E retrain | Waste/FIRMS merge | Grid sat + landuse | Traffic samples grow |
| Phase F–G | Wire new features | Jagdalpur sat | Roads density |
| Phase H API | — | — | — |

When a new folder fills: re-run readiness → retrain → update metrics JSON for the deck.

---

## 7. Efficiency / “prove it” artifacts for judges

Keep these always regenerable:

| File | Meaning |
| --- | --- |
| `outputs/metrics/korba_baselines.json` | Honest floor |
| `outputs/metrics/korba_temporal.json` | Model vs baselines |
| `outputs/models/...` | Reproducible artifact |
| `outputs/reports/station_panel_korba_quality.json` | Data integrity |
| `outputs/metrics/korba_attribution_vs_edgar.json` | Attribution scoring story |

Slide line: *“We report RMSE against persistence and CAMS (when present); we do not claim court-ready source guilt.”*

---

## 8. What I need from you (optional)

| Item | Need now? |
| --- | --- |
| Full PS PDF/text | **Optional** — sharpens wording; architecture is clear without it |
| Claude design doc | **Not required** — this plan replaces it |
| All datasets complete | **No** — start Phase A |
| Frontend stack choice | **Defer** until Phase H |

If you paste the PS later, we map each scoring rubric line → an `outputs/metrics/*` file.

---

## 9. Immediate next action (today)

1. Teammates: keep PERSON_1/2/3 collection running (especially GEE + TomTom).  
2. You: open Anti-Gravity in this repo folder.  
3. Paste **PROMPT A0** → install → paste **PROMPT A1** → run station panel.  
4. Message me with the quality JSON or errors; we fix, then B1 → C1.

**Ready for coding: YES — backend Phase A starting from data already on disk.**
