# Person 2 — Satellite (GEE), Virtual Sensors, Construction Proxy

**Your job:** Everything that needs **Google Earth Engine** — MODIS AOD, Sentinel-5P NO₂/SO₂, and **Dynamic World land-use change** (the free substitute for closed construction permits).

**Read first (15 min):** `README.md` → `M5_fix_and_free_alternatives.md` (section C2 Construction) → this file.

**You do NOT need to re-download:** CPCB, EDGAR, FIRMS, WorldPop, division boundaries.

---

## Why this matters for the system

| Deliverable | What it powers |
| --- | --- |
| Satellite AOD | Best free proxy for surface PM2.5 between stations |
| Satellite NO₂ | Traffic / combustion pattern |
| Satellite SO₂ | Coal / smelting — critical for **Korba** |
| Grid-mode exports | **Jagdalpur reveal** (zero ground sensors) |
| Dynamic World landuse | **Construction proxy** (permits not open data) |

**Judge line you enable:**  
*“Construction permits aren’t open data, so we detect construction from satellite land-cover change — and ingest permit feeds where a municipality publishes them.”*

Without satellite, there is **no** zero-station Jagdalpur story. That is Innovation score.

---

## Sequential checklist

### STEP 0 — Setup + GEE signup (DO THIS IN THE FIRST HOUR) ⏱️ signup: 15 min + wait

Approval can lag **hours to days**. Nothing unblocks satellite until this is done.

1. Go to https://earthengine.google.com/ → **Sign up** (free, non-commercial).
2. Create / pick a **Google Cloud project** and register it for Earth Engine (GEE docs walk you through this).
3. On your machine:

```bash
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
pip install -r requirements.txt
pip install earthengine-api
python scripts/00_setup.py
earthengine authenticate
```

4. Set project id (PowerShell example):

```powershell
$env:EE_PROJECT = "your-project-id"
```

**Done when:**

- [ ] GEE account approved
- [ ] `earthengine authenticate` succeeded
- [ ] Team has the project id written in shared notes

> Tell the team as soon as GEE is approved — Person 1/3 continue other work while you wait.

---

### STEP 1 — Prove auth with STATIONS mode (fast) ⏱️ ~10–30 min queue

Stations mode samples only at CPCB points. Proves your pipeline before long grid jobs.

**Korba first:**

```bash
python scripts/04_gee_export.py --mode stations --cities korba
```

Then Raipur (most stations):

```bash
python scripts/04_gee_export.py --mode stations --cities raipur
```

Optional:

```bash
python scripts/04_gee_export.py --mode stations --cities bhilai bilaspur
```

> Jagdalpur has **no stations** — stations mode will correctly skip it. Use **grid** for Jagdalpur.

**Watch tasks:** https://code.earthengine.google.com/tasks  
**Files land in:** Google Drive → folder **`AirSight_exports`**

**Done when:**

- [ ] Tasks complete without error for Korba stations
- [ ] CSVs appear in Drive `AirSight_exports`

---

### STEP 2 — Download station exports into the repo ⏱️ ~15 min

For each completed export, download the CSV and place it:

```
data/satellite/aod/<city>/
data/satellite/no2/<city>/
data/satellite/so2/<city>/
```

Naming can stay as GEE gave it (`airsight_aod_korba_stations_2021.csv`, etc.).

**Channels to keep:**

| Channel | Sensor | Use |
| --- | --- | --- |
| `aod` | MODIS MCD19A2 | PM2.5 proxy |
| `no2` | Sentinel-5P OFFL | combustion / traffic |
| `so2` | Sentinel-5P OFFL | coal / industry (Korba!) |

Years: **2021–2024** (script default). NO₂/SO₂ skip pre-2019 automatically.

**Done when:**

- [ ] `data/satellite/aod/korba/` has station CSVs
- [ ] `data/satellite/no2/korba/` has station CSVs
- [ ] `data/satellite/so2/korba/` has station CSVs
- [ ] Same for Raipur if time

---

### STEP 3 — GRID mode for spatial model + Jagdalpur ⏱️ queue: hours — start and walk away

Use **H3 res 7** (default). Res 8 is too big and can time out; satellite is coarser than res 8 anyway.

```bash
# Hero city
python scripts/04_gee_export.py --mode grid --cities korba --h3-res 7

# Zero-station reveal — MUST HAVE
python scripts/04_gee_export.py --mode grid --cities jagdalpur --h3-res 7

# If time
python scripts/04_gee_export.py --mode grid --cities raipur --h3-res 7
```

Do **not** sit and watch. Start these, then do Step 4 (landuse).

**Download into same folders:**

```
data/satellite/aod/korba/
data/satellite/aod/jagdalpur/
data/satellite/no2/korba/
data/satellite/no2/jagdalpur/
data/satellite/so2/korba/
data/satellite/so2/jagdalpur/
```

