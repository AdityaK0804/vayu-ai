"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, useControl, type MapRef } from "react-map-gl/maplibre";

import {
  BASEMAP_OPTIONS,
  basemapProviderLabel,
  resolveBasemapStyle,
  type BasemapId,
} from "@/lib/basemaps";
import {
  cpcbAqiFromPm25,
  cpcbPm25Color,
  cpcbPm25Label,
  NO_DATA_RGB,
} from "@/lib/aqiScale";
import { useDistricts, type CityPoint, type DistrictProps } from "@/lib/districts";

// Types and fetch hooks live in lib/districts so non-map components can
// read district data without pulling deck.gl in.
export * from "@/lib/districts";

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

function pmOf(p: Partial<DistrictProps> & Partial<CityPoint> & Record<string, any>): number | null {
  const v = p.display_pm25 ?? p.pm25;
  return v == null || Number.isNaN(v) ? null : Number(v);
}

export default function DistrictMap({
  selected,
  onSelect,
  focus,
  showCities = true,
  showCityLabels = true,
  openCityOnFocus = true,
  interactive = true,
  initialZoom = 6.35,
  basemap = "dark",
  onBasemapChange,
  showBasemapToggle = true,
}: {
  selected: string | null;
  onSelect: (d: DistrictProps | null) => void;
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
  showCityLabels?: boolean;
  interactive?: boolean;
  initialZoom?: number;
  /** Controlled basemap; uncontrolled default is dark */
  basemap?: BasemapId;
  onBasemapChange?: (id: BasemapId) => void;
  showBasemapToggle?: boolean;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [internalBasemap, setInternalBasemap] = useState<BasemapId>(basemap);
  const { data } = useDistricts();

  const activeBasemap = onBasemapChange ? basemap : internalBasemap;
  const setBasemap = (id: BasemapId) => {
    if (onBasemapChange) onBasemapChange(id);
    else setInternalBasemap(id);
  };

  const mapStyle = useMemo(() => resolveBasemapStyle(activeBasemap), [activeBasemap]);
  const isHybrid = activeBasemap === "hybrid";

  const flyToFeature = useCallback((f: any) => {
    mapRef.current?.fitBounds(bboxOf(f.geometry), {
      padding: 90,
      duration: 1200,
      essential: true,
    });
  }, []);

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
        m.fitBounds(
          [
            [focus.bb[0], focus.bb[1]],
            [focus.bb[2], focus.bb[3]],
          ],
          {
            padding: 90,
            duration: 1600,
            essential: true,
          },
        );
      } else if (focus.lat != null && focus.lon != null) {
        m.flyTo({ center: [focus.lon, focus.lat], zoom: 9, duration: 1600, curve: 1.5, essential: true });
      }
    }
  }, [focus, data, onSelect, openCityOnFocus]);

  const layers = useMemo(() => {
    if (!data) return [];
    // Hybrid/satellite needs lighter fills so imagery reads through
    const baseAlpha = isHybrid ? 132 : 168;
    const hoverAlpha = isHybrid ? 188 : 220;
    const selAlpha = isHybrid ? 210 : 236;

    const out: any[] = [
      new GeoJsonLayer({
        id: "cg-districts",
        data: data as any,
        pickable: interactive,
        stroked: true,
        filled: true,
        extruded: false,
        getFillColor: (f: any) => {
          const pm = pmOf(f.properties);
          const c = pm == null ? NO_DATA_RGB : cpcbPm25Color(pm);
          const isSel = f.properties.name === selected;
          const isHov = f.properties.name === hover;
          const lift = isSel ? 28 : isHov ? 18 : 0;
          const a = isSel ? selAlpha : isHov ? hoverAlpha : baseAlpha;
          return [
            Math.min(255, c[0] + lift),
            Math.min(255, c[1] + lift),
            Math.min(255, c[2] + lift),
            a,
          ];
        },
        getLineColor: (f: any) =>
          f.properties.name === selected
            ? [255, 255, 255, 255]
            : f.properties.name === hover
              ? [255, 255, 255, 230]
              : isHybrid
                ? [255, 255, 255, 120]
                : [8, 14, 16, 220],
        getLineWidth: (f: any) =>
          f.properties.name === selected ? 3.2 : f.properties.name === hover ? 2.6 : 1.6,
        lineWidthUnits: "pixels",
        lineWidthMinPixels: 1.2,
        transitions: {
          getFillColor: { duration: 260, easing: (t: number) => 1 - Math.pow(1 - t, 3) },
          getLineWidth: { duration: 200 },
          getLineColor: { duration: 200 },
        },
        updateTriggers: {
          getFillColor: [selected, hover, isHybrid],
          getLineColor: [selected, hover, isHybrid],
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
          getRadius: 6.5,
          getFillColor: [255, 255, 255, 245],
          getLineColor: (d: CityPoint) =>
            d.has_stations ? [8, 14, 13, 245] : [64, 214, 197, 255],
          lineWidthUnits: "pixels",
          getLineWidth: (d: CityPoint) => (d.has_stations ? 2 : 3),
        }),
      );

      if (showCityLabels) {
        out.push(
          new TextLayer({
            id: "cg-city-labels",
            data: data.cities,
            pickable: false,
            getPosition: (d: CityPoint) => [d.lon, d.lat],
            getText: (d: CityPoint) => {
              const pm = pmOf(d);
              const caqi = cpcbAqiFromPm25(pm);
              return caqi != null ? `${d.name} · ${caqi}` : d.name;
            },
            getSize: 12,
            sizeUnits: "pixels",
            getColor: [255, 255, 255, 252],
            getTextAnchor: "start",
            getAlignmentBaseline: "center",
            getPixelOffset: [13, 0],
            background: true,
            getBackgroundColor: isHybrid ? [10, 14, 18, 210] : [6, 12, 11, 225],
            backgroundPadding: [7, 4, 7, 4],
            getBorderColor: [255, 255, 255, 55],
            getBorderWidth: 1,
            fontWeight: 600,
            characterSet: "auto",
            fontSettings: { sdf: true, buffer: 8 },
            updateTriggers: {
              getText: [data.cities],
              getBackgroundColor: [isHybrid],
            },
          }),
        );
      }
    }
    return out;
  }, [
    data,
    selected,
    hover,
    onSelect,
    flyToFeature,
    showCities,
    showCityLabels,
    interactive,
    isHybrid,
  ]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 82.1, latitude: 21.2, zoom: initialZoom, pitch: 0, bearing: 0 }}
        mapStyle={mapStyle as any}
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
            const p = object.properties ?? object;
            if (p?.name == null) return null;
            const pm = pmOf(p);
            const caqi = cpcbAqiFromPm25(pm);
            const cat = cpcbPm25Label(pm);
            const c = pm == null ? NO_DATA_RGB : cpcbPm25Color(pm);
            const measured = p.display_basis === "measured";
            const pmTxt = pm == null ? "—" : `${Math.round(pm)}`;
            const aqiTxt = caqi == null ? "—" : String(caqi);
            return {
              html: `<div style="font-family:var(--font-body);font-size:12px;line-height:1.55;min-width:160px">
                  <b style="font-size:13px">${p.name}</b><br/>
                  <span style="font-family:var(--font-mono)">
                    <span style="color:rgb(${c.join(",")})">AQI ${aqiTxt}</span>
                    <span style="opacity:.75"> (CPCB)</span>
                  </span><br/>
                  <span style="font-family:var(--font-mono)">${pmTxt} µg/m³ · ${cat}</span><br/>
                  <span style="opacity:.72">${
                    measured
                      ? `live · ${p.live_stations ?? 0} CPCB station${(p.live_stations ?? 0) > 1 ? "s" : ""}`
                      : p.n_stations > 0
                        ? `${p.n_stations} station(s) · model`
                        : p.has_stations
                          ? "city · stations"
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

      {showBasemapToggle && interactive && (
        <div
          className="map-basemap-toggle"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 5,
            display: "flex",
            gap: 4,
            padding: 4,
            borderRadius: 10,
            background: "color-mix(in oklch, var(--surface) 92%, transparent)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(8px)",
          }}
          title={`Basemap · ${basemapProviderLabel()}`}
        >
          {BASEMAP_OPTIONS.map((opt) => {
            const on = activeBasemap === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBasemap(opt.id)}
                title={opt.label}
                style={{
                  border: 0,
                  cursor: "pointer",
                  borderRadius: 7,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  fontFamily: "var(--font-body)",
                  background: on ? "var(--ink)" : "transparent",
                  color: on ? "var(--bg)" : "var(--ink-2)",
                }}
              >
                {opt.short}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
