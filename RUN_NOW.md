# Run these commands now (Windows PowerShell)

Project root:

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
```

---

## 1. Python env + packages

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"

python -m pip install -r requirements.txt
python -m pip install -r requirements-backend.txt
python -m pip install catboost lightgbm shap joblib pyarrow
```

Quick check:

```powershell
python -c "import lightgbm, catboost, pandas, h3; print('lgb', lightgbm.__version__, 'cb', catboost.__version__)"
python scripts/models/print_proof.py
```

You should see v1 vs v2.1 RMSE table (24h model ~13.23, not AQI 28–50).

---

## 2. Start the web app (see dashboard)

Terminal A:

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data\web"
npm install
npm run dev
```

Open: http://localhost:5000

**Where model upgrade shows:** Analytics / Proof panel → RMSE @24h, “better than v1”, “better than persistence”.  
**Where live AQI shows:** map / city cards (can be 28–50 or lower in monsoon). That is **air**, not model skill.

Optional backend (only if UI needs API):

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
python -m uvicorn api.main:app --reload --port 8000
```

---

## 3. Optional: refresh live CAMS snapshot

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
python scripts/live/fetch_live.py
```

---

## 4. Download updated FIRMS (fire data) — you do this in browser

### Why
`fire_frp` is currently disabled (old archive ends mid-2024; test split needs coverage through late 2025). Without a full archive, fire cannot train cleanly.

### Steps
1. Open: https://firms.modaps.eosdis.nasa.gov/download/
2. Create/login NASA Earthdata account if asked.
3. Settings:
   - **Source:** VIIRS S-NPP and/or NOAA-20 (VIIRS)
   - **Area:** draw Chhattisgarh, or bbox  
     **West 80.2, South 17.8, East 84.4, North 24.1**
   - **Date range:** `2021-01-01` → today (or at least through `2025-12-31`)
   - **Format:** CSV
4. Download the CSV(s).
5. Save / replace as:

```text
C:\Users\akgam\Documents\ET GEN AI hack\airsight-data\data\fire\firms_chhattisgarh.csv
```

If you get multiple yearly files, keep them in `data/fire/` and tell me — we will merge them.

### After you drop the file, tell me or run:

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
python scripts/process_firms.py
# then I (or you) re-harmonize + retrain fire-aware model
```

---

## 5. Optional TomTom (traffic curve) — needs API key

```powershell
cd "C:\Users\akgam\Documents\ET GEN AI hack\airsight-data"
$env:TOMTOM_KEY = "YOUR_KEY_HERE"
python scripts/05_tomtom_sample.py --cities korba raipur --once
# leave running for days if you can:
python scripts/05_tomtom_sample.py --cities korba raipur --loop 30
```

---

## 6. Do NOT re-run full training unless we change data/code

Already done:

- `07_ensemble_proof.py` / `08_tighten_champion.py`
- `05_quantile_forecast.py`
- `bake_demo_data.py`

Only re-train after new FIRMS/traffic/landuse, or when I say so.

---

## Cheat sheet: what to look at for “did the model improve?”

| File / place | What it means |
|--------------|----------------|
| `python scripts/models/print_proof.py` | Official v1 → v2.1 RMSE table |
| `data/processed/MODEL_PROOF.md` | Written proof |
| `web/public/data/korba/metrics.json` | What the UI proof panel reads |
| Map AQI 28 / 50 | **Current air quality** — not model error |

**v2.1 proof (24h):** RMSE **13.23** (was **13.51**), **+19%** vs persistence, **+2.1%** vs v1, MAE **7.61** (was **8.06**).