**Done when:**

- [ ] Korba grid CSVs for aod (required by verify) + preferably no2/so2
- [ ] Jagdalpur grid CSVs for aod (required) + preferably no2/so2
- [ ] Files are under the correct city folders (not left only in Drive)

---

### STEP 4 — Dynamic World land use = construction proxy ⏱️ queue + 20 min download

This is the free alternative for **C2 construction permits**.

```bash
python scripts/04_gee_export.py --mode landuse --cities korba --h3-res 7
python scripts/04_gee_export.py --mode landuse --cities jagdalpur --h3-res 7
python scripts/04_gee_export.py --mode landuse --cities raipur --h3-res 7
```

Exports **2021** and **2024** built / bare / trees / etc. fractions per H3 cell.

**Download to:**

```
data/landuse/korba/
data/landuse/jagdalpur/
data/landuse/raipur/
```

**How the team will use it later (you can note this):**

- `built_2024 - built_2021` → new built-up ≈ construction growth  
- Spike in `bare` near built-up → active cleared sites  
- Optional: NDVI drop is corroboration (not required in this script)

**Done when:**

- [ ] At least Korba 2021 + 2024 landuse CSVs in `data/landuse/korba/`
- [ ] Jagdalpur landuse if grid jobs finished

---

### STEP 5 — Optional SO₂ hotspot summary for Person 1’s registry ⏱️ ~30–60 min

If SO₂ grid data is in, help Person 1:

1. Per city, find cells with **persistently high** mean SO₂ (top percentile).
2. Export a simple CSV:

```
data/sources/s5p_so2_hotspots.csv
```

Suggested columns: `city_id, cell_id, lat, lon, so2_mean, year`

Person 1 merges these into `industry_registry.geojson` with `source=s5p_so2`.

- [ ] (Optional) SO₂ hotspot CSV shared with Person 1

---

### STEP 6 — Optional night-lights activity proxy (stretch only)

Only if GEE exports are green and you have spare time:

- VIIRS night-time lights near roads / industry = activity proxy for traffic + diesel narratives.
- Can be a short GEE notebook export; not required for `99_verify.py`.

Do **not** let this delay AOD/grid/landuse.

---

### STEP 7 — Sanity + handoff

```bash
python scripts/99_verify.py
```

Verify cares most about:

- [ ] `Satellite AOD` present for Korba + Jagdalpur (required)
- [ ] NO₂ / SO₂ / Land use show OK or optional yellow (still collect them for the demo story)

**Message the team:**

```
Person 2 DONE checklist:
- GEE authenticated [yes/no]
- stations export downloaded: korba [yes/no]
- grid export downloaded: korba + jagdalpur [yes/no]
- landuse (Dynamic World): korba [yes/no]
- folders: data/satellite/{aod,no2,so2}/ and data/landuse/
```

---

## Recommended order of cities

1. **Korba** stations → Korba grid → Korba landuse  
2. **Jagdalpur** grid → Jagdalpur landuse  
3. **Raipur** if time  
4. Bhilai / Bilaspur only if Day 5 is green  

---

## Timebox rules

| Task | Max wait | If stuck |
| --- | --- | --- |
| GEE approval | Parallelize; don’t block whole team | Person 1 & 3 keep working |
| Stations export | 1 h | Check EE_PROJECT + authenticate |
| Grid export | Overnight OK | Keep res 7; fewer years if needed: `--years 2022 2023` |
| Landuse | After grid queued | Landuse is smaller; still queue early |
| Res 8 grid | **Don’t** | False precision + timeouts |

---

## Folder map (where files must end up)

```
data/satellite/
  aod/korba/          *.csv
  aod/jagdalpur/      *.csv
  no2/korba/          *.csv
  no2/jagdalpur/      *.csv
  so2/korba/          *.csv
  so2/jagdalpur/      *.csv
data/landuse/
  korba/              airsight_landuse_korba_2021.csv, ..._2024.csv
  jagdalpur/
  raipur/
```

Leaving files only in Google Drive = **not done**.

---

## Do NOT collect (not your job)

- Open-Meteo / GPPD → Person 1  
- TomTom traffic loop → Person 3  
- Re-downloading EDGAR / FIRMS / WorldPop / CPCB  
- Construction permit PDFs from municipal sites (time sink; we use Dynamic World)

---

## Quick commands cheat sheet

```bash
# Auth
earthengine authenticate
# PowerShell:
$env:EE_PROJECT = "your-project-id"

# Fast proof
python scripts/04_gee_export.py --mode stations --cities korba

# Spatial + reveal
python scripts/04_gee_export.py --mode grid --cities korba jagdalpur --h3-res 7

# Construction proxy
python scripts/04_gee_export.py --mode landuse --cities korba jagdalpur --h3-res 7

# Status
python scripts/99_verify.py
```
