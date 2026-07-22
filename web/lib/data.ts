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

/* -------------------- multi-city interventions -------------------- */
export interface InterventionSchool {
  name: string;
  block: string;
  district: string;
}
export interface InterventionRemedy {
  type: "city" | "school";
  action: string;
}
export interface InterventionItem {
  rank: number;
  city_id: string;
  city_name: string;
  ward: string;
  pm25: number;
  cpcb_category: string;
  cpcb_aqi_range: string;
  category_hex: string;
  severity: number;
  top_source: string;
  reason: string;
  urgency: string;
  demo_episode: boolean;
  affected_schools: InterventionSchool[];
  n_schools_district: number;
  remedies: InterventionRemedy[];
  threshold_ug_m3: number;
  standard_note: string;
}
export interface InterventionsFile {
  version: string;
  generated_note: string;
  aqi_scale: string;
  pm25_breakpoints: { category: string; pm25: string; aqi: string }[];
  n_items: number;
  cities_with_action: string[];
  items: InterventionItem[];
}

export function useInterventions() {
  return useQuery({
    queryKey: ["interventions_all"],
    queryFn: async (): Promise<InterventionsFile> => {
      const res = await fetch("/data/interventions.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`interventions: HTTP ${res.status}`);
      return res.json();
    },
    ...STATIC,
  });
}

/* -------------------- multi-city 72h forecasts -------------------- */
export interface CityHorizonForecast {
  horizon_h: number;
  origin?: string | null;
  valid_time?: string | null;
  pred_pm25: number;
  actual_pm25?: number | null;
  pm25_lag0?: number | null;
  cams_target?: number | null;
  p10?: number;
  p50?: number;
  p90?: number;
  cpcb?: { label: string; hex: string };
  source?: string;
}
export interface CityForecastRow {
  city_id: string;
  city_name: string;
  has_stations: boolean;
  latest_observed_pm25: number | null;
  latest_observed_time?: string | null;
  latest_cpcb?: { label: string; hex: string };
  horizons: Record<string, CityHorizonForecast>;
  model?: string;
  n_features?: number | null;
  note?: string;
  live?: {
    pm25?: number | null;
    us_aqi?: number | null;
    measured?: boolean;
    updated?: string;
    n_stations?: number;
  };
}
export interface Forecasts72hFile {
  version: string;
  horizons_h: number[];
  model_note: string;
  proof?: {
    model_version?: string;
    forecast_vs_baselines?: Metrics["forecast_vs_baselines"];
    headline?: string;
  };
  cities: CityForecastRow[];
  grid_trajectories?: Record<
    string,
    {
      city_id: string;
      origin?: string;
      timestamps: string[];
      frame_step_hours: number;
      grid_mean_pm25: (number | null)[];
      n_cells?: number;
      threshold_ug_m3?: number;
    }
  >;
}

export function useForecasts72h() {
  return useQuery({
    queryKey: ["forecasts_72h"],
    queryFn: async (): Promise<Forecasts72hFile> => {
      const res = await fetch("/data/forecasts_72h.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`forecasts_72h: HTTP ${res.status}`);
      return res.json();
    },
    ...STATIC,
  });
}
