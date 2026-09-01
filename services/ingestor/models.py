"""Pydantic payloads for live ingestion."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class StationReadingIn(BaseModel):
    ts: datetime
    station_id: str
    city_id: str | None = None
    source: str = "openaq"
    pm25: float | None = None
    pm10: float | None = None
    no2: float | None = None
    so2: float | None = None
    o3: float | None = None
    co: float | None = None
    aqi: float | None = None
    aqi_basis: str | None = None
    lat: float | None = None
    lon: float | None = None
    quality_flag: int = 0


class FireEventIn(BaseModel):
    ts: datetime
    lat: float
    lon: float
    frp: float | None = None
    confidence: float | None = None
    bright_ti4: float | None = None
    source: str = "firms"
    h3_cell: str | None = None
    city_id: str | None = None
    raw: dict[str, Any] | None = None


class MeteoPointIn(BaseModel):
    ts: datetime
    city_id: str
    lat: float
    lon: float
    temperature_2m: float | None = None
    relative_humidity_2m: float | None = None
    wind_speed_10m: float | None = None
    wind_direction_10m: float | None = None
    precipitation: float | None = None
    boundary_layer_height: float | None = None
    source: str = "open-meteo"


class CamsPointIn(BaseModel):
    ts: datetime
    city_id: str
    lat: float
    lon: float
    pm25: float | None = None
    pm10: float | None = None
    no2: float | None = None
    so2: float | None = None
    o3: float | None = None
    co: float | None = None
    dust: float | None = None
    aod550: float | None = None  # if available
    source: str = "open-meteo-aq"


class IngestResult(BaseModel):
    source: str
    status: Literal["ok", "degraded", "error"] = "ok"
    rows_written: int = 0
    detail: str = ""
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None
