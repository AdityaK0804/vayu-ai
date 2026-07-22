# Vayu — Project Document (Team PPT Pack)
### AI-Powered Urban Air Quality Intelligence for Smart-City Intervention  
**ET AI Hackathon 2.0 · Problem Statement 5**  
**Product name:** Vayu (formerly AirSight)  
**Version:** v2.1 · Updated 2026-07-22  

> **Give this file to teammates building the pitch deck.**  
> Every performance number is measured on a held-out time-ordered test set.  
> Live map AQI (e.g. 28–50) is **current air**, not model skill.

---

## 0. Changelog for teammates (what changed since the old AirSight doc)

| # | Change | Why it matters for the PPT |
|---|--------|----------------------------|
| 1 | **Brand: AirSight → Vayu** | Use **Vayu** on slides; “AirSight” only if referring to the repo/path |
| 2 | **Model v2.1** (not v1) | Forecast skill improved; quote **new RMSE table** below |
| 3 | Features **38 → 93** | Met@t+h, multi-CAMS, long lags, rolling, deltas, traffic proxy, **fire FRP** |
| 4 | **CatBoost + ensemble** bake-off | Technical excellence story (not just one LGBM) |
| 5 | **log1p target + sample weights** | Better MAE / typical-day skill |
| 6 | **Quantile P10/P50/P90 + conformal cal** | Uncertainty bands; PICP ~78–80% |
| 7 | **FIRMS fire fully enabled** | Archive **2021-01-01 → 2026-01-01** (**1.18M** detections). **100%** of training rows have fire coverage. `fire_count` / `fire_frp` in model features. |
| 8 | Demo bake + Proof UI | UI shows RMSE vs v1/persistence, not “AQI got better” |
| 9 | Honest AQI messaging | **AQI on map ≠ model upgrade.** Skill = RMSE/MAE |
| 10 | Cities / data scale same | Still **285,522** station-hours, **14** stations, **8+** cities, Jagdalpur reveal |

**Do not put old v1 numbers on slides** (13.51 / 14.91 / 16.23 as “current”). Use **v2.1** table in §5.

---

## 1. One-paragraph summary (use on slide 1)

**Vayu** is a multi-agent air quality intelligence platform for Chhattisgarh. It forecasts PM2.5 up to **72 hours** ahead at **~1 km** resolution — **including cities with no ground sensors** — attributes hotspots to likely sources (validated against **EDGAR**), generates **enforcement dossiers** for inspectors in seconds, and supports multi-language citizen advisories. Trained on **285,522 real hourly observations** across **14 stations**, its forecasts **beat persistence by ~19–23%** and **bias-corrected CAMS by ~39–48%** at every horizon. Built on **₹0 proprietary data**.

**Three verbs: Predict · Attribute · Prioritize.**

---

## 2. The problem (why this matters)

- ~**1.67 million** premature deaths/year in India from air pollution (Lancet Planetary Health).
- **900+** CAAQMS stations, but CAG 2024: only **~31%** of cities with monitoring have actionable multi-agency response protocols.
- **Data exists. The intelligence layer to act does not.**
- Cities need together: **source attribution**, **hyperlocal 24–72h forecast**, **enforcement prioritisation**.

**Blind spot:** thousands of towns have no station. Chhattisgarh has heavy industry (Korba power/coal, Bhilai steel) and sparse sensors. Vayu fills that gap.

---

## 3. What we built (architecture)

### Design principles
1. **₹0 stack** — free/open data + free hosting tier.
2. **Offline bake → online read** — models train offline; demo site reads JSON (demo-safe).
3. **LLM orchestrates; tools compute** — no hallucinated numbers for forecasts/attribution.
4. **Config-driven cities** — `config/cities.yaml`; new city ≈ bbox + data, not rewrites.

