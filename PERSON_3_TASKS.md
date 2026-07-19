# Person 3 — OSM Map Layers, Traffic Proxy, City Boundaries

**Your job:** Free substitutes for **historical traffic** and map structure: **OpenStreetMap roads/POIs**, **live TomTom sampling** (diurnal curve), and **per-city boundaries**.

**Read first (15 min):** `README.md` → `M5_fix_and_free_alternatives.md` (section C1 Traffic) → this file.

**You do NOT need to re-download:** CPCB, EDGAR, FIRMS, WorldPop, division GeoJSON.

---

## Why this matters for the system

| Deliverable | What it powers |
| --- | --- |
| OSM roads + weights | `road_density` per H3 cell for traffic attribution |
| OSM hospitals / schools | Business Impact / vulnerability layer (25% of score) |
| OSM industrial / stacks / kilns | Feeds Person 1’s industry registry |
| TomTom live samples | Calibrates **diurnal congestion curve** (history is not free) |
| City boundary GeoJSON | Map framing + fallback if wards missing |

**Judge line you enable:**  
*“Historical probe data is commercial; we calibrate a diurnal traffic model from live probe sampling and OSM road structure, and ingest municipal ANPR/probe feeds where available.”*

⚠️ **Start TomTom TODAY.** You cannot backfill multi-day samples on the last day.

---

## Sequential checklist

### STEP 0 — Setup (10 min)

```bash
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
pip install -r requirements.txt
pip install osmnx geopandas
python scripts/00_setup.py
```

- [ ] Repo opens, scripts folder visible
- [ ] `config/cities.yaml` read (know bboxes for Korba, Jagdalpur, Raipur)

---

### STEP 1 — TomTom account + first sample (FIRST 30 MINUTES) ⏱️ ~20 min

Historical traffic is **not free**. Live sampling is our free proxy.

1. Sign up: https://developer.tomtom.com/ → free API key (**no credit card** typically).
2. PowerShell:

```powershell
$env:TOMTOM_KEY = "your_key_here"
```

3. Test once:

```bash
python scripts/05_tomtom_sample.py --cities korba --once
```

4. Start the long-running loop (leave a terminal open / run overnight):

```bash
python scripts/05_tomtom_sample.py --cities korba --loop 30
```

This samples every **30 minutes**. Free tier ~2,500 non-tile requests/day — 30 min loop is safe.

**Optional second city if quota allows:**

```bash
python scripts/05_tomtom_sample.py --cities raipur --loop 60
```

**Save location (auto):**

```
data/traffic/korba_flow_samples.csv
```

**Done when:**

- [ ] API key works (`--once` succeeds)
- [ ] Loop is running (or scheduled)
- [ ] CSV starts appending rows with speed / freeflow / congestion fields
- [ ] You tell the team: “TomTom loop is live”

> TomTom pricing notes may change around mid-2026 — verify key still works before demo day.

---

### STEP 2 — OpenStreetMap pull (no signup) ⏱️ ~30–90 min depending on network

```bash
# Hero first
python scripts/02_fetch_osm.py --cities korba

# Reveal city (no CPCB, still needs roads/POIs)
python scripts/02_fetch_osm.py --cities jagdalpur

# Validation
python scripts/02_fetch_osm.py --cities raipur

# Optional
python scripts/02_fetch_osm.py --cities bhilai bilaspur

# Or all:
python scripts/02_fetch_osm.py
```

**What the script writes:**

| Output | Path |
| --- | --- |
| Road graph | `data/osm/roads/<city>/roads.graphml` |
| Road edges + weights | `data/osm/roads/<city>/road_edges.geojson` |
| Hospitals | `data/osm/pois/<city>/hospitals.geojson` |
| Schools | `data/osm/pois/<city>/schools.geojson` |
| Industrial land | `data/osm/pois/<city>/industrial.geojson` |
| Stacks / works | `data/osm/pois/<city>/stacks.geojson` |
| Brick kilns | `data/osm/pois/<city>/kilns.geojson` (if any) |
| City boundary | `data/boundaries/<city>.geojson` |

Road weights (already in script): motorway > trunk > primary > residential — used later for freight / pollution weighting.

**Done when:**

- [ ] Korba: roads + at least hospitals + schools + industrial
- [ ] Jagdalpur: roads + POIs (sparse is OK)
- [ ] Raipur: roads + POIs
- [ ] Tell **Person 1** that industrial/stacks are ready for the registry merge

If Overpass/OSM rate-limits you: wait 5–10 min and retry **one city**.

---

### STEP 3 — Confirm city boundaries ⏱️ ~10 min

After OSM:

- [ ] `data/boundaries/korba.geojson` exists
- [ ] `data/boundaries/jagdalpur.geojson` exists
- [ ] `data/boundaries/raipur.geojson` exists

We already have **division** polygons: `data/boundaries/cg_divisions.geojson` (M5).  
City polygons are the next finer tier for maps.

**Ward-level shapefiles (timebox 30 min total):**

Try only if ahead:

1. https://github.com/datameet/maps  
2. https://data.gov.in/ search “Chhattisgarh ward”

If nothing clean → **stop**. Say: *“Ward aggregation is a shapefile swap; we demonstrate at city/district level.”*

- [ ] Ward hunt done or timeboxed and abandoned with a note

---

### STEP 4 — Traffic proxy design notes (so builders don’t invent fakes) ⏱️ ~20 min

Create a short note file the ML team can implement later:

**Create:** `data/traffic/README_TRAFFIC_PROXY.md` with this content (you may paste as-is):

