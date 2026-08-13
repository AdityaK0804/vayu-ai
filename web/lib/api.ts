/**
 * Vayu AI - Centralized Backend API Routes
 *
 * All frontend requests to the FastAPI backend should use these endpoints.
 * The `NEXT_PUBLIC_LIVE_API_BASE` env variable determines the absolute URL
 * (e.g. `http://localhost:8000`), or falls back to the `/backend-api` rewrite proxy.
 */

export function liveApiBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_LIVE_API_BASE) {
    return process.env.NEXT_PUBLIC_LIVE_API_BASE.replace(/\/$/, "");
  }
  return "/backend-api";
}

export const API = {
  BASE: liveApiBase(),

  // Phase 1-4: Reports, Analytics & Configuration
  HEALTH: `${liveApiBase()}/health`,
  CITIES: `${liveApiBase()}/cities`,
  STATIONS: `${liveApiBase()}/stations`,
  METRICS: (cityId: string) => `${liveApiBase()}/metrics/${cityId}`,
  PANEL_SUMMARY: (cityId: string) => `${liveApiBase()}/panel/${cityId}/summary`,
  ATTRIBUTION: (cityId: string) => `${liveApiBase()}/attribution/${cityId}`,

  // Phase 3: Agents (Scout, Forecaster, Policy)
  AGENTS: {
    HEALTH: `${liveApiBase()}/api/v1/agents/health`,
    ANALYZE: `${liveApiBase()}/api/v1/agents/analyze`,
    WHATIF: `${liveApiBase()}/api/v1/agents/whatif`,
    ADVISORY: `${liveApiBase()}/api/v1/agents/advisory`,
  },

  // Phase 5.1: Live State & Real-time Feeds (Redis / Timescale)
  LIVE: {
    HEALTH: `${liveApiBase()}/api/v1/live/health`,
    SNAPSHOT: `${liveApiBase()}/api/v1/live/snapshot`,
    STATIONS: (includeVirtual = true) => `${liveApiBase()}/api/v1/live/stations?include_virtual=${includeVirtual}`,
    FIRES: (hours = 48) => `${liveApiBase()}/api/v1/live/fires?hours=${hours}`,
    METEO: `${liveApiBase()}/api/v1/live/meteo`,
    CAMS: `${liveApiBase()}/api/v1/live/cams`,
    STREAM: `${liveApiBase()}/api/v1/live/stream`, // SSE Alerts Source
  },

  // Phase 5.2: Alerts & Triggers
  ALERTS: {
    INJECT: `${liveApiBase()}/api/v1/alerts/inject`,
    WATCH: `${liveApiBase()}/api/v1/alerts/watch`,
    RECENT: (limit = 20) => `${liveApiBase()}/api/v1/alerts/recent?limit=${limit}`,
    TOAST: `${liveApiBase()}/api/v1/ui/toast`,
  },
} as const;