### Two-speed pipeline
| Mode | What happens |
|------|----------------|
| **Offline** | Fetch → H3 harmonize → train (LGBM / CatBoost) → quantiles → enforcement → bake JSON |
| **Online** | Next.js reads `web/public/data/<city>/`, map + proof + dossiers + Vayu Assist chat |

### Five agents (aligned to PS5)
| Agent | Job |
|-------|-----|
| **Forecast** | 24–72h PM2.5 per ~1 km cell + uncertainty bands |
| **Attribution** | traffic / industry / fire / dust shares + wind cone + EDGAR check |
| **Enforcement** | ranked dossiers: pollution × people × schools/hospitals |
| **Comparative** | multi-city trends / intervention framing |
| **Citizen advisory** | health messaging (EN / HI), grounded in real metrics |

### Tech stack
| Layer | Choice |
|-------|--------|
| Ground truth | CPCB hourly PM2.5 (+ co-pollutants) |
| Met + regional AQ | Open-Meteo + CAMS |
| Satellite | MODIS AOD, Sentinel-5P NO2/SO2 (GEE) |
| Inventory | EDGAR sector maps |
| Fire | NASA FIRMS VIIRS (S-NPP + NOAA-20) |
| Sources | GPPD plants, OSM industry/roads/POIs |
| Population | WorldPop |
| Models | **LightGBM** (production) + **CatBoost** (ensemble bake-off), quantiles |
| Frontend | Next.js, MapLibre, deck.gl H3 |
| Backend | FastAPI (optional), offline bake primary for demo |

---

## 4. Capabilities (what to demo live)

1. **Hyperlocal forecast** — 24 / 48 / 72 h, Korba hero city.  
2. **Zero-station reveal** — **Jagdalpur** (no CPCB) predicted from satellite + met + static features.  
3. **Source attribution** — industry-heavy Korba with upwind plants + EDGAR agreement.  
4. **Enforcement list** — top wards: exceedance × population × vulnerable sites.  
5. **Proof panel** — RMSE vs persistence, CAMS, and **v1 → v2.1**.  
6. **Uncertainty** — P10–P90 bands, calibrated coverage ~80%.  
7. **Citizen health advisory** — district **hospital (1,702)** + **school (55k)** registers × live/model AQ · EN/HI (Dashboard → Act → Citizen advisory).  
8. **Citizen assistant** — Vayu Assist (grounded answers / optional LLM).  

---

## 5. Measured results (CURRENT = v2.1) — USE THESE ON SLIDES

### Dataset
- **285,522** real hourly PM2.5 rows (0% fabricated targets).  
- **14 stations**, cities: Korba, Raipur, Bhilai, Bilaspur, Tumidih, Milupara, Chhal, Kunjemara + **Jagdalpur** (reveal, no target).  
- Window: **2022-10 → 2025-12**.  
- Features: **95** multi-modal with fire (was **38** in v1).  
- Fire: **1,181,458** FIRMS detections, **2021-01-01 → 2026-01-01** (includes full 2025).  
  Training tables: **100%** of rows inside fire archive (no train/test fire gap).

### Forecast accuracy vs baselines (held-out test)

| Horizon | **v2.1 RMSE** (full fire) | Persistence | CAMS (bias-corr.) | vs Persistence | vs CAMS | vs **v1** |
|--------:|-------------:|------------:|------------------:|---------------:|--------:|----------:|
| **24h** | **13.26** | 16.37 | 25.32 | **+19.0%** | **~+48%** | **+1.8%** |
| **48h** | **14.67** | 19.01 | 25.63 | **+22.8%** | **~+43%** | **+1.6%** |
| **72h** | **15.97** | 20.71 | 26.15 | **+22.9%** | **~+39%** | **+1.6%** |

| Horizon | v1 MAE | **v2.1 MAE** | MAE improvement |
|--------:|-------:|-------------:|----------------:|
| 24h | 8.06 | **7.52** | **-6.7%** |
| 48h | 9.14 | **8.38** | **-8.3%** |
| 72h | 9.76 | **8.93** | **-8.5%** |

