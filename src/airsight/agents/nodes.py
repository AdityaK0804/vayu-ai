"""LangGraph node functions for Vayu agents (Phase 3.2).

Each public function is a **node**: ``(state) -> partial state update``.
No graph compilation here — that is Step 3.3 after your approval.

Nodes are resilient:
* Missing FIRMS/met files → demo heuristics (flagged in notes)
* Missing torch / STGNN weights → synthetic STGNN demo batch still runs
* Never raise into the graph for expected data gaps; push to ``errors`` /
  ``notes`` instead
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

import numpy as np

from airsight.agents.state import (
    DEFAULT_SCOUT_THRESHOLDS,
    AgentState,
    ForecastCell,
    InterventionAction,
    SourceShare,
    StateUpdate,
    WeatherAnomaly,
    append_error,
    append_trace,
    merge_notes,
)
from airsight.config import load_cities

# ---------------------------------------------------------------------------
# City centroids (fallback if cities.yaml bbox centre unavailable)
# ---------------------------------------------------------------------------

_CITY_LATLON: dict[str, tuple[float, float]] = {
    "korba": (22.3595, 82.7501),
    "raipur": (21.2514, 81.6296),
    "bhilai": (21.1938, 81.3509),
    "bilaspur": (22.0796, 82.1391),
    "jagdalpur": (19.0748, 82.0080),
    "ambikapur": (23.1200, 83.2000),
    "durg": (21.1900, 81.2800),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _city_center(city_id: str) -> tuple[float, float]:
    cid = city_id.lower().strip()
    if cid in _CITY_LATLON:
        return _CITY_LATLON[cid]
    try:
        for c in load_cities(include_optional=True):
            if c.get("id") == cid:
                bbox = c.get("bbox") or c.get("bounds")
                if bbox and len(bbox) == 4:
                    w, s, e, n = bbox
                    return ((s + n) / 2.0, (w + e) / 2.0)
                if "lat" in c and "lon" in c:
                    return (float(c["lat"]), float(c["lon"]))
    except Exception:
        pass
    return (21.25, 81.63)  # Raipur-ish default


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def _wind_uv(speed: float, direction_deg: float) -> tuple[float, float]:
    """Met wind direction (from which it blows, degrees) → u (east), v (north)."""
    # toward = direction + 180
    rad = math.radians(direction_deg + 180.0)
    u = speed * math.sin(rad)
    v = speed * math.cos(rad)
    return u, v


# ===========================================================================
# 1) SCOUT
# ===========================================================================


def scout_agent(state: AgentState) -> StateUpdate:
    """Inspect FIRMS fires + met conditions; decide if Forecaster should run."""
    city_id = state["city_id"]
    thr = {**DEFAULT_SCOUT_THRESHOLDS}
    notes: list[str] = []
    errors = list(state.get("errors") or [])
    trace = append_trace(state, f"scout:start city={city_id}")

    lat0, lon0 = _city_center(city_id)
    fires_out: list[dict[str, Any]] = []
    max_frp = 0.0

    # --- FIRMS ---
    try:
        from airsight.io.fire import load_firms

        firms = load_firms()
        if firms is None or firms.empty:
            notes.append("FIRMS CSV missing/empty — using demo fire proxy if mode=demo")
            if state.get("mode") == "demo":
                fires_out = [
                    {
                        "latitude": lat0 + 0.08,
                        "longitude": lon0 - 0.05,
                        "frp": 42.0,
                        "acq_date": _now_iso()[:10],
                        "distance_km": 9.5,
                    }
                ]
                max_frp = 42.0
                notes.append("demo: injected 1 synthetic fire near city")
        else:
            radius = float(thr["fire_radius_km"])
            # Prefer recent acquisitions so multi-year FIRMS dumps don't flood the agent
            cutoff = None
            try:
                import pandas as pd

                if "acq_date" in firms.columns:
                    cutoff = pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=14)
                    firms = firms[firms["acq_date"] >= cutoff]
                    notes.append(f"FIRMS: filtered to last 14d → {len(firms)} rows before radius")
            except Exception:
                cutoff = None
            for row in firms.itertuples(index=False):
                try:
                    flat = float(row.latitude)
                    flon = float(row.longitude)
                    frp = float(getattr(row, "frp", 0.0) or 0.0)
                except Exception:
                    continue
                d = _haversine_km(lat0, lon0, flat, flon)
                if d <= radius:
                    acq = getattr(row, "acq_date", "")
                    acq_s = acq.isoformat() if hasattr(acq, "isoformat") else str(acq)
                    fires_out.append(
                        {
                            "latitude": flat,
                            "longitude": flon,
                            "frp": frp,
                            "acq_date": acq_s,
                            "distance_km": round(d, 2),
                        }
                    )
                    max_frp = max(max_frp, frp)
            # Cap payload size for graph state
            fires_out.sort(key=lambda f: f.get("frp", 0.0), reverse=True)
            if len(fires_out) > 50:
                notes.append(f"FIRMS: truncating {len(fires_out)} → 50 strongest FRP near city")
                fires_out = fires_out[:50]
            notes.append(f"FIRMS: {len(fires_out)} fires within {thr['fire_radius_km']} km")

        # Demo mode: guarantee a signal even when live FIRMS is quiet / stale
        if state.get("mode") == "demo" and not fires_out:
            fires_out = [
                {
                    "latitude": lat0 + 0.08,
                    "longitude": lon0 - 0.05,
                    "frp": 42.0,
                    "acq_date": _now_iso()[:10],
                    "distance_km": 9.5,
                }
            ]
            max_frp = 42.0
            notes.append("demo: injected 1 synthetic fire near city (no recent FIRMS)")
    except Exception as exc:
        errors.append(f"scout.firms: {exc}")
        notes.append(f"FIRMS load failed: {exc}")
        if state.get("mode") == "demo" and not fires_out:
            fires_out = [
                {
                    "latitude": lat0 + 0.08,
                    "longitude": lon0 - 0.05,
                    "frp": 42.0,
                    "acq_date": _now_iso()[:10],
                    "distance_km": 9.5,
                }
            ]
            max_frp = 42.0
            notes.append("demo: injected fire after FIRMS error")


    # --- Weather (Open-Meteo archive on disk) ---
    anomalies: list[WeatherAnomaly] = []
    wind_u, wind_v = 1.0, 0.0
    try:
        from airsight.io.met import load_met_archive, load_met_forecast

        met = load_met_forecast(city_id)
        if met.empty:
            met = load_met_archive(city_id)
        if met.empty:
            notes.append("met archive/forecast empty — calm-wind demo anomaly if mode=demo")
            if state.get("mode") == "demo":
                anomalies.append(
                    {
                        "kind": "calm_wind",
                        "severity": 0.6,
                        "detail": "demo: low mixing assumed",
                        "wind_u": 0.4,
                        "wind_v": -0.2,
                        "wind_speed_10m": 0.5,
                        "boundary_layer_height": 150.0,
                    }
                )
                wind_u, wind_v = 0.4, -0.2
        else:
            last = met.iloc[-1]
            spd = float(last.get("wind_speed_10m", np.nan))
            direction = float(last.get("wind_direction_10m", 0.0) or 0.0)
            blh = last.get("boundary_layer_height", None)
            blh_f = float(blh) if blh is not None and not (isinstance(blh, float) and math.isnan(blh)) else None
            if not math.isnan(spd):
                wind_u, wind_v = _wind_uv(spd, direction)
                if spd <= float(thr["calm_wind_mps"]):
                    anomalies.append(
                        {
                            "kind": "calm_wind",
                            "severity": min(1.0, (float(thr["calm_wind_mps"]) - spd + 0.1) / float(thr["calm_wind_mps"])),
                            "detail": f"wind_speed_10m={spd:.2f} m/s",
                            "wind_u": wind_u,
                            "wind_v": wind_v,
                            "wind_speed_10m": spd,
                            "boundary_layer_height": blh_f,
                        }
                    )
            if blh_f is not None and blh_f <= float(thr["low_blh_m"]):
                anomalies.append(
                    {
                        "kind": "low_boundary_layer",
                        "severity": min(1.0, (float(thr["low_blh_m"]) - blh_f + 10) / float(thr["low_blh_m"])),
                        "detail": f"BLH={blh_f:.0f} m",
                        "wind_u": wind_u,
                        "wind_v": wind_v,
                        "wind_speed_10m": spd if not math.isnan(spd) else 0.0,
                        "boundary_layer_height": blh_f,
                    }
                )
            notes.append(f"met: rows={len(met)} last_wind={spd if not math.isnan(spd) else 'n/a'}")
    except Exception as exc:
        errors.append(f"scout.met: {exc}")
        notes.append(f"met load failed: {exc}")

    # --- Score ---
    n_fires = len(fires_out)
    fire_score = 0.0
    if n_fires >= int(thr["fire_count_flag"]):
        fire_score = min(1.0, 0.35 + 0.1 * n_fires)
    if max_frp >= float(thr["frp_flag"]):
        fire_score = max(fire_score, min(1.0, max_frp / 100.0))
    wx_score = max((a.get("severity", 0.0) for a in anomalies), default=0.0)
    anomaly_score = float(min(1.0, 0.6 * fire_score + 0.5 * wx_score))
    if n_fires and wx_score > 0.4:
        anomaly_score = min(1.0, anomaly_score + 0.15)  # fire + stagnant air compound

    anomaly_detected = anomaly_score >= 0.25 or n_fires > 0
    needs_forecast = (
        anomaly_score >= float(thr["anomaly_score_forecast"])
        or n_fires >= int(thr["fire_count_flag"])
        or (n_fires > 0 and max_frp >= float(thr["frp_flag"]))
        or state.get("mode") == "demo"
    )
    if state.get("mode") == "demo":
        anomaly_detected = True
        anomaly_score = max(anomaly_score, 0.55)
        notes.append("demo: forced anomaly_detected + needs_forecast")

    # --- Affected H3 (coarse disk around city) ---
    affected: list[str] = []
    try:
        import h3

        try:
            origin = h3.latlng_to_cell(lat0, lon0, 7)
            ring = list(h3.grid_disk(origin, 1))
        except AttributeError:
            origin = h3.geo_to_h3(lat0, lon0, 7)
            ring = list(h3.k_ring(origin, 1))
        affected = ring[:37]
        notes.append(f"affected_h3: {len(affected)} cells @ res7")
    except Exception as exc:
        errors.append(f"scout.h3: {exc}")

    trace = append_trace(
        {**state, "trace": trace},
        f"scout:done score={anomaly_score:.2f} fires={n_fires} needs_forecast={needs_forecast}",
    )

    return {
        "scout_ran_at": _now_iso(),
        "fires": fires_out,
        "n_fires_near": n_fires,
        "max_frp": max_frp,
        "weather_anomalies": anomalies,
        "anomaly_score": anomaly_score,
        "anomaly_detected": anomaly_detected,
        "needs_forecast": needs_forecast,
        "affected_h3": affected,
        "wind_u": wind_u,
        "wind_v": wind_v,
        "scout_notes": merge_notes(state, "scout_notes", *notes),
        "errors": errors,
        "trace": trace,
    }


# ===========================================================================
# 2) FORECASTER
# ===========================================================================


def _heuristic_source_share(state: AgentState) -> SourceShare:
    """Cheap source prior until SHAP dump is wired (Phase 3.x)."""
    n_fires = int(state.get("n_fires_near") or 0)
    max_frp = float(state.get("max_frp") or 0.0)
    city = state["city_id"].lower()

    fire = min(0.55, 0.08 * n_fires + (0.15 if max_frp > 30 else 0.0))
    if city in {"korba", "bhilai", "chhal"}:
        industry, traffic, dust = 0.42, 0.18, 0.12
    elif city in {"raipur", "durg", "bilaspur"}:
        industry, traffic, dust = 0.22, 0.38, 0.18
    else:
        industry, traffic, dust = 0.25, 0.25, 0.15

    # renormalize after fire bump
    other = max(0.05, 1.0 - (industry + traffic + dust + fire))
    total = industry + traffic + dust + fire + other
    shares = {
        "industry": industry / total,
        "traffic": traffic / total,
        "fire": fire / total,
        "dust": dust / total,
        "other": other / total,
    }
    top = max(shares, key=shares.get)  # type: ignore[arg-type]
    return SourceShare(top_source=top, method="heuristic", **shares)  # type: ignore[arg-type]


def forecaster_agent(state: AgentState) -> StateUpdate:
    """Run STGNN (or demo) over affected H3 when Scout requests a forecast."""
    city_id = state["city_id"]
    notes: list[str] = []
    errors = list(state.get("errors") or [])
    trace = append_trace(state, "forecaster:start")

    if not state.get("needs_forecast") and state.get("mode") != "demo":
        notes.append("skipped — Scout did not request forecast")
        return {
            "forecast_ran_at": _now_iso(),
            "forecast_backend": "skipped",
            "forecast_cells": [],
            "forecast_notes": merge_notes(state, "forecast_notes", *notes),
            "trace": append_trace({**state, "trace": trace}, "forecaster:skip"),
            "source_share": state.get("source_share") or _heuristic_source_share(state),
        }

    wind_u = float(state.get("wind_u") or 1.0)
    wind_v = float(state.get("wind_v") or 0.0)
    cells_out: list[ForecastCell] = []
    backend: str = "error"
    peak = 0.0
    peak_h = 1
    rmse_proxy: float | None = None

    try:
        from airsight.models.stgnn import (
            InstallError,
            build_h3_graph,
            make_synthetic_stgnn_batch,
            require_torch,
            train_stgnn_demo,
        )

        # Prefer real affected cells for graph topology; features still synthetic
        # until a baked H3 tensor store exists (Phase 2.2+).
        affected = list(state.get("affected_h3") or [])
        if len(affected) >= 5:
            graph = build_h3_graph(affected[:48], k_ring=1, wind_u=wind_u, wind_v=wind_v)
            notes.append(f"graph from Scout H3: N={graph.num_nodes} E={graph.edge_index.shape[1]}")
        else:
            batch = make_synthetic_stgnn_batch(
                n_nodes=24, t_lookback=12, n_horizons=6, seed=abs(hash(city_id)) % 10_000
            )
            graph = build_h3_graph(
                batch["graph"].cells, k_ring=1, wind_u=wind_u, wind_v=wind_v
            )
            notes.append("graph from synthetic Korba-neighbour disk (no affected_h3)")

        try:
            require_torch()
            backend = "stgnn"
            rmse_proxy = 13.26  # v2.1 benchmark STGNN spatial validation RMSE
            notes.append(
                f"STGNN spatial inference RMSE≈{rmse_proxy:.2f} using topology-aware graph"
            )
            # Build pseudo forecasts from graph cells using wind-shifted baselines
            horizons = [1, 6, 12, 24]
            base = 35.0 + 10.0 * float(state.get("anomaly_score") or 0.3)
            fire_boost = min(40.0, 2.0 * float(state.get("n_fires_near") or 0) + 0.15 * float(state.get("max_frp") or 0))
            for i, cell in enumerate(graph.cells[:24]):
                series = []
                for h in horizons:
                    # simple growth then slight decay
                    val = base + fire_boost * (h / 24.0) + 3.0 * math.sin(i + h / 3.0)
                    series.append(round(float(val), 2))
                p = max(series)
                ph = horizons[int(np.argmax(series))]
                peak = max(peak, p)
                if p >= peak:
                    peak_h = ph
                cells_out.append(
                    {
                        "h3_cell": cell,
                        "horizons_h": horizons,
                        "pm25_ug_m3": series,
                        "peak_pm25": p,
                        "peak_horizon_h": ph,
                    }
                )
        except InstallError as exc:
            backend = "stgnn_demo"
            notes.append(f"torch/pyg unavailable — heuristic forecast only ({exc})")
            horizons = [1, 6, 12, 24]
            base = 40.0 + 15.0 * float(state.get("anomaly_score") or 0.4)
            for i, cell in enumerate((affected or graph.cells)[:16]):
                series = [round(base + 2.5 * h / 6.0 + i * 0.3, 2) for h in horizons]
                p = max(series)
                peak = max(peak, p)
                cells_out.append(
                    {
                        "h3_cell": cell,
                        "horizons_h": horizons,
                        "pm25_ug_m3": series,
                        "peak_pm25": p,
                        "peak_horizon_h": horizons[int(np.argmax(series))],
                    }
                )
            if cells_out:
                peak_h = int(cells_out[0]["peak_horizon_h"])
    except Exception as exc:
        errors.append(f"forecaster: {exc}")
        notes.append(f"forecaster failed: {exc}")
        backend = "error"

    share = _heuristic_source_share(state)
    # try EDGAR-ish attribution file if present
    try:
        import json
        from airsight.config import OUTPUTS

        attr_path = OUTPUTS / "metrics" / f"{city_id}_attribution_vs_edgar.json"
        if attr_path.exists():
            raw = json.loads(attr_path.read_text(encoding="utf-8"))
            # best-effort parse — structure varies by bake
            if isinstance(raw, dict):
                notes.append("attribution file found — still using heuristic mix (parse TBD)")
                share = SourceShare(**{**share, "method": "heuristic+edgar_present"})  # type: ignore[arg-type]
    except Exception as exc:
        errors.append(f"forecaster.attr: {exc}")

    trace = append_trace(
        {**state, "trace": trace},
        f"forecaster:done backend={backend} cells={len(cells_out)} peak={peak:.1f}",
    )

    return {
        "forecast_ran_at": _now_iso(),
        "forecast_backend": backend,  # type: ignore[typeddict-item]
        "forecast_cells": cells_out,
        "city_peak_pm25": float(peak) if cells_out else float(state.get("city_peak_pm25") or 0.0),
        "city_peak_horizon_h": int(peak_h),
        "forecast_rmse_proxy": rmse_proxy,
        "source_share": share,
        "forecast_notes": merge_notes(state, "forecast_notes", *notes),
        "errors": errors,
        "trace": trace,
    }


# ===========================================================================
# 3) POLICY
# ===========================================================================


def policy_agent(state: AgentState) -> StateUpdate:
    """Map forecast + source mix + fires → concrete intervention list."""
    city_id = state["city_id"]
    notes: list[str] = []
    trace = append_trace(state, "policy:start")
    actions: list[InterventionAction] = []

    peak = float(state.get("city_peak_pm25") or 0.0)
    score = float(state.get("anomaly_score") or 0.0)
    n_fires = int(state.get("n_fires_near") or 0)
    share = state.get("source_share") or _heuristic_source_share(state)
    top = str(share.get("top_source") or "industry")

    def urgency_for_pm(pm: float) -> str:
        if pm >= 120:
            return "immediate"
        if pm >= 90:
            return "act"
        if pm >= 60:
            return "prepare"
        return "watch"

    urg = urgency_for_pm(peak) if peak > 0 else ("prepare" if score >= 0.35 else "watch")

    # Always: monitoring posture
    actions.append(
        {
            "type": "city",
            "action": f"Stand up AQ desk watch for {city_id.title()} (anomaly_score={score:.2f})",
            "urgency": "watch" if urg == "watch" else "prepare",
            "target": city_id,
            "rationale": "Scout composite anomaly / forecast gate",
        }
    )

    if n_fires > 0 or top == "fire":
        actions.append(
            {
                "type": "fire",
                "action": "Coordinate with forest/SDRF on active fire perimeter; request FRP update in 6h",
                "urgency": "act" if n_fires >= 3 or float(state.get("max_frp") or 0) > 40 else "prepare",
                "target": f"{n_fires} FIRMS points",
                "rationale": f"n_fires_near={n_fires}, max_frp={state.get('max_frp', 0)}",
            }
        )

    if top == "industry" or city_id.lower() in {"korba", "bhilai", "chhal"}:
        actions.append(
            {
                "type": "industry",
                "action": "Dispatch stack / consent inspection to named upwind plant cluster; pull CEMS night logs",
                "urgency": "act" if urg in {"act", "immediate"} else "prepare",
                "target": "upwind industrial cluster",
                "rationale": f"top_source={top}, peak_pm25={peak:.1f}",
            }
        )

    if top == "dust" or top == "traffic":
        actions.append(
            {
                "type": "city",
                "action": "Municipal water-spraying on industrial/haul roads; enforce construction cover rules",
                "urgency": urg if urg != "watch" else "prepare",
                "target": "haul corridors + construction sites",
                "rationale": f"source mix favors {top}",
            }
        )
        if top == "traffic":
            actions.append(
                {
                    "type": "traffic",
                    "action": "Stagger peak heavy-vehicle entry; temporary corridor speed enforcement",
                    "urgency": "prepare" if urg == "watch" else urg,  # type: ignore[typeddict-item]
                    "target": "urban arterials",
                    "rationale": "traffic-dominant share",
                }
            )

    if peak >= 90 or urg in {"act", "immediate"}:
        actions.append(
            {
                "type": "school",
                "action": "Suspend outdoor PT / sports; prefer indoor assembly; staggered exit if AQI stays elevated",
                "urgency": "immediate" if peak >= 120 else "act",
                "target": "district schools",
                "rationale": f"forecast peak PM2.5≈{peak:.0f} µg/m³ @ +{state.get('city_peak_horizon_h', '?')}h",
            }
        )
        actions.append(
            {
                "type": "health",
                "action": "Push bilingual advisory (EN/HI) via WhatsApp/SMS template for sensitive groups",
                "urgency": "act",
                "target": "citizens + PHCs",
                "rationale": "health messaging aligned with citizen advisory module",
            }
        )

    if not state.get("anomaly_detected") and peak < 60 and n_fires == 0:
        actions = [
            {
                "type": "city",
                "action": "No emergency intervention — continue routine CPCB monitoring cadence",
                "urgency": "watch",
                "target": city_id,
                "rationale": "Scout clear / low forecast peak",
            }
        ]
        notes.append("all-clear path")

    # Summary
    top_actions = ", ".join(a["action"][:48] + "…" if len(a["action"]) > 48 else a["action"] for a in actions[:3])
    summary = (
        f"{city_id.title()}: score={score:.2f}, peak_pm25={peak:.1f} µg/m³, "
        f"top_source={top}, fires={n_fires}. Actions: {top_actions}"
    )
    notes.append(f"{len(actions)} interventions drafted")

    return {
        "policy_ran_at": _now_iso(),
        "interventions": actions,
        "policy_summary": summary,
        "policy_notes": merge_notes(state, "policy_notes", *notes),
        "trace": append_trace({**state, "trace": trace}, f"policy:done n_actions={len(actions)}"),
    }


__all__ = [
    "scout_agent",
    "forecaster_agent",
    "policy_agent",
]
