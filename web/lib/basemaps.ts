/**
 * Basemap styles for MapLibre.
 *
 * Prefer MapTiler when NEXT_PUBLIC_MAPTILER_KEY is set (best labels + hybrid).
 * Otherwise use free fallbacks that still look detailed enough for a personal
 * project: OpenFreeMap dark/streets + Esri World Imagery for satellite/hybrid.
 */

export type BasemapId = "dark" | "streets" | "hybrid";

export type BasemapOption = {
  id: BasemapId;
  label: string;
  /** Short chip label on the map control */
  short: string;
};

/** Style URL string or inline MapLibre style object */
export type MapStyleInput = string | Record<string, unknown>;

export const BASEMAP_OPTIONS: BasemapOption[] = [
  { id: "dark", label: "Dark streets", short: "Dark" },
  { id: "streets", label: "Detailed streets", short: "Streets" },
  { id: "hybrid", label: "Satellite hybrid", short: "Satellite" },
];

const MAPTILER_KEY =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MAPTILER_KEY?.trim() : "";

/** Esri World Imagery — free raster tiles, no key (attribution required). */
export const ESRI_SATELLITE_STYLE: MapStyleInput = {
  version: 8,
  name: "Esri World Imagery",
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "esri-satellite",
      type: "raster",
      source: "esri",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

function maptiler(style: string): string {
  return `https://api.maptiler.com/maps/${style}/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Resolve a basemap style URL or inline style object for react-map-gl / MapLibre.
 */
export function resolveBasemapStyle(id: BasemapId = "dark"): MapStyleInput {
  if (MAPTILER_KEY) {
    switch (id) {
      case "streets":
        return maptiler("streets-v2");
      case "hybrid":
        return maptiler("hybrid");
      case "dark":
      default:
        return maptiler("dataviz-dark");
    }
  }

  switch (id) {
    case "streets":
      return "https://tiles.openfreemap.org/styles/liberty";
    case "hybrid":
      return ESRI_SATELLITE_STYLE;
    case "dark":
    default:
      return "https://tiles.openfreemap.org/styles/dark";
  }
}

export function hasMapTilerKey(): boolean {
  return Boolean(MAPTILER_KEY);
}

export function basemapProviderLabel(): string {
  return MAPTILER_KEY ? "MapTiler" : "OpenFreeMap / Esri";
}
