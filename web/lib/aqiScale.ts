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
  { max: 50, label: "Good", short: "0–50", hex: "#00b96b", rgb: [0, 185, 107] },
  { max: 100, label: "Moderate", short: "51–100", hex: "#c9b21c", rgb: [201, 178, 28] },
  { max: 150, label: "Unhealthy (sensitive)", short: "101–150", hex: "#ff7e00", rgb: [255, 126, 0] },
  { max: 200, label: "Unhealthy", short: "151–200", hex: "#e02020", rgb: [224, 32, 32] },
  { max: 300, label: "Very unhealthy", short: "201–300", hex: "#8f3f97", rgb: [143, 63, 151] },
  { max: Infinity, label: "Hazardous", short: "301+", hex: "#7e0023", rgb: [126, 0, 35] },
];

export const NO_DATA_RGB: [number, number, number] = [96, 106, 114];

export function aqiBand(aqi: number | null | undefined): AqiBand | null {
  if (aqi == null || Number.isNaN(aqi)) return null;
  return AQI_BANDS.find((b) => aqi <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];
}

/** Smooth ramp within/between bands so neighbouring districts stay separable. */
export function aqiColor(aqi: number | null | undefined): [number, number, number] {
  if (aqi == null || Number.isNaN(aqi)) return NO_DATA_RGB;
  const a = Math.max(0, aqi);
  let lo = 0;
  for (let i = 0; i < AQI_BANDS.length; i++) {
    const b = AQI_BANDS[i];
    if (a <= b.max) {
      const hi = b.max === Infinity ? 500 : b.max;
      const prev = i === 0 ? b : AQI_BANDS[i - 1];
      const t = Math.min(1, Math.max(0, (a - lo) / Math.max(1, hi - lo)));
      // blend 35% from the previous band so the transition is not a hard step
      const mix = 0.35 * (1 - t);
      return [
        Math.round(b.rgb[0] * (1 - mix) + prev.rgb[0] * mix),
        Math.round(b.rgb[1] * (1 - mix) + prev.rgb[1] * mix),
        Math.round(b.rgb[2] * (1 - mix) + prev.rgb[2] * mix),
      ];
    }
    lo = b.max;
  }
  return AQI_BANDS[AQI_BANDS.length - 1].rgb;
}

export const aqiCss = (aqi: number | null | undefined) => `rgb(${aqiColor(aqi).join(",")})`;
export const aqiLabel = (aqi: number | null | undefined) => aqiBand(aqi)?.label ?? "No data";
