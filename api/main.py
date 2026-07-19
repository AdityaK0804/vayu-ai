"""FastAPI Backend for AirSight.

Serves precomputed metrics, panel summaries, and config data.
Reads directly from the ``outputs/`` and ``config/`` directories.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from airsight.config import OUTPUTS, load_cities
from airsight.io.stations import load_stations

app = FastAPI(title="AirSight Backend API")

# Open CORS for local development
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
    # Replace NaN with None for JSON serialization
    df = df.where(df.notna(), None)
    return df.to_dict(orient="records")


@app.get("/metrics/{city_id}")
def get_metrics(city_id: str) -> dict[str, Any]:
    """Merge and return all metrics files for a given city."""
    metrics_dir = OUTPUTS / "metrics"
    if not metrics_dir.exists():
        raise HTTPException(status_code=404, detail="Metrics directory not found")

    merged = {}
    
    # Baselines
    base_file = metrics_dir / f"{city_id}_baselines.json"
    if base_file.exists():
        with open(base_file) as f:
            merged["baselines"] = json.load(f)

    # Temporal C1
    temp_file = metrics_dir / f"{city_id}_temporal.json"
    if temp_file.exists():
        with open(temp_file) as f:
            merged["temporal"] = json.load(f)
            
    # Features Static D1
    static_file = metrics_dir / f"{city_id}_features_static.json"
    if static_file.exists():
        with open(static_file) as f:
            merged["features_static"] = json.load(f)

    if not merged:
        raise HTTPException(status_code=404, detail=f"No metrics found for {city_id}")

    return merged


@app.get("/panel/{city_id}/summary")
def get_panel_summary(city_id: str) -> dict[str, Any]:
    """Return the data quality summary for the station panel."""
    quality_file = OUTPUTS / "reports" / f"station_panel_{city_id}_quality.json"
    if not quality_file.exists():
        raise HTTPException(
            status_code=404, 
            detail=f"Panel summary not found for {city_id}."
        )

    with open(quality_file) as f:
        return json.load(f)


@app.get("/attribution/{city_id}")
def get_attribution(city_id: str) -> dict[str, Any]:
    """Return the source attribution prototype results."""
    attr_file = OUTPUTS / "metrics" / f"{city_id}_attribution_vs_edgar.json"
    if not attr_file.exists():
        raise HTTPException(
            status_code=404, 
            detail=f"Attribution metrics not found for {city_id}."
        )

    with open(attr_file) as f:
        return json.load(f)
