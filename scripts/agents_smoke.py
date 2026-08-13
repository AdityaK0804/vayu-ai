#!/usr/bin/env python3
"""Smoke-test Phase 3.3–3.4 agents graph + optional FastAPI import.

  .venv-agents/Scripts/python.exe scripts/agents_smoke.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]


def main() -> int:
    from airsight.agents.graph import run_analysis

    out = run_analysis("korba", mode="demo")
    print(
        json.dumps(
            {
                "forecast_backend": out.get("forecast_backend"),
                "needs_forecast": out.get("needs_forecast"),
                "n_interventions": len(out.get("interventions") or []),
                "policy_summary": (out.get("policy_summary") or "")[:160],
                "trace": out.get("trace"),
            },
            indent=2,
        )
    )
    assert out.get("needs_forecast")
    assert out.get("interventions")

    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    h = client.get("/api/v1/agents/health")
    assert h.status_code == 200 and h.json().get("langgraph") is True
    r = client.post("/api/v1/agents/analyze", json={"city_id": "bhilai", "mode": "demo"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("interventions"), body
    print("API OK", body.get("forecast_backend"), len(body["interventions"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
