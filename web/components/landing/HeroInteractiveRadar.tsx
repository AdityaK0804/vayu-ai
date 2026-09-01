"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CG_INDUSTRIAL_HOTSPOTS } from "@/lib/industrialHotspots";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";

interface Node {
  id: string;
  name: string;
  hindi: string;
  type: "station" | "plant" | "zero_sensor";
  x: number; // percentage in SVG coordinate space (0 - 100)
  y: number;
  basePm: number;
  capacity?: string;
  sources: { coal: number; industry: number; traffic: number; fires: number; dust: number };
}

const NODES: Node[] = [
  {
    id: "ntpc_korba",
    name: "NTPC Korba Super Thermal",
    hindi: "एनटीपीसी कोरबा",
    type: "plant",
    x: 62,
    y: 30,
    basePm: 194,
    capacity: "2,600 MW Coal",
    sources: { coal: 68, industry: 18, traffic: 4, fires: 6, dust: 4 },
  },
  {
    id: "korba_city",
    name: "Korba City CAAQMS",
    hindi: "कोरबा",
    type: "station",
    x: 58,
    y: 33,
    basePm: 168,
    sources: { coal: 55, industry: 22, traffic: 11, fires: 7, dust: 5 },
  },
  {
    id: "raipur",
    name: "Raipur Capital & Siltara",
    hindi: "रायपुर",
    type: "station",
    x: 44,
    y: 52,
    basePm: 118,
    sources: { coal: 28, industry: 34, traffic: 24, fires: 8, dust: 6 },
  },
  {
    id: "bhilai",
    name: "Bhilai Steel Plant (SAIL)",
    hindi: "भिलाई स्टील",
    type: "plant",
    x: 36,
    y: 55,
    basePm: 104,
    capacity: "7.0 MTPA Integrated Steel",
    sources: { coal: 22, industry: 52, traffic: 16, fires: 4, dust: 6 },
  },
  {
    id: "raigarh",
    name: "JSPL Raigarh Corridor",
    hindi: "रायगढ़",
    type: "plant",
    x: 76,
    y: 44,
    basePm: 138,
    capacity: "3.4 MTPA Steel & Power",
    sources: { coal: 42, industry: 38, traffic: 10, fires: 6, dust: 4 },
  },
  {
    id: "bilaspur",
    name: "Bilaspur Smart Junction",
    hindi: "बिलासपुर",
    type: "station",
    x: 52,
    y: 38,
    basePm: 74,
    sources: { coal: 32, industry: 20, traffic: 30, fires: 10, dust: 8 },
  },
  {
    id: "jagdalpur",
    name: "Jagdalpur Bastar (Zero-Sensor)",
    hindi: "जगदलपुर",
    type: "zero_sensor",
    x: 46,
    y: 84,
    basePm: 34,
    sources: { coal: 6, industry: 12, traffic: 28, fires: 42, dust: 12 },
  },
];

