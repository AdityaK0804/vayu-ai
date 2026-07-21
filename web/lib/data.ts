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
