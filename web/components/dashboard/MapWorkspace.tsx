"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { useDistricts, type CityPoint, type DistrictProps } from "@/lib/districts";
import CityDetail from "@/components/dashboard/CityDetail";
import DistrictDetail from "@/components/dashboard/DistrictDetail";
import {
  CPCB_PM25_LEGEND_GRADIENT,
  cpcbAqiFromPm25,
  cpcbPm25Css,
  cpcbPm25CssReadable,
  cpcbPm25Label,
} from "@/lib/aqiScale";
import { SOURCE_LABEL } from "@/lib/aqi";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { useLive, useLiveFires, useLiveSnapshot, usePriority } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import type { CityId } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="label">Loading map…</span>
    </div>
  ),
});

type Focus = {
  kind: "district" | "city" | "india";
  name: string;
  nonce: number;
  bb?: [number, number, number, number];
  lat?: number;
  lon?: number;
};

/**
 * Three-column workspace: cities to pick from on the left, the Chhattisgarh
 * risk map in the middle, live alerts on the right — the layout from the
 * reference. Selecting anywhere in the left rail flies the map and opens the
 * district panel, so the columns stay in sync.
 */
export default function MapWorkspace({
  onSelectDistrict,
  selected,
  openCity,
  setOpenCity,
}: {
  onSelectDistrict: (d: DistrictProps | null) => void;
  selected: DistrictProps | null;
  openCity: CityPoint | null;
  setOpenCity: (c: CityPoint | null) => void;
}) {
  const { t } = useT();
  const { city, setCity, setView } = useApp();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: liveSnap } = useLiveSnapshot();
  const { data: liveFires } = useLiveFires(168);
  const { data: priority } = usePriority(city);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [q, setQ] = useState("");

  const cities: CityPoint[] = districts?.cities ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cities;
    return cities.filter((c) => c.name.toLowerCase().includes(s));
  }, [q, cities]);

  const goCity = (c: CityPoint) => {
    setCity(c.id as CityId);
    onSelectDistrict(null);   // city and district panels are mutually exclusive
    setOpenCity(c);
    setFocus({ kind: "city", name: c.name, nonce: Date.now() });
  };

  // Alerts: CPCB AQI from PM2.5 (not legacy US display_aqi).
  // Moderate starts at CPCB AQI 101 (PM2.5 > 60 µg/m³).
  const alerts = useMemo(() => {
    if (!districts) return [];
    return districts.features
      .map((f) => f.properties)
      .map((p) => ({
        p,
        cpcbAqi: cpcbAqiFromPm25(p.display_pm25 ?? p.pm25) ?? 0,
      }))
      .filter(({ cpcbAqi }) => cpcbAqi > 100)
      .sort((a, b) => b.cpcbAqi - a.cpcbAqi)
      .slice(0, 12)
      .map(({ p }) => p);
  }, [districts]);

  const criticalAlerts = alerts.filter((a) => {
    const q = cpcbAqiFromPm25(a.display_pm25 ?? a.pm25) ?? 0;
    return q > 200; // CPCB Poor and worse
  }).length;

  const nCities = cities.length;
  const nDistricts = districts?.meta?.n_districts ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "auto", minHeight: "calc(100vh - 110px)", gap: 16 }}>
      {/* ---------------- Top Stats ---------------- */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", zIndex: 10, flex: "none" }}>
        {/* Total Cities */}
        <div className="card" style={{ flex: 1, minWidth: 180, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>TOTAL CITIES</span>
            <span style={{ color: "var(--aqi-1)", fontSize: 16 }}>🏢</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <NumberTicker value={nCities} className="kpi-ticker" />
            <span style={{ fontSize: 11, color: "var(--aqi-1)" }}>~Live</span>
          </div>
        </div>
        {/* Active Alerts */}
        <div className="card" style={{ flex: 1, minWidth: 180, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>ACTIVE ALERTS</span>
            <span style={{ color: "var(--aqi-3)", fontSize: 16 }}>● 🔔</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <NumberTicker value={alerts.length} className="kpi-ticker" delay={0.05} />
            <span style={{ fontSize: 11, color: "var(--aqi-3)" }}>~Live</span>
          </div>
        </div>
        {/* Critical Alerts */}
        <div className="card" style={{ flex: 1, minWidth: 180, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>CRITICAL ALERTS</span>
            <span style={{ color: "var(--aqi-4)", fontSize: 16 }}>↗</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <NumberTicker value={criticalAlerts} className="kpi-ticker" delay={0.1} />
            <span style={{ fontSize: 11, color: "var(--aqi-4)" }}>~Live</span>
          </div>
        </div>
        {/* Monitored Districts */}
        <div className="card" style={{ flex: 1, minWidth: 180, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>MONITORED DISTRICTS</span>
            <span style={{ color: "var(--aqi-2)", fontSize: 16 }}>↘</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <NumberTicker value={nDistricts} className="kpi-ticker" delay={0.15} />
            <span style={{ fontSize: 11, color: "var(--aqi-1)" }}>~Live</span>
          </div>
        </div>
      </div>

      <div className="mapws" style={{ height: "auto", flex: 1, minHeight: 350 }}>
      {/* ---------------- left: cities ---------------- */}
      <aside className="card mapws-col">
        <div className="mapws-head">
          <span style={{ color: "var(--accent)" }}>◉</span>
          <b>{t("Cities")}</b>
          <span className="n-badge" style={{ marginLeft: "auto" }}>
            {cities.length}
          </span>
        </div>

        <div style={{ padding: "10px 12px 6px" }}>
          <div className="search" style={{ maxWidth: "none", width: "100%" }}>
            <span>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search city…")}
              aria-label={t("Search city…")}
            />
          </div>
        </div>

        <div className="thin-scroll mapws-list">
          {filtered.map((c) => {
            const l = live?.find((x) => x.city_id === c.id);
            const pm = l?.measured_pm25_24h ?? c.pm25;
            const aqi = cpcbAqiFromPm25(pm) ?? c.us_aqi;
            const on = city === c.id;
            const tone = cpcbPm25CssReadable(pm);
            const rawTone = cpcbPm25Css(pm);
            return (
              <button
                key={c.id}
                onClick={() => goCity(c)}
                className={`mapws-city${on ? " on" : ""}`}
                style={{ borderLeftColor: on ? rawTone : "transparent" }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{c.name}</b>
                  <span
                    style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}
                  >
                    {c.has_stations
                      ? `${c.n_stations} ${t("CPCB stations")}`
                      : t("No ground sensor")}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="figure pill" style={{ background: `color-mix(in oklch, ${rawTone}, transparent 85%)`, color: rawTone, fontSize: 13, padding: "2px 8px" }}>
                    {aqi}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 9, color: "var(--ink-3)", marginTop: 4 }}
                    className="figure"
                  >
                    {l?.measured ? t("measured") : t("predicted")}
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--ink-3)" }}>
              {t("No match")}
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- middle: risk map ---------------- */}
      <section className="card mapws-col" style={{ overflow: "hidden" }}>
        <div className="mapws-head">
          <span style={{ color: "var(--accent)" }}>◉</span>
          <b>{t("Risk Map")}</b>
          <span className="sub" style={{ margin: "0 0 0 8px", fontSize: 11 }}>
            {districts?.meta?.n_districts ?? 28} {t("districts")}
          </span>
          <span
            className="pill"
            style={{
              marginLeft: "auto",
              fontSize: 10,
              background: liveSnap?.cache === "baked" ? "var(--surface-2)" : "color-mix(in oklch, var(--aqi-1), transparent 85%)",
              color: liveSnap?.cache === "baked" ? "var(--ink-3)" : "var(--aqi-1)",
            }}
          >
            {liveSnap?.cache === "baked" ? "BAKED FALLBACK" : "LIVE FEED"}
          </span>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <DistrictMap
            selected={selected?.name ?? null}
            onSelect={(d) => {
              setOpenCity(null);
              onSelectDistrict(d);
            }}
            focus={focus}
            openCityOnFocus={false}
            liveStations={liveSnap?.stations ?? []}
            liveFires={liveFires?.fires ?? liveSnap?.fires ?? []}
          />

          <div className="mapws-legend card">
            <div className="crumb" style={{ marginBottom: 6 }}>
              {t("CPCB PM2.5")} · µg/m³
            </div>
            <div style={{ width: 240 }}>
              <div
                style={{
                  height: 12,
                  background: CPCB_PM25_LEGEND_GRADIENT,
                  marginBottom: 6,
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: "var(--ink-2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>0</span>
                <span>30</span>
                <span>60</span>
                <span>90</span>
                <span>120</span>
                <span>250+</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 6, lineHeight: 1.4 }}>
                {t("Colour = PM2.5 · tooltip shows CPCB AQI")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- right: detail, else live alerts ----------------
          The detail panel used to float over the risk map, hiding the very
          thing it described. It now takes the right column instead — closing
          it reveals the alerts underneath, and the map is never covered. */}
      {openCity || selected ? (
        <aside className="card mapws-col">
          {openCity ? (
            <CityDetail city={openCity} onClose={() => setOpenCity(null)} />
          ) : (
            <DistrictDetail district={selected!} onClose={() => onSelectDistrict(null)} />
          )}
        </aside>
      ) : (
      <aside className="card mapws-col">
        <div className="mapws-head">
          <span style={{ color: alerts.length ? "var(--aqi-4)" : "var(--ink-3)" }}>◔</span>
          <b>{t("Live Alerts")}</b>
          <span
            className="n-badge"
            style={{
              marginLeft: "auto",
              background: alerts.length ? "var(--aqi-5)" : "var(--surface-2)",
              color: alerts.length ? "#fff" : "var(--ink-3)",
            }}
          >
            {alerts.length}
          </span>
          <button
            className="chip"
            style={{ padding: "4px 9px", fontSize: 10.5 }}
            onClick={() => setView("alerts")}
          >
            {t("View all")}
          </button>
        </div>

        <div className="thin-scroll mapws-list">
          {alerts.length === 0 ? (
            <div style={{ padding: "36px 18px", textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  margin: "0 auto 12px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  background: "color-mix(in oklch, var(--aqi-1), transparent 88%)",
                  color: "var(--aqi-1)",
                }}
              >
                ◔
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{t("No active alerts")}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {t("No district is above CPCB AQI 100 right now.")}
              </div>
            </div>
          ) : (
            alerts.map((p) => {
              const pm = p.display_pm25 ?? p.pm25;
              const caqi = cpcbAqiFromPm25(pm) ?? p.display_aqi;
              const tone = cpcbPm25Css(pm);
              return (
              <button
                key={p.name}
                onClick={() => {
                  setOpenCity(null);
                  onSelectDistrict(p);
                  setFocus({ kind: "district", name: p.name, nonce: Date.now() });
                }}
                className="mapws-alert"
                style={{ borderLeftColor: tone }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{p.name}</b>
                  <span
                    style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}
                  >
                    {pm} µg/m³ · {cpcbPm25Label(pm)} · {p.population.toLocaleString()} {t("people")}
                  </span>
                </span>
                <span
                  className="pill"
                  style={{
                    background: `color-mix(in oklch, ${tone}, transparent 85%)`,
                    color: tone,
                    fontSize: 10.5,
                  }}
                >
                  {caqi}
                </span>
              </button>
              );
            })
          )}
        </div>

        {priority?.dossiers?.[0] && (() => {
          const d = priority.dossiers[0];
          const srcLabel = SOURCE_LABEL[d.top_source] ?? d.top_source;
          const pm = d.predicted_pm25;
          const wardName = d.ward || city;

          let cleanAction = d.recommended_action
            .replace(/\? km - \([^)]+\) of/g, "upwind of")
            .replace(/\? km - /g, "");

          return (
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)", background: "color-mix(in oklch, var(--surface-2) 70%, transparent)" }}>
              {/* Header Badge */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>🎯</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                    TOP ENFORCEMENT TARGET
                  </span>
                </div>
                <span className="pill" style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", background: "color-mix(in oklch, var(--accent), transparent 85%)", color: "var(--accent)" }}>
                  RANK #01
                </span>
              </div>

              {/* Structured Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                <div style={{ background: "var(--surface)", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="crumb" style={{ fontSize: 9 }}>Target Ward</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {wardName}
                  </div>
                </div>

                <div style={{ background: "var(--surface)", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--line)" }}>
                  <div className="crumb" style={{ fontSize: 9 }}>Forecast PM2.5</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", marginTop: 1 }}>
                    {pm} µg/m³
                  </div>
                </div>
              </div>

              {/* Clean Action Description */}
              <div style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--ink-2)", background: "var(--surface)", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--line)", marginBottom: 8 }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6, fontSize: 12 }}>Directive</div>
                <ul style={{ margin: 0, paddingLeft: 18, listStyleType: "disc", display: "flex", flexDirection: "column", gap: 5 }}>
                  {cleanAction.split('. ').filter(Boolean).map((s, i) => (
                    <li key={i}>{s.replace(/\.$/, "")}</li>
                  ))}
                </ul>
              </div>

              {/* Footer Metrics */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "var(--ink-3)" }}>
                <span>Source: <b style={{ color: "var(--accent)", textTransform: "capitalize" }}>{srcLabel}</b></span>
                <span>Confidence: <b>{Math.round((d.confidence ?? 0.9) * 100)}%</b></span>
              </div>
            </div>
          );
        })()}
      </aside>
      )}
      </div>
    </div>
  );
}
