/** CPCB PM2.5 bands (ug/m3) -> the green->maroon ramp declared in theme.css. */

export interface Band {
  max: number;
  label: string;
  hex: string;
  rgb: [number, number, number];
}

export const BANDS: Band[] = [
  { max: 30, label: "Good", hex: "#2f9e6b", rgb: [47, 158, 107] },
  { max: 60, label: "Satisfactory", hex: "#a8c23a", rgb: [168, 194, 58] },
  { max: 90, label: "Moderate", hex: "#e0a33a", rgb: [224, 163, 58] },
  { max: 120, label: "Poor", hex: "#d9702f", rgb: [217, 112, 47] },
  { max: 250, label: "Very Poor", hex: "#b03030", rgb: [176, 48, 48] },
  { max: Infinity, label: "Severe", hex: "#6d1420", rgb: [109, 20, 32] },
];

export function bandFor(pm25: number): Band {
  return BANDS.find((b) => pm25 <= b.max) ?? BANDS[BANDS.length - 1];
}

export function colorFor(pm25: number): [number, number, number, number] {
  const b = bandFor(pm25);
  return [b.rgb[0], b.rgb[1], b.rgb[2], 185];
}

export const SOURCE_LABEL: Record<string, string> = {
  industry: "Industry",
  traffic: "Traffic",
  fire: "Fire / biomass",
  dust: "Dust",
};
