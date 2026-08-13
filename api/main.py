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
from api.schemas_agents import AnalyzeRequest, AnalyzeResponse

app = FastAPI(title="AirSight Backend API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


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
