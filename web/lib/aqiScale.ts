/**
 * Dedicated AQI colour mapping for the Risk Map.
 *
 * Colouring by the US-EPA AQI *category* (not by a compressed 0-100 index) is
 * what makes the map read: Chhattisgarh's districts land between AQI ~125 and
 * ~165, which the old index squashed into one indistinguishable band of yellow.
 * On the AQI scale those same districts spread across orange -> red, and the
 * ramp keeps going darker (purple -> maroon) as air gets genuinely dangerous.
 * The hues are the official AQI palette, with the yellow deepened so it stays
 * legible on a dark basemap.
 */

export interface AqiBand {
  max: number;
  label: string;
  short: string;
  hex: string;
  rgb: [number, number, number];
}

/** US-EPA style display bands (used for live US AQI feeds). */
export const AQI_BANDS: AqiBand[] = [
  { max: 50, label: "Good", short: "0–50", hex: "#00c26e", rgb: [0, 194, 110] },
  { max: 100, label: "Moderate", short: "51–100", hex: "#f2d024", rgb: [242, 208, 36] },
  { max: 150, label: "Unhealthy (sensitive)", short: "101–150", hex: "#e11d48", rgb: [225, 29, 72] },
  { max: 200, label: "Unhealthy", short: "151–200", hex: "#e11d48", rgb: [225, 29, 72] },
  { max: 300, label: "Very unhealthy", short: "201–300", hex: "#9333ea", rgb: [147, 51, 234] },
  { max: Infinity, label: "Hazardous", short: "301+", hex: "#7f1d1d", rgb: [127, 29, 29] },
];

/**
 * CPCB National AQI categories from PM2.5 24-hr breakpoints
 * (National Air Quality Index Report — Table 3.11 / index report.jpeg).
 * Good 0–30 · Satisfactory 31–60 · Moderate 61–90 · Poor 91–120 ·
 * Very Poor 121–250 · Severe 250+.
 */
export const CPCB_PM25_BANDS: AqiBand[] = [
  { max: 30, label: "Good", short: "0–30", hex: "#00c26e", rgb: [0, 194, 110] },
  { max: 60, label: "Satisfactory", short: "31–60", hex: "#f2d024", rgb: [242, 208, 36] },
  { max: 90, label: "Moderate", short: "61–90", hex: "#fb923c", rgb: [251, 146, 60] },
  { max: 120, label: "Poor", short: "91–120", hex: "#e11d48", rgb: [225, 29, 72] },
  { max: 250, label: "Very Poor", short: "121–250", hex: "#9333ea", rgb: [147, 51, 234] },
  { max: Infinity, label: "Severe", short: "250+", hex: "#7f1d1d", rgb: [127, 29, 29] },
];

export function cpcbPm25Band(pm25: number | null | undefined): AqiBand | null {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  return CPCB_PM25_BANDS.find((b) => pm25 <= b.max) ?? CPCB_PM25_BANDS[CPCB_PM25_BANDS.length - 1];
}

export function cpcbPm25Css(pm25: number | null | undefined): string {
  return cpcbPm25Band(pm25)?.hex ?? "#606a72";
}

export function cpcbPm25Label(pm25: number | null | undefined): string {
  return cpcbPm25Band(pm25)?.label ?? "No data";
}

/**
 * Continuous colour stops: green -> yellow -> red, no orange in the middle.
 *
 * Two things this has to solve at once. Chhattisgarh's districts currently sit
 * between AQI 25 and 75 — inside just two official categories — so a plain
 * three-stop ramp still leaves most of the state a similar yellow-green. The
 * extra stops below 100 spread that band across visibly different hues.
 *
 * Above 100 the ramp keeps darkening (deep red -> crimson -> purple -> maroon)
 * instead of flattening to one red, so a genuinely hazardous district can never
 * look the same as a merely unhealthy one.
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 208, 88]],      // green
  [20, [124, 222, 40]],   // yellow-green
  [38, [238, 226, 20]],   // yellow
  [50, [245, 205, 20]],   // gold      (Good | Moderate boundary)
  [58, [235, 60, 45]],    // red — the ramp crosses to red in 8 points, so the
                          // orange in between is a thin transition, not a band
  [78, [222, 26, 40]],    // red
  [100, [201, 12, 34]],   // deep red  (Moderate | Sensitive boundary)
  [150, [166, 10, 58]],   // crimson
  [200, [147, 51, 234]],  // purple
  [300, [127, 29, 29]],   // maroon
  [500, [90, 12, 20]],
];

export const NO_DATA_RGB: [number, number, number] = [96, 106, 114];

export function aqiBand(aqi: number | null | undefined): AqiBand | null {
  if (aqi == null || Number.isNaN(aqi)) return null;
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** Linear interpolation across the stop table above. */
export function aqiColor(aqi: number | null | undefined): [number, number, number] {
  if (aqi == null || Number.isNaN(aqi)) return NO_DATA_RGB;
  const a = Math.max(0, Math.min(500, aqi));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [x0, c0] = STOPS[i];
    const [x1, c1] = STOPS[i + 1];
    if (a >= x0 && a <= x1) {
      const t = x1 === x0 ? 0 : (a - x0) / (x1 - x0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export const aqiCss = (aqi: number | null | undefined) => `rgb(${aqiColor(aqi).join(",")})`;
export const aqiLabel = (aqi: number | null | undefined) => aqiBand(aqi)?.label ?? "No data";
