"""Phase 5 agent extensions: what-if + RAG advisory + alerts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class WhatIfScenario(BaseModel):
    traffic_delta: float = Field(0.0, ge=-1.0, le=1.0)
    industry_delta: float = Field(0.0, ge=-1.0, le=1.0)
    construction_dust_delta: float = Field(0.0, ge=-1.0, le=1.0)
    fire_reduction: float = Field(0.0, ge=0.0, le=1.0)
    ward_sprinkling: bool = False
    ward: str | None = None
    city_id: str = "raipur"
    n_hex: int = Field(37, ge=7, le=120)


class WhatIfRequest(BaseModel):
    scenario: WhatIfScenario = Field(default_factory=WhatIfScenario)


class AdvisoryRequest(BaseModel):
    city_id: str = "raipur"
    pm25: float | None = 95.0
    aqi: float | None = None
    top_source: str | None = "traffic"
    asthma: bool = False
    child: bool = False
    elderly: bool = False


class AlertInjectRequest(BaseModel):
    city_id: str = "raipur"
    aqi: float = 320.0
    pm25: float = 180.0
    station_id: str = "inject:demo"
    hours: int = Field(3, ge=1, le=24)
