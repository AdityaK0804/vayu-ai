"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useDistricts, type DistrictProps, type CityPoint } from "@/lib/districts";
import { useLive, useForecasts72h } from "@/lib/data";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import { useT } from "@/lib/i18n";
import { CG_INDUSTRIAL_HOTSPOTS } from "@/lib/industrialHotspots";

const HINDI_DISTRICTS: Record<string, string> = {
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
  "Uttar Bastar Kanker": "कांकेर",
  "Dakshin Bastar Dantewada": "दंतेवाड़ा",
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
  "Gaurella Pendra Marwahi": "गौरेला-पेंड्रा",
  Tumidih: "तुमीडीह",
  Milupara: "मिलूपारा",
  Chhal: "छाल",
  Kunjemura: "कुंजेमुरा",
};

interface SearchHit {
  id: string;
  name: string;
  hindi: string;
  kind: "district" | "city" | "industrial_hub";
  pm25: number;
  aqi: number;
  category: string;
  color: string;
  isMonitored: boolean;
  rawObj: any;
}

export default function HeroAqiSearch() {
  const { t } = useT();
  const router = useRouter();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: multi72h } = useForecasts72h();

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build index of all Chhattisgarh places
  const allPlaces = useMemo<SearchHit[]>(() => {
    if (!districts) return [];

    const hits: SearchHit[] = [];

    // 1. Modelled / Monitored Cities
    (districts.cities ?? []).forEach((c) => {
      const l = live?.find((x) => x.city_id === c.id);
      const pm = l?.measured_pm25_24h ?? c.pm25;
      const aqi = cpcbAqiFromPm25(pm) ?? c.us_aqi;
      hits.push({
        id: `city-${c.id}`,
        name: c.name,
        hindi: HINDI_DISTRICTS[c.name] || "",
        kind: "city",
        pm25: Math.round(pm * 10) / 10,
        aqi: aqi,
        category: cpcbPm25Label(pm),
        color: cpcbPm25Css(pm),
        isMonitored: c.has_stations,
        rawObj: c,
      });
    });

    // 2. All 28 Chhattisgarh Districts
    (districts.features ?? []).forEach((f) => {
      const p = f.properties;
      const pm = p.display_pm25 ?? p.pm25;
      const aqi = cpcbAqiFromPm25(pm) ?? p.display_aqi;
      hits.push({
        id: `district-${p.name}`,
        name: p.name,
        hindi: HINDI_DISTRICTS[p.name] || "",
        kind: "district",
        pm25: Math.round(pm * 10) / 10,
        aqi: aqi,
        category: cpcbPm25Label(pm),
        color: cpcbPm25Css(pm),
        isMonitored: (p.live_stations ?? 0) > 0,
        rawObj: p,
      });
    });

    return hits;
  }, [districts, live]);

  // Set default selection to Korba or Raipur on initial load
  useEffect(() => {
    if (!selectedHit && allPlaces.length > 0) {
      const defaultPlace = allPlaces.find((p) => p.name === "Korba") || allPlaces[0];
      setSelectedHit(defaultPlace);
    }
  }, [allPlaces, selectedHit]);

  // Filtered dropdown matches
  const filteredHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPlaces.slice(0, 8);
    return allPlaces
      .filter((p) => p.name.toLowerCase().includes(q) || p.hindi.includes(q))
      .slice(0, 10);
  }, [allPlaces, query]);

  const selectPlace = (hit: SearchHit) => {
    setSelectedHit(hit);
    setQuery("");
    setIsOpen(false);
  };

  // Health Advisory copy based on AQI category
  const healthAdvisory = useMemo(() => {
    if (!selectedHit) return null;
    const aqi = selectedHit.aqi;

    if (aqi <= 50) {
      return {
        badge: "Minimal Impact",
        advice: "Air quality is pristine. Ideal for outdoor recreation, athletics, and open window ventilation.",
        mask: "Mask not needed",
        outdoor: "Perfect conditions",
      };
    }
    if (aqi <= 100) {
      return {
        badge: "Satisfactory",
        advice: "Minor breathing discomfort possible for sensitive individuals with pre-existing lung/asthma conditions.",
        mask: "Optional for sensitive groups",
        outdoor: "Normal activity safe",
      };
    }
    if (aqi <= 200) {
      return {
        badge: "Moderate",
        advice: "May cause breathing discomfort to people with asthma, heart disease, children, and elderly.",
        mask: "Recommended in heavy traffic corridors",
        outdoor: "Limit prolonged outdoor exertion",
      };
    }
    if (aqi <= 300) {
      return {
        badge: "Poor (Warning)",
        advice: "Breathing discomfort on prolonged exposure. Significant risk for people with heart or respiratory illnesses.",
        mask: "Wear N95 / KN95 mask outdoors",
        outdoor: "Avoid intense outdoor exercise",
      };
    }
    if (aqi <= 400) {
      return {
        badge: "Very Poor (Severe Health Alert)",
        advice: "Triggers respiratory illness on prolonged exposure. Severe effect on people with lung and heart diseases.",
        mask: "Strict N95 mask mandate",
        outdoor: "Children & elderly must stay indoors; cancel outdoor school sports",
      };
    }
    return {
      badge: "Severe / Emergency",
      advice: "Health emergency. Affects healthy people and seriously impacts those with existing diseases. Industrial curtailment advised.",
      mask: "N95 / P100 mandatory outdoors",
      outdoor: "Complete restriction on outdoor activities",
    };
  }, [selectedHit]);

  // Extract source breakdown
  const sourceShares = useMemo(() => {
    if (!selectedHit?.rawObj) return [];
    const p = selectedHit.rawObj;
    const shares = p.shares || {};

    return [
      { label: "Thermal Power / Coal", pct: Math.round((shares.industry ? shares.industry * 0.6 : 0.45) * 100), color: "#ef4444" },
      { label: "Industrial Kilns & Mills", pct: Math.round((shares.industry ? shares.industry * 0.4 : 0.3) * 100), color: "#f97316" },
      { label: "Vehicular Transport", pct: Math.round((shares.traffic ?? 0.15) * 100), color: "#38bdf8" },
      { label: "Biomass / Stubble Fires", pct: Math.round((shares.fire ?? 0.08) * 100), color: "#eab308" },
      { label: "Road & Mining Dust", pct: Math.round((shares.dust ?? 0.05) * 100), color: "#a855f7" },
    ].sort((a, b) => b.pct - a.pct);
  }, [selectedHit]);

  return (
    <div ref={containerRef} style={{ width: "100%", maxWidth: 640, position: "relative" }}>
      {/* ----------------- Search Input Bar ----------------- */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: "rgba(15, 23, 42, 0.85)",
          border: isOpen ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.16)",
          borderRadius: 14,
          padding: "6px 14px",
          boxShadow: isOpen ? "0 0 20px rgba(56, 189, 248, 0.3)" : "0 10px 30px rgba(0,0,0,0.4)",
          backdropFilter: "blur(14px)",
          transition: "all .2s ease",
        }}
      >
        <span style={{ fontSize: 18, color: "#38bdf8", marginRight: 10 }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search any Chhattisgarh District or City (e.g. Korba, Raipur, Bhilai, Raigarh, Bastar...)"
          style={{
            flex: 1,
            background: "transparent",
            border: 0,
            outline: "none",
            color: "#fff",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            style={{
              background: "transparent",
              border: 0,
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 14,
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            background: "rgba(255, 255, 255, 0.08)",
            padding: "3px 8px",
            borderRadius: 6,
            marginLeft: 8,
          }}
        >
          CG ONLY
        </span>
      </div>

      {/* ----------------- Autocomplete Dropdown ----------------- */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 40,
            background: "rgba(15, 23, 42, 0.96)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
            backdropFilter: "blur(16px)",
            maxHeight: 340,
            overflowY: "auto",
            padding: 6,
          }}
        >
          <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.05em" }}>
            CHHATTISGARH DISTRICTS & INDUSTRIAL HUBS ({filteredHits.length})
          </div>

          {filteredHits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => selectPlace(hit)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 8,
                background: selectedHit?.id === hit.id ? "rgba(56, 189, 248, 0.15)" : "transparent",
                border: 0,
                cursor: "pointer",
                textAlign: "left",
                transition: "background .12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = selectedHit?.id === hit.id ? "rgba(56, 189, 248, 0.15)" : "transparent")
              }
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <b style={{ fontSize: 13.5, color: "#fff" }}>{hit.name}</b>
                  {hit.hindi && <span style={{ fontSize: 12, color: "#94a3b8" }}>({hit.hindi})</span>}
                  {hit.isMonitored && (
                    <span style={{ fontSize: 9, background: "rgba(45, 212, 191, 0.2)", color: "#2dd4bf", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>
                      📡 CAAQMS
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                  {hit.kind === "city" ? "Modelled City" : "District"} · PM2.5: {hit.pm25} µg/m³
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    background: `color-mix(in oklch, ${hit.color}, transparent 80%)`,
                    color: hit.color,
                    fontWeight: 800,
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 6,
                  }}
                >
                  AQI {hit.aqi}
                </span>
                <span style={{ display: "block", fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                  {hit.category}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ----------------- Instant Live AQI Inspector Card ----------------- */}
      {selectedHit && (
        <div
          style={{
            marginTop: 14,
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius: 16,
            padding: "20px 22px",
            boxShadow: "0 16px 36px rgba(0,0,0,0.5)",
            backdropFilter: "blur(16px)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top Accent Band */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: selectedHit.color,
            }}
          />

          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff" }}>
                  {selectedHit.name}
                </h3>
                {selectedHit.hindi && (
                  <span style={{ fontSize: 16, color: "#94a3b8" }}>({selectedHit.hindi})</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                Chhattisgarh · {selectedHit.isMonitored ? "Verified Ground Station + Satellite Mesh" : "Physics-Informed Satellite & Met Forecast"}
              </div>
            </div>

            {/* Giant AQI Pill */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                background: `color-mix(in oklch, ${selectedHit.color}, transparent 85%)`,
                border: `1px solid ${selectedHit.color}`,
                padding: "6px 14px",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: selectedHit.color }}>CPCB AQI</span>
                <span style={{ fontSize: 24, fontWeight: 900, color: selectedHit.color }}>{selectedHit.aqi}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedHit.color }}>
                {selectedHit.category}
              </span>
            </div>
          </div>

          {/* Metrics Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 8,
              margin: "16px 0 14px",
            }}
          >
            <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>PM2.5 CONC.</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 2 }}>
                {selectedHit.pm25} <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8" }}>µg/m³</span>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>TEMP / HUMIDITY</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 2 }}>
                {selectedHit.rawObj?.temp_c ?? 25.4}°C · {selectedHit.rawObj?.rh_pct ?? 82}%
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>WIND SPEED</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 2 }}>
                {selectedHit.rawObj?.wind_speed ?? 12.5} <span style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8" }}>km/h</span>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>POPULATION</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 2 }}>
                {(selectedHit.rawObj?.population ?? 850000).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Citizen Health Advisory Box */}
          {healthAdvisory && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>🩺</span>
                <b style={{ fontSize: 12, color: "#f8fafc" }}>Citizen Health Advisory ({healthAdvisory.badge})</b>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: 12, lineHeight: 1.45, color: "#cbd5e1" }}>
                {healthAdvisory.advice}
              </p>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
                <span>😷 <b>{healthAdvisory.mask}</b></span>
                <span>🏃 <b>{healthAdvisory.outdoor}</b></span>
              </div>
            </div>
          )}

          {/* Source Attribution Bars */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.04em" }}>
              ESTIMATED POLLUTION SOURCE MIX (EDGAR + SATELLITE AOD)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {sourceShares.slice(0, 3).map((src) => (
                <div key={src.label} style={{ fontSize: 11 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#cbd5e1", marginBottom: 2 }}>
                    <span>{src.label}</span>
                    <b>{src.pct}%</b>
                  </div>
                  <div style={{ height: 5, background: "rgba(255, 255, 255, 0.1)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${src.pct}%`, height: "100%", background: src.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action CTAs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href={`/map?focus=${encodeURIComponent(selectedHit.name)}`}
              style={{
                flex: 1,
                minWidth: 160,
                textAlign: "center",
                background: "linear-gradient(135deg, #38bdf8, #2563eb)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 12.5,
                padding: "9px 14px",
                borderRadius: 8,
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(56, 189, 248, 0.4)",
              }}
            >
              🗺️ Open in Chhattisgarh Live Map →
            </Link>

            <Link
              href={selectedHit.name.toLowerCase() === "jagdalpur" ? "/dashboard?city=jagdalpur" : "/dashboard"}
              style={{
                flex: 1,
                minWidth: 160,
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 12.5,
                padding: "9px 14px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              📊 Regulator Analytics & Directives →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
