"""Freshness metadata for live API responses (Phase 9 D2)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

STALE_AFTER_SECONDS = 2 * 60 * 60  # 2 hours


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        s = str(value).strip()
        if not s:
            return None
        try:
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def freshness(
    updated_at: Any,
    *,
    source: str | None = None,
    now: datetime | None = None,
    stale_after_s: int = STALE_AFTER_SECONDS,
) -> dict[str, Any]:
    """Build updated_at + source + stale_flag package."""
    now = now or datetime.now(timezone.utc)
    dt = _parse_ts(updated_at)
    age_s: float | None = None
    stale = True
    if dt is not None:
        age_s = max(0.0, (now - dt).total_seconds())
        stale = age_s > stale_after_s
    return {
        "updated_at": dt.isoformat() if dt else (str(updated_at) if updated_at else None),
        "source": source,
        "stale_flag": stale,
        "age_seconds": None if age_s is None else int(age_s),
        "stale_after_seconds": stale_after_s,
    }


def attach_row_freshness(row: dict[str, Any], *, ts_keys: tuple[str, ...] = ("ts", "updated_at", "measured_at_utc")) -> dict[str, Any]:
    out = dict(row)
    ts = None
    for k in ts_keys:
        if out.get(k) is not None:
            ts = out[k]
            break
    src = out.get("source") or out.get("data_source")
    meta = freshness(ts, source=str(src) if src else None)
    out["updated_at"] = meta["updated_at"]
    out["stale_flag"] = meta["stale_flag"]
    out["age_seconds"] = meta["age_seconds"]
    out["freshness"] = meta
    return out


def source_last_sync(
    *,
    stations: list[dict[str, Any]] | None = None,
    fires: list[dict[str, Any]] | None = None,
    meteo: list[dict[str, Any]] | None = None,
    cams: list[dict[str, Any]] | None = None,
    redis_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Per-source last_sync + stale for snapshot envelope."""

    def latest_from(rows: list[dict[str, Any]] | None, source_name: str) -> dict[str, Any]:
        # Prefer explicit ingest sync stamp (avoids historical FIRMS acq_time looking "stale forever")
        if redis_meta and redis_meta.get(source_name):
            return freshness(redis_meta[source_name], source=source_name)
        if not rows:
            return freshness(None, source=source_name)
        best: datetime | None = None
        for r in rows:
            for k in ("ts", "updated_at", "generated_at"):
                dt = _parse_ts(r.get(k))
                if dt and (best is None or dt > best):
                    best = dt
        return freshness(best, source=source_name)

    by_src: dict[str, list[dict[str, Any]]] = {}
    for s in stations or []:
        key = str(s.get("source") or "stations")
        by_src.setdefault(key, []).append(s)

    out: dict[str, Any] = {}
    for src, rows in by_src.items():
        out[src] = latest_from(rows, src)
    out["stations"] = latest_from(stations, "stations")
    out["fires"] = latest_from(fires, "fires")
    out["meteo"] = latest_from(meteo, "meteo")
    out["cams"] = latest_from(cams, "cams")
    if redis_meta:
        for k, v in redis_meta.items():
            if k not in out:
                out[k] = freshness(v, source=k)
    return out
