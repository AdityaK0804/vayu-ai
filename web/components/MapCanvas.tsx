"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { AttributionControl, useControl, type MapRef } from "react-map-gl/maplibre";

import { colorFor } from "@/lib/aqi";
import {
  BASEMAP_OPTIONS,
  basemapProviderLabel,
  resolveBasemapStyle,
  type BasemapId,
} from "@/lib/basemaps";
import { cpcbAqiFromPm25, cpcbPm25Label } from "@/lib/aqiScale";
import { useForecast, usePriority, useStations } from "@/lib/data";
import { useApp } from "@/lib/store";
import { selectFrame } from "@/lib/types";

const VIEWS: Record<string, { longitude: number; latitude: number; zoom: number }> = {
  korba: { longitude: 82.75, latitude: 22.36, zoom: 9.2 },
  jagdalpur: { longitude: 82.03, latitude: 19.08, zoom: 9.2 },
};

function DeckOverlay(props: any) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, ...props }));
  overlay.setProps(props);
  return null;
}

export default function MapCanvas() {
  const { city, timeIndex, layer, revealed, selectedCell, selectCell } = useApp();
  const mapRef = useRef<MapRef | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>("dark");

  const { data: forecast } = useForecast(city);
  const { data: priority } = usePriority(city);
  const { data: stations } = useStations(city);

  const cells = useMemo(() => selectFrame(forecast, timeIndex), [forecast, timeIndex]);
  const mapStyle = useMemo(() => resolveBasemapStyle(basemap), [basemap]);
  const isHybrid = basemap === "hybrid";

  useEffect(() => {
    const v = VIEWS[city];
    mapRef.current?.flyTo({ center: [v.longitude, v.latitude], zoom: v.zoom, duration: 1200 });
  }, [city]);

  useEffect(() => {
    if (!selectedCell || !priority) return;
    const d = priority.dossiers.find((x) => x.cell === selectedCell);
    if (d) mapRef.current?.flyTo({ center: [d.lon, d.lat], zoom: 11.5, duration: 900 });
  }, [selectedCell, priority]);

  const hidden = city === "jagdalpur" && !revealed;

  const layers = useMemo(() => {
    if (hidden) return [];
    const alpha = isHybrid ? 150 : layer === "forecast" ? 175 : 140;
    const out: any[] = [
      new H3HexagonLayer({
        id: `hex-${city}-${timeIndex}`,
        data: cells,
        pickable: true,
        wireframe: false,
        filled: true,
        extruded: false,
        highPrecision: false,
        coverage: 0.92,
        getHexagon: (d: any) => d.h3,
        getFillColor: (d: any) => colorFor(d.pm25, alpha),
        getLineColor: isHybrid ? [255, 255, 255, 50] : [200, 162, 74, 55],
        lineWidthMinPixels: 0,
        opacity: 1,
        updateTriggers: { getFillColor: [timeIndex, alpha], getLineColor: [isHybrid] },
        onClick: (info: any) => info?.object && selectCell(info.object.h3),
      }),
    ];

    if (layer === "priority" && priority) {
      out.push(
        new ScatterplotLayer({
          id: `wards-${city}`,
          data: priority.dossiers,
          pickable: true,
          stroked: true,
          filled: false,
          radiusUnits: "pixels",
          getPosition: (d: any) => [d.lon, d.lat],
          getRadius: (d: any) => 16 - d.rank * 0.5,
          getLineColor: [200, 162, 74, 230],
          lineWidthMinPixels: 2,
          onClick: (info: any) => info?.object && selectCell(info.object.cell),
        }),
      );
    }

    if (stations?.has_stations) {
      out.push(
        new ScatterplotLayer({
          id: `stations-${city}`,
          data: stations.stations,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: any) => [d.lon, d.lat],
          getRadius: 5.5,
          getFillColor: [236, 231, 220, 240],
          getLineColor: [10, 10, 11, 255],
          lineWidthMinPixels: 2,
        }),
      );
    }
    return out;
  }, [cells, city, hidden, layer, priority, stations, timeIndex, selectCell, isHybrid]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{ ...VIEWS[city], pitch: 0, bearing: 0 }}
        mapStyle={mapStyle as any}
        style={{ width: "100%", height: "100%", background: "var(--carbon)" }}
        attributionControl={false}
      >
        <AttributionControl compact position="bottom-right" />
        <DeckOverlay
          layers={layers}
          getTooltip={({ object }: any) => {
            if (!object || object.pm25 === undefined) return null;
            const pm = object.pm25;
            const caqi = cpcbAqiFromPm25(pm);
            const cat = cpcbPm25Label(pm);
            return {
              html: `<div style="font-family:var(--font-mono);font-size:11px;line-height:1.5">
                <div><b>AQI ${caqi ?? "—"}</b> <span style="opacity:.7">(CPCB)</span></div>
                <div>${Math.round(pm)} µg/m³ · ${cat}</div>
              </div>`,
              style: {
                background: "var(--surface-2)",
                color: "var(--ink)",
                border: "1px solid var(--accent-dim)",
                padding: "6px 8px",
                borderRadius: "6px",
              },
            };
          }}
        />
      </Map>

      <div
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
          const on = basemap === opt.id;
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
                background: on ? "var(--ink)" : "transparent",
                color: on ? "var(--bg)" : "var(--ink-2)",
              }}
            >
              {opt.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
