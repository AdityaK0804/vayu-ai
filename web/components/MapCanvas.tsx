"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
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
  const [is3D, setIs3D] = useState(false);
  const [showStations, setShowStations] = useState(true);
  const [showWards, setShowWards] = useState(true);
  const [showWind, setShowWind] = useState(true);

  const { data: forecast } = useForecast(city);
  const { data: priority } = usePriority(city);
  const { data: stations } = useStations(city);

  const cells = useMemo(() => selectFrame(forecast, timeIndex), [forecast, timeIndex]);
  const mapStyle = useMemo(() => resolveBasemapStyle(basemap), [basemap]);
  const isHybrid = basemap === "hybrid";

  const selectedCellData = useMemo(() => {
    if (!selectedCell || !cells) return null;
    return cells.find((c: any) => c.h3 === selectedCell) || null;
  }, [selectedCell, cells]);

  const windLines = useMemo(() => {
    if (!showWind || !cells) return [];
    return cells
      .filter((_: any, idx: number) => idx % 3 === 0)
      .map((c: any) => {
        const length = Math.min(0.014, Math.max(0.006, (c.pm25 / 120) * 0.012));
        return {
          from: [c.lon, c.lat],
          to: [c.lon + length * 0.8, c.lat + length * 0.6],
          pm25: c.pm25,
        };
      });
  }, [cells, showWind]);

  useEffect(() => {
    const v = VIEWS[city];
    mapRef.current?.flyTo({
      center: [v.longitude, v.latitude],
      zoom: v.zoom,
      pitch: is3D ? 52 : 0,
      bearing: is3D ? -18 : 0,
      duration: 1200,
    });
  }, [city, is3D]);

  useEffect(() => {
    if (!selectedCell || !priority) return;
    const d = priority.dossiers.find((x) => x.cell === selectedCell);
    if (d) mapRef.current?.flyTo({ center: [d.lon, d.lat], zoom: 11.5, duration: 900 });
  }, [selectedCell, priority]);

  const toggle3D = () => {
    const next3D = !is3D;
    setIs3D(next3D);
    mapRef.current?.flyTo({
      pitch: next3D ? 52 : 0,
      bearing: next3D ? -18 : 0,
      duration: 1000,
    });
  };

  const resetView = () => {
    const v = VIEWS[city];
    mapRef.current?.flyTo({
      center: [v.longitude, v.latitude],
      zoom: v.zoom,
      pitch: is3D ? 52 : 0,
      bearing: is3D ? -18 : 0,
      duration: 1000,
    });
  };

  const hidden = city === "jagdalpur" && !revealed;

  const layers = useMemo(() => {
    if (hidden) return [];
    const alpha = isHybrid ? 150 : layer === "forecast" ? 175 : 140;
    const out: any[] = [
      new H3HexagonLayer({
        id: `hex-${city}-${timeIndex}-${is3D ? "3d" : "2d"}`,
        data: cells,
        pickable: true,
        wireframe: is3D,
        filled: true,
        extruded: is3D,
        elevationScale: is3D ? 60 : 0,
        getElevation: (d: any) => d.pm25,
        highPrecision: false,
        coverage: 0.92,
        getHexagon: (d: any) => d.h3,
        getFillColor: (d: any) => colorFor(d.pm25, alpha),
        getLineColor: isHybrid
          ? [255, 255, 255, 60]
          : is3D
            ? [255, 255, 255, 90]
            : [200, 162, 74, 55],
        lineWidthMinPixels: is3D ? 1 : 0,
        opacity: 1,
        updateTriggers: {
          getFillColor: [timeIndex, alpha],
          getLineColor: [isHybrid, is3D],
          getElevation: [is3D],
        },
        onClick: (info: any) => info?.object && selectCell(info.object.h3),
      }),
    ];

    if (showWind && windLines.length > 0) {
      out.push(
        new LineLayer({
          id: `wind-vectors-${city}`,
          data: windLines,
          getSourcePosition: (d: any) => d.from,
          getTargetPosition: (d: any) => d.to,
          getColor: [96, 165, 250, 190],
          getWidth: 2,
          widthUnits: "pixels",
        })
      );
    }

    if (layer === "priority" && priority && showWards) {
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

    if (stations?.has_stations && showStations) {
      out.push(
        new ScatterplotLayer({
          id: `stations-${city}`,
          data: stations.stations,
          pickable: true,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: any) => [d.lon, d.lat],
          getRadius: 6.5,
          getFillColor: [255, 247, 237, 255],
          getLineColor: [249, 115, 22, 255],
          lineWidthMinPixels: 2.5,
        }),
      );
    }
    return out;
  }, [cells, city, hidden, layer, priority, stations, timeIndex, selectCell, isHybrid, is3D, showStations, showWards, showWind, windLines]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{ ...VIEWS[city], pitch: is3D ? 52 : 0, bearing: is3D ? -18 : 0 }}
        maxBounds={[
          [79.0, 17.0],
          [85.0, 24.5],
        ]}
        minZoom={5.8}
        maxZoom={15.5}
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
                <div style="font-size:9.5px;color:var(--accent);margin-top:2px">Click to inspect H3 cell</div>
              </div>`,
              style: {
                background: "var(--surface-2)",
                color: "var(--ink)",
                border: "1px solid var(--accent-dim)",
                padding: "6px 8px",
                borderRadius: "6px",
                boxShadow: "0 6px 16px rgba(0,0,0,0.4)",
              },
            };
          }}
        />
      </Map>

      {/* Floating map controls header (Right) */}
      <div
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
      >
        {/* Basemap buttons */}
        <div style={{ display: "flex", gap: 3 }}>
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
                  borderRadius: 6,
                  padding: "5px 9px",
                  fontSize: 10.5,
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

        <div style={{ width: 1, height: 16, background: "var(--line)" }} />

        {/* 3D Extrusion toggle button */}
        <button
          type="button"
          onClick={toggle3D}
          title="Toggle 3D H3 Volume Extrusion"
          style={{
            border: "1px solid var(--line)",
            cursor: "pointer",
            borderRadius: 6,
            padding: "5px 10px",
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
          onClick={resetView}
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

      {/* Floating Layer Controls (Left Top) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 5,
          display: "flex",
          gap: 6,
          padding: "4px 8px",
          borderRadius: 10,
          background: "color-mix(in oklch, var(--surface) 92%, transparent)",
          border: "1px solid var(--line)",
          backdropFilter: "blur(10px)",
          fontSize: 11,
        }}
      >
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={showStations}
            onChange={(e) => setShowStations(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>Stations</span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none", marginLeft: 6 }}>
          <input
            type="checkbox"
            checked={showWards}
            onChange={(e) => setShowWards(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>Targets</span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none", marginLeft: 6 }}>
          <input
            type="checkbox"
            checked={showWind}
            onChange={(e) => setShowWind(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>Wind Flow</span>
        </label>
      </div>

      {/* Selected H3 Cell Inspect Drawer */}
      {selectedCellData && (
        <div
          className="card"
          style={{
            position: "absolute",
            bottom: 24,
            left: 12,
            zIndex: 10,
            width: 280,
            padding: 14,
            background: "color-mix(in oklch, var(--surface) 96%, transparent)",
            backdropFilter: "blur(12px)",
            border: "1px solid var(--accent-dim)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            borderRadius: 12,
            animation: "vayuRise .3s both",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--accent)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              H3 CELL INSPECTOR
            </span>
            <button
              onClick={() => selectCell(null as any)}
              style={{ background: "none", border: 0, color: "var(--ink-3)", cursor: "pointer", fontSize: 14 }}
              title="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--ink-2)", marginBottom: 10, wordBreak: "break-all" }}>
            ID: {selectedCellData.h3}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--accent)" }}>
              {Math.round(selectedCellData.pm25)}
            </span>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>µg/m³ PM2.5</span>
            <span
              className="pill"
              style={{
                marginLeft: "auto",
                background: "color-mix(in oklch, var(--accent), transparent 84%)",
                color: "var(--accent)",
                fontSize: 11,
              }}
            >
              AQI {cpcbAqiFromPm25(selectedCellData.pm25)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            Status: <b>{cpcbPm25Label(selectedCellData.pm25)}</b>
            <br />
            Resolution: <b>H3 Res 7 (~1 km²)</b>
          </div>
        </div>
      )}
    </div>
  );
}

