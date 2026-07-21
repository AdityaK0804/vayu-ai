"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, useControl, type MapRef } from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";

import { aqiColor, NO_DATA_RGB } from "@/lib/aqiScale";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Bumped whenever bake_districts.py changes shape. Without this the browser
// keeps serving a previously cached bake and every new field reads `undefined`.
const DATA_URL = "/data/cg_districts.json?v=3";

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
}

export function useDistricts() {
  return useQuery({
    queryKey: ["cg_districts_v3"],
    queryFn: async (): Promise<DistrictsFC> => {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`districts: HTTP ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
  });
}

function DeckOverlay(props: any) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, ...props }));
  overlay.setProps(props);
  return null;
}

function bboxOf(geometry: any): [[number, number], [number, number]] {
  const coords: number[][] = [];
  const walk = (c: any) => {
    if (typeof c[0] === "number") coords.push(c as number[]);
    else c.forEach(walk);
  };
  walk(geometry.coordinates);
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

export default function DistrictMap({
  selected,
  onSelect,
  focus,
  showCities = true,
}: {
  selected: string | null;
  onSelect: (d: DistrictProps | null) => void;
  /** name of a district or city to fly to (from the search box) */
  focus?: { kind: "district" | "city"; name: string; nonce: number } | null;
  showCities?: boolean;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const { data } = useDistricts();

  const flyToFeature = useCallback((f: any) => {
    mapRef.current?.fitBounds(bboxOf(f.geometry), { padding: 90, duration: 850 });
  }, []);

  // search-driven focus
  useEffect(() => {
    if (!focus || !data) return;
    if (focus.kind === "district") {
      const f = data.features.find((x) => x.properties.name === focus.name);
      if (f) {
        onSelect(f.properties);
        flyToFeature(f);
      }
    } else {
      const c = data.cities?.find((x) => x.name === focus.name);
      if (c) mapRef.current?.flyTo({ center: [c.lon, c.lat], zoom: 9.4, duration: 850 });
    }
  }, [focus, data, flyToFeature, onSelect]);

  const layers = useMemo(() => {
    if (!data) return [];
    const out: any[] = [
      new GeoJsonLayer({
        id: "cg-districts",
        data: data as any,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: false, // flat: the extruded walls looked like torn paper at low pitch
        getFillColor: (f: any) => {
          const c = aqiColor(f.properties.us_aqi);
          const isSel = f.properties.name === selected;
          const isHov = f.properties.name === hover;
          // "pop": brighten + go fully opaque on hover, eased by transitions
          const lift = isSel ? 42 : isHov ? 30 : 0;
          return [
            Math.min(255, c[0] + lift),
            Math.min(255, c[1] + lift),
            Math.min(255, c[2] + lift),
            isSel ? 255 : isHov ? 246 : 214,
          ];
        },
        // dark, near-black borders so districts read as distinct tiles
        getLineColor: (f: any) =>
          f.properties.name === selected
            ? [255, 255, 255, 255]
            : f.properties.name === hover
              ? [255, 255, 255, 210]
              : [6, 12, 11, 235],
        getLineWidth: (f: any) =>
          f.properties.name === selected ? 2.6 : f.properties.name === hover ? 2.2 : 1.1,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1,
        transitions: {
          getFillColor: { duration: 260, easing: (t: number) => 1 - Math.pow(1 - t, 3) },
          getLineWidth: { duration: 200 },
          getLineColor: { duration: 200 },
        },
        updateTriggers: {
          getFillColor: [selected, hover],
          getLineColor: [selected, hover],
          getLineWidth: [selected, hover],
        },
        onHover: (info: any) => setHover(info?.object?.properties?.name ?? null),
        onClick: (info: any) => {
          if (!info?.object) return;
          onSelect(info.object.properties);
          flyToFeature(info.object);
        },
      }),
    ];

    if (showCities && data.cities?.length) {
      out.push(
        new ScatterplotLayer({
          id: "cg-cities",
          data: data.cities,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: CityPoint) => [d.lon, d.lat],
          getRadius: 6,
          getFillColor: [255, 255, 255, 245],
          // zero-station cities get an accent ring — the reveal, on the map
          getLineColor: (d: CityPoint) =>
            d.has_stations ? [8, 14, 13, 245] : [64, 214, 197, 255],
          lineWidthUnits: "pixels",
          getLineWidth: (d: CityPoint) => (d.has_stations ? 2 : 3),
        }),
        new TextLayer({
          id: "cg-city-labels",
          data: data.cities,
          pickable: false,
          getPosition: (d: CityPoint) => [d.lon, d.lat],
          getText: (d: CityPoint) => `${d.name} · ${d.us_aqi}`,
          getSize: 12,
          sizeUnits: "pixels",
          getColor: [255, 255, 255, 252],
          getTextAnchor: "start",
          getAlignmentBaseline: "center",
          getPixelOffset: [13, 0],
          // solid plate behind the label — the single biggest legibility win
          // over a coloured choropleth
          background: true,
          getBackgroundColor: [6, 12, 11, 225],
          backgroundPadding: [7, 4, 7, 4],
          getBorderColor: [255, 255, 255, 55],
          getBorderWidth: 1,
          fontWeight: 600,
          characterSet: "auto",
          fontSettings: { sdf: true, buffer: 8 },
        }),
      );
    }
    return out;
  }, [data, selected, hover, onSelect, flyToFeature, showCities]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 82.1, latitude: 21.2, zoom: 6.35, pitch: 0, bearing: 0 }}
        mapStyle={BASEMAP}
        style={{ width: "100%", height: "100%", background: "#060b0a" }}
        attributionControl={false}
      >
        <AttributionControl compact position="bottom-right" />
        <DeckOverlay
          layers={layers}
          getCursor={({ isHovering }: any) => (isHovering ? "pointer" : "grab")}
          getTooltip={({ object }: any) => {
            if (!object) return null;
            // NB: every GeoJSON feature carries an `id`, so sniffing for one to
            // tell cities from districts silently handed us the feature instead
            // of its properties — which is where the `undefined`s came from.
            const p = object.properties ?? object;
            if (p?.name == null) return null;
            const c = aqiColor(p.us_aqi);
            return {
              html: `<div style="font-family:var(--font-body);font-size:12px;line-height:1.55">
                  <b style="font-size:13px">${p.name}</b><br/>
                  <span style="font-family:var(--font-mono)">${p.pm25} µg/m³ ·
                    <span style="color:rgb(${c.join(",")})">AQI ${p.us_aqi}</span></span><br/>
                  <span style="opacity:.72">${
                    p.n_stations > 0
                      ? `${p.n_stations} CPCB station${p.n_stations > 1 ? "s" : ""}`
                      : "no ground sensor — predicted"
                  }</span>
                </div>`,
              style: {
                background: "var(--surface)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
                padding: "9px 12px",
                borderRadius: "10px",
                boxShadow: "var(--shadow)",
              },
            };
          }}
        />
      </Map>
    </div>
  );
}
