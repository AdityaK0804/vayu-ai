# Vayu / AirSight — Full Architecture & Stack

**Product:** Vayu.AI — multi-agent air-quality intelligence for Chhattisgarh  
**Team:** NexGen  
**Repo:** local `airsight-data` · remote `https://github.com/AdityaK0804/vayu-ai.git`  
**Purpose of this doc:** research map of what the project is, how layers connect, and what technologies are in play.

---

## 1. What the product does

Vayu is a **command-centre + citizen layer** for regional air quality:

| Capability | Description |
|------------|-------------|
| Live risk map | District choropleth + city markers for Chhattisgarh (MapLibre + deck.gl) |
| City forecast | H3 hex PM2.5 field up to **72h** |
| CPCB-first AQI | Official PM2.5 → CPCB NAQI sub-index + continuous colour ramp |
| Zero-station | Model coverage where no CPCB station exists (satellite / met / emissions) |
| Source attribution | SHAP-style shares: industry / traffic / fire / dust (+ EDGAR cross-check) |
| Interventions | Ranked cities/wards, schools exposed, remedy playbooks |
| Citizen advisory | EN/HI health messaging |
| Bilingual alerts | Preview of WhatsApp / channel-style alerts |
| Demo admin gate | UI-only role split (citizen vs enforcement) — **not real auth** |

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
|                         DATA SOURCES                            |
|  CPCB/OpenAQ · Open-Meteo/CAMS · Sentinel-5P/MODIS · EDGAR     |
|  WorldPop · OSM · GPPD · FIRMS · TomTom (optional) · GEE        |
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
|                    PYTHON PIPELINE (scripts/)                     |
|  fetch → clean → H3 harmonize → train (LGBM/CatBoost) → bake    |
|  outputs: metrics, forecasts, districts GeoJSON, interventions  |
└────────────────────────────┬────────────────────────────────────┘
                             │ static JSON / parquet under
                             │ data/  +  web/public/data/
                             ▼
┌──────────────────────┐    ┌─────────────────────────────────────┐
|  FastAPI (api/)      |    |  Next.js 14 dashboard (web/)          |
|  optional live API   |◄──►|  React · MapLibre · deck.gl · Zustand|
|  uvicorn :8000       |    |  TanStack Query · Magic UI motion     |
└──────────────────────┘    └─────────────────────────────────────┘
                             │
                             ▼
                    Browser :3000 / :5000
                    Landing + /dashboard
```

**Design principle:** Many UI numbers are **baked** from the ML pipeline into static JSON so the demo runs without a heavy backend. Live hooks (OpenAQ, etc.) can refresh when available.

---

## 3. Repository layout

| Path | Role |
|------|------|
| `web/` | Next.js 14 app (landing + command centre) |
| `web/app/` | App Router pages, theme, global CSS |
| `web/components/` | UI: dashboard, site/landing, charts, magicui |
| `web/lib/` | Data hooks, AQI scales, auth store, i18n, types |
| `web/public/data/` | Baked JSON the UI fetches (districts, forecasts, live snapshots) |
| `api/` | FastAPI entry (`main.py`) for optional live/serving endpoints |
| `scripts/` | Data collection, processing, model training, bake jobs |
| `src/` | Python package (`airsight` / shared libs) |
| `data/` | Raw + processed datasets (often large; may be gitignored) |
| `config/` | Cities, stations, pipeline config |
| `tests/` | Pytest suite for loaders / grid utils |
| `docs/`, `Vayu_Project_Document.md`, `RUN_NOW.md` | Narrative + operator docs |

**Branches commonly used:** `frontend` (UI), `backend`, `main`.

---

## 4. Frontend stack (`web/`)

### Core
| Tech | Version (approx) | Use |
|------|------------------|-----|
| **Next.js** | 14.2 | App Router, SSR/CSR hybrid |
| **React** | 18.3 | UI |
| **TypeScript** | 5.5 | Types |
| **Tailwind CSS** | 3.4 | Utility styling + Magic UI |
| **Zustand** | 4.5 | Client state (theme, view, city, selection) |
| **TanStack Query** | 5.51 | Server/baked data fetching + cache |

### Maps & viz
| Tech | Use |
|------|-----|
| **MapLibre GL** + **react-map-gl** | Vector basemap (OpenFreeMap / MapTiler / Esri hybrid) |
| **deck.gl** | District GeoJSON layer, H3 hex layer, scatter/text |
| **@visx/** | Charts (analytics, proof panels) |
| **d3-array** | Chart domain helpers |

### UI / motion
| Tech | Use |
|------|-----|
| **motion** (Framer Motion) | MagicCard, NumberTicker, ScrollVelocity, particles |
| **Radix** (accordion, label, slot) | Tree nav, form primitives |
| **lucide-react** | Icons |
| **class-variance-authority / clsx / tailwind-merge** | Component variants |
| **Magic UI-style components** (in-repo) | MagicCard, File Tree, NumberTicker, ScrollVelocity, Particles, Shiny buttons |

### Fonts (next/font)
| Role | Face |
|------|------|
| Display | **Outfit** |
| Body / UI | **Plus Jakarta Sans** |
| Mono / data | **JetBrains Mono** |

### Auth (demo only)
- `web/lib/auth.ts` — Zustand role `citizen` | `admin`
- Credentials **in client bundle** (documented as non-secure UI gate)

### i18n
- `web/lib/i18n.tsx` — EN / HI string table + toggles

### Design tokens
- `web/app/theme.css` — colours, AQI CSS vars, `--eyebrow` (section labels)
- `web/app/dashboard.css` — command centre layout
- `web/app/site.css` — landing chrome

---

## 5. Backend / ML stack

### API
| Tech | Use |
|------|-----|
| **FastAPI** | HTTP API |
| **Uvicorn** | ASGI server (often `:8000`) |

### Data & geo
| Tech | Use |
|------|-----|
| **pandas / numpy / pyarrow** | Tables, parquet |
| **h3** | Hexagonal spatial index (~1 km class grids) |
| **geopandas / rasterio** | Vector/raster IO |
| **xarray / netCDF4** | Gridded met/satellite |
| **PyYAML** | Config |

### Models
| Tech | Use |
|------|-----|
| **LightGBM** | Gradient boosting (horizons) |
| **CatBoost** | Ensemble / champion path |
| **scikit-learn** | Metrics, splits, utilities |
| **SHAP** | Feature / source attribution |
| **joblib** | Model serialize |

### External data APIs (pipeline)
- Google **Earth Engine** (satellite exports)
- **Open-Meteo** / CAMS
- **OpenAQ** / CPCB station series
- **TomTom** traffic (optional long-running sampler)
- NASA **FIRMS** fires
- **EDGAR**, WorldPop, OSM, GPPD

---

## 6. Key frontend routes & views

| Route | Content |
|-------|---------|
| `/` | Landing: hero, city index, platform features, live preview map, flow, bilingual alerts, NexGen team, CTA |
| `/dashboard` | Command centre shell |
| `/live-cities`, `/platform`, `/how-ai-works` | Supporting marketing pages |

### Dashboard views (`ViewId`)
- **MONITOR:** map, analytics, overview, forecast  
- **ACT:** advisories (public), interventions + alerts (**admin**)  
- **SYSTEM:** network, reports (**admin**)

---

## 7. Map stack details

```
Basemap (MapLibre style URL or inline Esri raster)
    └── deck.gl MapboxOverlay
            ├── GeoJsonLayer  → districts (PM2.5 continuous CPCB colour)
            ├── ScatterplotLayer → cities / stations
            └── H3HexagonLayer → city forecast cells (MapCanvas)
