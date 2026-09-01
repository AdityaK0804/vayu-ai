"""Redis hot-cache helpers."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import redis

from services.ingestor.config import Settings, get_settings

log = logging.getLogger(__name__)

KEY_SNAPSHOT = "vayu:live:snapshot"
KEY_STATIONS = "vayu:live:stations"
KEY_FIRES = "vayu:live:fires"
KEY_METEO = "vayu:live:meteo"
KEY_CAMS = "vayu:live:cams"
KEY_LAST_SYNC = "vayu:live:last_sync"


def client(settings: Settings | None = None) -> redis.Redis:
    cfg = settings or get_settings()
    return redis.Redis.from_url(cfg.redis_url, decode_responses=True)


def ping_redis(settings: Settings | None = None) -> bool:
    try:
        return bool(client(settings).ping())
    except Exception as exc:
        log.warning("redis ping failed: %s", exc)
        return False


def set_json(key: str, payload: Any, ttl_s: int, settings: Settings | None = None) -> None:
    try:
        r = client(settings)
        r.set(key, json.dumps(payload, default=str), ex=ttl_s)
    except Exception as exc:
        log.warning("redis set %s failed: %s", key, exc)


def get_json(key: str, settings: Settings | None = None) -> Any | None:
    try:
        raw = client(settings).get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        log.warning("redis get %s failed: %s", key, exc)
        return None


def touch_last_sync(source: str, settings: Settings | None = None) -> None:
    """Record per-source last successful sync timestamp (ISO UTC)."""
    cfg = settings or get_settings()
    try:
        meta = get_json(KEY_LAST_SYNC, cfg) or {}
        if not isinstance(meta, dict):
            meta = {}
        meta[source] = datetime.now(timezone.utc).isoformat()
        set_json(KEY_LAST_SYNC, meta, cfg.redis_ttl_snapshot_s, cfg)
    except Exception as exc:
        log.warning("touch_last_sync failed: %s", exc)


def publish_live_bundle(
    *,
    snapshot: dict,
    stations: list,
    fires: list,
    meteo: list | None = None,
    cams: list | None = None,
    settings: Settings | None = None,
) -> None:
    cfg = settings or get_settings()
    ttl = cfg.redis_ttl_snapshot_s
    set_json(KEY_SNAPSHOT, snapshot, ttl, cfg)
    set_json(KEY_STATIONS, stations, ttl, cfg)
    set_json(KEY_FIRES, fires, ttl, cfg)
    if meteo is not None:
        set_json(KEY_METEO, meteo, ttl, cfg)
    if cams is not None:
        set_json(KEY_CAMS, cams, ttl, cfg)
