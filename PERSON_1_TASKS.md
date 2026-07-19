# Person 1 — Weather, Power Plants, Industrial Registry, Waste Proxies

**Your job:** Fill everything that replaces **closed industrial registers (M6)** and **waste burning**, plus the **meteorology** the forecast model needs.

**Read first (15 min):** `README.md` → `M5_fix_and_free_alternatives.md` (sections M6 + Waste) → this file.

**You do NOT need to re-download:** CPCB, EDGAR, FIRMS archive, WorldPop, division boundaries (already in the repo).

---

## Why this matters for the system

| Deliverable | What it powers |
| --- | --- |
| Open-Meteo met + CAMS | Forecast features + **baseline #2** (must beat CAMS) |
| GPPD power plants | “Inspect **this** plant” on the enforcement map |
| Merged industry registry | Free substitute for CECB consent-to-operate |
| Waste-burning proxy | FIRMS low-FRP near landfills (no open waste feed exists) |

**Judge line you enable:**  
*“Consent-to-operate registers aren’t openly machine-readable, so we build the industrial registry from GPPD, OSM industrial land use, and satellite thermal + SO₂ signatures — and the platform ingests the official CECB register where the board shares it.”*

---

## Sequential checklist

### STEP 0 — Setup (10 min)

```bash
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
pip install -r requirements.txt
python scripts/00_setup.py
```

Confirm these already exist (do not re-download):

- [ ] `config/stations.csv` has Korba / Raipur / Bhilai / Bilaspur coords
- [ ] `data/fire/firms_chhattisgarh.csv` (or the two `fire_archive_*.csv` files)
- [ ] `data/inventory/edgar/` has `.nc` files
- [ ] `data/boundaries/cg_divisions.geojson`

---

### STEP 1 — Open-Meteo weather + CAMS (no signup) ⏱️ ~30–60 min

**Priority: Korba first, then Jagdalpur, then Raipur.**

```bash
python scripts/01_fetch_openmeteo.py --cities korba
python scripts/01_fetch_openmeteo.py --cities jagdalpur
python scripts/01_fetch_openmeteo.py --cities raipur
# If time:
python scripts/01_fetch_openmeteo.py --cities bhilai bilaspur
# Or all at once:
python scripts/01_fetch_openmeteo.py
```

**Save location (auto):**

| File | Path |
| --- | --- |
| Archive met | `data/met/<city>/archive.csv` |
| Forecast met | `data/met/<city>/forecast.csv` |
| CAMS AQ baseline | `data/met/<city>/cams_forecast.csv` (script may name `cams*.csv`) |

**Done when:**

- [ ] `data/met/korba/` has archive + forecast + CAMS files
- [ ] `data/met/jagdalpur/` has the same
- [ ] Files are non-empty (open one CSV, check dates cover ~2021–2024 where expected)

---

### STEP 2 — GPPD power plants (no signup) ⏱️ ~5–15 min

```bash
python scripts/03_fetch_sources.py
```

**Save location (auto):**

| File | Path |
| --- | --- |
| All India plants | `data/sources/gppd_india.csv` |
| Plants clipped to our cities | `data/sources/power_plants_by_city.csv` |

**Done when:**

- [ ] Both CSVs exist under `data/sources/`
- [ ] Korba shows power plants (NTPC / coal complex expected)
- [ ] Note plant count per city in chat (useful for slides)

> Skip `--firms-key` unless you want a live 7-day fire layer. Historical FIRMS is **already** in `data/fire/`.

---

### STEP 3 — Wait for Person 3’s OSM industrial layers

Person 3 runs `02_fetch_osm.py`, which writes:

- `data/osm/pois/<city>/industrial.geojson`
- `data/osm/pois/<city>/stacks.geojson`
- `data/osm/pois/<city>/kilns.geojson` (if any)

**Done when (coordinate with Person 3):**

- [ ] At least **Korba** industrial + stacks GeoJSON exist
- [ ] Jagdalpur industrial pulled (even if sparse)

If Person 3 is blocked, you can run OSM yourself for Korba only:

```bash
python scripts/02_fetch_osm.py --cities korba
```

---

### STEP 4 — Extra OSM tags for waste + power (manual Overpass or small script) ⏱️ ~30–45 min

The main OSM script does **not** yet pull landfills or power plants from OSM. Collect these for **Korba + Raipur + Bhilai** at minimum.

#### Option A — Overpass Turbo (browser, no code)

1. Open https://overpass-turbo.eu/
2. Draw bbox around each city (or use city search).
3. Run queries one by one; **Export → GeoJSON**.

**Query 1 — waste / dumps:**

```
[out:json][timeout:60];
(
  nwr["landuse"="landfill"]({{bbox}});
  nwr["amenity"="waste_disposal"]({{bbox}});
  nwr["amenity"="recycling"]({{bbox}});
);
out center;
```

**Query 2 — OSM power infrastructure:**

```
[out:json][timeout:60];
(
  nwr["power"="plant"]({{bbox}});
  nwr["power"="generator"]({{bbox}});
  nwr["power"="substation"]({{bbox}});
);
out center;
```

**Save to:**

