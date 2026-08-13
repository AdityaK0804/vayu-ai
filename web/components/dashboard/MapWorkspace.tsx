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
  cpcbPm25Label,
} from "@/lib/aqiScale";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { useLive, usePriority } from "@/lib/data";
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
            const tone = cpcbPm25Css(pm);
            return (
              <button
                key={c.id}
                onClick={() => goCity(c)}
                className={`mapws-city${on ? " on" : ""}`}
                style={{ borderLeftColor: on ? tone : "transparent" }}
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
                  <span className="figure" style={{ fontSize: 16, color: tone }}>
                    {aqi}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 9, color: "var(--ink-3)" }}
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
          <span className="sub" style={{ margin: 0, fontSize: 11 }}>
            {districts?.meta?.n_districts ?? 28} {t("districts")} ·{" "}
            {districts?.meta_live?.mode === "live" ? t("live") : t("model")}
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

        {priority?.dossiers?.[0] && (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
            <div className="crumb" style={{ marginBottom: 6 }}>
              {t("Top enforcement target")}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-2)" }}>
              {priority.dossiers[0].recommended_action}
            </div>
          </div>
        )}
      </aside>
      )}
      </div>
    </div>
  );
}
