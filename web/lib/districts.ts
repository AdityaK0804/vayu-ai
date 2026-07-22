"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * District data types + fetch hooks.
 *
 * These live here rather than in DistrictMap.tsx on purpose. That component
 * imports deck.gl and maplibre (~250 KB gzipped); anything that merely wanted
 * the *numbers* — the chatbot, the hero preview, the alert list, analytics —
 * used to import the hook from there and drag the whole rendering stack onto
 * the landing page with it. Splitting the data layer out means only the map
 * itself pays for the map.
 */

// Bumped whenever bake_districts.py changes shape. Without this the browser
// keeps serving a previously cached bake and every new field reads `undefined`.
export const DATA_URL = "/data/cg_districts.json?v=4";

export interface DistrictProps {
  name: string;
  pm25: number;
  us_aqi: number;
  risk: number;
  population: number;
  stations: string[];
  n_stations: number;
  source: string;
  measured: Record<string, number | string>;
  shares: Record<string, number>;
  edgar_nox: number;
  edgar_so2: number;
  edgar_pm25: number;
  edgar_share_ene: number;
  edgar_share_ind: number;
  edgar_share_tro: number;
  edgar_share_rco: number;
  edgar_share_awb: number;
  edgar_share_ags: number;
  gppd_nearest_km: number;
  gppd_nearest_mw: number;
  gppd_cap_25km: number;
  temp_c: number;
  rh_pct: number;
  wind_speed: number;
  blh_m: number;
  cams_pm25: number;
  /** measured station values where they exist; null elsewhere */
  live_pm25: number | null;
  live_us_aqi: number | null;
  live_stations: number;
  /** what the map paints: measured when available, model otherwise */
  display_pm25: number;
  display_aqi: number;
  display_basis: "measured" | "model";
}

export interface CityPoint {
  id: string;
  name: string;
  role: string;
  lat: number;
  lon: number;
  pm25: number;
  us_aqi: number;
  risk: number;
  n_stations: number;
  has_stations: boolean;
}

export interface DistrictsFC {
  type: "FeatureCollection";
  features: { id?: string; type: "Feature"; properties: DistrictProps; geometry: any }[];
  cities?: CityPoint[];
  meta?: Record<string, any>;
  meta_live?: { origin: string; mode: "live" | "historical" };
}

export interface IndiaPlace {
  n: string;
  lat: number;
  lon: number;
  bb: [number, number, number, number];
}

/** All 735 Indian districts — lets the search box reach beyond Chhattisgarh. */
export function useIndiaIndex() {
  return useQuery({
    queryKey: ["india_index"],
    queryFn: async (): Promise<{ n: number; districts: IndiaPlace[] }> => {
      const res = await fetch("/data/india_districts_index.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`india index: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useDistricts() {
  return useQuery({
    queryKey: ["cg_districts_v4"],
    queryFn: async (): Promise<DistrictsFC> => {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`districts: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });
}
