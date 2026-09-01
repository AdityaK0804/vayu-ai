/**
 * CPCB-first AQI / PM2.5 colour mapping for the Risk Map and dashboard.
 *
 * India-facing UI uses CPCB categories and a proper PM2.5 → CPCB NAQI sub-index.
 * Continuous ramps interpolate inside official bands so nearby districts stay
 * distinguishable on a dark or satellite basemap.
 *
 * US-EPA helpers remain available and are explicitly named — never mix the
 * two scales on one legend or tooltip.
 */

export interface AqiBand {
  max: number;
  label: string;
  short: string;
  hex: string;
  rgb: [number, number, number];
}

/**
 * CPCB PM2.5 24-h categories (µg/m³).
 * Colours track the familiar CPCB ramp; Moderate uses gold (not pure #FFFF00)
 * so it stays legible on dark basemaps.
 */
export const CPCB_PM25_BANDS: AqiBand[] = [
  { max: 30, label: "Good", short: "0–30", hex: "#00B050", rgb: [0, 176, 80] },
  { max: 60, label: "Satisfactory", short: "31–60", hex: "#92D050", rgb: [146, 208, 80] },
  { max: 90, label: "Moderate", short: "61–90", hex: "#E6C200", rgb: [230, 194, 0] },
  { max: 120, label: "Poor", short: "91–120", hex: "#FF9900", rgb: [255, 153, 0] },
  { max: 250, label: "Very Poor", short: "121–250", hex: "#FF2000", rgb: [255, 32, 0] },
  { max: Infinity, label: "Severe", short: "250+", hex: "#800000", rgb: [128, 0, 0] },
];

/**
 * CPCB National AQI display bands (index units).
 * Breakpoints follow the NAQI report pairing with PM2.5 sub-index ranges.
 */
export const CPCB_AQI_BANDS: AqiBand[] = [
  { max: 50, label: "Good", short: "0–50", hex: "#00B050", rgb: [0, 176, 80] },
  { max: 100, label: "Satisfactory", short: "51–100", hex: "#92D050", rgb: [146, 208, 80] },
  { max: 200, label: "Moderate", short: "101–200", hex: "#E6C200", rgb: [230, 194, 0] },
  { max: 300, label: "Poor", short: "201–300", hex: "#FF9900", rgb: [255, 153, 0] },
  { max: 400, label: "Very Poor", short: "301–400", hex: "#FF2000", rgb: [255, 32, 0] },
  { max: Infinity, label: "Severe", short: "401–500", hex: "#800000", rgb: [128, 0, 0] },
];

/** @deprecated Use CPCB_AQI_BANDS — kept so older imports keep compiling. */
export const AQI_BANDS = CPCB_AQI_BANDS;

/** US-EPA style bands (only when UI explicitly says US AQI). */
export const US_AQI_BANDS: AqiBand[] = [
  { max: 50, label: "Good", short: "0–50", hex: "#00c26e", rgb: [0, 194, 110] },
  { max: 100, label: "Moderate", short: "51–100", hex: "#f2d024", rgb: [242, 208, 36] },
  { max: 150, label: "Unhealthy (sensitive)", short: "101–150", hex: "#fb923c", rgb: [251, 146, 60] },
  { max: 200, label: "Unhealthy", short: "151–200", hex: "#e11d48", rgb: [225, 29, 72] },
  { max: 300, label: "Very unhealthy", short: "201–300", hex: "#9333ea", rgb: [147, 51, 234] },
  { max: Infinity, label: "Hazardous", short: "301+", hex: "#7f1d1d", rgb: [127, 29, 29] },
];

export const NO_DATA_RGB: [number, number, number] = [96, 106, 114];

/** Continuous PM2.5 colour stops (µg/m³) — CPCB-aligned, smooth inside bands. */
const PM25_STOPS: [number, [number, number, number]][] = [
  [0, [0, 176, 80]], // Good
  [30, [0, 176, 80]],
  [45, [100, 198, 70]],
  [60, [146, 208, 80]], // Satisfactory end
  [75, [200, 200, 30]],
  [90, [230, 194, 0]], // Moderate end
  [105, [255, 170, 0]],
  [120, [255, 153, 0]], // Poor end
  [180, [255, 80, 0]],
  [250, [255, 32, 0]], // Very Poor end
  [350, [160, 0, 0]],
  [500, [96, 0, 0]],
];

/** Continuous CPCB AQI index colour stops. */
const CPCB_AQI_STOPS: [number, [number, number, number]][] = [
  [0, [0, 176, 80]],
  [50, [0, 176, 80]],
  [75, [100, 198, 70]],
  [100, [146, 208, 80]],
  [150, [230, 194, 0]],
  [200, [230, 194, 0]],
  [250, [255, 153, 0]],
  [300, [255, 153, 0]],
  [350, [255, 32, 0]],
  [400, [255, 32, 0]],
  [450, [160, 0, 0]],
  [500, [96, 0, 0]],
];

