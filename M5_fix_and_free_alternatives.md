# M5 fix + Free Alternatives for the "Not Available" Sources

## M5 — SOLVED with the file you have

Your `chhattisgarh.topo.json` is **TopoJSON** holding **5 divisions** (Bastar, Bilaspur,
Durg, Raipur, Surguja). geopandas can't read TopoJSON directly — **convert it to GeoJSON once**.
Tested on your actual file: it converts cleanly, geopandas reads it, CRS is correct, bounds
match Chhattisgarh. Your demo cities land like this:

| City | Division | (finer) District |
| --- | --- | --- |
| Korba | Bilaspur | Korba |
| Raipur | Raipur | Raipur |
| Bhilai | Durg | Durg |
| Bilaspur | Bilaspur | Bilaspur |
| Jagdalpur | Bastar | Bastar |

**Quick convert (run once):**
```python
import json, topojson, geopandas as gpd
raw = json.load(open("chhattisgarh.topo.json"))
obj = list(raw["objects"])[0]
gj = json.loads(topojson.Topology(raw, object_name=obj).to_geojson())
json.dump(gj, open("data/boundaries/cg_divisions.geojson", "w"))
print(gpd.read_file("data/boundaries/cg_divisions.geojson"))   # 5 rows, EPSG:4326
```
`pip install topojson` first.

**But divisions are coarse** — a division is huge, "Bilaspur division is polluted" isn't an
enforcement instruction. Use the `14_boundaries.py` script (in this delivery) which gets you
three tiers automatically: **divisions (you have) → districts (auto-download) → city wards
(OSM, where they exist).** Use the finest tier available per city; fall back gracefully.

**What to say if only coarse boundaries exist:** *"Ward aggregation is a shapefile swap — the
platform ingests ward boundaries wherever a municipality publishes them. We demonstrate at
district level."* That's honest and judges accept it.


## The principle for every "not free" source

> **Never leave it blank. Replace a paid/closed feed with a free proxy, then name the
> ingestion path.** "We don't have X, so we derive a proxy from Y, and the platform plugs in
> the real X feed where a city provides it" — that sentence wins more points than the real
> data would, because it shows systems thinking.


## M6 — CECB consent-to-operate (industrial register)

**Why it's hard:** Chhattisgarh Environment Conservation Board doesn't publish a clean
machine-readable industry list. **Don't scrape it under time pressure.** Build the registry
from free sources that are already in your kit + these additions:

### Free substitutes (use all three, layer them)
1. **GPPD (B3, you scripted it)** — every power plant near Korba, geolocated with capacity/fuel.
   Covers the biggest emitters directly (NTPC Korba, Korba complex).
2. **OSM industrial (B2, you scripted it)** — `landuse=industrial`, `man_made=works|chimney`.
   Free, gives polygons + points for factories and stacks.
3. **VIIRS/FIRMS thermal anomalies (M3, you have it)** — persistent night-time thermal hotspots
   over industrial zones ARE your "operating industry" signal. A cell that lights up on FIRMS
   month after month is an active thermal source. This is a clever, defensible proxy for
   "which registered industry is actually running."

### Optional free additions (only if ahead)
- **OpenInfraMap / OSM power** (`power=plant|generator|substation`) — same OSM pull, extra tag.
- **Sentinel-5P SO2 hotspots (B4)** — coal/smelting shows up as persistent SO2 columns.
  Cross-referencing an SO2 hotspot with an OSM industrial polygon = strong "this plant is
  emitting" evidence, entirely from free satellite.

**Registry you end up with:** merge GPPD points + OSM industrial polygons + FIRMS thermal
hotspots into one `data/sources/industry_registry.geojson` with a `source` column
(gppd / osm / firms_thermal / s5p_so2). That's your enforcement target list.

**Say on stage:** *"Consent-to-operate registers aren't openly machine-readable, so we build
the industrial source registry from power-plant databases, OSM industrial land use, and
satellite thermal + SO2 signatures — and the platform ingests the official CECB register
directly where the board shares it."*


