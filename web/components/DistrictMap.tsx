"use client";

import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, ScatterplotLayer, TextLayer, LineLayer } from "@deck.gl/layers";
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
import { CG_INDUSTRIAL_HOTSPOTS, type IndustrialHotspot } from "@/lib/industrialHotspots";

export * from "@/lib/districts";

// Chhattisgarh geographic envelope
export const CG_BOUNDS: [[number, number], [number, number]] = [
  [79.0, 17.0], // Southwest [lon, lat]
  [85.0, 24.5], // Northeast [lon, lat]
];

export const CG_CENTER = {
  longitude: 82.15,
  latitude: 21.25,
  zoom: 6.85,
};

// Hindi translations for districts
const DISTRICT_HINDI: Record<string, string> = {
  Raipur: "रायपुर",
  Korba: "कोरबा",
  Durg: "दुर्ग",
  Bhilai: "भिलाई",
  Bilaspur: "बिलासपुर",
  Raigarh: "रायगढ़",
  Bastar: "बस्तर",
  Jagdalpur: "जगदलपुर",
  Surguja: "सरगुजा",
  Rajnandgaon: "राजनांदगांव",
  "Janjgir-Champa": "जांजगीर-चांपा",
  Mahasamund: "महासमुंद",
  Dhamtari: "धमतरी",
  "Uttar Bastar Kanker": "उत्तर बस्तर कांकेर",
  "Dakshin Bastar Dantewada": "दक्षिण बस्तर दंतेवाड़ा",
  "Baloda Bazar": "बलौदाबाजार",
  Bemetra: "बेमेतरा",
  Kabeerdham: "कबीरधाम",
  Mungeli: "मुंगेली",
  Balod: "बालोद",
  Gariaband: "गरियाबंद",
  Koriya: "कोरिया",
  Surajpur: "सूरजपुर",
  Balrampur: "बलरामपुर",
  Jashpur: "जशपुर",
  Kondagaon: "कोण्डागांव",
  Narayanpur: "नारायणपुर",
  Bijapur: "बीजापुर",
  Sukma: "सुकमा",
  "Gaurella Pendra Marwahi": "गौरेला-पेंड्रा-मरवाही",
};

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
  initialZoom = 6.85,
  basemap = "dark",
  onBasemapChange,
  showBasemapToggle = true,
  liveStations = [],
  liveFires = [],
  showLiveStations = true,
  showLiveFires = true,
  showIndustrial = true,
  showWind = true,
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
  basemap?: BasemapId;
  onBasemapChange?: (id: BasemapId) => void;
  showBasemapToggle?: boolean;
  liveStations?: LiveApiStation[];
  liveFires?: LiveApiFire[];
  showLiveStations?: boolean;
  showLiveFires?: boolean;
  showIndustrial?: boolean;
  showWind?: boolean;
}) {
  const mapRef = useRef<MapRef | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [internalBasemap, setInternalBasemap] = useState<BasemapId>(basemap);
  const [is3D, setIs3D] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Layer filter state
  const [layerDistricts, setLayerDistricts] = useState(true);
  const [layerIndustrial, setLayerIndustrial] = useState(showIndustrial);
  const [layerStations, setLayerStations] = useState(showLiveStations);
  const [layerFires, setLayerFires] = useState(showLiveFires);
  const [layerWind, setLayerWind] = useState(showWind);

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
      pitch: next3D ? 48 : 0,
      bearing: next3D ? -14 : 0,
      duration: 1000,
    });
  };

  const resetToStateView = () => {
    mapRef.current?.flyTo({
      center: [CG_CENTER.longitude, CG_CENTER.latitude],
      zoom: initialZoom,
      pitch: is3D ? 48 : 0,
      bearing: is3D ? -14 : 0,
      duration: 1200,
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

  const quickJumpCity = (lon: number, lat: number, name: string) => {
    mapRef.current?.flyTo({ center: [lon, lat], zoom: 9.8, pitch: is3D ? 45 : 0, duration: 1200 });
    if (data) {
      const f = data.features.find((x) => x.properties.name.toLowerCase() === name.toLowerCase());
      if (f) onSelect(f.properties);
    }
  };

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
        m.flyTo({ center: [c.lon, c.lat], zoom: 9.8, duration: 1500, curve: 1.5, essential: true });
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
    if (focus.kind === "india" && focus.lat != null && focus.lon != null) {
      m.flyTo({ center: [focus.lon, focus.lat], zoom: 9, duration: 1600, curve: 1.5, essential: true });
    }
  }, [focus, data, onSelect, openCityOnFocus]);

  // Generate dynamic wind streamlines across Chhattisgarh
  const windStreamlines = useMemo(() => {
    if (!layerWind || !data?.features) return [];
    const lines: { from: [number, number]; to: [number, number]; speed: number }[] = [];
    data.features.forEach((f) => {
      const p = f.properties;
      const [[w, s], [e, n]] = bboxOf(f.geometry);
      const cLon = (w + e) / 2;
      const cLat = (s + n) / 2;
      const spd = p.wind_speed ?? 12;
      // Typical regional winter/dry airflow from NW to SE in CG
      const angle = 0.785; // 45 deg
      const len = 0.16 + Math.min(0.12, (spd / 25) * 0.12);
      lines.push({
        from: [cLon, cLat],
        to: [cLon + Math.cos(angle) * len, cLat - Math.sin(angle) * len * 0.7],
        speed: spd,
      });
      // secondary vector
      lines.push({
        from: [cLon - 0.12, cLat + 0.08],
        to: [cLon - 0.12 + Math.cos(angle) * len, cLat + 0.08 - Math.sin(angle) * len * 0.7],
        speed: spd,
      });
    });
    return lines;
  }, [data, layerWind]);

  const layers = useMemo(() => {
    const out: any[] = [];
    if (!data) return out;

    const baseAlpha = isHybrid ? 140 : 175;
    const hoverAlpha = isHybrid ? 195 : 225;
    const selAlpha = isHybrid ? 220 : 245;

    // 1. District Choropleth Layer
    if (layerDistricts) {
      out.push(
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
            return pm == null ? 0 : Math.min(180, pm) * 480;
          },
          getFillColor: (f: any) => {
            const pm = pmOf(f.properties);
            const c = pm == null ? NO_DATA_RGB : cpcbPm25Color(pm);
            const isSel = f.properties.name === selected;
            const isHov = f.properties.name === hover;
            const lift = isSel ? 32 : isHov ? 20 : 0;
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
                ? [255, 255, 255, 240]
                : isHybrid
                  ? [255, 255, 255, 140]
                  : [10, 20, 24, 230],
          getLineWidth: (f: any) =>
            f.properties.name === selected ? 3.4 : f.properties.name === hover ? 2.8 : 1.6,
          lineWidthUnits: "pixels",
          lineWidthMinPixels: 1.4,
          transitions: {
            getFillColor: { duration: 250 },
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
        })
      );
    }

    // 2. What-If Simulator delta hexagons
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
            if (d.delta_pm25 < -0.1) return [34, 197, 94, 210]; // Green (reduction)
            if (d.delta_pm25 > 0.1) return [239, 68, 68, 210]; // Red (increase)
            return [150, 150, 150, 60];
          },
          getLineColor: [255, 255, 255, 120],
          lineWidthMinPixels: 1,
        })
      );
    }

    // 3. Wind Streamlines
    if (layerWind && windStreamlines.length > 0) {
      out.push(
        new LineLayer({
          id: "cg-wind-streamlines",
          data: windStreamlines,
          getSourcePosition: (d: any) => d.from,
          getTargetPosition: (d: any) => d.to,
          getColor: [147, 197, 253, 175], // Light Blue Streamlines
          getWidth: 2.2,
          widthUnits: "pixels",
        })
      );
    }

    // 4. Industrial Hotspots & Thermal Power Plants
    if (layerIndustrial) {
      out.push(
        new ScatterplotLayer({
          id: "cg-industrial-halo",
          data: CG_INDUSTRIAL_HOTSPOTS,
          pickable: false,
          stroked: false,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: IndustrialHotspot) => [d.lon, d.lat],
          getRadius: pulse ? 24 : 15,
          getFillColor: (d: IndustrialHotspot) => [...d.color, pulse ? 45 : 120] as [number, number, number, number],
          transitions: { getRadius: { duration: 1100 }, getFillColor: { duration: 1100 } },
          updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
        }),
        new ScatterplotLayer({
          id: "cg-industrial-points",
          data: CG_INDUSTRIAL_HOTSPOTS,
          pickable: interactive,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: IndustrialHotspot) => [d.lon, d.lat],
          getRadius: 8.5,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          getFillColor: (d: IndustrialHotspot) => [...d.color, 255] as [number, number, number, number],
          getLineColor: [255, 255, 255, 240],
        })
      );
    }

    // 5. Modelled & Monitored Cities
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
            d.has_stations ? [249, 115, 22, pulse ? 70 : 160] : [251, 146, 60, pulse ? 55 : 120],
          transitions: { getRadius: { duration: 1100 }, getFillColor: { duration: 1100 } },
          updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
        }),
        new ScatterplotLayer({
          id: "cg-cities",
          data: data.cities,
          pickable: interactive,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: CityPoint) => [d.lon, d.lat],
          getRadius: 8,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          getFillColor: (d: CityPoint) => (d.has_stations ? [249, 115, 22, 255] : [251, 146, 60, 240]),
          getLineColor: [255, 255, 255, 220],
          onClick: (info: any) => {
            if (!info?.object) return;
            const c = info.object;
            const host = data.features.find((f: any) => {
              const [[w, s2], [e, n]] = bboxOf(f.geometry);
              return c.lon >= w && c.lon <= e && c.lat >= s2 && c.lat <= n;
            });
            if (host) onSelect(host.properties);
            mapRef.current?.flyTo({ center: [c.lon, c.lat], zoom: 9.8, duration: 1200 });
          },
        })
      );
    }

    // 6. Live CPCB CAAQMS Stations
    const stations = (liveStations || []).filter(
      (s) => s.lat != null && s.lon != null && Number.isFinite(s.lat) && Number.isFinite(s.lon)
    );
    if (layerStations && stations.length) {
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
          getRadius: 7.5,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          getFillColor: (d: LiveApiStation) => {
            const rgb = cpcbPm25Color(d.pm25 ?? null);
            return [...rgb, 240] as [number, number, number, number];
          },
          getLineColor: [255, 255, 255, 220],
          updateTriggers: { getFillColor: [stations.length] },
        })
      );
    }

    // 7. Live NASA FIRMS Fires
    const fires = (liveFires || []).filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon)).slice(0, 400);
    if (layerFires && fires.length) {
      out.push(
        new ScatterplotLayer({
          id: "live-fires",
          data: fires,
          pickable: interactive,
          stroked: true,
          filled: true,
          radiusUnits: "pixels",
          getPosition: (d: LiveApiFire) => [d.lon, d.lat],
          getRadius: (d: LiveApiFire) => Math.min(16, 5 + Math.sqrt(Math.max(d.frp ?? 1, 1))),
          getFillColor: [239, 68, 68, 220],
          getLineColor: [255, 255, 255, 180],
          getLineWidth: 1.5,
        })
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
    layerDistricts,
    layerIndustrial,
    layerStations,
    layerFires,
    layerWind,
    windStreamlines,
  ]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Map
        ref={mapRef}
        initialViewState={CG_CENTER}
        maxBounds={CG_BOUNDS}
        minZoom={5.8}
        maxZoom={15.5}
        mapStyle={mapStyle as any}
        style={{ width: "100%", height: "100%", background: "#050a09" }}
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
          getCursor={({ isHovering }: any) => (!interactive ? "default" : isHovering ? "pointer" : "grab")}
          getTooltip={({ object }: any) => {
            if (!object) return null;

            // Check if hovering an Industrial Hotspot
            if (object.categoryLabel && object.operator) {
              const plant = object as IndustrialHotspot;
              return {
                html: `
                  <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;min-width:240px">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                      <span style="font-size:14px">${plant.icon}</span>
                      <b style="font-size:13px;color:#fff">${plant.name}</b>
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${plant.hindiName} · ${plant.district}</div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                      <span style="background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700">${plant.categoryLabel}</span>
                    </div>
                    <div style="background:rgba(0,0,0,0.35);padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);font-size:11px">
                      <div><b>Capacity:</b> ${plant.capacity}</div>
                      <div><b>Operator:</b> ${plant.operator}</div>
                      <div style="margin-top:4px;color:#cbd5e1"><b>Impact:</b> ${plant.emissionProfile}</div>
                    </div>
                  </div>
                `,
                style: {
                  background: "rgba(15, 23, 42, 0.95)",
                  color: "#f8fafc",
                  border: "1px solid rgba(239, 68, 68, 0.5)",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                  backdropFilter: "blur(12px)",
                },
              };
            }

            // Check if hovering a Live CAAQMS Station
            if (object.station_id || (object.lat && object.pm25 != null && object.city_id)) {
              const s = object as LiveApiStation;
              const caqi = cpcbAqiFromPm25(s.pm25);
              const label = cpcbPm25Label(s.pm25);
              return {
                html: `
                  <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;min-width:210px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                      <b>📡 ${s.station_id ? `Station ${s.station_id}` : "CAAQMS Ground Sensor"}</b>
                      <span style="background:rgba(45,212,191,0.2);color:#2dd4bf;padding:1px 5px;border-radius:4px;font-size:10px;font-weight:700">LIVE CPCB</span>
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${s.city_id ? s.city_id.toUpperCase() : "CHHATTISGARH"} District</div>
                    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px">
                      <span style="font-size:22px;font-weight:800;color:#fff">${s.pm25 ? Math.round(s.pm25) : "—"}</span>
                      <span style="font-size:11px;color:#cbd5e1">µg/m³ PM2.5</span>
                    </div>
                    <div style="font-size:11px;color:#fca5a5">CPCB AQI: <b>${caqi ?? "—"}</b> (${label})</div>
                  </div>
                `,
                style: {
                  background: "rgba(15, 23, 42, 0.95)",
                  color: "#f8fafc",
                  border: "1px solid rgba(45, 212, 191, 0.5)",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(10px)",
                },
              };
            }

            // Default: District or City GeoJSON feature
            const p: Partial<DistrictProps> = object.properties ?? object;
            if (!p?.name) return null;
            const pm = pmOf(p);
            const caqi = cpcbAqiFromPm25(pm);
            const label = cpcbPm25Label(pm);
            const hindi = DISTRICT_HINDI[p.name] || "";

            return {
              html: `
                <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.4;min-width:220px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                    <b style="font-size:14px;color:#fff">${p.name}</b>
                    ${hindi ? `<span style="font-size:12px;color:#94a3b8">${hindi}</span>` : ""}
                  </div>
                  <div style="display:flex;align-items:baseline;gap:6px;margin:6px 0">
                    <span style="font-size:24px;font-weight:800;color:#fff">${pm != null ? Math.round(pm) : "—"}</span>
                    <span style="font-size:11px;color:#cbd5e1">µg/m³ PM2.5</span>
                    <span style="margin-left:auto;background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700">AQI ${caqi ?? "—"}</span>
                  </div>
                  <div style="font-size:11px;color:#fca5a5;font-weight:600;margin-bottom:6px">${label}</div>
                  <div style="border-top:1px solid rgba(255,255,255,0.12);padding-top:6px;display:flex;justify-content:space-between;font-size:10.5px;color:#94a3b8">
                    <span>👥 Pop: ${(p.population ?? 0).toLocaleString()}</span>
                    <span>🌡️ ${p.temp_c ?? "—"}°C · 💧 ${p.rh_pct ?? "—"}%</span>
                  </div>
                  <div style="margin-top:4px;font-size:9.5px;color:rgba(255,255,255,0.5)">Click to inspect district analytics</div>
                </div>
              `,
              style: {
                background: "rgba(10, 18, 20, 0.95)",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                padding: "10px 14px",
                borderRadius: "10px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
                backdropFilter: "blur(12px)",
              },
            };
          }}
        />
      </Map>

      {/* Floating Pro Map Controls & Layer Bar */}
      {interactive && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          {/* Top Bar: Basemap + 3D + Reset */}
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              padding: "4px 8px",
              borderRadius: 10,
              background: "rgba(15, 23, 42, 0.88)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Basemap Switcher */}
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
                      fontSize: 11,
                      fontWeight: 600,
                      background: on ? "#38bdf8" : "transparent",
                      color: on ? "#000" : "#94a3b8",
                      transition: "all .15s ease",
                    }}
                  >
                    {opt.short}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.15)" }} />

            {/* 3D Extrusion toggle */}
            <button
              type="button"
              onClick={toggle3D}
              title="Toggle 3D Extruded Districts"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                cursor: "pointer",
                borderRadius: 6,
                padding: "5px 9px",
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: is3D ? "#38bdf8" : "rgba(255,255,255,0.06)",
                color: is3D ? "#000" : "#fff",
              }}
            >
              {is3D ? "🧊 3D On" : "🗺 2D"}
            </button>

            {/* Reset Camera Button */}
            <button
              type="button"
              onClick={resetToStateView}
              title="Reset View to Chhattisgarh State Extent"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                cursor: "pointer",
                borderRadius: 6,
                padding: "5px 9px",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(255,255,255,0.06)",
                color: "#94a3b8",
              }}
            >
              🎯 State View
            </button>
          </div>

          {/* Layer Matrix Toggle Dock */}
          <div
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              maxWidth: 380,
              padding: "4px 6px",
              borderRadius: 8,
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(10px)",
            }}
          >
            <button
              type="button"
              onClick={() => setLayerDistricts((v) => !v)}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: 5,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: layerDistricts ? "rgba(56, 189, 248, 0.25)" : "transparent",
                color: layerDistricts ? "#38bdf8" : "#64748b",
              }}
            >
              🗺 Districts
            </button>
            <button
              type="button"
              onClick={() => setLayerIndustrial((v) => !v)}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: 5,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: layerIndustrial ? "rgba(239, 68, 68, 0.25)" : "transparent",
                color: layerIndustrial ? "#f87171" : "#64748b",
              }}
            >
              🏭 Power/Plants
            </button>
            <button
              type="button"
              onClick={() => setLayerStations((v) => !v)}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: 5,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: layerStations ? "rgba(45, 212, 191, 0.25)" : "transparent",
                color: layerStations ? "#2dd4bf" : "#64748b",
              }}
            >
              📡 CPCB Sensors
            </button>
            <button
              type="button"
              onClick={() => setLayerFires((v) => !v)}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: 5,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: layerFires ? "rgba(249, 115, 22, 0.25)" : "transparent",
                color: layerFires ? "#fb923c" : "#64748b",
              }}
            >
              🔥 NASA Fires
            </button>
            <button
              type="button"
              onClick={() => setLayerWind((v) => !v)}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: 5,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: layerWind ? "rgba(96, 165, 250, 0.25)" : "transparent",
                color: layerWind ? "#60a5fa" : "#64748b",
              }}
            >
              💨 Wind Flow
            </button>
          </div>
        </div>
      )}

      {/* Bottom Floating Quick-Jump Hubs */}
      {interactive && (
        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "5px 10px",
            borderRadius: 100,
            background: "rgba(15, 23, 42, 0.88)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            maxWidth: "92vw",
            overflowX: "auto",
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 4px" }}>
            CG Hubs:
          </span>
          {[
            { name: "Raipur", lon: 81.6296, lat: 21.2514, icon: "🏛️" },
            { name: "Korba", lon: 82.7501, lat: 22.3595, icon: "⚡" },
            { name: "Bhilai", lon: 81.3509, lat: 21.1938, icon: "🏗️" },
            { name: "Bilaspur", lon: 82.1409, lat: 22.0797, icon: "🚂" },
            { name: "Raigarh", lon: 83.3768, lat: 21.9284, icon: "⛏️" },
            { name: "Jagdalpur", lon: 82.0261, lat: 19.0748, icon: "🌲" },
          ].map((hub) => (
            <button
              key={hub.name}
              type="button"
              onClick={() => quickJumpCity(hub.lon, hub.lat, hub.name)}
              style={{
                border: "1px solid rgba(255, 255, 255, 0.1)",
                cursor: "pointer",
                borderRadius: 100,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(255, 255, 255, 0.05)",
                color: "#f8fafc",
                display: "flex",
                alignItems: "center",
                gap: 4,
                whiteSpace: "nowrap",
              }}
            >
              <span>{hub.icon}</span>
              <span>{hub.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
