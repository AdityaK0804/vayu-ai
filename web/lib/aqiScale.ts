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

export const AQI_BANDS: AqiBand[] = [
  { max: 50, label: "Good", short: "0–50", hex: "#00c26e", rgb: [0, 194, 110] },
  { max: 100, label: "Moderate", short: "51–100", hex: "#f2d024", rgb: [242, 208, 36] },
  { max: 150, label: "Unhealthy (sensitive)", short: "101–150", hex: "#f97316", rgb: [249, 115, 22] },
  { max: 200, label: "Unhealthy", short: "151–200", hex: "#e11d48", rgb: [225, 29, 72] },
  { max: 300, label: "Very unhealthy", short: "201–300", hex: "#9333ea", rgb: [147, 51, 234] },
  { max: Infinity, label: "Hazardous", short: "301+", hex: "#7f1d1d", rgb: [127, 29, 29] },
];

/**
 * Continuous colour stops.
 *
 * Chhattisgarh currently sits between AQI 25 and 75 — inside just two official
 * categories — so colouring straight from AQI_BANDS painted the entire state
 * one shade of green and one of yellow. These extra stops give the 0-100 range
 * real separation (deep green -> lime -> yellow -> amber) while keeping the
 * official hue at each category boundary, so the legend still reads true.
 */
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 168, 107]],     // deep green
  [25, [99, 209, 58]],    // lime
  [50, [242, 208, 36]],   // yellow  (Good | Moderate boundary)
  [75, [247, 144, 32]],   // amber
  [100, [249, 115, 22]],  // orange  (Moderate | Sensitive boundary)
  [150, [225, 29, 72]],   // red
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
