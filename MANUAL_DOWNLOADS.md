# MANUAL DOWNLOADS — the click-by-click part

These 5 datasets **cannot be scripted cheaply**. A human opens a portal and downloads a file.
Everything else is a script (see README).

**Total time if you don't get lost: ~2 hours.**

---

## M1. 🔴 CPCB CAAQMS — you already have this, BUT…

You have the hourly CSVs. **You are still missing the one thing everything blocks on.**

### THE #1 BLOCKER: `config/stations.csv`

Your CPCB CSVs contain measurements but **not coordinates**. Without lat/lon, a station is
just a name — it cannot be placed on the H3 grid, cannot be joined to satellite pixels,
cannot be used for leave-one-station-out validation. **The entire pipeline blocks here.**

**Fill in `config/stations.csv`:**
```csv
station_id,station_name,city_id,latitude,longitude,source_file
korba_01,Korba (CECB),korba,22.3595,82.7501,korba_cecb_2021_2024.csv
raipur_01,Raipur (CECB),raipur,21.2514,81.6296,raipur_cecb_2021_2024.csv
```

**How to find each station's lat/lon (3 ways, in order of speed):**
1. **CPCB portal** — station detail page usually lists coordinates.
2. **Google Maps** — search the exact station name + city, right-click → copy coordinates.
3. **OpenAQ Explorer** — `https://explore.openaq.org` → search the city → it wraps CPCB
   stations and shows coordinates cleanly. Often the fastest.

⚠️ **`city_id` must exactly match `config/cities.yaml`** (`korba`, `raipur`, `bhilai`, `bilaspur`).

### If you're missing any city's CPCB data
1. `https://airquality.cpcb.gov.in/` → register (free)
2. **Advanced Search / Data Download**
3. State: **Chhattisgarh** → City → **Station** (repeat for *every* station)
4. Parameters: **PM2.5, PM10, NO2, SO2, CO, O3** (all six — free, each is a channel)
5. Time step: **1 Hour** ← not daily. Daily kills the diurnal/inversion signal.
6. Range: **01-01-2021 → 31-12-2024**
7. Times out? → pull **3-month chunks**, combine later.

**Save to:** `data/cpcb/<city_id>/`

> **Jagdalpur has no station. Skip it. That's the entire point of the demo.**

### Quality checks before you trust it
- Timestamps in **IST**, consistent.
- Drop/flag negatives and sensor-offline runs.
- Note the **station count per city** (usually 1–3). *That number justifies your whole
  satellite virtual-sensor argument — put it on a slide.*
- If you display "AQI", compute the **official CPCB AQI formula**. Don't invent a private
  index and call it AQI without saying so.

---

## M2. 🔴 EDGAR v8.1_AP — emission inventory *(the attribution ground truth)*

**Why this is not optional:** the PS Evaluation Focus says *"source attribution accuracy
versus ground-truth emission inventories."* This **is** that inventory. Without it your
attribution is an assertion; with it, it's a scored result.

**Where:** `https://edgar.jrc.ec.europa.eu/emissions_data_and_maps`

**Steps:**
1. Find dataset **EDGAR v8.1_AP** (air pollutants, 1970–2022)
2. Substance: **PM2.5** → download **gridmaps by sector**
3. Repeat for **NOx** and **SO2**
4. Sectors you want: **power, industry, transport, residential, agriculture**
5. Year: latest available (**2022**)
6. Format: `.nc` (use `xarray`) or `.txt`

**Save to:** `data/inventory/edgar/`

**How it gets used:** clip to city bbox → aggregate each sector to H3 → per-cell "expected
sector mix" → compare against your model's shares → **that comparison is your attribution
accuracy metric.**

> **Say this before a judge says it:** EDGAR is annual, bottom-up, ~11km. It validates the
> **sector mix**, not hourly dynamics. Naming the limitation yourself converts your weakest
> point into a credibility win.