```markdown
# Traffic free proxy (AirSight)

## Formula
traffic_index(cell, hour, dow) =
    road_density(cell) × diurnal_curve(hour, dow)

## road_density
- From data/osm/roads/<city>/road_edges.geojson
- Sum (edge_length × road_weight) per H3 cell
- Weights: motorway 4, trunk 3.5, primary 3, secondary 2, residential 1, ...

## diurnal_curve
- Calibrated from data/traffic/<city>_flow_samples.csv (TomTom live)
- Group by hour-of-day and day-of-week
- Use currentSpeed / freeFlowSpeed (or congestion field) as the signal

## Extra free layers (optional)
- POI density (markets/schools) → rush-hour load
- Freight-class roads near industrial polygons → diesel proxy
- Night-lights near roads → activity (Person 2 optional GEE)

## Honest limit
Historical TomTom Stats / Google / HERE history is commercial.
We do NOT invent historical speeds. We sample live and name the municipal ANPR ingestion path.
```

- [ ] `data/traffic/README_TRAFFIC_PROXY.md` written
- [ ] After ≥1 day of samples, glance that hours cover day + night (not only one hour)

---

### STEP 5 — Diesel / ANPR free proxy (lightweight CSV, no paid data) ⏱️ ~30–45 min

No ANPR feed exists for the public. Build a **static weight table** builders can join to H3:

1. From OSM roads, flag high-weight classes: `motorway`, `trunk`, `primary` (freight corridors).
2. From Person 1 / your industrial GeoJSON, mark cells near industry (within ~1–2 km).
3. Export simple CSV (one row per sample corridor or later per H3 — even a city-level note is fine for now):

```
data/traffic/diesel_proxy_notes.csv
```

Suggested columns: `city_id, road_class, weight, near_industry, method_note`

Example rows:

```csv
city_id,road_class,weight,near_industry,method_note
korba,motorway,4.0,yes,freight_weight × industrial_proximity
korba,primary,3.0,yes,freight_weight × industrial_proximity
korba,residential,1.0,no,baseline
```

**Done when:**

- [ ] File exists and documents the method (implementation can refine to H3 later)

---

### STEP 6 — Help Person 1 if they need landfill OSM tags

Person 1 uses Overpass for `landuse=landfill`. If they are busy, you can pull landfills while OSM is warm (see Person 1 Step 4 queries) and drop files in:

```
data/osm/pois/<city>/landfills.geojson
```

- [ ] (Optional) Landfills collected for Korba / Raipur / Bhilai

---

### STEP 7 — Sanity + handoff

```bash
python scripts/99_verify.py
```

Your items that should improve:

- [ ] OSM roads → OK for Korba + Jagdalpur  
- [ ] OSM POIs → OK (≥2 geojson files per city)  
- [ ] Boundary optional yellow → green if city geojson present  
- [ ] Traffic folder has growing CSV (verify may not check traffic yet — still required for the PS mobility story)

**Message the team:**

```
Person 3 DONE checklist:
- TomTom loop running since: [timestamp]
- samples file: data/traffic/korba_flow_samples.csv rows ≈ [n]
- OSM roads+POIs: korba, jagdalpur, raipur [yes/no]
- boundaries: korba/jagdalpur/raipur.geojson [yes/no]
- industrial geojson ready for Person 1 [yes/no]
- traffic proxy README written [yes/no]
```

---

## Priority order (if short on time)

1. **TomTom loop started** (wall-clock — non-negotiable)  
2. OSM **Korba** (roads + industrial + hospitals + schools)  
3. OSM **Jagdalpur**  
4. OSM **Raipur**  
5. Traffic README + diesel notes  
6. Bhilai / Bilaspur OSM  
7. Ward shapefile hunt (timebox 30 min)

---

## Timebox rules

| Task | Max time | If stuck |
| --- | --- | --- |
| TomTom signup + once | 30 min | Ask teammate; key issues common |
| OSM one city | 45 min | Retry; use bbox fallback (script does this) |
| Ward boundaries | **30 min then STOP** | City polygon + H3 is enough |
| Historical traffic purchase | **Never** | Use live sample proxy only |
| Fake speed time series | **Never** | Judges will dismantle this in Q&A |

---

## Folder map

```
data/osm/
  roads/korba/roads.graphml
  roads/korba/road_edges.geojson
  pois/korba/hospitals.geojson
  pois/korba/schools.geojson
  pois/korba/industrial.geojson
  pois/korba/stacks.geojson
  ... same for jagdalpur, raipur ...
data/boundaries/
  korba.geojson
  jagdalpur.geojson
  raipur.geojson
  cg_divisions.geojson          # already exists (M5)
data/traffic/
  korba_flow_samples.csv        # grows over days
  README_TRAFFIC_PROXY.md
  diesel_proxy_notes.csv
```

---

## Do NOT collect (not your job)

- GEE satellite / Dynamic World → Person 2  
- Open-Meteo / GPPD / industry_registry merge → Person 1  
- EDGAR / FIRMS / WorldPop / CPCB re-download  
- Paid TomTom Traffic Stats history  

---

## Quick commands cheat sheet

```powershell
$env:TOMTOM_KEY = "your_key"
python scripts/05_tomtom_sample.py --cities korba --once
python scripts/05_tomtom_sample.py --cities korba --loop 30

python scripts/02_fetch_osm.py --cities korba
python scripts/02_fetch_osm.py --cities jagdalpur
python scripts/02_fetch_osm.py --cities raipur

python scripts/99_verify.py
```