*(RMSE/MAE in µg/m³. Time-ordered split: last 20% per station = test. No shuffle.)*

### Uncertainty (quantiles)

| Horizon | P50 RMSE | PICP (calibrated) | Mean band width |
|--------:|---------:|------------------:|----------------:|
| 24h | 13.25 | **~78.5%** | ~22.0 µg/m³ |
| 48h | 14.69 | **~78.9%** | ~24.2 µg/m³ |
| 72h | 16.04 | **~78.0%** | ~25.2 µg/m³ |

Target coverage for [P10, P90] ≈ 80%.

### Zero-station capability (LOSO nowcast)

| Metric | Value |
|--------|------:|
| LOSO RMSE (satellite-covered stations) | **~20.5** µg/m³ |
| Bias-corrected CAMS on same rows | **~26.7** µg/m³ |
| Improvement vs CAMS | **~+23%** |

**Jagdalpur** = product demo of “never seen a station, still map the city.”

### What the model learned (feature story for judges)
- At **24h**, recent PM still dominates (persistence is strong).  
- At **48–72h**, **forecast meteorology + CAMS@t+h** matter more — physics-consistent.  
- v2.1 adds **met at target time**, **rolling history**, **traffic diurnal proxy**, **fire FRP** when archive covers the day.

---

## 6. v1 → v2.1: what we improved (technical excellence slide)

| Upgrade | Detail |
|---------|--------|
| Weather @ **t+h** | Open-Meteo fields at forecast valid time (not only origin) |
| Multi-species CAMS | dust, AOD, PM10, NO2, SO2… at now + target |
| Longer memory | lags to 168h, rolling 6/24/168, deltas, residual-to-CAMS |
| log1p target | stabilises spikes; better MAE |
| Sample weights | more weight on dirtier hours |
| Traffic proxy | road density × diurnal congestion curve |
| **Fire FRP** | daily city FRP from FIRMS; **NaN after archive end** (honest) |
| CatBoost + ensemble | bake-off; champions per horizon |
| Quantiles + conformal scale | calibrated uncertainty |
| Proof UI | shows skill metrics separately from live AQI |

**Production recipe:** LightGBM, **log1p(pm25)**, 93 features, one model per horizon; decode with `expm1`.

---

## 7. How Vayu is better than “just a dashboard”

| Existing systems | Vayu |
|------------------|------|
| Display readings | Forecast + attribute + prioritise |
| Only at stations | Predicts **unmonitored** cells / cities |
| “AQI 340” | “Likely industry upwind, confidence X, EDGAR-aligned” |
| Raw CAMS (biased high in CG) | Beats bias-corrected CAMS by ~39–48% |
| Reactive alerts | 24–72h **scheduling** |
| No inspector list | Ranked **dossiers** |
| Station ≈ ₹1–1.5 crore | District-scale intelligence on laptop + free data |
| Hard to scale | `cities.yaml` + scripted loops |

**One-liner:** *Dashboards tell you the air is bad. Vayu tells you what will happen, what’s driving it, and where to send an inspector — with or without a sensor.*

---

## 8. Business impact & scalability

- **Cost asymmetry:** virtual coverage vs crore-scale stations.  
- **Marginal city cost ≈ data pull + retrain** (config-driven).  
- **Signal → dossier** in seconds (demo stopwatch in enforcement bake).  
- **B2G SaaS angle:** SPCBs / municipalities; Smart Cities / NCAP alignment.  
- **Judging weights to hit:** Innovation 25% · Business 25% · Technical 20% · Scalability 15% · UX 15%.

---

## 9. Honesty & limitations (say these first)

