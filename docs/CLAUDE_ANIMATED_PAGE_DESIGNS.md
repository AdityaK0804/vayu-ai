# Vayu — Claude design brief for animated marketing pages

**Product:** Vayu (AI air-quality intelligence for Chhattisgarh)  
**Stack in app:** Next.js · dark/light · MapLibre/H3 · real baked metrics  
**Use this doc as the full prompt context when asking Claude to design or generate motion/UI.**

---

## Global design system (keep consistent)

| Token | Guidance |
|-------|----------|
| Mood | Dark-first smart-city ops room; calm teal/emerald accent; not neon cyberpunk |
| Accent | Teal / green gradient (`accent` → `accent-2`) — “clean air” |
| AQI colours | Green → yellow → orange → red → purple (official-ish AQI bands) |
| Type | Display headlines bold; mono for numbers (RMSE, AQI, µg/m³) |
| Motion | Prefer Framer Motion / CSS: fade-up, staggered reveals, soft path draws, number counters — **no** janky infinite spin |
| Truth rule | **Never invent metrics.** Use only numbers below. Map AQI is “air now”; RMSE is “model skill” |

### Real numbers to wire into designs

```
Stations: 14 · Station-hours: 285,522 · Features: 95 · Cities demo: Korba + Jagdalpur (+ Raipur, Bhilai, Bilaspur live)
24h RMSE: 13.26 µg/m³  |  +19% vs persistence  |  ~+48% vs CAMS  |  +1.8% vs our v1
48h RMSE: 14.67  ·  72h RMSE: 15.97
Zero-station LOSO: ~20.5 µg/m³ (vs CAMS ~26.7, +23%)
Quantile PICP: ~78–79% calibrated
Fire: FIRMS 1.18M detections 2021→2026
Hospitals in registry: 1,702  ·  Schools: 55,380
Korba H3 cells: ~8,360  ·  Forecast: +24 / +48 / +72 h
Languages: English + Hindi
```

### Cities to show

| City | Story |
|------|--------|
| **Korba** | Hero — power/coal industry, full stations + grid |
| **Raipur** | Capital, most stations |
| **Bhilai** | Steel plant |
| **Bilaspur** | Validation city |
| **Jagdalpur** | **Zero station** — model-only reveal |

---

# PAGE 1 — `/live-cities`

## Purpose
Answer: *“What is the air right now across Chhattisgarh cities?”*  
Entry to dashboard with real AQI/PM2.5 — including Jagdalpur predicted.

## Current page skeleton
- `PageHero` (“Five cities. One live view…”)
- `CityIndex` (city cards)
- Empty `WorkflowSlot` (placeholder for new design)

## Animated sections to design (top → bottom)

### 1A. Hero atmospheric strip (subtle loop)
- Soft particle / haze drift over a dark Chhattisgarh silhouette
- Live pulse: green “LIVE” pill + timestamp
- **Do not** flash fake AQI 300; use realistic monsoon/moderate range or “live feed”
- Micro-animation: each city name fades in left→right

### 1B. “Constellation of cities” map (hero visual)
**Animation story (3–4s loop or scroll-triggered):**
1. Outline of Chhattisgarh draws on
2. Five city nodes pop in with AQI colour rings
3. Pulse radius = severity (subtle)
4. Jagdalpur node uses **dashed ring** + label “NO SENSOR · MODEL”
5. Click/hover (in final web): card focus; in design: show one expanded tooltip

**Data on nodes:** City name · PM2.5 · US AQI · Measured vs Model badge

### 1C. City cards row (replace static list feel)
Each card animated entrance (stagger 80ms):
- Left colour bar = AQI band
- Big mono AQI number **counting up** once on enter
- Sparkline of last 24h (placeholder waveform OK in design; real data later)
- Footer chips: `CPCB` or `MODEL` · station count

**Korba card** special: small industry icon  
**Jagdalpur card** special: reveal animation — grey “blind” → colour fill (“AI fills the gaps”)

### 1D. Compare strip
Horizontal animated bars: 5 cities PM2.5 side-by-side  
Caption: “Same hour · same pipeline · different cities”

### 1E. CTA band
“Open Live Map” → `/dashboard`  
Secondary: “See how AI predicts Jagdalpur” → `/how-ai-works`

## Motion dos / don’ts
- Do: number counters, staggered cards, map node pulse  
- Don’t: spinning globes, fake “98% accuracy”, stock city skylines that aren’t CG  

## Claude prompt starter (Live Cities)
> Design a dark smart-city marketing page section for Vayu “Live Cities”. Show 5 Chhattisgarh cities as glowing nodes on a state map. Jagdalpur has a dashed ring labeled “no sensor · model predicted”. City cards with AQI colour bars and count-up numbers. Real metrics only: 14 stations, 72h forecast capability. Style: teal accent, mono figures, subtle particle haze. Provide Framer Motion animation sequence description and layout wireframe for desktop + mobile.

