"use client";

import Link from "next/link";
import { useEffect } from "react";

import {
  AlertsView,
  ForecastView,
  InterventionsView,
  MapView,
  NetworkView,
  OverviewView,
  ReportsView,
} from "@/components/dashboard/views";
import Chatbot from "@/components/Chatbot";
import LangToggle from "@/components/LangToggle";
import { useT } from "@/lib/i18n";
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { useLive, usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";
import type { ViewId } from "@/lib/store";
import type { CityId } from "@/lib/types";

const NAV: {
  group: string;
  items: { id: ViewId; label: string; ico: string; badge?: "count" | "72h" }[];
}[] = [
  {
    group: "MONITOR",
    items: [
      { id: "overview", label: "Overview", ico: "◫" },
      { id: "map", label: "Live Map", ico: "◍" },
      { id: "forecast", label: "AI Forecast", ico: "◈", badge: "72h" },
    ],
  },
  {
    group: "ACT",
    items: [
      { id: "interventions", label: "Interventions", ico: "◎", badge: "count" },
      { id: "alerts", label: "Alerts", ico: "◔", badge: "count" },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      { id: "network", label: "Sensor Network", ico: "◇" },
      { id: "reports", label: "Reports & Export", ico: "▤" },
    ],
  },
];

export default function Dashboard() {
  const { city, setCity, view, setView, sideOpen, toggleSide } = useApp();
  const { t } = useT();
  // city selection now lives inside the Risk Map card (Live Map view)
  const { data: priority } = usePriority(city);
  const { data: live } = useLive();

  // deep link from the landing city cards: /dashboard?city=jagdalpur
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("city");
    if (p === "jagdalpur" || p === "korba") setCity(p as CityId);
  }, [setCity]);

  const badgeVal = (b?: "count" | "72h") =>
    b === "72h" ? "72h" : b === "count" ? String(priority?.dossiers.length ?? "") : undefined;

  const cityLive = live?.find((l) => l.city_id === city);

  return (
    <div className="app">
      {/* ---------------- topbar ---------------- */}
      <header className="topbar">
        <button className="icon-btn md:hidden" onClick={toggleSide} aria-label="Menu">
          ☰
        </button>
        <Link href="/" className="brand">
          <span className="logo">
            <span />
          </span>
          <span>
            <b style={{ letterSpacing: ".08em" }}>Vayu AI</b>
            <small>{t("COMMAND CENTER")}</small>
          </span>
        </Link>

        <div className="search hidden md:flex">
          <span>⌕</span>
          <input placeholder={t("Search wards, stations, sources…")} aria-label="Search" />
        </div>

        <div className="tb-right">
          {cityLive && (
            <span
              className="pill hidden lg:inline-flex"
              style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
            >
              <span className="live-dot" />
              AQI {cityLive.measured_us_aqi ?? cityLive.current_us_aqi}
              <span style={{ opacity: 0.6, fontSize: 10 }}>
                {cityLive.measured ? `· ${cityLive.n_stations} stn` : "· model"}
              </span>
            </span>
          )}
          <LangToggle compact />
          <AnimatedThemeToggler className="icon-btn" />
        </div>
      </header>

      {/* ---------------- sidebar ---------------- */}
      <aside className={`side${sideOpen ? " open" : ""}`}>
        {NAV.map((grp) => (
          <div key={grp.group}>
            <div className="grp">{t(grp.group)}</div>
            {grp.items.map((it) => {
              const val = badgeVal(it.badge);
              return (
                <button
                  key={it.id}
                  className={`nav${view === it.id ? " active" : ""}`}
                  onClick={() => setView(it.id)}
                >
                  <span className="ico">{it.ico}</span>
                  {t(it.label)}
                  {val && <span className="n-badge">{val}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="side-foot">
          Vayu AI · demo build
          <br />
          Real data · CPCB · Sentinel-5P
          <br />
          EDGAR v8.1 · WorldPop · GPPD
        </div>
      </aside>

      {/* ---------------- main ---------------- */}
      <main className="main">
        {view === "overview" && <OverviewView />}
        {view === "map" && <MapView />}
        {view === "forecast" && <ForecastView />}
        {view === "interventions" && <InterventionsView />}
        {view === "alerts" && <AlertsView />}
        {view === "network" && <NetworkView />}
        {view === "reports" && <ReportsView />}
      </main>

      <Chatbot />
    </div>
  );
}