---

## M3. 🟠 NASA FIRMS — active fire *(5 minutes, big payoff)*

**Why:** crop burning **and** the thermal signature of Korba's power plants / Bhilai's steel
works. This is what lets you say *"that spike wasn't traffic — it was the industrial cluster
4km upwind."*

**Where:** `https://firms.modaps.eosdis.nasa.gov/download/`

**Steps:**
1. Source: **VIIRS S-NPP** and/or **NOAA-20**
2. Area: draw **Chhattisgarh**, or bbox `80.2, 17.8, 84.4, 24.1`
3. Date range: **2021-01-01 → 2024-12-31**
4. Format: **CSV** → download

Columns you need: `latitude, longitude, frp, confidence, acq_date, acq_time`
(**FRP** = fire radiative power = intensity.)

**Save to:** `data/fire/firms_chhattisgarh.csv`  ← **one file covers all five cities**

> ⚠️ The free FIRMS **API** only serves a rolling ~7–10 day window. For the 2021–2024
> archive you **must** use this manual download page. `03_fetch_sources.py --firms-key`
> only fetches the recent live layer.

---

## M4. 🟠 WorldPop — population grid

**Why:** turns a red hex into *"…and 40,000 people live here, including 3 schools."*
This is the **Business Impact** layer (25% of the score).

**Where:** `https://hub.worldpop.org/`

**Steps:**
1. Search **India** → **Population Counts** → **100m** resolution
2. Pick the most recent year (2020 constrained is fine)
3. Download the `.tif`

**Save to:** `data/static/population/worldpop_india.tif`  ← **one file covers everything**

> It's a big file (hundreds of MB). Download once. Never put it in Supabase — sample it
> offline and store only the per-cell numbers.

---

## M5. 🟡 Ward boundaries

**Why:** administrators think in **wards**, not hex cells. Ward-level aggregation is what
makes the Enforcement dossier usable by a real municipal officer.

**Where (in order of likelihood):**
1. `https://github.com/datameet/maps` — community India shapefiles
2. `https://data.gov.in/` → search *"Chhattisgarh ward boundary"*
3. **Fallback:** already automated — `02_fetch_osm.py` writes city polygons to
   `data/boundaries/<city>.geojson`

**Save to:** `data/boundaries/`

> ⏱️ **Timebox: 30 minutes.** If ward-level shapefiles aren't there, ship with city polygons
> + H3 cells and say *"ward aggregation is a shapefile swap."* Don't lose a day to this.

---

## ❌ M6. CECB consent-to-operate register — TIMEBOX 20 MINUTES

Chhattisgarh Environment Conservation Board publishes consented industries.
**If it isn't machine-readable in 20 minutes, STOP.** You have 7 days.
GPPD (scripted) + OSM industrial (scripted) already cover your source registry.

---

## ❌ NOT AVAILABLE FREE — do not hunt for these

| Wanted | Reality | What we do instead | What you SAY |
|---|---|---|---|
| Historical traffic | TomTom Stats = trial/sales only; Google/HERE charge | `road_density × diurnal curve` calibrated from live TomTom sampling | *"Historical probe data is commercial. We calibrate a diurnal model from live probe sampling; the platform ingests municipal ANPR/probe feeds where a city provides them."* |
| Construction permits | Not open data in Chhattisgarh | Dynamic World built-up change detection | *"Permits aren't open data here, so we detect construction from satellite land-cover change. Where a municipality publishes permits, we ingest them directly."* |
| Diesel fleet / ANPR | Municipal-private | Road-class weighting + night-lights near industry | *"Designed as an ingestion point for municipal ANPR feeds; demonstrated with proxies."* |

> **This table is a scoring asset, not an apology.** Every team will hand-wave these.
> You'll name the constraint, show a calibrated substitute, and point at the ingestion path.
> **Faking a traffic dataset gets you dismantled in Q&A. This wins it.**
