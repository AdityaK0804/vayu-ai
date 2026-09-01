"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";

interface CityPin {
  id: string;
  name: string;
  hindi: string;
  state: string;
  aqi: number;
  pm25: number;
  dominant: string;
  riskPct: number;
  riskDesc: string;
  temp: number;
  humidity: number;
  windSpeed: number;
  lat: number;
  lon: number;
  // Normalized 2D sphere coordinates (-1 to 1)
  sx: number;
  sy: number;
  sz: number;
}

const CITIES: CityPin[] = [
  {
    id: "korba",
    name: "Korba",
    hindi: "कोरबा",
    state: "Chhattisgarh",
    aqi: 174,
    pm25: 168,
    dominant: "PM2.5",
    riskPct: 78,
    riskDesc: "Severe risk due to 2,600 MW NTPC thermal coal emissions",
    temp: 29,
    humidity: 58,
    windSpeed: 14.2,
    lat: 22.3595,
    lon: 82.7501,
    sx: 0.35,
    sy: -0.28,
    sz: 0.89,
  },
  {
    id: "raipur",
    name: "Raipur",
    hindi: "रायपुर",
    state: "Chhattisgarh",
    aqi: 155,
    pm25: 118,
    dominant: "PM2.5",
    riskPct: 65,
    riskDesc: "High risk from Siltara & Urla industrial corridor",
    temp: 31,
    humidity: 54,
    windSpeed: 11.5,
    lat: 21.2514,
    lon: 81.6296,
    sx: 0.15,
    sy: -0.15,
    sz: 0.97,
  },
  {
    id: "bhilai",
    name: "Bhilai",
    hindi: "भिलाई",
    state: "Chhattisgarh",
    aqi: 112,
    pm25: 94,
    dominant: "PM10",
    riskPct: 48,
    riskDesc: "Moderate risk from SAIL heavy blast furnace operations",
    temp: 30,
    humidity: 56,
    windSpeed: 9.8,
    lat: 21.1938,
    lon: 81.3509,
    sx: 0.05,
    sy: -0.12,
    sz: 0.99,
  },
  {
    id: "raigarh",
    name: "Raigarh",
    hindi: "रायगढ़",
    state: "Chhattisgarh",
    aqi: 132,
    pm25: 126,
    dominant: "PM2.5",
    riskPct: 58,
    riskDesc: "Elevated risk downwind from sponge iron kilns",
    temp: 28,
    humidity: 62,
    windSpeed: 12.0,
    lat: 21.8974,
    lon: 83.395,
    sx: 0.52,
    sy: -0.18,
    sz: 0.83,
  },
  {
    id: "bilaspur",
    name: "Bilaspur",
    hindi: "बिलासपुर",
    state: "Chhattisgarh",
    aqi: 78,
    pm25: 58,
    dominant: "NO2",
    riskPct: 35,
    riskDesc: "Moderate risk due to transport & commercial freight",
    temp: 29,
    humidity: 50,
    windSpeed: 8.5,
    lat: 22.0797,
    lon: 82.1409,
    sx: 0.28,
    sy: -0.22,
    sz: 0.93,
  },
  {
    id: "jagdalpur",
    name: "Jagdalpur",
    hindi: "जगदलपुर",
    state: "Chhattisgarh",
    aqi: 34,
    pm25: 22,
    dominant: "O3",
    riskPct: 15,
    riskDesc: "Low risk in Bastar forest canopy baseline",
    temp: 26,
    humidity: 70,
    windSpeed: 6.2,
    lat: 19.074,
    lon: 82.0298,
    sx: 0.24,
    sy: 0.35,
    sz: 0.90,
  },
  {
    id: "durg",
    name: "Durg",
    hindi: "दुर्ग",
    state: "Chhattisgarh",
    aqi: 90,
    pm25: 66,
    dominant: "PM2.5",
    riskPct: 40,
    riskDesc: "Moderate ambient exposure",
    temp: 30,
    humidity: 55,
    windSpeed: 10.0,
    lat: 21.1904,
    lon: 81.2849,
    sx: -0.08,
    sy: -0.10,
    sz: 0.99,
  },
];

