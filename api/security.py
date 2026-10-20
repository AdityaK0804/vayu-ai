"""Admin authentication and CORS settings, both driven by environment variables.

VAYU_ADMIN_TOKENS  comma-separated secrets accepted for admin actions
                   (``Authorization: Bearer <token>`` or ``X-API-Key: <token>``).
                   Several values allow rotation without downtime. When unset,
                   admin endpoints are disabled (503), never open.
CORS_ALLOW_ORIGINS comma-separated exact origins, e.g.
                   ``https://vayu.example.org,http://localhost:3000``.
                   No wildcards; ``*`` is ignored.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os

from fastapi import Request

from api.errors import ApiError

log = logging.getLogger("vayu.auth")

DEFAULT_DEV_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def _split(value: str | None) -> list[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def admin_tokens() -> list[str]:
    tokens = _split(os.environ.get("VAYU_ADMIN_TOKENS") or os.environ.get("VAYU_ADMIN_TOKEN"))
    weak = [t for t in tokens if len(t) < 24]
    if weak:
        log.error("ignoring %d admin token(s) shorter than 24 characters", len(weak))
    return [t for t in tokens if len(t) >= 24]


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS")
    if raw is None:
        return list(DEFAULT_DEV_ORIGINS)
    origins = []
    for o in _split(raw):
        if "*" in o:
            log.error("CORS origin %r ignored: wildcards are not allowed", o)
            continue
        origins.append(o.rstrip("/"))
    return origins


def _presented(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    key = request.headers.get("x-api-key")
    return key.strip() if key else None


def _fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()[:8]


def require_admin(request: Request) -> str:
    """FastAPI dependency. Returns a short token fingerprint for audit logs."""
    tokens = admin_tokens()
    if not tokens:
        raise ApiError(503, "Admin actions are disabled on this server.", code="admin_disabled")
    presented = _presented(request)
    if not presented:
        raise ApiError(401, "Authentication required.", headers={"WWW-Authenticate": "Bearer"})
    for t in tokens:
        if hmac.compare_digest(presented.encode(), t.encode()):
            fp = _fingerprint(t)
            log.info("admin action %s %s by key %s", request.method, request.url.path, fp)
            return fp
    log.warning("rejected admin credential for %s from %s", request.url.path,
                request.client.host if request.client else "?")
    raise ApiError(403, "Invalid credentials.")
