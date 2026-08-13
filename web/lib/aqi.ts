/**
 * CPCB PM2.5 helpers used by hex / attribution UI.
 * Colours come from the unified continuous scale in aqiScale.ts.
 */

import { CPCB_PM25_BANDS, cpcbPm25Band, cpcbPm25Color } from "@/lib/aqiScale";

export interface Band {
  max: number;
  label: string;
  hex: string;
  rgb: [number, number, number];
}

export const BANDS: Band[] = CPCB_PM25_BANDS.map((b) => ({
  max: b.max,
  label: b.label,
  hex: b.hex,
  rgb: b.rgb,
}));

export function bandFor(pm25: number): Band {
  const b = cpcbPm25Band(pm25);
  if (!b) return BANDS[BANDS.length - 1];
  return { max: b.max, label: b.label, hex: b.hex, rgb: b.rgb };
}

/** deck.gl fill colour — continuous CPCB ramp, semi-transparent for basemap bleed-through. */
export function colorFor(pm25: number, alpha = 168): [number, number, number, number] {
  const [r, g, b] = cpcbPm25Color(pm25);
  return [r, g, b, alpha];
}

export const SOURCE_LABEL: Record<string, string> = {
  industry: "Industry",
  traffic: "Traffic",
  fire: "Fire / biomass",
  dust: "Dust",
};