| Limit | Our line |
|-------|----------|
| Map AQI still “normal” numbers | That’s **ambient air**, not RMSE. Monsoon is often cleaner. |
| Fire archive end | FIRMS currently through **2026-01-01** (full 2025 included). Further years: re-pull + re-patch. |
| EDGAR annual ~11 km | Validates **sector mix**, not hourly guilt. |
| Attribution | **Evidence-backed prioritisation**, not court-ready liability. |
| Historical traffic | Diurnal proxy from limited TomTom samples + defaults; municipal feeds are the ingestion path. |
| Severe spikes (PM ≥ 60) | Still harder (RMSE ~40–50 on those hours); fire + winter focus is the path. |
| Free GEE / map tiers | Non-commercial; production would license. |

---

## 10. Demo script (3–4 minutes)

1. **Problem** — CAG 31%, blind spots, Chhattisgarh industry.  
2. **Korba map** — H3 forecast field + station proof.  
3. **Proof panel** — 24h RMSE **13.23**, **+19%** vs persistence, **+2%** vs our own v1.  
4. **Attribution + enforcement** — industry upwind, dossier with population + schools.  
5. **Jagdalpur** — zero stations, still a map (LOSO **~20.5** vs CAMS **~26.7**).  
6. **Citizen / Vayu Assist** — one grounded Q&A in Hindi/English.  
7. **Close** — Predict · Attribute · Prioritize · ₹0 · scales by config.

---

## 11. PPT slide outline (suggested 10–12 slides)

1. Title — **Vayu** · PS5 · team  
2. Problem + CAG stat  
3. Solution one-liner + 3 verbs  
4. Architecture (offline bake / online read + 5 agents)  
5. Data stack (multi-modal)  
6. **Results table** (v2.1 RMSE — copy §5)  
7. Zero-station / Jagdalpur  
8. Attribution + enforcement dossier screenshot  
9. Uncertainty bands (PICP)  
10. vs existing systems  
11. Business / scale / cities.yaml  
12. Honest limits + roadmap + ask  

---

## 12. Roadmap

| Near-term | When 2025–26 FIRMS lands | Product |
|-----------|--------------------------|---------|
| Retrain after full fire year | Re-harmonize fire_frp → retrain v2.2 | Ward shapefiles if available |
| More TomTom samples | Stronger traffic curve | Live optional OpenAQ refresh |
| Peak/severe specialist | Winter spike skill | Multi-state config pack |

---

## 13. Key file pointers (for builders)

| Path | Content |
|------|---------|
| `Vayu_Project_Document.md` | **This pack** |
| `AirSight_Project_Document_ARCHIVED_v1.md` | Old doc (v1 numbers) |
| `data/processed/MODEL_PROOF.md` | Model proof detail |
| `data/processed/forecast_metrics_v21.json` | Champion metrics JSON |
| `data/processed/quantile_metrics.json` | Uncertainty metrics |
| `web/public/data/korba/metrics.json` | What the UI Proof panel reads |
| `config/cities.yaml` | Scalability story |
| `RUN_NOW.md` | How to run app / train / FIRMS |

### Reproduce metrics
```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
python scripts/models/print_proof.py
```

### Run UI
```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data\web"
npm run dev
```
Open http://localhost:3000 → Proof / Analytics for RMSE (not only map AQI).

---

## 14. Numbers cheat-sheet (copy onto one slide)

```
Vayu v2.1  |  285,522 station-hours  |  14 stations  |  95 features (+ fire)

24h RMSE 13.26  (v1: 13.51)   |  +19.0% vs persistence  |  ~+48% vs CAMS_bc
48h RMSE 14.67                |  +22.8% vs persistence
72h RMSE 15.97                |  +22.9% vs persistence
MAE better than v1 by ~7–9% at all horizons

Zero-station LOSO ~20.5 µg/m³  (CAMS_bc ~26.7, +23%)
Quantile coverage ~78–79% (calibrated)
Fire: FIRMS 2021-01-01 → 2026-01-01 (1.18M detections, 100% train coverage)
Brand: Vayu · Predict · Attribute · Prioritize
```

---

*All performance figures measured on held-out test data as of the v2.1 build and are reproducible from the repo scripts. Update this document when 2025–26 FIRMS arrives and models are retrained.*
