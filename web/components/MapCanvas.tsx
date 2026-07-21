"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useEffect, useMemo, useRef } from "react";
import Map, { AttributionControl, useControl, type MapRef } from "react-map-gl/maplibre";

import { colorFor } from "@/lib/aqi";
import { useForecast, usePriority, useStations } from "@/lib/data";
import { useApp } from "@/lib/store";
import { selectFrame } from "@/lib/types";

// CARTO positron — free, no API token required.
const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

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

  const { data: forecast } = useForecast(city);
  const { data: priority } = usePriority(city);
  const { data: stations } = useStations(city);

  const cells = useMemo(() => selectFrame(forecast, timeIndex), [forecast, timeIndex]);

  // fly when the city changes
  useEffect(() => {
    const v = VIEWS[city];
    mapRef.current?.flyTo({ center: [v.longitude, v.latitude], zoom: v.zoom, duration: 1200 });
  }, [city]);

  // fly to a ward selected in the priority panel
  useEffect(() => {
    if (!selectedCell || !priority) return;
    const d = priority.dossiers.find((x) => x.cell === selectedCell);
    if (d) mapRef.current?.flyTo({ center: [d.lon, d.lat], zoom: 11.5, duration: 900 });
  }, [selectedCell, priority]);

  const hidden = city === "jagdalpur" && !revealed;

  const layers = useMemo(() => {
    if (hidden) return [];
    const out: any[] = [
      new H3HexagonLayer({
        id: `hex-${city}-${timeIndex}`,
        data: cells,
        pickable: true,
        wireframe: false,
        filled: true,
        extruded: false,
        highPrecision: false,
        coverage: 0.94,
        getHexagon: (d: any) => d.h3,
        getFillColor: (d: any) => colorFor(d.pm25),
        getLineColor: [200, 162, 74, 60],
        lineWidthMinPixels: 0,
        opacity: layer === "forecast" ? 0.72 : 0.4,
        updateTriggers: { getFillColor: [timeIndex] },
        onClick: (info: any) => info?.object && selectCell(info.object.h3),
      }),
    ];

    // ranked wards as gold rings on top
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
        })
      );
    }

    // real ground stations (korba only)
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
          getRadius: 5,
          getFillColor: [236, 231, 220, 240],
          getLineColor: [10, 10, 11, 255],
          lineWidthMinPixels: 2,
        })
      );
    }
    return out;
  }, [cells, city, hidden, layer, priority, stations, timeIndex, selectCell]);

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        initialViewState={{ ...VIEWS[city], pitch: 0, bearing: 0 }}
        mapStyle={BASEMAP}
        style={{ width: "100%", height: "100%", background: "var(--carbon)" }}
        attributionControl={false}
      >
        {/* OSM/CARTO attribution is required by their terms — kept, just compact */}
        <AttributionControl compact position="bottom-right" />
        <DeckOverlay
          layers={layers}
          getTooltip={({ object }: any) =>
            object?.pm25 !== undefined
              ? {
                  html: `<div style="font-family:var(--font-mono);font-size:11px">${Math.round(
                    object.pm25
                  )} µg/m³</div>`,
                  style: {
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    border: "1px solid var(--accent-dim)",
                    padding: "4px 7px",
                    borderRadius: "2px",
                  },
                }
              : null
          }
        />
      </Map>

      {/* carbon wash so the light basemap sits inside the dark print */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, transparent 40%, rgba(10,10,11,0.55) 100%)",
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
}