---

# PAGE 2 — `/how-ai-works`

## Purpose
Answer: *“How does the model go from raw data to action without hallucinating?”*  
This is the **technical excellence / trust** page for judges.

## Current skeleton
- `PageHero`
- `FlowSteps` (3 steps: ingest → ML → act)
- Empty `WorkflowSlot`

## Animated sections to design

### 2A. Hero: “Signal → Intelligence → Action”
Three-word morph animation:
`SIGNAL` → `FORECAST` → `ACTION`  
With small icons: satellite dish · brain · clipboard

### 2B. Full pipeline (horizontal desktop / vertical mobile) — **main piece**

**7 animated stages** (not just 3) — expand FlowSteps:

| # | Stage | Visual animation | Real detail to show |
|---|--------|------------------|---------------------|
| 1 | Ground stations | Points blink on map | 14 CPCB / OpenAQ |
| 2 | Weather + CAMS | Wind arrows + layer fade | Open-Meteo, CAMS @ t and t+h |
| 3 | Satellite | Swipe overlay AOD/NO2/SO2 | Sentinel-5P, MODIS |
| 4 | Fire (FIRMS) | Small heat dots appear | 1.18M fire detections |
| 5 | H3 grid | Hex mesh tiles onto city | Korba ~8,360 cells |
| 6 | Models | Branch into 3 trees labeled +24 +48 +72 | LightGBM log1p · 95 features |
| 7 | Outputs | Cards fly out | Forecast · Attribution · Dossier · Advisory |

**Connector:** dashed path with light traveling left→right (or top→bottom).

### 2C. Model truth panel (animated counters)
When section enters viewport, counters animate to:
- RMSE 24h **13.26**
- vs persistence **+19%**
- vs CAMS **~+48%**
- Zero-station **20.5**
- Features **95**
- Train rows **285,522**

Subtitle: “Held-out time-ordered test · never shuffled · real CPCB labels”

### 2D. “One cell story” interactive diagram (design as scroll frames)
Single H3 hex in centre. On scroll/time:
1. Empty hex  
2. Weather vectors attach  
3. Fire FRP badge  
4. PM lag bars  
5. Model outputs P10–P50–P90 band  
6. Pie split: industry / traffic / fire / dust  
7. Upwind plant name label  

### 2E. Zero-station reveal (Jagdalpur)
Split screen animation:
- Left: “No CAAQMS” grey  
- Right: colour grid fades in  
Caption: “LOSO ~20.5 µg/m³ · beats CAMS ~23%”

### 2F. Agents strip (PS5 multi-agent story)
Five agent chips that light in sequence:
**Forecast · Attribution · Enforcement · Comparative · Citizen Advisory**  
Supervisor pulse in centre (LLM routes; tools compute numbers)

### 2G. Honest limits strip (builds trust)
Small “we say this first” cards fade in:
- Attribution = prioritisation, not court guilt  
- EDGAR = annual sector mix  
- Live AQI ≠ model RMSE  

## Claude prompt starter (How AI Works)
> Design an animated explainer page for Vayu “How the AI Works”. Pipeline of 7 stages from CPCB+satellite+FIRMS fire into H3 grid into LightGBM +24/48/72h models into dossiers. Show real metrics: RMSE 13.26 @24h, +19% vs persistence, 95 features, 285k station-hours, Jagdalpur zero-station reveal. Motion: scroll-driven path, staggered stage cards, number counters. Dark ops-room aesthetic, teal accent. Deliver section list + Framer Motion timeline + mobile stacking.

---

# PAGE 3 — `/platform`

## Purpose
Answer: *“What product modules does a city admin get?”*  
Product/feature page — control room story, not pure ML theory.

## Current skeleton
- `PageHero`
- `FeatureGrid` (6 feature cards)
- Empty `WorkflowSlot`

## Animated sections to design

### 3A. Hero: Control-room mock (tilted device)
- Browser frame (like landing preview) but **fuller**
- Default view: **Live Map** hex heat (not analytics charts)
- Soft float / parallax on scroll
- Badge: “Offline bake · Online read · Demo-safe”

### 3B. Module orbit or tab theatre
Six modules as animated panels (cycle or click in design):

| Module | Animation idea | Real hook |
|--------|----------------|-----------|
| Live Map | Hexes colour-wash | 8,360 Korba cells |
| AI Forecast | Timeline scrub 0→72h | RMSE proof strip |
| Attribution | Pie expands industry-heavy for Korba | SHAP + EDGAR |
| Enforcement | Dossier card slides in | Signal→dossier seconds |
| Citizen Advisory | Hospital + school icons count up | 68 hospitals / 2,428 schools Korba district |
| Proof / Analytics | Bars grow: model < persistence < CAMS | Real RMSE |