```

**Basemap modes:** Dark · Streets · Satellite (hybrid)  
**AQI module:** `web/lib/aqiScale.ts` — `cpcbAqiFromPm25`, `cpcbPm25Color`, legends  
**Preview map:** `DashboardFrame` uses `interactive={false}` so page scroll is not stolen.

---

## 8. Data flow (UI)

1. Bake scripts write JSON under `web/public/data/` (e.g. `cg_districts.json`, city forecasts, metrics, interventions).
2. Hooks in `web/lib/data.ts` / `districts.ts` `fetch` those files (React Query).
3. Components render maps/charts; optional live endpoints override when backend is up.
4. Chatbot can answer from baked context + optional Gemini if key present.

---

## 9. Security & demo notes

| Topic | Reality |
|-------|---------|
| Admin login | **UI gate only** — secrets in client |
| Enforcement data | Hidden by role in UI; not server-enforced in demo |
| `.env` | API keys for Gemini, TomTom, OpenAQ, MapTiler — never commit real secrets |
| MapTiler | Optional `NEXT_PUBLIC_MAPTILER_KEY`; free basemaps work without it |

---

## 10. Local run (quick)

```bash
# Web
cd web
npm install
npm run dev -- -p 5000
# → http://localhost:5000

# Optional API
cd ..
python -m uvicorn api.main:app --reload --port 8000
```

See also `RUN_NOW.md` for Windows operator steps and model proof commands.

---

## 11. Research angles / next upgrades

1. **True auth** — server sessions; protect intervention/alert APIs.  
2. **Zoom-dependent layers** — districts far out → H3/heatmap near.  
3. **Raster PM2.5 tiles** — smoother continuous field.  
4. **Official multi-pollutant NAQI** — max of sub-indices, not PM2.5-only.  
5. **Realtime OpenAQ polling** on a cron + cache.  
6. **Mobile-first interventions** — already cleaned cards; push notifications.  
7. **Observability** — Sentry + pipeline data freshness badges.  
8. **Tests** — Playwright for map/login; expand pytest on bake contracts.

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| **H3** | Uber hexagonal hierarchical spatial index |
| **CPCB** | Central Pollution Control Board (India) |
| **NAQI** | National Air Quality Index |
| **CAMS** | Copernicus Atmosphere Monitoring Service |
| **LOSO** | Leave-one-station-out validation |
| **SHAP** | Explainable ML attributions |
| **Bake** | Precompute JSON/artifacts for the static demo UI |

---

*Generated for NexGen research use. Update this file when stack or pipeline contracts change.*
