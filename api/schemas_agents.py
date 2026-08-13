"""Pydantic request/response models for agent analyze endpoint."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    city_id: str = Field(..., examples=["korba", "bhilai", "raipur"])
    mode: Literal["live", "demo", "offline"] = "live"
    request_id: str | None = None


class AnalyzeResponse(BaseModel):
    city_id: str
    mode: str
    anomaly_score: float | None = None
    anomaly_detected: bool | None = None
    needs_forecast: bool | None = None
    n_fires_near: int | None = None
    forecast_backend: str | None = None
    city_peak_pm25: float | None = None
    source_share: dict[str, Any] | None = None
    interventions: list[dict[str, Any]] = Field(default_factory=list)
    policy_summary: str | None = None
    scout_notes: list[str] = Field(default_factory=list)
    forecast_notes: list[str] = Field(default_factory=list)
    policy_notes: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    trace: list[str] = Field(default_factory=list)
    # full state for debugging / UI (optional bulk)
    state: dict[str, Any] | None = None
