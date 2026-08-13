/**
 * Live FastAPI client with baked-JSON fallback (Phase 5.1).
 *
 * Browser calls same-origin `/backend-api/...` (Next rewrite → uvicorn :8000).
 * If the API is down, hooks fall back to `/data/live/*.json` so the demo
 * never blanks.
 */

import type {
  LiveApiFire,
  LiveApiStation,
  LiveCity,
  LiveFiresResponse,
  LiveSnapshot,
  LiveStationsResponse,
} from "./types";

import { API } from "./api";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

/** Try live API first; on failure run fallback. */
export async function liveFirst<T>(liveUrl: string, fallback: () => Promise<T>): Promise<T> {
  try {
    return await fetchJson<T>(liveUrl);
  } catch {
    return fallback();
  }
}

export async function fetchLiveSnapshot(): Promise<LiveSnapshot> {
  return liveFirst(API.LIVE.SNAPSHOT, async () => {
    // Rebuild a minimal snapshot from baked city + station files
    const [cities, stationsFile] = await Promise.all([
      fetchJson<LiveCity[]>("/data/live/latest.json").catch(() => [] as LiveCity[]),
      fetchJson<{ fetched_at_utc?: string; stations?: Array<Record<string, unknown>> }>(
        "/data/live/stations_live.json",
      ).catch(() => ({ stations: [] })),
    ]);
    const stations: LiveApiStation[] = (stationsFile.stations || []).map((s) => ({
      ts: String(s.measured_at_utc || new Date().toISOString()),
      station_id: `baked:${s.openaq_id ?? s.station}`,
      city_id: (s.city_id as string) || null,
      source: "baked",
      pm25: (s.pm25 as number) ?? null,
      pm10: (s.pm10 as number) ?? null,
      no2: (s.no2 as number) ?? null,
      aqi: (s.us_aqi as number) ?? null,
      aqi_basis: "us",
      lat: Number(s.lat),
      lon: Number(s.lon),
      quality_flag: 0,
    }));
    // city-level rows if no stations
    if (!stations.length && cities.length) {
      for (const c of cities) {
        if (c.lat == null || c.lon == null) continue;
        stations.push({
          ts: c.updated || new Date().toISOString(),
          station_id: `city:${c.city_id}`,
          city_id: c.city_id,
          source: "baked-city",
          pm25: c.current_pm25,
          aqi: c.current_us_aqi,
          aqi_basis: "us",
          lat: c.lat,
          lon: c.lon,
          quality_flag: 0,
        });
      }
    }
    return {
      generated_at: new Date().toISOString(),
      n_stations: stations.length,
      n_fires: 0,
      stations,
      fires: [] as LiveApiFire[],
      cache: "baked" as const,
    };
  });
}

export async function fetchLiveStations(): Promise<LiveStationsResponse> {
  return liveFirst(API.LIVE.STATIONS(true), async () => {
    const snap = await fetchLiveSnapshot();
    return {
      generated_at: snap.generated_at,
      cache: snap.cache || "baked",
      n: snap.stations.length,
      n_virtual: 0,
      stations: snap.stations,
      virtual_stations: [],
    };
  });
}

export async function fetchLiveFires(hours = 48): Promise<LiveFiresResponse> {
  return liveFirst(API.LIVE.FIRES(hours), async () => ({
    generated_at: new Date().toISOString(),
    cache: "baked",
    hours,
    n: 0,
    fires: [],
  }));
}

/** Map live stations → LiveCity[] so existing city-index consumers keep working. */
export function stationsToLiveCities(stations: LiveApiStation[]): LiveCity[] {
  const byCity = new Map<string, { pm: number[]; lat: number; lon: number; ts: string }>();
  for (const s of stations) {
    if (!s.city_id || s.lat == null || s.lon == null) continue;
    const pm = s.pm25;
    const cur = byCity.get(s.city_id) || { pm: [], lat: s.lat, lon: s.lon, ts: s.ts };
    if (pm != null) cur.pm.push(pm);
    cur.lat = s.lat;
    cur.lon = s.lon;
    cur.ts = s.ts;
    byCity.set(s.city_id, cur);
  }
  const out: LiveCity[] = [];
  for (const [city_id, v] of byCity) {
    const mean = v.pm.length ? v.pm.reduce((a, b) => a + b, 0) / v.pm.length : null;
    out.push({
      city_id,
      name: city_id.charAt(0).toUpperCase() + city_id.slice(1),
      lat: v.lat,
      lon: v.lon,
      current_pm25: mean,
      current_us_aqi: null,
      updated: v.ts,
      measured: true,
      measured_pm25_24h: mean,
      n_stations: v.pm.length || 1,
    });
  }
  return out;
}