function lerpStops(
  value: number,
  stops: [number, [number, number, number]][],
): [number, number, number] {
  const v = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], value));
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, c0] = stops[i];
    const [x1, c1] = stops[i + 1];
    if (v >= x0 && v <= x1) {
      const t = x1 === x0 ? 0 : (v - x0) / (x1 - x0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * CPCB NAQI sub-index for PM2.5 (24-h).
 * Breakpoints: Conc 0–30 / 31–60 / 61–90 / 91–120 / 121–250 / 250–350
 *              AQI  0–50 / 51–100 / 101–200 / 201–300 / 301–400 / 401–500
 */
export function cpcbAqiFromPm25(pm25: number | null | undefined): number | null {
  if (pm25 == null || Number.isNaN(pm25) || pm25 < 0) return null;
  const c = pm25;
  const rows: [number, number, number, number][] = [
    [0, 30, 0, 50],
    [30, 60, 51, 100],
    [60, 90, 101, 200],
    [90, 120, 201, 300],
    [120, 250, 301, 400],
    [250, 500, 401, 500],
  ];
  if (c >= 500) return 500;
  for (const [clo, chi, ilo, ihi] of rows) {
    if (c >= clo && c <= chi) {
      const t = chi === clo ? 0 : (c - clo) / (chi - clo);
      return Math.round(ilo + t * (ihi - ilo));
    }
  }
  return 500;
}

export function cpcbPm25Band(pm25: number | null | undefined): AqiBand | null {
  if (pm25 == null || Number.isNaN(pm25)) return null;
  return CPCB_PM25_BANDS.find((b) => pm25 <= b.max) ?? CPCB_PM25_BANDS[CPCB_PM25_BANDS.length - 1];
}

export function cpcbPm25Color(pm25: number | null | undefined): [number, number, number] {
  if (pm25 == null || Number.isNaN(pm25)) return NO_DATA_RGB;
  return lerpStops(pm25, PM25_STOPS);
}

export function cpcbPm25Css(pm25: number | null | undefined): string {
  return `rgb(${cpcbPm25Color(pm25).join(",")})`;
}

/** High-contrast CSS text colour for AQI numbers in light/dark themes */
export function cpcbPm25CssReadable(pm25: number | null | undefined): string {
  if (pm25 == null || Number.isNaN(pm25)) return "var(--ink-2)";
  if (pm25 <= 30) return "#047857"; // Deep high-contrast emerald green
  if (pm25 <= 60) return "#15803d"; // Dark green
  if (pm25 <= 90) return "#d97706"; // Amber gold
  if (pm25 <= 120) return "#ea580c"; // Orange
  if (pm25 <= 250) return "#dc2626"; // Red
  return "#991b1b"; // Dark red
}

export function cpcbPm25Label(pm25: number | null | undefined): string {
  return cpcbPm25Band(pm25)?.label ?? "No data";
}

export function cpcbAqiBand(aqi: number | null | undefined): AqiBand | null {
  if (aqi == null || Number.isNaN(aqi)) return null;
  return CPCB_AQI_BANDS.find((b) => aqi <= b.max) ?? CPCB_AQI_BANDS[CPCB_AQI_BANDS.length - 1];
}

export function cpcbAqiColor(aqi: number | null | undefined): [number, number, number] {
  if (aqi == null || Number.isNaN(aqi)) return NO_DATA_RGB;
  return lerpStops(Math.max(0, Math.min(500, aqi)), CPCB_AQI_STOPS);
}

export function cpcbAqiCss(aqi: number | null | undefined): string {
  return `rgb(${cpcbAqiColor(aqi).join(",")})`;
}

export function cpcbAqiLabel(aqi: number | null | undefined): string {
  return cpcbAqiBand(aqi)?.label ?? "No data";
}

/**
 * Preferred map colour: continuous CPCB ramp on PM2.5 (µg/m³).
 * Falls back to CPCB AQI colour if only an index is available.
 */
export function riskColor(opts: {
  pm25?: number | null;
  cpcbAqi?: number | null;
  /** legacy US AQI — only used if pm25/cpcbAqi missing */
  usAqi?: number | null;
}): [number, number, number] {
  if (opts.pm25 != null && !Number.isNaN(opts.pm25)) return cpcbPm25Color(opts.pm25);
  if (opts.cpcbAqi != null && !Number.isNaN(opts.cpcbAqi)) return cpcbAqiColor(opts.cpcbAqi);
  if (opts.usAqi != null && !Number.isNaN(opts.usAqi)) {
    // Convert rough US AQI display into a PM-like colour via US bands — last resort
    return usAqiColor(opts.usAqi);
  }
  return NO_DATA_RGB;
}

export function usAqiBand(aqi: number | null | undefined): AqiBand | null {
  if (aqi == null || Number.isNaN(aqi)) return null;
  return US_AQI_BANDS.find((b) => aqi <= b.max) ?? US_AQI_BANDS[US_AQI_BANDS.length - 1];
}

export function usAqiColor(aqi: number | null | undefined): [number, number, number] {
  if (aqi == null || Number.isNaN(aqi)) return NO_DATA_RGB;
  const band = usAqiBand(aqi);
  return band ? band.rgb : NO_DATA_RGB;
}

/**
 * Default product colour helpers — CPCB AQI index based.
 * Call sites that still pass US AQI numbers should migrate to
 * cpcbPm25Css / cpcbAqiFromPm25(pm25).
 */
export function aqiBand(aqi: number | null | undefined): AqiBand | null {
  return cpcbAqiBand(aqi);
}

export function aqiColor(aqi: number | null | undefined): [number, number, number] {
  return cpcbAqiColor(aqi);
}

export const aqiCss = (aqi: number | null | undefined) => cpcbAqiCss(aqi);
export const aqiLabel = (aqi: number | null | undefined) => cpcbAqiLabel(aqi);

/** CSS gradient string for legends (PM2.5 continuous). */
export const CPCB_PM25_LEGEND_GRADIENT =
  "linear-gradient(to right, #00B050 0%, #92D050 20%, #E6C200 40%, #FF9900 55%, #FF2000 75%, #800000 100%)";

/** CSS gradient for CPCB AQI index legend. */
export const CPCB_AQI_LEGEND_GRADIENT =
  "linear-gradient(to right, #00B050 0%, #92D050 20%, #E6C200 40%, #FF9900 60%, #FF2000 80%, #800000 100%)";
