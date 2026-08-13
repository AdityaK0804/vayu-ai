"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
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
import type { LiveApiFire, LiveApiStation } from "@/lib/types";
import { useWhatIf } from "@/lib/data";
import { useApp } from "@/lib/store";

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
  liveStations = [],
  liveFires = [],
  showLiveStations = true,
  showLiveFires = true,
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
  /** Phase 5.1 live overlays from FastAPI (optional) */
  liveStations?: LiveApiStation[];
  liveFires?: LiveApiFire[];
  showLiveStations?: boolean;
  showLiveFires?: boolean;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [internalBasemap, setInternalBasemap] = useState<BasemapId>(basemap);
  const [is3D, setIs3D] = useState(false);
  const [pulse, setPulse] = useState(false);
  const { data } = useDistricts();

  const scenarioActive = useApp((s) => s.scenarioActive);
  const { data: whatif } = useWhatIf();

  useEffect(() => {
    const timer = setInterval(() => setPulse((p) => !p), 1200);
    return () => clearInterval(timer);
  }, []);

  const activeBasemap = onBasemapChange ? basemap : internalBasemap;
  const setBasemap = (id: BasemapId) => {
    if (onBasemapChange) onBasemapChange(id);
    else setInternalBasemap(id);
  };

  const toggle3D = () => {
    const next3D = !is3D;
    setIs3D(next3D);
    mapRef.current?.flyTo({
      pitch: next3D ? 45 : 0,
      bearing: next3D ? -12 : 0,
      duration: 1000,
    });
  };

  const resetDistrictView = () => {
    mapRef.current?.flyTo({
      center: [82.1, 21.2],
      zoom: initialZoom,
      pitch: is3D ? 45 : 0,
      bearing: is3D ? -12 : 0,
      duration: 1000,
    });
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
        id: `cg-districts-${is3D ? "3d" : "2d"}`,
        data: data as any,
        pickable: interactive,
        stroked: true,
        filled: true,
        extruded: is3D,
        wireframe: is3D,
        getElevation: (f: any) => {
          const pm = pmOf(f.properties);
          return pm == null ? 0 : pm * 450;
        },
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
          getFillColor: [selected, hover, isHybrid, is3D, scenarioActive],
          getLineColor: [selected, hover, isHybrid, is3D, scenarioActive],
          getLineWidth: [selected, hover],
          getElevation: [is3D],
        },
        onHover: (info: any) => setHover(info?.object?.properties?.name ?? null),
        onClick: (info: any) => {
          if (!info?.object) return;
          onSelect(info.object.properties);
          flyToFeature(info.object);
        },
      }),
    ];

    if (scenarioActive && whatif?.hex_deltas) {
      out.push(
        new H3HexagonLayer({
          id: "whatif-delta-layer",
          data: whatif.hex_deltas,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: false,
          getHexagon: (d: any) => d.h3,
          getFillColor: (d: any) => {
            if (d.delta_pm25 < -0.1) return [34, 197, 94, 200]; // Green (better)
            if (d.delta_pm25 > 0.1) return [239, 68, 68, 200]; // Red (worse)
            return [150, 150, 150, 50]; // Neutral
          },
          getLineColor: [255, 255, 255, 100],
          lineWidthMinPixels: 1,
        })
      );
    }

    if (showCities && data.cities?.length) {
      out.push(
        new ScatterplotLayer({
          id: "cg-cities-pulse",
          data: data.cities,
          pickable: false,
          stroked: false,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: CityPoint) => [d.lon, d.lat],
          getRadius: pulse ? 18 : 11,
          getFillColor: (d: CityPoint) =>
            d.has_stations
              ? [249, 115, 22, pulse ? 70 : 160]
              : [251, 146, 60, pulse ? 55 : 120],
          transitions: {
            getRadius: { duration: 1100 },
            getFillColor: { duration: 1100 },
          },
          updateTriggers: {
            getRadius: [pulse],
            getFillColor: [pulse],
          },
        }),
        new ScatterplotLayer({
          id: "cg-cities",
          data: data.cities,
          pickable: interactive,
          stroked: false,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: CityPoint) => [d.lon, d.lat],
          getRadius: 9.5,
          getFillColor: (d: CityPoint) =>
            d.has_stations ? [249, 115, 22, 255] : [251, 146, 60, 240],
          onClick: (info: any) => {
            if (!info?.object) return;
            const c = info.object;
            const host = data.features.find((f: any) => {
              const [[w, s2], [e, n]] = bboxOf(f.geometry);
              return c.lon >= w && c.lon <= e && c.lat >= s2 && c.lat <= n;
            });
            if (host) onSelect(host.properties);
            mapRef.current?.flyTo({ center: [c.lon, c.lat], zoom: 9.6, duration: 1200 });
          },
        }),
      );
    }

    // Live station pulses (FastAPI / Redis snapshot)
    const stations = (liveStations || []).filter(
      (s) => s.lat != null && s.lon != null && Number.isFinite(s.lat) && Number.isFinite(s.lon),
    );
    if (showLiveStations && stations.length) {
      out.push(
        new ScatterplotLayer({
          id: "live-stations-pulse",
          data: stations,
          pickable: false,
          stroked: false,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: LiveApiStation) => [Number(d.lon), Number(d.lat)],
          getRadius: pulse ? 22 : 12,
          getFillColor: [45, 212, 191, pulse ? 90 : 160],
          transitions: { getRadius: { duration: 1100 }, getFillColor: { duration: 1100 } },
          updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
        }),
        new ScatterplotLayer({
          id: "live-stations",
          data: stations,
          pickable: interactive,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: LiveApiStation) => [Number(d.lon), Number(d.lat)],
          getRadius: 7,
          getLineWidth: 1.5,
          lineWidthUnits: "pixels",
          getFillColor: (d: LiveApiStation) => {
            const rgb = cpcbPm25Color(d.pm25 ?? null);
            return [...rgb, 230] as [number, number, number, number];
          },
          getLineColor: [255, 255, 255, 180],
          updateTriggers: { getFillColor: [stations.length] },
        }),
      );
    }

    // Live FIRMS fire markers
    const fires = (liveFires || [])
      .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
      .slice(0, 400);
    if (showLiveFires && fires.length) {
      out.push(
        new ScatterplotLayer({
          id: "live-fires",
          data: fires,
          pickable: interactive,
          stroked: false,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: LiveApiFire) => [d.lon, d.lat],
          getRadius: (d: LiveApiFire) => Math.min(14, 4 + Math.sqrt(Math.max(d.frp ?? 1, 1))),
          getFillColor: [239, 68, 68, 200],
        }),
      );
    }

    return out;
  }, [
    data,
    selected,
    hover,
    onSelect,
    flyToFeature,
    showCities,
    interactive,
    isHybrid,
    is3D,
    pulse,
    liveStations,
    liveFires,
    showLiveStations,
    showLiveFires,
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
            return {
              html: `<div style="font-family:var(--font-body);font-size:12.5px;font-weight:600;letter-spacing:0.02em">${p.name}</div>`,
              style: {
                background: "var(--surface)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
                padding: "6px 10px",
                borderRadius: "8px",
                boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
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
            gap: 6,
            alignItems: "center",
            padding: "4px 6px",
            borderRadius: 10,
            background: "color-mix(in oklch, var(--surface) 92%, transparent)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(10px)",
          }}
          title={`Basemap · ${basemapProviderLabel()}`}
        >
          <div style={{ display: "flex", gap: 3 }}>
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
                    borderRadius: 6,
                    padding: "5px 9px",
                    fontSize: 10.5,
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

          <div style={{ width: 1, height: 16, background: "var(--line)" }} />

          {/* 3D Extrusion toggle button */}
          <button
            type="button"
            onClick={toggle3D}
            title="Toggle 3D Extruded Districts"
            style={{
              border: "1px solid var(--line)",
              cursor: "pointer",
              borderRadius: 6,
              padding: "5px 9px",
              fontSize: 10.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: is3D ? "var(--accent)" : "var(--surface-2)",
              color: is3D ? "#fff" : "var(--ink)",
            }}
          >
            <span>{is3D ? "🧊 3D On" : "🗺 2D"}</span>
          </button>

          {/* Reset View Button */}
          <button
            type="button"
            onClick={resetDistrictView}
            title="Reset Camera View"
            style={{
              border: "1px solid var(--line)",
              cursor: "pointer",
              borderRadius: 6,
              padding: "5px 8px",
              fontSize: 10.5,
              background: "var(--surface-2)",
              color: "var(--ink-2)",
            }}
          >
            🎯 Recenter
          </button>
        </div>
      )}
    </div>
  );
}