## C1 — Historical traffic (already in your plan, restated)

**Not free anywhere** (TomTom Stats, Google, HERE all charge for history).

**Free substitute:** `traffic_index(cell, hour, dow) = road_density(cell) × diurnal_curve(hour, dow)`
where `road_density` is from OSM (B2) and `diurnal_curve` is calibrated from a few days of
**live** TomTom sampling (B5, free tier). Start B5 today — the curve needs wall-clock days.

**Extra free proxies you can layer in (no traffic API at all):**
- **OSM road density + class weighting** — highways carry freight, weight them heavier.
- **VIIRS night-lights near roads** — activity proxy.
- **Google/OSM POI density** — markets, schools, offices predict rush-hour load per cell.

**Say:** *"Historical probe data is commercial; we calibrate a diurnal traffic model from live
probe sampling and OSM road structure, and ingest municipal ANPR/probe feeds where available."*


## C2 — Construction permits

**Not open data** in Chhattisgarh.

**Free substitute — satellite change detection:**
- **Dynamic World** (`GOOGLE/DYNAMICWORLD/V1`, via GEE / B4) — compare the `built` class
  between two dates; new built-up area = construction activity. This is a real, defensible,
  free construction proxy.
- **Bare-soil fraction** from Dynamic World / Sentinel-2 — freshly cleared construction sites
  show as bare ground before building; a spike in bare-soil near built-up = active site.
- **NDVI drop** (vegetation removed) as a corroborating signal.

**Say:** *"Construction permits aren't open data, so we detect construction from satellite
land-cover change — and ingest permit feeds directly where a municipality publishes them."*


## Waste / garbage burning (PS names it; no dataset exists)

**Free substitutes:**
- **FIRMS/VIIRS low-FRP detections in residential/dump areas** — small persistent fires away
  from industry ≈ open waste burning. You already have FIRMS (M3).
- **OSM `landuse=landfill` / `amenity=waste_disposal`** — known dump sites as fixed hotspots.
- Combine: a low-intensity FIRMS cluster on/near an OSM landfill = waste-burning event.

**Say:** *"Waste-burning has no open feed; we infer it from low-intensity satellite fire
detections near mapped disposal sites."*


## Diesel fleet / ANPR movement

**Municipal-private.** Free substitute: OSM freight-road class weighting + industrial-zone
proximity + night-lights. **Say:** *"Designed as an ingestion point for municipal ANPR feeds;
demonstrated with road-network and activity proxies."*


## Real-time CAAQMS (PS suggests it)

You have historical CPCB. For a *live* touch in the demo: **OpenAQ v3** (B6, free API key)
gives current readings. Optional — historical CPCB is enough. Don't scrape CPCB live on stage.


## Summary — the "we cover everything" table for your deck

| PS-named source | Openly free? | What we actually use (all free) |
| --- | --- | --- |
| Monitoring stations | Yes | CPCB historical + OpenAQ live |
| Satellite | Yes | Sentinel-5P + MODIS AOD (GEE) |
| Meteorology forecast | Yes | Open-Meteo + CAMS |
| Emission inventory | Yes | EDGAR v8.1_AP |
| Industrial sources | Register not open | GPPD + OSM industrial + FIRMS thermal + S5P SO2 |
| Construction | Permits closed | Dynamic World built-up change + bare-soil |
| Waste burning | No feed | FIRMS low-FRP near OSM landfills |
| Traffic / mobility | History paid | OSM road density × live TomTom diurnal curve |
| Diesel/ANPR | Municipal-private | freight-road weighting + night-lights (ingestion-ready) |
| Ward boundaries | Partial | datameet divisions/districts + OSM wards |

**Every row is filled with a free method.** Nothing is left blank. That completeness — plus the
honesty about proxies — is a scoring asset, not a weakness.
