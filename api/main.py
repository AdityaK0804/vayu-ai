"""FastAPI Backend for AirSight.

Serves precomputed metrics, panel summaries, config data, and the
Phase-3 multi-agent analyze endpoint.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Ensure repo root + src are importable when launched as `uvicorn api.main:app`
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_ROOT / "src"))

from airsight.config import OUTPUTS, load_cities
from airsight.io.stations import load_stations
from api.live import router as live_router
from api.schemas_agents import AnalyzeRequest, AnalyzeResponse
from api.schemas_phase5 import AdvisoryRequest, AlertInjectRequest, WhatIfRequest

app = FastAPI(title="Vayu Air Quality Intelligence API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "https://vayu-ai-eosin.vercel.app",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(live_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "version": "2.1.0"}


@app.get("/cities")
def get_cities() -> list[dict[str, Any]]:
    return load_cities(include_optional=True)


@app.get("/stations")
def get_stations(city_id: str | None = None) -> list[dict[str, Any]]:
    df = load_stations(city_id=city_id)
    if df.empty:
        return []
    df = df.where(df.notna(), None)
    return df.to_dict(orient="records")


@app.get("/metrics/{city_id}")
def get_metrics(city_id: str) -> dict[str, Any]:
    """Merge and return all metrics files for a given city."""
    metrics_dir = OUTPUTS / "metrics"
    if not metrics_dir.exists():
        raise HTTPException(status_code=404, detail="Metrics directory not found")

    merged: dict[str, Any] = {}
    base_file = metrics_dir / f"{city_id}_baselines.json"
    if base_file.exists():
        with open(base_file) as f:
            merged["baselines"] = json.load(f)

    temp_file = metrics_dir / f"{city_id}_temporal.json"
    if temp_file.exists():
        with open(temp_file) as f:
            merged["temporal"] = json.load(f)

    static_file = metrics_dir / f"{city_id}_features_static.json"
    if static_file.exists():
        with open(static_file) as f:
            merged["features_static"] = json.load(f)

    if not merged:
        raise HTTPException(status_code=404, detail=f"No metrics found for {city_id}")
    return merged


@app.get("/panel/{city_id}/summary")
def get_panel_summary(city_id: str) -> dict[str, Any]:
    quality_file = OUTPUTS / "reports" / f"station_panel_{city_id}_quality.json"
    if not quality_file.exists():
        raise HTTPException(status_code=404, detail=f"Panel summary not found for {city_id}.")
    with open(quality_file) as f:
        return json.load(f)


@app.get("/attribution/{city_id}")
def get_attribution(city_id: str) -> dict[str, Any]:
    attr_file = OUTPUTS / "metrics" / f"{city_id}_attribution_vs_edgar.json"
    if not attr_file.exists():
        raise HTTPException(status_code=404, detail=f"Attribution metrics not found for {city_id}.")
    with open(attr_file) as f:
        return json.load(f)


def _json_clean(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _json_clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_clean(v) for v in obj]
    if hasattr(obj, "item"):
        try:
            return obj.item()
        except Exception:
            return str(obj)
    return obj


@app.post("/api/v1/agents/analyze")
def agents_analyze(
    body: AnalyzeRequest,
    include_state: bool = False,
) -> AnalyzeResponse:
    """Run Scout → Forecaster? → Policy for a city (LangGraph).

    Set ``include_state=true`` to embed the full agent blackboard in the response.
    """
    try:
        from airsight.agents.graph import InstallError, run_analysis
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"agents package import failed: {exc}") from exc

    try:
        state = run_analysis(
            body.city_id.strip().lower(),
            mode=body.mode,
            request_id=body.request_id or str(uuid4()),
        )
    except InstallError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"agent graph failed: {exc}") from exc

    clean = _json_clean(dict(state))
    return AnalyzeResponse(
        city_id=str(clean.get("city_id", body.city_id)),
        mode=str(clean.get("mode", body.mode)),
        anomaly_score=clean.get("anomaly_score"),
        anomaly_detected=clean.get("anomaly_detected"),
        needs_forecast=clean.get("needs_forecast"),
        n_fires_near=clean.get("n_fires_near"),
        forecast_backend=clean.get("forecast_backend"),
        city_peak_pm25=clean.get("city_peak_pm25"),
        source_share=clean.get("source_share"),
        interventions=list(clean.get("interventions") or []),
        policy_summary=clean.get("policy_summary"),
        scout_notes=list(clean.get("scout_notes") or []),
        forecast_notes=list(clean.get("forecast_notes") or []),
        policy_notes=list(clean.get("policy_notes") or []),
        errors=list(clean.get("errors") or []),
        trace=list(clean.get("trace") or []),
        state=clean if include_state else None,
    )


@app.get("/api/v1/agents/health")
def agents_health() -> dict[str, Any]:
    try:
        from airsight.agents.graph import _HAS_LANGGRAPH, require_langgraph

        require_langgraph()
        return {"status": "ok", "langgraph": bool(_HAS_LANGGRAPH)}
    except Exception as exc:
        return {"status": "degraded", "langgraph": False, "detail": str(exc)}


# ---------------------------------------------------------------------------
# Phase 5 — what-if, RAG advisory, alerts
# ---------------------------------------------------------------------------


@app.post("/api/v1/agents/whatif")
def agents_whatif(body: WhatIfRequest) -> dict[str, Any]:
    """Run a scenario and return per-H3 PM2.5 deltas + exposure estimates."""
    try:
        from airsight.whatif.engine import Scenario, run_whatif

        sc = body.scenario
        result = run_whatif(
            Scenario(
                traffic_delta=sc.traffic_delta,
                industry_delta=sc.industry_delta,
                construction_dust_delta=sc.construction_dust_delta,
                fire_reduction=sc.fire_reduction,
                ward_sprinkling=sc.ward_sprinkling,
                ward=sc.ward,
                city_id=sc.city_id,
                n_hex=sc.n_hex,
            )
        )
        return _json_clean(result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"whatif failed: {exc}") from exc


@app.post("/api/v1/agents/advisory")
def agents_advisory(body: AdvisoryRequest) -> dict[str, Any]:
    """RAG-style bilingual advisory — template mode without LLM keys."""
    try:
        from airsight.rag.advisory import generate_advisory

        return _json_clean(
            generate_advisory(
                city_id=body.city_id,
                pm25=body.pm25,
                aqi=body.aqi,
                top_source=body.top_source,
                asthma=body.asthma,
                child=body.child,
                elderly=body.elderly,
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"advisory failed: {exc}") from exc


@app.post("/api/v1/alerts/inject")
def alerts_inject(body: AlertInjectRequest) -> dict[str, Any]:
    """Inject a sustained AQI breach → Timescale + Redis pub/sub + UI toast."""
    try:
        from airsight.alerts.watcher import inject_breach

        return _json_clean(
            inject_breach(
                city_id=body.city_id,
                aqi=body.aqi,
                pm25=body.pm25,
                station_id=body.station_id,
                hours=body.hours,
            )
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"alert inject failed: {exc}") from exc


@app.post("/api/v1/alerts/watch")
def alerts_watch() -> dict[str, Any]:
    """Run one threshold pass over latest station readings."""
    try:
        from airsight.alerts.watcher import run_watcher_once

        return _json_clean(run_watcher_once())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/v1/alerts/recent")
def alerts_recent(limit: int = 20) -> dict[str, Any]:
    from airsight.alerts.watcher import list_recent_alerts

    items = list_recent_alerts(limit=limit)
    return {"n": len(items), "alerts": items}


@app.get("/api/v1/ui/toast")
def ui_toast() -> dict[str, Any]:
    """Latest toast payload for the dashboard (Redis)."""
    try:
        from services.ingestor import cache

        t = cache.get_json("vayu:ui:toast")
        return {"toast": t}
    except Exception as exc:
        return {"toast": None, "detail": str(exc)}
