# Vayu 3-minute demo script (Phase 5.5)

**Runtime:** ~3 minutes · **URLs:** http://localhost:5000 · API http://localhost:8000

## 0. Prep (30s, before audience)
```bash
docker compose up -d
.venv-agents/Scripts/python.exe -m services.ingestor.main --once
.venv-agents/Scripts/python.exe -m uvicorn api.main:app --port 8000
cd web && npm run dev -- -p 5000
```

## 1. Landing (20s)
- Open `/` — AlertTicker, CPCB story, NexGen team.
- Click **Launch dashboard**.

## 2. Live map (45s)
- `/dashboard` Live Map — header should show `live N st · M fires`.
- Point out **teal pulsing stations** (live API) and **red fire markers** (FIRMS).
- Optional: `curl http://localhost:8000/api/v1/live/snapshot | head`.

## 3. What-if (45s)
```bash
curl -s -X POST http://localhost:8000/api/v1/agents/whatif \
  -H "Content-Type: application/json" \
  -d "{\"scenario\":{\"traffic_delta\":-0.3,\"ward\":\"Raipur-45\",\"city_id\":\"raipur\",\"ward_sprinkling\":true}}"
```
- Call out: `hex_deltas[]`, negative `delta_pm25`, `schools_protected_est`, `population_protected_est`.
- Narrative: “Cut traffic 30% + ward sprinkling → X schools / Y people protected.”

## 4. Advisory EN/HI (40s)
```bash
curl -s -X POST http://localhost:8000/api/v1/agents/advisory \
  -H "Content-Type: application/json" \
  -d "{\"city_id\":\"raipur\",\"pm25\":110,\"top_source\":\"traffic\",\"child\":true}"
```
- Show `mode: template` (works **without** LLM keys).
- Read one EN line + one HI line; point to WhatsApp preview fields.

## 5. Alert breach (30s)
```bash
curl -s -X POST http://localhost:8000/api/v1/alerts/inject \
  -H "Content-Type: application/json" \
  -d "{\"city_id\":\"raipur\",\"aqi\":320,\"pm25\":180,\"hours\":3}"
```
- Confirm Timescale `alert_events`, Redis `vayu:alerts:latest`, `GET /api/v1/ui/toast`.

## Close (10s)
- One line: DuckDB → STGNN → LangGraph agents → live Timescale/Redis → what-if + RAG + alerts.
