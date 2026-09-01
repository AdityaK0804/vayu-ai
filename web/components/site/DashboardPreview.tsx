"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLive, useForecasts72h, useMetrics, useLiveSnapshot } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import { CG_INDUSTRIAL_HOTSPOTS } from "@/lib/industrialHotspots";

export default function DashboardPreview() {
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: multi72h } = useForecasts72h();
  const { data: metrics } = useMetrics("korba");
  const { data: snap } = useLiveSnapshot();

  const cities = useMemo(() => {
    const list = [
      { id: "korba", name: "Korba", role: "Coal & Power Capital", defaultPm: 168 },
      { id: "raipur", name: "Raipur", role: "State Capital & Siltara Belt", defaultPm: 112 },
      { id: "bhilai", name: "Bhilai", role: "Steel City & Smelting Hub", defaultPm: 94 },
      { id: "raigarh", name: "Raigarh", role: "Sponge Iron Corridor", defaultPm: 124 },
      { id: "bilaspur", name: "Bilaspur", role: "Rail & Commercial Center", defaultPm: 68 },
      { id: "jagdalpur", name: "Jagdalpur", role: "Zero-Station Baseline", defaultPm: 32 },
    ];

    return list.map((item) => {
      const l = live?.find((x) => x.city_id === item.id);
      const pm = l?.measured_pm25_24h ?? l?.current_pm25 ?? item.defaultPm;
      const aqi = cpcbAqiFromPm25(pm);
      const tone = cpcbPm25Css(pm);
      const label = cpcbPm25Label(pm);
      const isMeasured = l?.measured === true;

      return {
        ...item,
        pm25: Math.round(pm),
        aqi: aqi ?? Math.round(pm * 1.3),
        tone,
        label,
        isMeasured,
      };
    });
  }, [live]);

  const nFires = snap?.n_fires ?? 18;
  const nStations = snap?.n_stations ?? 9;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 620,
        margin: "0 auto",
        borderRadius: 20,
        background: "linear-gradient(160deg, rgba(15, 28, 25, 0.95), rgba(7, 16, 14, 0.98))",
        border: "1px solid rgba(56, 189, 248, 0.25)",
        boxShadow: "0 24px 60px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.12)",
        overflow: "hidden",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* ----------------- Window Header / Browser Chrome ----------------- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          background: "rgba(0, 0, 0, 0.4)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginLeft: 8, letterSpacing: "0.04em" }}>
            VAYU SPATIAL ENGINE · CHHATTISGARH
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 8px #22c55e",
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>LIVE CPCB / SATELLITE</span>
        </div>
      </div>

      {/* ----------------- Live Telemetry Highlights ----------------- */}
      <div style={{ padding: "18px 20px" }}>
        {/* KPI Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>ACTIVE STACKS</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171", marginTop: 2 }}>
              {CG_INDUSTRIAL_HOTSPOTS.length} <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>Thermal/Steel</span>
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>GROUND SENSORS</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#2dd4bf", marginTop: 2 }}>
              {nStations} <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>CAAQMS</span>
            </div>
          </div>

          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700 }}>NASA FIRMS FIRES</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fb923c", marginTop: 2 }}>
              {nFires} <span style={{ fontSize: 11, fontWeight: 500, color: "#94a3b8" }}>Hotspots</span>
            </div>
          </div>
        </div>

        {/* Real-time City Telemetry Grid */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 8, letterSpacing: "0.05em" }}>
          REAL-TIME CHHATTISGARH AQI READOUTS
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
          {cities.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: 8,
                transition: "all .15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: c.tone,
                    boxShadow: `0 0 8px ${c.tone}`,
                  }}
                />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b style={{ fontSize: 13, color: "#fff" }}>{c.name}</b>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>· {c.role}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#64748b" }}>
                    PM2.5: <b>{c.pm25} µg/m³</b> · {c.isMeasured ? "Verified CAAQMS Sensor" : "Zero-Sensor AI Model"}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    background: `color-mix(in oklch, ${c.tone}, transparent 82%)`,
                    color: c.tone,
                    fontWeight: 800,
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 6,
                    border: `1px solid ${c.tone}`,
                  }}
                >
                  AQI {c.aqi}
                </span>
                <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 2 }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA Bar */}
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/map"
            style={{
              flex: 1,
              textAlign: "center",
              background: "linear-gradient(135deg, #38bdf8, #2563eb)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 12.5,
              padding: "10px 14px",
              borderRadius: 8,
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(56, 189, 248, 0.4)",
            }}
          >
            🗺️ Open Live Spatial Map →
          </Link>

          <Link
            href="/dashboard"
            style={{
              flex: 1,
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 12.5,
              padding: "10px 14px",
              borderRadius: 8,
              textDecoration: "none",
            }}
          >
            📊 View Full Analytics & AI Models →
          </Link>
        </div>
      </div>
    </div>
  );
}
