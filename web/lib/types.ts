/**
 * Types mirror the BAKED files byte-for-byte (scripts/bake/bake_demo_data.py).
 *
 * NOTE on forecast_frames: the bake stores one row per CELL with a value ARRAY
 * indexed by frame (`v[i]` <-> `timestamps[i]`) — NOT an array of frame objects.
 * That layout is ~3x smaller on the wire because the H3 id and coords are written
 * once instead of once per frame. `selectFrame()` below gives you the
 * frame-shaped view components actually want.
 */

export type CityId = "korba" | "jagdalpur";

/* ------------------------------------------------- forecast_frames.json */
export interface ForecastCell {
  c: string; // H3 index (res 8)
  lat: number;
  lon: number;
  v: number[]; // pm25 per frame, integers, length === timestamps.length
}

export interface StationForecast {
  cell: string;
  horizon_h: 24 | 48 | 72;
  valid_time: string;
  pred_pm25: number;
  actual_pm25: number | null;
}

export interface ForecastFrames {
  city: CityId;
  grid_model: string;
  origin: string;
  timestamps: string[];
  frame_step_hours: number;
  threshold_ug_m3: number;
  n_cells: number;
  cells: ForecastCell[];
  station_forecast?: StationForecast[];
  station_forecast_model?: string;
}

/** Frame-shaped view of the columnar bake. */
export interface FrameCell {
  h3: string;
  lat: number;
  lon: number;
  pm25: number;
}
export function selectFrame(d: ForecastFrames | undefined, i: number): FrameCell[] {
  if (!d) return [];
  const idx = Math.max(0, Math.min(i, d.timestamps.length - 1));
  return d.cells.map((c) => ({ h3: c.c, lat: c.lat, lon: c.lon, pm25: c.v[idx] ?? 0 }));
}

/* ------------------------------------------------- priority_wards.json */
export interface UpwindSource {
  type: "power_plant" | "industry";
  name: string;
  km: number;
  bearing: number;
  capacity_mw?: number | null;
}

export type SourceKey = "industry" | "traffic" | "fire" | "dust";

export interface EdgarAgreement {
  edgar_top: string;
  edgar_shares: Record<string, number>;
  match: boolean;
  note: string;
}

export interface Dossier {
  rank: number;
  cell: string;
  ward: string;
  lat: number;
  lon: number;
  predicted_pm25: number;
  exceedance_over_60: number;
  top_source: SourceKey;
  attribution_shares: Record<SourceKey, number>;
  edgar_agreement: EdgarAgreement;
  population_affected: number;
  vulnerable_sites: number;
  upwind_sources: UpwindSource[];
  named_upwind_source: string | null;
  recommended_action: string;
  confidence: number;
  priority_score: number;
}

export interface PriorityWards {
  city: CityId;
  forecast_time: string;
  generated_at_utc: string;
  signal_to_dossier_seconds: number;
  threshold_ug_m3: number;
  cells_scored: number;
  cells_over_threshold: number;
  top_n: number;
  dossiers: Dossier[];
}

/* ------------------------------------------------- attribution.json */
export interface AttributionCell {
  cell: string;
  ward: string;
  lat: number;
  lon: number;
  predicted_pm25: number;
  top_source: SourceKey;
  shares: Record<SourceKey, number>;
  confidence: number;
  edgar_top: string;
  edgar_match: boolean;
  named_upwind_source: string | null;
}
export interface Attribution {
  cells: AttributionCell[];
}

/* ------------------------------------------------- stations.json */
export interface Station {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  latest_pm25: number | null;
  latest_time: string | null;
  use_in_training: boolean;
}
export interface Stations {
  city: CityId;
  has_stations: boolean;
  stations: Station[];
  note?: string;
}

/* ------------------------------------------------- metrics.json */
export interface HorizonMetric {
  horizon_h: number;
  model_rmse: number | null;
  persistence_rmse: number | null;
  cams_bc_rmse: number | null;
  vs_persistence_pct: number | null;
  vs_cams_bc_pct: number | null;
}
export interface Metrics {
  city: CityId;
  dataset: {
    pooled_target_rows: number | null;
    stations: number | null;
    window: [string, string] | null;
  };
  forecast_vs_baselines: HorizonMetric[];
  zero_station_loso: {
    rmse_satellite_subset: number | null;
    rmse_all_stations: number | null;
    cams_bc_rmse: number | null;
    beats_cams_by_pct: number | null;
  };
  headline: string;
}

/* ------------------------------------------------- live/latest.json */
export interface LiveCity {
  city_id: string;
  name: string;
  lat: number;
  lon: number;
  current_pm25: number | null;
  current_us_aqi: number | null;
  updated: string;
  stale?: boolean;
  /** measured CPCB values (24h mean) — present only where a station exists */
  measured?: boolean;
  measured_pm25_24h?: number | null;
  measured_us_aqi?: number | null;
  n_stations?: number;
}
