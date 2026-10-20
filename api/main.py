"""Vayu API entrypoint.

Only the v2 API (``/api/v2/*``) is served. The v0 root routes (``/cities``,
``/metrics/...``) and the v1 routes (``/api/v1/live``, ``/api/v1/agents``,
``/api/v1/alerts``) were retired; see CHANGES.md for the mapping.

Run:  uvicorn api.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

# Ensure repo root + src are importable when launched as `uvicorn api.main:app`
_ROOT = Path(__file__).resolve().parents[1]
for _p in (_ROOT, _ROOT / "src"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from api.errors import ApiError, install_error_handlers  # noqa: E402
from api.security import cors_origins  # noqa: E402
from api.v2 import API_VERSION, router as v2_router  # noqa: E402

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Vayu Air Quality API",
        version=API_VERSION,
        docs_url="/api/v2/docs",
        openapi_url="/api/v2/openapi.json",
        redoc_url=None,
    )
    install_error_handlers(app)
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_origin_regex=None,
        # The API is token-authenticated, not cookie-authenticated.
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
        max_age=600,
    )
    app.include_router(v2_router)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"name": "vayu-api", "version": API_VERSION, "docs": "/api/v2/docs", "health": "/api/v2/health"}

    @app.api_route("/api/v1/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
    def retired_v1(rest: str) -> None:
        raise ApiError(410, "API v1 has been retired. Use /api/v2.", code="gone")

    return app


app = create_app()