```
data/osm/pois/korba/landfills.geojson
data/osm/pois/korba/power_osm.geojson
data/osm/pois/raipur/landfills.geojson
data/osm/pois/raipur/power_osm.geojson
data/osm/pois/bhilai/landfills.geojson
data/osm/pois/bhilai/power_osm.geojson
data/osm/pois/jagdalpur/landfills.geojson   # may be empty — OK
data/osm/pois/bilaspur/landfills.geojson    # optional
```

- [ ] Landfill / waste GeoJSONs saved (empty file with `{"type":"FeatureCollection","features":[]}` is OK if none found — note that in chat)
- [ ] Power OSM GeoJSONs saved for Korba at minimum

---

### STEP 5 — FIRMS → industrial thermal + waste-burning flags ⏱️ ~45–90 min

You already have FIRMS CSVs. Build two filtered products (Excel / Python / pandas — your choice).

**Input:** `data/fire/firms_chhattisgarh.csv` (or combine the archive CSVs).

Columns you need: `latitude, longitude, frp, confidence, acq_date, acq_time` (names may vary slightly — check header).

#### 5a — Persistent industrial thermal hotspots

1. Keep points inside each city bbox from `config/cities.yaml`.
2. Focus on **high FRP** and/or **repeat detections** in the same ~1–2 km cell over many months.
3. Especially near known industry (Korba power, Bhilai steel).
4. Export points / monthly counts.

**Save to:**

```
data/sources/firms_thermal_hotspots.csv
```

Suggested columns: `city_id, latitude, longitude, frp, confidence, acq_date, hotspot_type`  
where `hotspot_type` starts as `industrial_thermal` for high/repeat FRP.

#### 5b — Waste-burning candidates

1. Keep **low FRP** detections (open burning is weaker than industrial).
2. Spatial join / near filter to OSM landfills / waste sites from Step 4 (e.g. within 1–2 km).
3. Also tag low-FRP in residential-looking areas if no landfill layer exists.

**Save to:**

```
data/sources/firms_waste_burning_candidates.csv
```

Suggested columns: `city_id, latitude, longitude, frp, acq_date, near_landfill (yes/no), notes`

**Done when:**

- [ ] Both CSVs exist under `data/sources/`
- [ ] Korba has some thermal rows (expected)
- [ ] Waste file exists even if few matches (document “few OSM landfills”)

---

### STEP 6 — Merge industrial registry (the M6 substitute) ⏱️ ~1–2 h

Build **one** GeoJSON / CSV the enforcement module can read.

**Layers to merge:**

| Layer | Source file | `source` tag |
| --- | --- | --- |
| Power plants | `data/sources/power_plants_by_city.csv` | `gppd` |
| OSM industrial polygons | `data/osm/pois/<city>/industrial.geojson` | `osm` |
| OSM stacks / works | `data/osm/pois/<city>/stacks.geojson` | `osm` |
| OSM power | `data/osm/pois/<city>/power_osm.geojson` | `osm_power` |
| FIRMS thermal | `data/sources/firms_thermal_hotspots.csv` | `firms_thermal` |
| S5P SO₂ hotspots | *optional — ask Person 2 when SO₂ grid lands* | `s5p_so2` |

**Output:**

```
data/sources/industry_registry.geojson
```

Minimum properties per feature:

- `name` (or `unknown` + lat/lon)
- `city_id`
- `source` (`gppd` / `osm` / `firms_thermal` / `s5p_so2` / …)
- `latitude`, `longitude` (centroid if polygon)
- `notes` (optional capacity, fuel, FRP, etc.)

**Done when:**

- [ ] `data/sources/industry_registry.geojson` opens in https://geojson.io or QGIS
- [ ] Korba shows multiple points/polygons
- [ ] Every feature has a `source` field

---

### STEP 7 — Sanity + handoff

```bash
python scripts/99_verify.py
```

Your rows that should go green / improve:

- [ ] EDGAR / FIRMS / WorldPop already OK (global)
- [ ] GPPD power plants → OK
- [ ] Open-Meteo archive / forecast / CAMS for Korba + Jagdalpur → OK

**Message the team:**

```
Person 1 DONE checklist:
- met: korba, jagdalpur, raipur [yes/no]
- sources/gppd + power_plants_by_city [yes/no]
- industry_registry.geojson [yes/no]
- firms thermal + waste candidates [yes/no]
- landfills OSM [yes/no]
```

---

## Timebox rules

| Task | Max time | If stuck |
| --- | --- | --- |
| Open-Meteo | 90 min | Retry one city; check internet |
| GPPD | 20 min | Manual CSV from WRI GitHub (script prints URL) |
| Overpass landfills | 45 min | Ship empty FeatureCollection + note |
| Full registry merge | 2 h | Ship GPPD + OSM only; add FIRMS later |
| CECB website scrape | **20 min then STOP** | Do **not** scrape under time pressure |

---

## Do NOT collect (not your job / not free)

- Historical TomTom / Google traffic archives → Person 3’s proxy
- GEE satellite CSVs → Person 2
- Fake traffic numbers → never
- CECB consent PDF scrape beyond a 20-minute look

---

## Optional stretch (only if ahead)

1. Cross-reference Person 2’s SO₂ grid peaks with OSM industrial polygons → add `s5p_so2` rows to the registry.
2. Write a short slide note with plant counts per city from GPPD.
3. OpenAQ live key for demo-day live CAAQMS (optional; historical CPCB is enough).
