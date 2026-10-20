"""Safe, consistent JSON errors for the public API.

Every error leaves the API as::

    {"error": {"code": "not_found", "message": "Unknown city.", "request_id": "..."}}

* Messages are written for clients; exception text, SQL, DSNs, hostnames and
  file paths are never echoed back.
* Unexpected exceptions are logged server-side with the request id so a user
  report can be matched to the stack trace.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("vayu.api")

_DEFAULT_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "invalid_request",
    429: "rate_limited",
    500: "internal_error",
    502: "upstream_error",
    503: "unavailable",
}


class ApiError(Exception):
    """Raise from route code with a client-safe message."""

    def __init__(self, status: int, message: str, *, code: str | None = None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code or _DEFAULT_CODES.get(status, "error")
        self.headers = headers


def request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    if not rid:
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
    return rid


def error_body(status: int, message: str, rid: str, code: str | None = None, details: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {
        "code": code or _DEFAULT_CODES.get(status, "error"),
        "message": message,
        "request_id": rid,
    }
    if details is not None:
        err["details"] = details
    return {"error": err}


def _resp(request: Request, status: int, message: str, code: str | None = None, details: Any = None,
          headers: dict[str, str] | None = None) -> JSONResponse:
    rid = request_id(request)
    h = {"x-request-id": rid, **(headers or {})}
    return JSONResponse(error_body(status, message, rid, code, details), status_code=status, headers=h)


def install_error_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def _request_id_mw(request: Request, call_next):  # type: ignore[no-untyped-def]
        rid = request_id(request)
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 - last line of defence
            log.exception("unhandled error rid=%s %s %s", rid, request.method, request.url.path)
            return _resp(request, 500, "Something went wrong on our side. Please try again.")
        response.headers["x-request-id"] = rid
        return response

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:
        if exc.status >= 500:
            log.warning("api error rid=%s %s: %s", request_id(request), request.url.path, exc.message)
        return _resp(request, exc.status, exc.message, exc.code, headers=exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Only plain string details written by our own code are passed through;
        # anything else gets the generic text for its status.
        message = exc.detail if isinstance(exc.detail, str) and exc.status_code < 500 else None
        if exc.status_code >= 500:
            log.warning("http %s rid=%s %s: %s", exc.status_code, request_id(request), request.url.path, exc.detail)
        default = {404: "Not found.", 405: "Method not allowed.", 401: "Authentication required.",
                   403: "Not allowed.", 503: "Temporarily unavailable. Please try again shortly."}
        return _resp(request, exc.status_code, message or default.get(exc.status_code, "Request failed."),
                     headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(p) for p in e.get("loc", ()) if p not in ("body", "query", "path")),
             "issue": e.get("msg")}
            for e in exc.errors()
        ]
        return _resp(request, 422, "Some request parameters are invalid.", details=details)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error rid=%s %s %s", request_id(request), request.method, request.url.path)
        return _resp(request, 500, "Something went wrong on our side. Please try again.")