export default function HeroInteractiveRadar() {
  const [selectedId, setSelectedId] = useState<string>("ntpc_korba");
  const [hour, setHour] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [activeMitigations, setActiveMitigations] = useState<{
    stackScrubbing: boolean;
    fireExtinguish: boolean;
    smogGuns: boolean;
  }>({
    stackScrubbing: false,
    fireExtinguish: false,
    smogGuns: false,
  });

  // Auto time advance
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setHour((prev) => (prev >= 72 ? 0 : prev + 12));
    }, 2800);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Selected node computation
  const selectedNode = useMemo(() => {
    return NODES.find((n) => n.id === selectedId) || NODES[0];
  }, [selectedId]);

  // Dynamic PM2.5 calculation based on forecast hour and mitigation policy toggles
  const computePm25 = (node: Node) => {
    // Diurnal & meteorological wave simulation (stagnant evening inversion peaks @ 24h & 48h)
    const diurnalFactor = 1 + Math.sin((hour / 24) * Math.PI) * 0.28;
    let pm = node.basePm * diurnalFactor;

    // Apply interventions
    if (activeMitigations.stackScrubbing) {
      pm -= pm * (node.sources.coal / 100) * 0.45;
    }
    if (activeMitigations.fireExtinguish) {
      pm -= pm * (node.sources.fires / 100) * 0.7;
    }
    if (activeMitigations.smogGuns) {
      pm -= pm * 0.12;
    }

    return Math.max(12, Math.round(pm));
  };

  const currentPm = computePm25(selectedNode);
  const currentAqi = cpcbAqiFromPm25(currentPm) ?? Math.round(currentPm * 1.3);
  const currentTone = cpcbPm25Css(currentPm);
  const currentLabel = cpcbPm25Label(currentPm);

  const baselinePm = computePm25({ ...selectedNode });
  const totalReductionPct = activeMitigations.stackScrubbing || activeMitigations.fireExtinguish || activeMitigations.smogGuns
    ? Math.round(((selectedNode.basePm - currentPm) / selectedNode.basePm) * 100)
    : 0;

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 24,
        background: "linear-gradient(165deg, rgba(14, 26, 23, 0.95), rgba(6, 14, 12, 0.98))",
        border: "1px solid rgba(56, 189, 248, 0.3)",
        boxShadow: "0 28px 70px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.15)",
        overflow: "hidden",
        backdropFilter: "blur(24px)",
      }}
    >
      {/* ---------------- HUD Header ---------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "rgba(0, 0, 0, 0.45)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: "#38bdf8",
              boxShadow: "0 0 10px #38bdf8",
              animation: "vayuPulse 2s infinite",
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: "#f8fafc" }}>
            CHHATTISGARH AI ATMOSPHERIC RADAR
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "#94a3b8",
              background: "rgba(255,255,255,0.05)",
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            WIND: 14 km/h WNW · BLH: 1,420m
          </span>
        </div>
      </div>

      {/* ---------------- Main Radar Canvas + Control Panel ---------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 16,
          padding: "18px 20px",
          alignItems: "stretch",
        }}
      >
        {/* LEFT: Interactive SVG Spatial Radar with Plumes and Hotspots */}
        <div
          style={{
            position: "relative",
            background: "radial-gradient(circle at 50% 50%, rgba(16, 38, 33, 0.6) 0%, rgba(6, 14, 12, 0.9) 100%)",
            borderRadius: 16,
            border: "1px solid rgba(56, 189, 248, 0.18)",
            minHeight: 330,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 12,
          }}
        >
          {/* Radar Scanner Sweep Line */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "conic-gradient(from 0deg at 50% 50%, rgba(56, 189, 248, 0.18) 0deg, transparent 60deg, transparent 360deg)",
              borderRadius: 16,
              animation: "spin 5s linear infinite",
            }}
          />

          {/* Grid Rings */}
          <svg
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              opacity: 0.25,
            }}
          >
            <circle cx="50" cy="50" r="20" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="2 2" />
            <circle cx="50" cy="50" r="35" fill="none" stroke="#38bdf8" strokeWidth="0.5" strokeDasharray="3 3" />
            <circle cx="50" cy="50" r="48" fill="none" stroke="#38bdf8" strokeWidth="0.5" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="#38bdf8" strokeWidth="0.3" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#38bdf8" strokeWidth="0.3" />
          </svg>

          {/* Plume Vector from NTPC Korba downwind toward Raigarh */}
          <svg
            viewBox="0 0 100 100"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              <radialGradient id="korbaPlume" cx="62%" cy="30%" r="35%">
                <stop offset="0%" stopColor="rgba(239, 68, 68, 0.45)" />
                <stop offset="60%" stopColor="rgba(249, 115, 22, 0.15)" />
                <stop offset="100%" stopColor="rgba(249, 115, 22, 0)" />
              </radialGradient>
            </defs>
            <ellipse cx="68" cy="38" rx="22" ry="14" transform="rotate(25 68 38)" fill="url(#korbaPlume)" />
            {/* Wind Vector Arrows */}
            <path d="M 40 40 L 75 48" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" strokeDasharray="3 3" />
            <path d="M 35 60 L 65 68" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.8" strokeDasharray="3 3" />
          </svg>

          {/* Interactive Node Markers */}
          {NODES.map((node) => {
            const isSel = node.id === selectedId;
            const pm = computePm25(node);
            const tone = cpcbPm25Css(pm);

            return (
              <button
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                style={{
                  position: "absolute",
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: "translate(-50%, -50%)",
                  background: isSel ? "rgba(15, 23, 42, 0.95)" : "rgba(6, 14, 12, 0.8)",
                  border: `2px solid ${isSel ? "#38bdf8" : tone}`,
                  borderRadius: 10,
                  padding: "4px 8px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  zIndex: isSel ? 20 : 10,
                  boxShadow: isSel ? `0 0 16px ${tone}, 0 0 8px #38bdf8` : `0 0 8px ${tone}44`,
                  transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  scale: isSel ? "1.15" : "1",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: tone,
                    boxShadow: `0 0 6px ${tone}`,
                  }}
                />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                  {node.type === "plant" ? "🏭" : node.type === "zero_sensor" ? "🛰️" : "📡"} {node.name.split(" ")[0]}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: tone,
                    fontFamily: "var(--font-mono)",
                    background: "rgba(0,0,0,0.5)",
                    padding: "1px 4px",
                    borderRadius: 4,
                  }}
                >
                  {pm}
                </span>
              </button>
            );
          })}

          {/* Bottom Overlay Info Tag */}
          <div
            style={{
              position: "relative",
              zIndex: 25,
              fontSize: 10.5,
              fontWeight: 600,
              color: "#94a3b8",
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
              padding: "4px 10px",
              borderRadius: 8,
              alignSelf: "flex-start",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            📍 <b>Interactive Radar:</b> Click any hotspot to inspect emissions & source mix
          </div>
        </div>

        {/* RIGHT: Node Telemetry Card, Source Attribution, & AI Scenario Sandbox */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Active Node Scorecard */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: `1px solid ${currentTone}66`,
              borderRadius: 14,
              padding: "14px 16px",
              boxShadow: `0 8px 24px -6px ${currentTone}22`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <b style={{ fontSize: 15, color: "#fff" }}>{selectedNode.name}</b>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>({selectedNode.hindi})</span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {selectedNode.capacity ? `Industrial Scale: ${selectedNode.capacity}` : "CPCB Verified Ground Monitor"}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    background: `color-mix(in oklch, ${currentTone}, transparent 80%)`,
                    color: currentTone,
                    fontWeight: 900,
                    fontSize: 15,
                    padding: "3px 10px",
                    borderRadius: 8,
                    border: `1px solid ${currentTone}`,
                  }}
                >
                  AQI {currentAqi}
                </span>
                <div style={{ fontSize: 10, color: currentTone, fontWeight: 700, marginTop: 2 }}>
                  {currentLabel}
                </div>
              </div>
            </div>

            {/* PM2.5 Metric */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "var(--font-mono)" }}>
                {currentPm}
              </span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>µg/m³ PM2.5 at horizon +{hour}h</span>
              {totalReductionPct > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: "rgba(34, 197, 94, 0.2)",
                    color: "#4ade80",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(74, 222, 128, 0.4)",
                  }}
                >
                  -{totalReductionPct}% via Policy
                </span>
              )}
            </div>

            {/* Source Breakdown Bar */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", marginBottom: 4 }}>
                ESTIMATED POLLUTION ORIGIN (SHAP SPATIAL ATTRIBUTION)
              </div>
              <div
                style={{
                  display: "flex",
                  height: 10,
                  borderRadius: 5,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.5)",
                }}
              >
                <div style={{ width: `${selectedNode.sources.coal}%`, background: "#ef4444" }} title="Coal Thermal Power" />
                <div style={{ width: `${selectedNode.sources.industry}%`, background: "#f97316" }} title="Heavy Industry / Kilns" />
                <div style={{ width: `${selectedNode.sources.traffic}%`, background: "#38bdf8" }} title="Vehicular Traffic" />
                <div style={{ width: `${selectedNode.sources.fires}%`, background: "#fbbf24" }} title="Biomass / Forest Fires" />
                <div style={{ width: `${selectedNode.sources.dust}%`, background: "#94a3b8" }} title="Road & Mining Dust" />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9.5,
                  color: "#cbd5e1",
                  marginTop: 4,
                }}
              >
                <span>🔥 Coal {selectedNode.sources.coal}%</span>
                <span>🏭 Ind {selectedNode.sources.industry}%</span>
                <span>🚗 Veh {selectedNode.sources.traffic}%</span>
                <span>🌲 Fires {selectedNode.sources.fires}%</span>
              </div>
            </div>
          </div>

          {/* 72-Hour AI Forecast Timeline Scrubber */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "10px 14px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8" }}>
                ⏳ 72-HOUR AI FORECAST TRAJECTORY
              </span>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {isPlaying ? "⏸ Pause" : "▶ Play Sim"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              {[0, 12, 24, 36, 48, 72].map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setHour(h);
                    setIsPlaying(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "6px 2px",
                    borderRadius: 6,
                    background: hour === h ? "linear-gradient(135deg, #38bdf8, #2563eb)" : "rgba(255,255,255,0.05)",
                    color: hour === h ? "#fff" : "#94a3b8",
                    border: hour === h ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  +{h}h
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Policy Intervention Sandbox */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
              padding: "10px 14px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", marginBottom: 6 }}>
              ⚡ REGULATORY SCENARIO SIMULATOR (WHAT-IF)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: activeMitigations.stackScrubbing ? "#4ade80" : "#cbd5e1",
                  cursor: "pointer",
                  background: activeMitigations.stackScrubbing ? "rgba(34, 197, 94, 0.12)" : "transparent",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                <span>🏭 40% Thermal Stack Scrubbing</span>
                <input
                  type="checkbox"
                  checked={activeMitigations.stackScrubbing}
                  onChange={(e) =>
                    setActiveMitigations({ ...activeMitigations, stackScrubbing: e.target.checked })
                  }
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: activeMitigations.fireExtinguish ? "#4ade80" : "#cbd5e1",
                  cursor: "pointer",
                  background: activeMitigations.fireExtinguish ? "rgba(34, 197, 94, 0.12)" : "transparent",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                <span>🚜 Rapid Forest Fire Response</span>
                <input
                  type="checkbox"
                  checked={activeMitigations.fireExtinguish}
                  onChange={(e) =>
                    setActiveMitigations({ ...activeMitigations, fireExtinguish: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Bottom Quick Navigation Bar ---------------- */}
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 20px 16px",
          background: "rgba(0, 0, 0, 0.3)",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <Link
          href={`/map?focus=${selectedNode.name.split(" ")[0]}`}
          style={{
            flex: 1,
            textAlign: "center",
            background: "linear-gradient(135deg, #38bdf8, #2563eb)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            padding: "11px 16px",
            borderRadius: 10,
            textDecoration: "none",
            boxShadow: "0 6px 18px rgba(56, 189, 248, 0.35)",
            transition: "transform 0.15s ease",
          }}
        >
          🗺️ Open Full Live GIS Map for {selectedNode.name.split(" ")[0]} →
        </Link>

        <Link
          href="/dashboard"
          style={{
            flex: 1,
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "11px 16px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          📊 Deep Dive Regulatory Analytics →
        </Link>
      </div>
    </div>
  );
}
