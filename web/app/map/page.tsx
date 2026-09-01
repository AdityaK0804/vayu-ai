"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

import { useDistricts, type DistrictProps, type CityPoint } from "@/lib/districts";
import { useLiveSnapshot, useLiveFires } from "@/lib/data";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import DistrictDetail from "@/components/dashboard/DistrictDetail";
import CityDetail from "@/components/dashboard/CityDetail";
import SiteFooter from "@/components/site/SiteFooter";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        background: "#050a09",
        color: "#94a3b8",
        fontSize: 14,
        fontFamily: "var(--font-mono)",
      }}
    >
      <span>Loading Chhattisgarh spatial intelligence map…</span>
    </div>
  ),
});

function MapContent() {
  const searchParams = useSearchParams();
  const focusParam = searchParams.get("focus");

  const { data: districts } = useDistricts();
  const { data: liveSnap } = useLiveSnapshot();
  const { data: liveFires } = useLiveFires(168);

  const [selectedDistrict, setSelectedDistrict] = useState<DistrictProps | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focus, setFocus] = useState<{
    kind: "district" | "city" | "india";
    name: string;
    nonce: number;
  } | null>(null);

  // Auto-focus if query parameter is present
  useEffect(() => {
    if (!focusParam || !districts) return;
    const norm = focusParam.toLowerCase();

    // Check cities
    const city = districts.cities?.find((c) => c.name.toLowerCase() === norm);
    if (city) {
      setSelectedCity(city);
      setSelectedDistrict(null);
      setFocus({ kind: "city", name: city.name, nonce: Date.now() });
      return;
    }

    // Check districts
    const dist = districts.features?.find((f) => f.properties.name.toLowerCase() === norm);
    if (dist) {
      setSelectedDistrict(dist.properties);
      setSelectedCity(null);
      setFocus({ kind: "district", name: dist.properties.name, nonce: Date.now() });
    }
  }, [focusParam, districts]);

  const allList = useMemo(() => {
    if (!districts) return [];
    const q = searchQuery.trim().toLowerCase();

    const c = (districts.cities ?? []).map((x) => ({
      name: x.name,
      kind: "city" as const,
      pm25: x.pm25,
      aqi: cpcbAqiFromPm25(x.pm25) ?? x.us_aqi,
      raw: x,
    }));

    const d = (districts.features ?? []).map((f) => ({
      name: f.properties.name,
      kind: "district" as const,
      pm25: f.properties.display_pm25 ?? f.properties.pm25,
      aqi: cpcbAqiFromPm25(f.properties.display_pm25 ?? f.properties.pm25) ?? f.properties.display_aqi,
      raw: f.properties,
    }));

    const combined = [...c, ...d];
    if (!q) return combined;
    return combined.filter((item) => item.name.toLowerCase().includes(q));
  }, [districts, searchQuery]);

  const handleSelect = (item: (typeof allList)[0]) => {
    if (item.kind === "city") {
      setSelectedCity(item.raw as CityPoint);
      setSelectedDistrict(null);
      setFocus({ kind: "city", name: item.name, nonce: Date.now() });
    } else {
      setSelectedDistrict(item.raw as DistrictProps);
      setSelectedCity(null);
      setFocus({ kind: "district", name: item.name, nonce: Date.now() });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#050a09", color: "#fff" }}>
      {/* ----------------- Top Navigation Bar ----------------- */}
      <header
        style={{
          height: 60,
          borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
          background: "rgba(10, 18, 20, 0.95)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 clamp(16px, 3vw, 32px)",
          zIndex: 20,
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ fontSize: 20 }}>💨</span>
            <span>VAYU AI</span>
          </Link>

          <span style={{ color: "rgba(255, 255, 255, 0.2)" }}>/</span>

          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#38bdf8",
              background: "rgba(56, 189, 248, 0.15)",
              padding: "3px 10px",
              borderRadius: 100,
              border: "1px solid rgba(56, 189, 248, 0.3)",
            }}
          >
            CHHATTISGARH SPATIAL INTELLIGENCE
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "#94a3b8",
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 6,
              transition: "all .15s",
            }}
          >
            ← Home Portal
          </Link>

          <Link
            href="/dashboard"
            style={{
              textDecoration: "none",
              color: "#fff",
              background: "linear-gradient(135deg, #38bdf8, #2563eb)",
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 8,
              boxShadow: "0 4px 12px rgba(56, 189, 248, 0.35)",
            }}
          >
            Regulator Dashboard 📊
          </Link>
        </div>
      </header>

      {/* ----------------- Main Map Canvas & Sidebar ----------------- */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>
        {/* Left Floating Search & Quick Explorer Drawer */}
        <aside
          style={{
            width: 320,
            background: "rgba(10, 18, 20, 0.92)",
            borderRight: "1px solid rgba(255, 255, 255, 0.12)",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(14px)",
          }}
        >
          {/* Search Box */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 8,
                padding: "6px 10px",
              }}
            >
              <span style={{ fontSize: 14, color: "#38bdf8", marginRight: 8 }}>🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search CG district or hub…"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  color: "#fff",
                  fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* District & City List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#64748b", padding: "6px 8px", textTransform: "uppercase" }}>
              Chhattisgarh Locations ({allList.length})
            </div>

            {allList.map((item) => {
              const tone = cpcbPm25Css(item.pm25);
              const isSelected =
                (item.kind === "city" && selectedCity?.name === item.name) ||
                (item.kind === "district" && selectedDistrict?.name === item.name);

              return (
                <button
                  key={`${item.kind}-${item.name}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: isSelected ? "rgba(56, 189, 248, 0.18)" : "transparent",
                    border: 0,
                    cursor: "pointer",
                    textAlign: "left",
                    marginBottom: 3,
                    borderLeft: isSelected ? `3px solid ${tone}` : "3px solid transparent",
                    transition: "all .12s ease",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? "#fff" : "#e2e8f0" }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 1 }}>
                      {item.kind === "city" ? "Modelled City" : "District"} · {item.pm25} µg/m³
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: tone,
                      background: `color-mix(in oklch, ${tone}, transparent 85%)`,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}
                  >
                    AQI {item.aqi}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: Fullscreen Deck.gl Map */}
        <main style={{ flex: 1, position: "relative" }}>
          <DistrictMap
            selected={selectedDistrict?.name ?? null}
            onSelect={(d) => {
              setSelectedDistrict(d);
              setSelectedCity(null);
            }}
            focus={focus}
            openCityOnFocus={false}
            liveStations={liveSnap?.stations ?? []}
            liveFires={liveFires?.fires ?? liveSnap?.fires ?? []}
          />
        </main>

        {/* Right Floating Drawer (Detail Panel when selected) */}
        {(selectedCity || selectedDistrict) && (
          <aside
            style={{
              width: 380,
              background: "rgba(10, 18, 20, 0.94)",
              borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
              zIndex: 15,
              display: "flex",
              flexDirection: "column",
              backdropFilter: "blur(16px)",
              overflowY: "auto",
              boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
            }}
          >
            {selectedCity ? (
              <CityDetail city={selectedCity} onClose={() => setSelectedCity(null)} />
            ) : (
              <DistrictDetail district={selectedDistrict!} onClose={() => setSelectedDistrict(null)} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default function PublicMapPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "grid", placeItems: "center", height: "100vh", background: "#050a09", color: "#94a3b8" }}>
          Loading Map…
        </div>
      }
    >
      <MapContent />
    </Suspense>
  );
}