### 3C. “Day in the life” storyboard (4 frames, auto-advance)
1. **Morning:** Live AQI map, Korba moderate  
2. **+24h forecast:** band P10–P90 appears  
3. **Attribution:** “Industry upwind · plant name”  
4. **Action:** Inspector dossier + school/hospital advisory  

### 3D. Feature bento grid (upgrade static FeatureGrid)
Bento layout with one large “map” tile + smaller tiles  
Hover: slight lift + accent border  
Icons already defined: map, measured, 72h, source, satellite zero-station, dossiers  

### 3E. Stack + free tier honesty
Animated logos row: CPCB · Open-Meteo · CAMS · Sentinel · FIRMS · EDGAR · WorldPop · OSM  
Caption: “₹0 proprietary data · config-driven cities.yaml”

### 3F. Dual CTA
Primary: Launch dashboard  
Secondary: Citizen advisory  
Tertiary: How AI works  

## Claude prompt starter (Platform)
> Design Vayu “Platform” product page. Control-room browser mock with live H3 map. Bento feature grid for: live surface, 72h forecast, SHAP attribution, enforcement dossiers, citizen advisory (hospitals+schools), proof metrics. Include day-in-the-life 4-frame storyboard animation. Use real stats: 8360 cells Korba, RMSE 13.26, 14 stations, EN+HI. Dark teal smart-city UI. Output desktop wireframes + motion notes for Framer Motion.

---

# Cross-page animation library (reuse)

| Motion primitive | Where |
|------------------|--------|
| `fadeUp` stagger | All heroes, cards |
| `countUp` mono numbers | RMSE, AQI, hospital counts |
| `pathDraw` | State outline, pipeline |
| `pulseRing` | Live cities, Jagdalpur |
| `hexFill` | Platform map, How-AI grid |
| `bandGrow` | P10–P90 uncertainty |
| `pieReveal` | Attribution |
| `marquee` (slow) | Data sources logos |
| `parallax` light | Hero backgrounds only |

**Performance:** Prefer CSS + Framer Motion; avoid heavy Lottie on every section. One Lottie max per page if needed.

---

# What Claude should output (ask for this structure)

For each page, ask Claude to deliver:

1. **Section list** (name + goal + scroll position)  
2. **Desktop layout wireframe** (ASCII or description)  
3. **Mobile stack order**  
4. **Animation timeline** (0–100% scroll or time in ms)  
5. **Exact copy** (headlines + body) using real metrics only  
6. **Component inventory** (what to build in React)  
7. **Assets needed** (state SVG, icons, no fake photos)  
8. **Data bindings** (`useLive`, `useMetrics('korba')`, advisories index, etc.)

---

# Master Claude system prompt (copy-paste)

```
You are designing marketing pages for Vayu, an AI air-quality intelligence platform
for Chhattisgarh (ET AI Hackathon PS5). Stack: Next.js, dark theme, teal accents.

REAL PRODUCT FACTS (do not invent numbers):
- 14 CPCB stations, 285,522 station-hours, 95 model features
- LightGBM (log1p) + CatBoost bake-off; horizons +24/+48/+72h
- 24h RMSE 13.26 µg/m³; +19% vs persistence; ~+48% vs bias-corrected CAMS
- Zero-station LOSO ~20.5 µg/m³; Jagdalpur has no ground sensor
- FIRMS fire 1.18M detections; H3 res-8 (~1km); Korba ~8360 cells
- Citizen advisory uses 1702 hospitals + 55380 schools by district
- Languages: English + Hindi; offline bake → online JSON for demo resilience

PAGES TO DESIGN:
1) /live-cities — live AQI across cities + Jagdalpur model reveal
2) /how-ai-works — data→H3→models→attribution→action pipeline + proof metrics
3) /platform — product modules control room (map, forecast, dossiers, advisory)

For each page produce: sections, wireframe, motion timeline, copy, React component list,
data hooks to bind. Motion should feel premium and calm, not flashy. Distinguish
live AQI (air now) from RMSE (model skill). No fake "94% accuracy".
```

---

# Priority if time is short

| Priority | Page | Highest-impact animation |
|---------:|------|---------------------------|
| 1 | How AI Works | 7-stage pipeline + metric counters |
| 2 | Live Cities | State map nodes + Jagdalpur reveal |
| 3 | Platform | Control-room mock + module theatre |

---

# After Claude designs — implementation order in this repo

1. Replace empty `WorkflowSlot` on each page with new sections  
2. Bind counters to `useMetrics` / `useLive` / advisories JSON  
3. Reuse existing `PlatformLivePreview` / `DashboardPreview` patterns  
4. Keep dashboard itself functional; marketing pages stay “story + CTA”

---

*This brief matches the current Vayu v2.1 codebase and baked metrics as of the full-fire retrain.*
