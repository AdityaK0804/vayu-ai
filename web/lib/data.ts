"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  Attribution,
  LiveCity,
  CityId,
  ForecastFrames,
  Metrics,
  PriorityWards,
  Stations,
} from "./types";

/** Static reads only — the frontend never calls the model or an API. */
async function getJSON<T>(city: CityId, file: string): Promise<T> {
  const res = await fetch(`/data/${city}/${file}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`${city}/${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Baked files are immutable per deploy, so never refetch within a session.
const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 1 } as const;

export function useForecast(city: CityId) {
  return useQuery({
    queryKey: ["forecast", city],
    queryFn: () => getJSON<ForecastFrames>(city, "forecast_frames.json"),
    ...STATIC,
  });
}

export function usePriority(city: CityId) {
  return useQuery({
    queryKey: ["priority", city],
    queryFn: () => getJSON<PriorityWards>(city, "priority_wards.json"),
    ...STATIC,
  });
}

export function useAttribution(city: CityId) {
  return useQuery({
    queryKey: ["attribution", city],
    queryFn: () => getJSON<Attribution>(city, "attribution.json"),
    ...STATIC,
  });
}

export function useStations(city: CityId) {
  return useQuery({
    queryKey: ["stations", city],
    queryFn: () => getJSON<Stations>(city, "stations.json"),
    ...STATIC,
  });
}

export function useMetrics(city: CityId) {
  return useQuery({
    queryKey: ["metrics", city],
    queryFn: () => getJSON<Metrics>(city, "metrics.json"),
    ...STATIC,
  });
}

/** Live city index (baked from scripts/live/fetch_live.py -> latest.json). */
export function useLive() {
  return useQuery({
    queryKey: ["live"],
    queryFn: async (): Promise<LiveCity[]> => {
      const res = await fetch("/data/live/latest.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`live: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/** Per-station live readings (scripts/live/fetch_live_stations.py). */
export interface LiveStation {
  openaq_id: number;
  station: string;
  city_id: string | null;
  lat: number;
  lon: number;
  pm25?: number;
  pm25_24h?: number | null;
  pm10?: number;
  no2?: number;
  so2?: number;
  co?: number;
  o3?: number;
  us_aqi: number | null;
  measured_at_utc: string | null;
}
export function useStationsLive() {
  return useQuery({
    queryKey: ["stations_live"],
    queryFn: async (): Promise<{ fetched_at_utc: string; stations: LiveStation[] }> => {
      const res = await fetch("/data/live/stations_live.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`stations_live: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

/* -------------------- citizen advisories (hospital + school bake) -------------------- */
export interface AdvisoryFacility {
  name: string;
  type?: string;
  address?: string;
  district?: string;
  block?: string;
}
export interface CityAdvisory {
  city_id: string;
  city_name: string;
  districts_matched: string[];
  air: {
    pm25: number | null;
    us_aqi: number | null;
    band_en: string;
    band_hi: string;
    severity: number;
    basis: string;
    top_source: string | null;
    source_shares?: Record<string, number> | null;
    priority_ward?: string | null;
  };
  exposure: {
    hospitals_total: number;
    hospitals_public: number;
    hospitals_private: number;
    schools_total: number;
    vulnerable_note_en: string;
    vulnerable_note_hi: string;
  };
  hospitals_sample: AdvisoryFacility[];
  schools_sample: AdvisoryFacility[];
  messages: { en: string; hi: string };
  actions: { en: string[]; hi: string[] };
  audience: { id: string; en: string; hi: string }[];
}
export interface AdvisoryIndex {
  version: string;
  cities: {
    city_id: string;
    city_name: string;
    hospitals: number;
    schools: number;
    severity: number;
    band_en: string;
    pm25: number | null;
  }[];
  advisories: Record<string, CityAdvisory>;
}

export function useAdvisoryIndex() {
  return useQuery({
    queryKey: ["advisories_index"],
    queryFn: async (): Promise<AdvisoryIndex> => {
      const res = await fetch("/data/advisories/index.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`advisories: HTTP ${res.status}`);
      return res.json();
    },
    ...STATIC,
  });
}

export function useAdvisory(city: CityId) {
  return useQuery({
    queryKey: ["advisories", city],
    queryFn: () => getJSON<CityAdvisory>(city, "advisories.json"),
    ...STATIC,
  });
}
