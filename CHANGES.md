# Backend P0 changes

Scope: the P0 items from the 20 Oct 2026 audit (`AUDIT.md`, `AUDIT_REPORT.md`).
The baseline is the first commit in this repo ("baseline: vayu-ai as received").
Run `git diff HEAD~1` to see every change. The frontend (`web/`) is untouched.

## Summary

| Area | What changed |
|---|---|
| API surface | Only **v2** is served. v0 root routes (`/health`, `/cities`, `/stations`, `/metrics/*`, `/panel/*`, `/attribution/*`) are removed. `/api/v1/*` now returns **410 Gone** with the standard error body. `api/live.py` and `api/schemas_agents.py` are deleted. There is one health endpoint, `GET /api/v2/health`, and one cities endpoint, `GET /api/v2/cities`. |
| Ported from v1 | `POST /api/v2/advice` (EN/HI health advice, defaults to the city's current AQI), `POST /api/v2/scenarios` (what-if), `GET /api/v2/alerts`, `POST /api/v2/admin/alerts`. Alerts are stored in the main database, so Redis and Timescale are no longer needed. The LangGraph `/agents/analyze` route, which could train a model inside a request, was dropped. |
| Auth | `POST /api/v2/admin/refresh`, `POST /api/v2/admin/alerts` and `GET …/surface?rebuild=true` require `Authorization: Bearer <token>` or `X-API-Key: <token>`. Tokens come from `VAYU_ADMIN_TOKENS` (comma-separated, minimum 24 characters, compared in constant time, key fingerprint logged). If no token is configured, admin endpoints are **disabled (503)**, never open. |
| CORS | Exact allowlist from `CORS_ALLOW_ORIGINS`. Wildcards are rejected, `allow_credentials=False`, methods are limited to GET/POST/OPTIONS. The old `https://.*\.vercel\.app` + credentials regex is gone. |
| AQI | One method: **CPCB NAQI** with the official windows. PM2.5/PM10/NO₂/SO₂/NH₃ use the 24 h mean. O₃/CO use the **maximum 8 h rolling mean within 24 h** (previously this was only a trailing 8 h mean). Windows need ≥50% coverage. Irregular rows are put on a gap-aware hourly grid (`hourly_grid`), so "24 h" means 24 clock hours, not 24 rows. Responses carry `aqi_basis` and `cpcb_valid` (≥3 pollutants including PM). Forecast AQI is the PM2.5 sub-index of the **24 h rolling mean** (observed history plus forecast), not of a single hour. `/air/point` uses the same rolling windows. Measured (OpenAQ) rows get their AQI from stored station history, not from one reading. |
| US AQI removed | `us_aqi`/`european_aqi` are no longer requested from Open-Meteo. `scripts/live/fetch_live.py`, `fetch_live_stations.py`, `scripts/bake/bake_districts.py` (which used US EPA breakpoints), `bake_advisories.py` and `bake_city_forecasts.py` now emit CPCB `aqi` + `aqi_basis`. `grep -ri us_aqi` over the backend Python returns nothing. |
| Errors | `api/errors.py` gives every error the envelope `{"error": {"code", "message", "request_id", "details?"}}`, and every response carries an `X-Request-Id` header. Unhandled exceptions return a generic 500. Upstream, DB and model failures return 503 with friendly text. Validation errors return 422 with a field list. Nothing includes exception text, DSNs, hosts or paths, and full tracebacks are logged server-side under the request id. Health no longer exposes `db_path` or ingest error details. Admin refresh returns a sanitised summary. |
| Optional libs | The API imports without langgraph, torch or redis. Postgres (`psycopg`) is imported only when `DATABASE_URL` is set. APScheduler isn't needed, because the scheduler is a stdlib loop. `sys.exit()` in `pipeline/run_korba_experiment.py` now raises `FileNotFoundError`. The `io/edgar.py` and `io/population.py` imports were already guarded and are unchanged. |
| DATA-01 (silent empty features) | `scripts/features_v2.py` now also handles `wind_dir`/`wind_speed_ms`. `build_feature_frame` logs any feature that is entirely empty. `feature_matrix()` raises `EmptyFeatureError` when a required feature, or more than 50% of the features, is entirely missing, instead of quietly filling zeros. In the live forecast path, `registry.predict_frame` raises `MissingFeaturesError` above 50% missing, so the forecast falls back to CAMS for that horizon. Missing features are reported in `forecast.inputs.missing_features`. |
| DATA-03 (stale fires as live) | v2 `live/fires.fetch_fires` drops detections older than the request window +6 h (`drop_stale_fires`). In the legacy `services/ingestor/sources.py`, the local CSV fallback returns only rows from the last 48 h. The CSV is a 2021 archive, so in practice it returns nothing and says "archive only". |
| DATA-05 (satellite QA) | `scripts/04_gee_export.py` applies `apply_qa()` before any mean. S5P NO₂/SO₂ are masked on `cloud_fraction < 0.3`. MODIS MCD19A2 is masked on `AOD_QA` (cloud mask = clear, QA = best) and the ×0.001 scale is applied. `io/satellite.load_satellite` also scales unscaled AOD exports, masks physically implausible values and de-duplicates `(cell_id, date)` rows (DATA-13). |
| Database | `Store` uses **Postgres when `DATABASE_URL=postgresql://…`** is set and falls back to SQLite (`VAYU_DB_PATH`, default `data/vayu.db`). A small adapter maps `?` → `%s`, `IS ?` → `IS NOT DISTINCT FROM`, `REAL` → `DOUBLE PRECISION`, `AUTOINCREMENT` → `BIGSERIAL` and `lastrowid` → `RETURNING id`, and creates the schema on first connect. New tables: `alerts`. New index on `ingest_log(source, status, finished_at)`. |
| Freshness | `Store.source_freshness()` reports, per source (`cams`, `openaq`, `met`, `forecast`, `fires`), the newest data timestamp, last successful sync, age in hours and `stale` against per-source limits (3 h; fires 6 h, judged on last sync because zero fires is valid). It is exposed as `freshness` on `/health` (`freshness.sources`), `/cities`, `/cities/{id}`, `/cities/{id}/forecast`, `/cities/{id}/surface` and `/fires`. `/health.status` is `ok`, `stale` or `empty`. |
| Hourly job | `src/airsight/live/jobs.py` covers ingest → surfaces → forecasts, plus an ingest-log entry for forecasts. `python -m airsight.live.jobs once` is cron-ready (exit 0/1). `python -m airsight.live.jobs schedule` is a long-running worker that runs at minute `VAYU_INGEST_MINUTE` (UTC) every hour and once at start-up, and handles SIGTERM. A process lock prevents overlapping runs, and `admin/refresh` returns 409 while a run is in progress. `scripts/cron/hourly_ingest.sh` wraps the job for crontab. `admin/refresh` calls the same `run_cycle`. |
| Misc | `/air/point` cache is a bounded LRU+TTL (1,024 entries, 10 min) instead of an unbounded dict, and it is cleared after a refresh. OpenAPI docs moved to `/api/v2/docs`. API version is 4.0.0. |

## Endpoint map (old → new)

| Old | New |
|---|---|
| `GET /health`, `/api/v1/live/health`, `/api/v1/agents/health` | `GET /api/v2/health` |
| `GET /cities`, `/stations` | `GET /api/v2/cities`, `GET /api/v2/cities/{id}` (includes `stations`) |
| `/api/v1/live/snapshot`, `/stations`, `/fires`, `/meteo`, `/cams`, `/stream` | `GET /api/v2/cities`, `/cities/{id}`, `/fires`, `/cities/{id}/forecast` |
| `POST /api/v1/alerts/inject` (no auth) | `POST /api/v2/admin/alerts` (token) |
| `GET /api/v1/alerts/recent` | `GET /api/v2/alerts` |
| `POST /api/v1/agents/advisory` | `POST /api/v2/advice` |
| `POST /api/v1/agents/whatif` | `POST /api/v2/scenarios` |
| `POST /api/v1/agents/analyze`, `/api/v1/alerts/watch`, `/api/v1/ui/toast`, `/metrics/*`, `/panel/*`, `/attribution/*` | Removed (P2 adds `/cities/{id}/attribution` and `/priorities` for the redesign) |

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | unset | `postgresql://user:pass@host:5432/db`. When unset, SQLite is used. |
| `VAYU_DB_PATH` | `data/vayu.db` | SQLite file (local dev only). |
| `VAYU_ADMIN_TOKENS` | unset (admin disabled) | Comma-separated admin tokens, each ≥24 characters. List two while rotating. |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact browser origins. No wildcards. |
| `OPENAQ_API_KEY` | unset | Measured CPCB stations via OpenAQ. |
| `FIRMS_MAP_KEY` | unset | NASA FIRMS live fires. Without it, fires stay empty and are reported stale. |
| `VAYU_INGEST_MINUTE` | `7` | Minute past the hour (UTC) for the scheduler. |
| `LOG_LEVEL` | `INFO` | Server log level. |
| `PORT` | `8000` | API port inside the container. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `vayu` / required / `vayu` | docker compose only. |

## Run locally

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-backend.txt pytest httpx
export PYTHONPATH=$PWD:$PWD/src
export VAYU_ADMIN_TOKENS=$(python -c "import secrets;print(secrets.token_urlsafe(32))")
python -m airsight.live.jobs once                 # fill the SQLite store (about 30 s for 9 cities)
uvicorn api.main:app --reload --port 8000         # http://localhost:8000/api/v2/docs
python -m pytest -q                               # 82 passed, 1 skipped (Postgres integration)
```

Trigger a refresh manually with:
`curl -X POST localhost:8000/api/v2/admin/refresh -H "Authorization: Bearer $VAYU_ADMIN_TOKENS"`

Run against Postgres with `export DATABASE_URL=postgresql://…`. The schema is created on first connect. To run the Postgres round-trip test, set `VAYU_TEST_DATABASE_URL`.

## Deploy

**Docker Compose (VM, Fly or Railway with Compose):**
```bash
cp .env.example .env    # set POSTGRES_PASSWORD, VAYU_ADMIN_TOKENS, CORS_ALLOW_ORIGINS, keys
docker compose up -d --build
curl localhost:8000/api/v2/health
```
This starts three services: `postgres` (volume `vayu_pg`, not published to the host), `api` (uvicorn), and `ingest` (the hourly worker, same image).

**Managed (Render, Railway, Fly) without Compose:**
1. Create a managed Postgres and set `DATABASE_URL`.
2. Web service: build from the `Dockerfile`, default command, health check path `/api/v2/health`.
3. Worker: same image, command `python -m airsight.live.jobs schedule`. Alternatively, use the platform's cron with `python -m airsight.live.jobs once` at `7 * * * *`.
4. Set `VAYU_ADMIN_TOKENS`, `CORS_ALLOW_ORIGINS=https://<your-frontend-domain>`, `OPENAQ_API_KEY` and `FIRMS_MAP_KEY`.
5. Point the Vercel `/backend-api` rewrite (`LIVE_API_PROXY`) at the API URL. This is a frontend change and is not made here.

**Plain cron on a host:** `7 * * * * cd /srv/vayu && ./scripts/cron/hourly_ingest.sh >> /var/log/vayu-ingest.log 2>&1`

## Known gaps / follow-ups

* **Postgres has not been run against a live server here.** No Postgres binary was available in the build sandbox. The adapter's translation is unit-tested, and an opt-in integration test (`VAYU_TEST_DATABASE_URL`) is included. Run it once before deploying.
* **No trained quantile models ship in the zip** (`outputs/models` has no `*.joblib`). Forecasts therefore run as `cams-direct` until you run `python -m airsight.models.registry` (training) as part of the job or once per deploy.
* GEE QA masks are code-reviewed against the product docs, but they were not executed (they need Earth Engine credentials). Existing satellite CSVs in `data/` predate the mask and should be re-exported.
* The H3 surface still colours cells by the hourly PM2.5 sub-index (labelled `aqi_basis: cpcb_pm25_subindex_hourly_estimate`). City numbers use full CPCB windows. The frontend should colour the map from the city `aqi` field so the colour matches the number.
* `services/ingestor` (Redis/Timescale poller) is no longer used by the API. Its DATA-03 bug is fixed, but the module can be deleted in P2. The same applies to `src/airsight/alerts/watcher.py` and `src/airsight/agents`.
* The frontend still calls `/api/v1/*` in `lib/data.ts` and `lib/liveClient.ts` (legacy dashboard), and it has hardcoded admin passwords in `lib/auth.ts`. Both belong to the frontend rebuild.
* P1 items not done: async endpoints, rate limiting, typed response models, CI.
* `data/vayu.db` (a runtime SQLite file) is git-ignored and was not part of the baseline commit.

## Postgres fixes found on Render + Supabase (staging)

Deployed `backend-p0-staging` to Render (free, Singapore) against Supabase Postgres
(session pooler, ap-south-1). `test_postgres_roundtrip` runs in the Render build step.

- **Registry seeding blocked by any existing city row.** `ingest_cities` only seeded
  `config/cities.yaml` when the `cities` table was completely empty, so the round-trip
  test's `pgtest` row stopped the real 28-district registry from ever loading
  (refresh ran on 1 fake city). It now seeds when no config-sourced city exists.
- **Round-trip test left fixture rows in the shared database.** `test_postgres_roundtrip`
  now deletes its `pgtest` city/observation/alert and `test` ingest-log rows in a
  `finally` block.
- **One weather failure dropped a whole city.** On Render's shared egress IPs
  Open-Meteo's weather API returns 429; `_ingest_city` fetched weather before storing
  anything, so every city failed and no air-quality rows were written. Weather is now
  best-effort: on failure the city's CAMS air-quality observations are still stored
  and the error is logged.
- **Refresh hung for minutes per city on remote Postgres.** The adapter ran in
  autocommit and sent every row of a bulk upsert as its own round trip; one city's
  surface snapshot is ~6,000 `hex_snapshot` rows, so with Render (Singapore) ->
  Supabase (Mumbai) latency the refresh never got past the first city. `Store.tx()`
  blocks now run in psycopg pipeline mode (statements queued, synced at COMMIT; reads
  and `RETURNING` sync immediately). A failing statement still rolls the whole
  transaction back. New test `test_postgres_bulk_snapshot_and_rollback`.

## Live sources: CPCB (data.gov.in), FIRMS, OpenAQ, weather, hourly refresh

- **CPCB real-time feed** (`airsight/live/cpcb.py`): data.gov.in resource
  `3b01bcb8-…` for all 14 Chhattisgarh CAAQMS stations, once per refresh, state-wide.
  The feed publishes 24 h min/max/avg **pollutant sub-indices** (e.g. CO "30" at a
  clean site); we invert the CPCB breakpoints to concentrations, store those
  (source `cpcb`, `ingested_at` = fetch time) and recompute the AQI with
  `cpcb_naqi` (>= 3 pollutants incl. PM). Stations are matched by CPCB name, then by
  coordinates. Registry: `config/cpcb_stations.csv` (built from
  `vayu-data/fetched/cpcb/cg_stations.csv`, mapped to our station ids). Endpoint,
  resource id, state, time zone and value kind are in `config/live_sources.yaml`.
  data.gov.in stalls requests with the default `python-httpx` User-Agent, so the UA
  is set from config.
- **Measured-first everywhere:** city summaries, surfaces and forecast anchoring
  prefer `cpcb`, then `openaq`, then CAMS. A CPCB row's AQI is used as published
  (already a 24 h average) instead of re-averaging hourly snapshots.
- **FIRMS:** VIIRS (SNPP, NOAA-20) + MODIS for the state bbox from config (was the
  union of city boxes). Needs `FIRMS_MAP_KEY`.
- **OpenAQ:** unchanged cross-check; every attempt (incl. "empty") now goes to
  `ingest_log` so freshness reflects it.
- **Weather:** one multi-point Open-Meteo request per refresh for all due cities,
  at most every `weather.min_interval_minutes` (180), with a 60 min back-off after a
  429. New `POST /api/v2/admin/ingest/weather` (admin token) accepts Open-Meteo JSON
  fetched elsewhere.
- **Hourly refresh:** `.github/workflows/vayu-hourly-refresh.yml` +
  `scripts/cron/gha_refresh.py` wake the API, push weather if stale, then call
  `/admin/refresh`.
- Health freshness gains a `cpcb` source; `met` stale threshold 3 h -> 6 h.
- Tests: `tests/test_live_sources.py`.