export default function AirIndxHero() {
  const [selectedCity, setSelectedCity] = useState<CityPin>(CITIES[0]);
  const [viewMode, setViewMode] = useState<"globe" | "map">("globe");
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, "0");
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const y = now.getFullYear();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      setCurrentTime(`${d}/${m}/${y} ${hrs}:${mins}`);
    };
    updateTime();
    const t = setInterval(updateTime, 10000);
    return () => clearInterval(t);
  }, []);

  // Continuous subtle 3D globe rotation animation
  useEffect(() => {
    let animId: number;
    const animate = () => {
      setRotationAngle((prev) => (prev + 0.003) % (Math.PI * 2));
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Draw 3D Earth canvas with night lights and atmosphere
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.44 * zoomLevel;

    ctx.clearRect(0, 0, width, height);

    // Deep space backdrop glow
    const outerAura = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.35);
    outerAura.addColorStop(0, "rgba(56, 189, 248, 0.35)");
    outerAura.addColorStop(0.5, "rgba(37, 99, 235, 0.15)");
    outerAura.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = outerAura;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // Earth Base Sphere (Deep Ocean Blue/Black Gradient)
    const earthGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    earthGrad.addColorStop(0, "#1e3a8a");
    earthGrad.addColorStop(0.4, "#0f172a");
    earthGrad.addColorStop(0.85, "#060e18");
    earthGrad.addColorStop(1, "#020617");
    ctx.fillStyle = earthGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Longitude & Latitude Wireframe Rings
    ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
    ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      const r = radius * Math.cos((lat * Math.PI) / 180);
      const y = cy + radius * Math.sin((lat * Math.PI) / 180) * 0.35;
      ctx.beginPath();
      ctx.ellipse(cx, y, r, r * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotating Longitude Ellipses
    for (let lon = 0; lon < Math.PI; lon += Math.PI / 6) {
      const angle = lon + rotationAngle;
      const rx = radius * Math.cos(angle);
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(rx), radius, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Glowing Night Lights / City Cluster Particles on the globe
    const numLights = 140;
    for (let i = 0; i < numLights; i++) {
      const phi = (i * 2.3999632) % (Math.PI * 2);
      const theta = Math.asin(-1 + (2 * i) / numLights);
      const rotPhi = phi + rotationAngle;
      const z = Math.cos(theta) * Math.cos(rotPhi);

      // Only draw on front hemisphere (z > 0)
      if (z > 0) {
        const px = cx + radius * Math.cos(theta) * Math.sin(rotPhi);
        const py = cy + radius * Math.sin(theta) * 0.85;
        const alpha = Math.max(0, z);

        ctx.fillStyle = `rgba(253, 224, 71, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.2 * z, 0, Math.PI * 2);
        ctx.fill();

        // City light halo
        if (i % 8 === 0) {
          ctx.fillStyle = `rgba(251, 146, 60, ${alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(px, py, 3.5 * z, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Atmospheric Edge Rim Lighting (Blue/Cyan Neon Crescent)
    const rimGrad = ctx.createRadialGradient(cx - radius * 0.5, cy - radius * 0.5, radius * 0.7, cx, cy, radius);
    rimGrad.addColorStop(0.75, "transparent");
    rimGrad.addColorStop(0.95, "rgba(56, 189, 248, 0.45)");
    rimGrad.addColorStop(1, "rgba(96, 165, 250, 0.9)");
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Outer Thin Orbit Ring
    ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

  }, [rotationAngle, zoomLevel]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1360,
        margin: "0 auto",
        borderRadius: 32,
        background: "linear-gradient(145deg, #090e17 0%, #05080f 100%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 30px 90px -20px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.12)",
        overflow: "hidden",
        position: "relative",
        color: "#ffffff",
      }}
    >
      {/* Background Starfield Grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ---------------- Top Navbar (AirIndx Style) ---------------- */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 36px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        {/* Left Sub-Links */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 13.5, color: "#94a3b8" }}>
          <Link href="/#cities" style={{ color: "#ffffff", fontWeight: 600 }}>
            Air Quality
          </Link>
          <Link href="/map" style={{ color: "#94a3b8", transition: "color .2s" }}>
            Air Monitors
          </Link>
          <Link href="/dashboard" style={{ color: "#94a3b8", transition: "color .2s" }}>
            Discover
          </Link>
        </div>

        {/* Center Brand Logo (AirIndx Style with Vayu.AI in Comic Sans) */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #38bdf8, #6366f1)",
              boxShadow: "0 0 12px rgba(56, 189, 248, 0.7)",
            }}
          >
            <span style={{ fontSize: 14, color: "#fff" }}>✦</span>
          </span>
          <span
            style={{
              fontFamily: '"Comic Neue", "Comic Sans MS", "Comic Sans", cursive, sans-serif',
              fontWeight: 800,
              fontSize: 22,
              letterSpacing: "0.02em",
              color: "#ffffff",
              textShadow: "0 0 12px rgba(56, 189, 248, 0.5)",
            }}
          >
            Vayu.AI
          </span>
        </Link>

        {/* Right Action Links & Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/#how" style={{ fontSize: 13.5, color: "#94a3b8" }}>
            About
          </Link>
          <Link href="/#features" style={{ fontSize: 13.5, color: "#94a3b8" }}>
            Technology
          </Link>
          <Link
            href="/map"
            style={{
              background: "#ffffff",
              color: "#090e17",
              fontWeight: 700,
              fontSize: 13.5,
              padding: "9px 22px",
              borderRadius: 100,
              textDecoration: "none",
              boxShadow: "0 4px 18px rgba(255, 255, 255, 0.3)",
              transition: "transform .15s ease",
            }}
          >
            Get Started
          </Link>
        </div>
      </div>

      {/* ---------------- Main Hero Grid Content ---------------- */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          padding: "36px 40px 30px",
          gap: 30,
          alignItems: "center",
        }}
      >
        {/* ================= LEFT COLUMN: KPI Cards ================= */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Headline & Location */}
          <div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(34px, 4vw, 44px)",
                fontWeight: 800,
                lineHeight: 1.1,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              Air Quality <span style={{ color: "#94a3b8", fontWeight: 400 }}>Index</span>
            </h1>
            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                fontFamily: "var(--font-mono)",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{currentTime || "01/09/2026 21:58"}</span>
              <span>·</span>
              <span>State → 🇮🇳 {selectedCity.state}</span>
            </div>
          </div>

          {/* Card 1: Main Statistics */}
          <div
            style={{
              background: "rgba(18, 26, 43, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 22,
              padding: "22px 24px",
              backdropFilter: "blur(14px)",
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.4)",
            }}
          >
            <div style={{ fontSize: 13.5, color: "#94a3b8", fontWeight: 500 }}>Main Statistics</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>AQI</div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 800,
                fontFamily: "var(--font-mono)",
                lineHeight: 1,
                color: "#ffffff",
                marginTop: 4,
              }}
            >
              {selectedCity.aqi}
            </div>
            <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 14 }}>
              Dominant Pollutant{" "}
              <b style={{ color: "#ffffff" }}>{selectedCity.dominant}—</b> Wind {selectedCity.windSpeed} km/h
            </div>
          </div>

          {/* Card 2: Risk of Pollution */}
          <div
            style={{
              background: "rgba(18, 26, 43, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 22,
              padding: "22px 24px",
              backdropFilter: "blur(14px)",
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.4)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Wavy Wind Graphic in Background */}
            <svg
              viewBox="0 0 120 60"
              style={{
                position: "absolute",
                right: 14,
                top: 24,
                width: 90,
                opacity: 0.18,
                pointerEvents: "none",
              }}
            >
              <path d="M 10 20 Q 30 5 50 20 T 90 20 T 130 20" stroke="#38bdf8" strokeWidth="4" fill="none" />
              <path d="M 0 35 Q 25 20 45 35 T 85 35 T 120 35" stroke="#38bdf8" strokeWidth="3" fill="none" />
              <path d="M 20 50 Q 40 38 60 50 T 100 50" stroke="#38bdf8" strokeWidth="2.5" fill="none" />
            </svg>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#ffffff" }}>Risk of Pollution</span>
              <Link
                href="/dashboard"
                style={{
                  background: "#eab308",
                  color: "#0f172a",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "4px 12px",
                  borderRadius: 100,
                  textDecoration: "none",
                }}
              >
                Details
              </Link>
            </div>

            <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>Risk</div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                fontFamily: "var(--font-mono)",
                lineHeight: 1,
                color: "#ffffff",
                marginTop: 2,
              }}
            >
              {selectedCity.riskPct}%
            </div>

            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10, maxWidth: "26ch", lineHeight: 1.4 }}>
              {selectedCity.riskDesc}
            </div>
          </div>

          {/* Bottom Share & Coordinates */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#64748b",
              fontFamily: "var(--font-mono)",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>Share</span>
              <span style={{ cursor: "pointer", color: "#94a3b8" }}>🔵</span>
              <span style={{ cursor: "pointer", color: "#94a3b8" }}>✖️</span>
              <span style={{ cursor: "pointer", color: "#94a3b8" }}>🟢</span>
            </div>

            <div>
              X: {selectedCity.lat.toFixed(5)} <br />
              Y: {selectedCity.lon.toFixed(5)}
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: 3D Globe & Floating Hotspot Badges ================= */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 520,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Sun Light Flare Effect behind globe */}
          <div
            style={{
              position: "absolute",
              top: "12%",
              left: "18%",
              width: 320,
              height: 320,
              background: "radial-gradient(circle, rgba(253, 224, 71, 0.18) 0%, rgba(56, 189, 248, 0.08) 45%, transparent 70%)",
              filter: "blur(40px)",
              pointerEvents: "none",
            }}
          />

          {/* 3D Animated Canvas Sphere */}
          <canvas
            ref={canvasRef}
            width={520}
            height={520}
            style={{
              width: 520,
              height: 520,
              maxWidth: "100%",
            }}
          />

          {/* Floating AQI Pins on the Globe (Matching AirIndx Layout) */}
          {CITIES.map((city) => {
            const isSelected = city.id === selectedCity.id;
            // Project 3D sphere coordinate to 2D view with rotation
            const rotX = city.sx * Math.cos(rotationAngle) - city.sz * Math.sin(rotationAngle);
            const rotZ = city.sx * Math.sin(rotationAngle) + city.sz * Math.cos(rotationAngle);

            // If behind the globe (rotZ < 0), dim and scale down
            const isFront = rotZ > -0.2;
            const screenX = 50 + rotX * 38;
            const screenY = 50 + city.sy * 38;

            let badgeBg = "#22c55e";
            if (city.aqi > 150) badgeBg = "#ef4444";
            else if (city.aqi > 100) badgeBg = "#f97316";
            else if (city.aqi > 50) badgeBg = "#eab308";

            return (
              <div
                key={city.id}
                onClick={() => setSelectedCity(city)}
                style={{
                  position: "absolute",
                  left: `${screenX}%`,
                  top: `${screenY}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isSelected ? 30 : isFront ? 15 : 5,
                  opacity: isFront ? 1 : 0.25,
                  cursor: "pointer",
                  transition: "opacity 0.2s, transform 0.2s",
                }}
              >
                {/* Circular Floating Badge */}
                <div
                  style={{
                    width: isSelected ? 48 : 34,
                    height: isSelected ? 48 : 34,
                    borderRadius: "50%",
                    background: badgeBg,
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: isSelected ? 15 : 12,
                    fontFamily: "var(--font-mono)",
                    boxShadow: isSelected
                      ? `0 0 24px ${badgeBg}, 0 0 10px #ffffff`
                      : `0 4px 14px rgba(0,0,0,0.6)`,
                    border: isSelected ? "3px solid #ffffff" : "2px solid rgba(255,255,255,0.4)",
                    transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                >
                  {city.aqi}
                </div>

                {/* City Name label under pin */}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: isSelected ? "#ffffff" : "#94a3b8",
                    textAlign: "center",
                    marginTop: 3,
                    textShadow: "0 2px 6px rgba(0,0,0,0.9)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {city.name}
                </div>
              </div>
            );
          })}

          {/* ================= Floating Glassmorphic Inspector Card (Exact AirIndx style) ================= */}
          <div
            style={{
              position: "absolute",
              top: "28%",
              right: "8%",
              zIndex: 35,
              background: "rgba(23, 32, 54, 0.9)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 16,
              padding: "12px 16px",
              backdropFilter: "blur(18px)",
              boxShadow: "0 18px 40px rgba(0, 0, 0, 0.7)",
              minWidth: 230,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: selectedCity.aqi > 150 ? "#ef4444" : "#eab308",
                  }}
                />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#ffffff" }}>
                  {selectedCity.name}, Chhattisgarh
                </span>
              </div>
              <Link href={`/map?focus=${selectedCity.name}`} style={{ fontSize: 10.5, color: "#38bdf8", fontWeight: 600 }}>
                Details
              </Link>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
              <span
                style={{
                  background: selectedCity.aqi > 150 ? "#ef4444" : "#eab308",
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {selectedCity.aqi} AQI
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#f1f5f9", lineHeight: 1.2 }}>
                {selectedCity.aqi > 150 ? "Unhealthy for sensitive people" : "Moderate air quality"}
              </span>
            </div>

            {/* Weather bar inside tooltip */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "#94a3b8",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 6,
                marginTop: 6,
              }}
            >
              <span>🌡 {selectedCity.temp}°C</span>
              <span>💧 {selectedCity.humidity}%</span>
              <span>💨 {selectedCity.windSpeed} km/h</span>
            </div>
          </div>

          {/* Mode Switcher Pill: [ 3D GLOBE ] [ REGIONAL MAP ] */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 35,
              display: "flex",
              gap: 4,
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: 100,
              padding: 4,
              backdropFilter: "blur(12px)",
            }}
          >
            <button
              onClick={() => setViewMode("globe")}
              style={{
                background: viewMode === "globe" ? "#2563eb" : "transparent",
                color: viewMode === "globe" ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: 100,
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all .15s ease",
              }}
            >
              3D GLOBE
            </button>
            <Link
              href="/map"
              style={{
                background: viewMode === "map" ? "#2563eb" : "transparent",
                color: viewMode === "map" ? "#ffffff" : "#94a3b8",
                borderRadius: 100,
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              IQ AIR MAP
            </Link>
          </div>

          {/* Bottom Right Zoom Buttons */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 20,
              zIndex: 35,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            <span>Zoom</span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(1.3, z + 0.1))}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
              }}
            >
              +
            </button>
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
              }}
            >
              -
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
