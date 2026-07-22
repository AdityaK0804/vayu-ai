"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, useControl, type MapRef } from "react-map-gl/maplibre";

import { aqiColor, NO_DATA_RGB } from "@/lib/aqiScale";
import { useDistricts, type CityPoint, type DistrictProps } from "@/lib/districts";
// Types and fetch hooks now live in lib/districts so non-map components can
// read district data without pulling deck.gl in. Re-exported for callers that
// still import them from here.
export * from "@/lib/districts";

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";


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
  openCityOnFocus = true,
  interactive = true,
}: {
  selected: string | null;
  onSelect: (d: DistrictProps | null) => void;
  /** name of a district or city to fly to (from the search box) */
  /** when a CITY is focused, whether to also open its host district panel */
  openCityOnFocus?: boolean;
  focus?: {
    kind: "district" | "city" | "india";
    name: string;
    nonce: number;
    bb?: [number, number, number, number];
    lat?: number;
    lon?: number;
  } | null;
  showCities?: boolean;
  /** false on the landing page: a preview should look live, not invite panning */
  interactive?: boolean;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const { data } = useDistricts();

  const flyToFeature = useCallback((f: any) => {
    mapRef.current?.fitBounds(bboxOf(f.geometry), {
      padding: 90,
      duration: 1200,
      essential: true,
    });
  }, []);

  // search-driven focus
  // One easing curve for every kind of navigation — search, dropdown, click —
  // so arriving somewhere always feels the same.
  const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

  useEffect(() => {
    if (!focus) return;
    const m = mapRef.current;
    if (!m) return;

    if (focus.kind === "district" && data) {
      const f = data.features.find((x) => x.properties.name === focus.name);
      if (f) {
        onSelect(f.properties);
        m.fitBounds(bboxOf(f.geometry), { padding: 90, duration: 1400, essential: true });
      }
      return;
    }
    if (focus.kind === "city" && data) {
      const c = data.cities?.find((x) => x.name === focus.name);
      if (c) {
        m.flyTo({ center: [c.lon, c.lat], zoom: 9.6, duration: 1500, curve: 1.5, essential: true });
        // The dashboard shows a dedicated CITY panel, so it opts out of this.
        // Elsewhere (e.g. search), falling back to the host district is still
        // better than a bare viewport move.
        if (openCityOnFocus) {
          const host = data.features.find((f) => {
            const [[w, s2], [e, n]] = bboxOf(f.geometry);
            return c.lon >= w && c.lon <= e && c.lat >= s2 && c.lat <= n;
          });
          if (host) onSelect(host.properties);
        }
      }
      return;
    }
    if (focus.kind === "india") {
      if (focus.bb) {
        m.fitBounds([[focus.bb[0], focus.bb[1]], [focus.bb[2], focus.bb[3]]], {
          padding: 90,
          duration: 1600,
          essential: true,
        });
      } else if (focus.lat != null && focus.lon != null) {
        m.flyTo({ center: [focus.lon, focus.lat], zoom: 9, duration: 1600, curve: 1.5, essential: true });
      }
    }
  }, [focus, data, onSelect, openCityOnFocus]);

  const layers = useMemo(() => {
    if (!data) return [];
    const out: any[] = [
      new GeoJsonLayer({
        id: "cg-districts",
        data: data as any,
        pickable: interactive,
        stroked: true,
        filled: true,
        extruded: false, // flat: the extruded walls looked like torn paper at low pitch
        getFillColor: (f: any) => {
          const c = aqiColor(f.properties.display_aqi ?? f.properties.us_aqi);
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
          pickable: interactive,
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
  }, [data, selected, hover, onSelect, flyToFeature, showCities, interactive]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 82.1, latitude: 21.2, zoom: 6.35, pitch: 0, bearing: 0 }}
        mapStyle={BASEMAP}
        style={{ width: "100%", height: "100%", background: "#060b0a" }}
        attributionControl={false}
        interactive={interactive}
        dragPan={interactive}
        dragRotate={interactive}
        scrollZoom={interactive}
        doubleClickZoom={interactive}
        touchZoomRotate={interactive}
        keyboard={interactive}
      >
        <AttributionControl compact position="bottom-right" />
        <DeckOverlay
          layers={layers}
          getCursor={({ isHovering }: any) =>
            !interactive ? "default" : isHovering ? "pointer" : "grab"
          }
          getTooltip={({ object }: any) => {
            if (!object) return null;
            // NB: every GeoJSON feature carries an `id`, so sniffing for one to
            // tell cities from districts silently handed us the feature instead
            // of its properties — which is where the `undefined`s came from.
            const p = object.properties ?? object;
            if (p?.name == null) return null;
            const pm = p.display_pm25 ?? p.pm25;
            const aq = p.display_aqi ?? p.us_aqi;
            const c = aqiColor(aq);
            const measured = p.display_basis === "measured";
            return {
              html: `<div style="font-family:var(--font-body);font-size:12px;line-height:1.55">
                  <b style="font-size:13px">${p.name}</b><br/>
                  <span style="font-family:var(--font-mono)">${pm} µg/m³ ·
                    <span style="color:rgb(${c.join(",")})">AQI ${aq}</span></span><br/>
                  <span style="opacity:.72">${
                    measured
                      ? `live · ${p.live_stations} CPCB station${p.live_stations > 1 ? "s" : ""}`
                      : p.n_stations > 0
                        ? `${p.n_stations} station(s) · model`
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
