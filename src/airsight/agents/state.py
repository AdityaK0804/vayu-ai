"""LangGraph shared state for Vayu multi-agent orchestration (Phase 3).

Architecture (for the graph you will approve in 3.3)
----------------------------------------------------
```
                 ┌─────────────┐
  request ──►    │   Scout     │  FIRMS + Open-Meteo / met archive
                 └──────┬──────┘
                        │ anomaly_score, flags, affected_h3
            ┌───────────┴───────────┐
            │ needs_forecast?       │
           yes                     no
            ▼                       ▼
     ┌─────────────┐         ┌────────────┐
     │ Forecaster  │         │  (skip)    │
     │  STGNN/demo │         └─────┬──────┘
     └──────┬──────┘               │
            └───────────┬──────────┘
                        ▼
                 ┌─────────────┐
                 │   Policy    │  remedies from forecast + sources
                 └──────┬──────┘
                        ▼
                   final report
```

LangGraph threads a single ``AgentState`` dict through nodes. Each node
returns a **partial update** (only keys it owns). Conditional edges (Step 3.3)
will branch on ``anomaly_detected`` / ``needs_forecast``.

This module is intentionally free of ``langgraph`` imports so schema review
does not require the package installed yet.
"""

from __future__ import annotations

from typing import Any, Literal, NotRequired, Required, TypedDict


class FireEvent(TypedDict, total=False):
    """One FIRMS (or proxy) fire detection near the city."""

    latitude: float
    longitude: float
    frp: float
    acq_date: str
    distance_km: float


class WeatherAnomaly(TypedDict, total=False):
    """Met anomaly summary from archive/forecast."""

    kind: str  # e.g. "low_boundary_layer", "calm_wind", "heat"
    severity: float  # 0..1
    detail: str
    wind_u: float
    wind_v: float
    wind_speed_10m: float
    boundary_layer_height: float | None


class ForecastCell(TypedDict, total=False):
    """Per-H3 (or station) multi-horizon PM2.5 forecast."""

    h3_cell: str
    horizons_h: list[int]
    pm25_ug_m3: list[float]
    peak_pm25: float
    peak_horizon_h: int


class SourceShare(TypedDict, total=False):
    """Coarse source mix used by Policy (SHAP/EDGAR/heuristic)."""

    industry: float
    traffic: float
    fire: float
    dust: float
    other: float
    top_source: str
    method: str  # "shap" | "edgar" | "heuristic" | "demo"


class InterventionAction(TypedDict, total=False):
    """One actionable recommendation."""

    type: Literal["city", "school", "industry", "traffic", "fire", "health"]
    action: str
    urgency: Literal["watch", "prepare", "act", "immediate"]
    target: str
    rationale: str


class AgentState(TypedDict, total=False):
    """Shared blackboard for Scout → Forecaster → Policy.

    Required at invoke time
    -----------------------
    city_id : str
        Target city (e.g. ``\"korba\"``, ``\"bhilai\"``).

    Everything else is filled by nodes. Use ``total=False`` so partial updates
    type-check; runtime validation happens in the API layer (Step 3.4).
    """

    # ── request / routing ─────────────────────────────────────────────
    city_id: Required[str]
    request_id: NotRequired[str]
    mode: NotRequired[Literal["live", "demo", "offline"]]

    # ── Scout outputs ─────────────────────────────────────────────────
    scout_ran_at: NotRequired[str]
    fires: NotRequired[list[FireEvent]]
    n_fires_near: NotRequired[int]
    max_frp: NotRequired[float]
    weather_anomalies: NotRequired[list[WeatherAnomaly]]
    anomaly_score: NotRequired[float]  # 0..1 aggregate
    anomaly_detected: NotRequired[bool]
    needs_forecast: NotRequired[bool]
    affected_h3: NotRequired[list[str]]
    scout_notes: NotRequired[list[str]]
    wind_u: NotRequired[float]
    wind_v: NotRequired[float]

    # ── Forecaster outputs ────────────────────────────────────────────
    forecast_ran_at: NotRequired[str]
    forecast_backend: NotRequired[Literal["stgnn", "stgnn_demo", "skipped", "error"]]
    forecast_cells: NotRequired[list[ForecastCell]]
    city_peak_pm25: NotRequired[float]
    city_peak_horizon_h: NotRequired[int]
    forecast_rmse_proxy: NotRequired[float | None]
    forecast_notes: NotRequired[list[str]]

    # ── attribution / XAI (feeds Policy) ──────────────────────────────
    source_share: NotRequired[SourceShare]

    # ── Policy outputs ────────────────────────────────────────────────
    policy_ran_at: NotRequired[str]
    interventions: NotRequired[list[InterventionAction]]
    policy_summary: NotRequired[str]
    policy_notes: NotRequired[list[str]]

    # ── errors / trace ────────────────────────────────────────────────
    errors: NotRequired[list[str]]
    trace: NotRequired[list[str]]  # human-readable step log


# Threshold knobs shared by nodes (overridable later via config)
class ScoutThresholds(TypedDict, total=False):
    fire_radius_km: float
    fire_count_flag: int
    frp_flag: float
    calm_wind_mps: float
    low_blh_m: float
    anomaly_score_forecast: float  # run Forecaster if score ≥ this


DEFAULT_SCOUT_THRESHOLDS: ScoutThresholds = {
    "fire_radius_km": 40.0,
    "fire_count_flag": 3,
    "frp_flag": 25.0,
    "calm_wind_mps": 1.5,
    "low_blh_m": 200.0,
    "anomaly_score_forecast": 0.35,
}


def empty_state(city_id: str, *, mode: Literal["live", "demo", "offline"] = "live") -> AgentState:
    """Factory for a minimal invoke payload."""
    return {
        "city_id": city_id,
        "mode": mode,
        "fires": [],
        "weather_anomalies": [],
        "affected_h3": [],
        "scout_notes": [],
        "forecast_notes": [],
        "policy_notes": [],
        "interventions": [],
        "errors": [],
        "trace": [],
    }


def merge_notes(state: AgentState, key: str, *lines: str) -> list[str]:
    """Append note lines onto a list field."""
    prev = list(state.get(key) or [])  # type: ignore[arg-type]
    prev.extend(lines)
    return prev


def append_trace(state: AgentState, msg: str) -> list[str]:
    prev = list(state.get("trace") or [])
    prev.append(msg)
    return prev


def append_error(state: AgentState, msg: str) -> list[str]:
    prev = list(state.get("errors") or [])
    prev.append(msg)
    return prev


# Loose alias used by node signatures (LangGraph passes dict-like state)
StateUpdate = dict[str, Any]
