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
import AnalyticsView from "@/components/dashboard/AnalyticsView";
import AdminLogin from "@/components/dashboard/AdminLogin";
import AdvisoriesView from "@/components/dashboard/AdvisoriesView";
import DashboardSideNav, { type NavGroup } from "@/components/dashboard/DashboardSideNav";
import Chatbot from "@/components/Chatbot";
import LangToggle from "@/components/LangToggle";
import { useT } from "@/lib/i18n";
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";
import { useLive, usePriority } from "@/lib/data";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { ViewId } from "@/lib/store";
import type { CityId } from "@/lib/types";

/**
 * `admin: true` marks a view as enforcement tooling — ranked dossiers, alert
 * triage, station health and compliance exports. Those name specific sites and
 * drive inspection orders, so they stay behind the admin sign-in; everything
 * else is public-interest information a citizen should simply be able to read.
 */
const NAV: {
  id: string;
  group: string;
  items: { id: ViewId; label: string; ico: string; badge?: "count" | "72h"; admin?: boolean }[];
}[] = [
  {
    id: "monitor",
    group: "MONITOR",
    items: [
      { id: "map", label: "Live Map", ico: "🗺️" },
      { id: "analytics", label: "Analytics", ico: "📊" },
      { id: "overview", label: "Overview", ico: "📚" },
      { id: "forecast", label: "AI Forecast", ico: "🎯", badge: "72h" },
    ],
  },
  {
    id: "act",
    group: "ACT",
    items: [
      { id: "advisories", label: "Citizen advisory", ico: "🆘" },
      // public for demo — same dossiers citizens can learn from; admin still
      // owns Alerts / Network / Reports
      { id: "interventions", label: "Interventions", ico: "👨‍⚕️", badge: "count" },
      { id: "alerts", label: "Alerts", ico: "◔", badge: "count", admin: true },
    ],
  },
  {
    id: "system",
    group: "SYSTEM",
    items: [
      { id: "network", label: "Sensor Network", ico: "◇", admin: true },
      { id: "reports", label: "Reports & Export", ico: "▤", admin: true },
    ],
  },
];

const ADMIN_VIEWS = new Set<ViewId>(
  NAV.flatMap((g) => g.items.filter((i) => i.admin).map((i) => i.id)),
);

export default function Dashboard() {
  const { city, setCity, view, setView, sideOpen, toggleSide, sideCollapsed, toggleCollapse } =
    useApp();
  const { t } = useT();
  const { role, account, openLogin, signOut } = useAuth();
  const isAdmin = role === "admin";
  // city selection now lives inside the Risk Map card (Live Map view)
  const { data: priority } = usePriority(city);
  const { data: live } = useLive();

  // deep link from the landing city cards: /dashboard?city=jagdalpur
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("city");
    if (p === "jagdalpur" || p === "korba") setCity(p as CityId);
  }, [setCity]);

  // signing out while on an enforcement view drops back to the map rather than
  // leaving the old screen rendered behind a stale role
  useEffect(() => {
    if (!isAdmin && ADMIN_VIEWS.has(view)) setView("map");
  }, [isAdmin, view, setView]);

  const badgeVal = (b?: "count" | "72h") =>
    b === "72h" ? "72h" : b === "count" ? String(priority?.dossiers.length ?? "") : undefined;

  const cityLive = live?.find((l) => l.city_id === city);

  return (
    <div className={`app${sideCollapsed ? " rail" : ""}`}>
      {/* ---------------- topbar ---------------- */}
      <header className="topbar">
        <button className="icon-btn md:hidden" onClick={toggleSide} aria-label="Menu">
          ☰
        </button>
        <Link href="/" className="brand" style={{ gap: 12 }}>
          <span style={{ display: "grid", placeItems: "center", position: "relative" }}>
            <svg width="34" height="34" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
              <path d="M 25 45 C 20 45 15 40 15 35 C 15 30 18 26 23 25 C 25 15 33 10 42 12 C 48 5 58 5 63 12 C 72 10 80 15 82 25 C 87 26 90 30 90 35 C 90 40 85 45 80 45 L 25 45 Z" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(96,165,250,0.8))" }}></path>
              <path d="M 25 45 L 80 45" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(96,165,250,0.8))" }}></path>
              <path d="M 12 35 L 35 35 L 43 45 L 53 15 L 63 45 L 70 35 L 92 35" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(74,222,128,0.8))" }}></path>
              <circle cx="53" cy="15" r="5" fill="#fbbf24" style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.8))" }}></circle>
            </svg>
          </span>
          <span>
            <b style={{ letterSpacing: ".08em" }}>Vayu.AI</b>
            <small>{t("COMMAND CENTER")}</small>
          </span>
        </Link>

        <div className="search hidden md:flex">
          <span>⌕</span>
          <input placeholder={t("Search wards, stations, sources…")} aria-label="Search" />
        </div>

        <div className="tb-right">
          <LangToggle compact />
          <AnimatedThemeToggler className="icon-btn" />
        </div>
      </header>

      {/* ---------------- sidebar ---------------- */}
      <aside className={`side${sideOpen ? " open" : ""}${sideCollapsed ? " rail" : ""}`}>
        <DashboardSideNav
          collapsed={sideCollapsed}
          view={view}
          onSelect={setView}
          groups={
            NAV.map((grp) => ({
              id: grp.id,
              group: grp.group,
              items: grp.items
                .filter((it) => !it.admin || isAdmin)
                .map((it) => ({
                  id: it.id,
                  label: it.label,
                  ico: it.ico,
                  badge: badgeVal(it.badge),
                  admin: it.admin,
                })),
            })).filter((g) => g.items.length > 0) as NavGroup[]
          }
        />

        {/* sign-in / out lives with the nav, not the topbar: it changes what
            the nav contains, so it belongs next to it */}
        {isAdmin ? (
          <button className="side-auth" onClick={signOut} title={t("Sign out")}>
            <span className="ico">◆</span>
            <span className="lab">
              <b>{account?.name}</b>
              <small>{account?.org}</small>
            </span>
          </button>
        ) : (
          <button className="side-auth" onClick={openLogin} title={t("Administrator sign-in")}>
            <span className="ico">⚿</span>
            <span className="lab">
              <b>{t("Administrator sign-in")}</b>
              <small>{t("for enforcement tools")}</small>
            </span>
          </button>
        )}

        <div className="side-foot">
          Vayu AI · demo build
          <br />
          Real data · CPCB · Sentinel-5P
          <br />
          EDGAR v8.1 · WorldPop · GPPD
        </div>
        <button
          className="side-collapse"
          onClick={toggleCollapse}
          title={sideCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
          aria-expanded={!sideCollapsed}
        >
          <span className="chev">«</span>
          <span className="lab">{t("Collapse sidebar")}</span>
        </button>
      </aside>

      {/* ---------------- main ---------------- */}
      <main className="main">
        {view === "map" && <MapView />}
        {view === "analytics" && <AnalyticsView />}
        {view === "overview" && <OverviewView />}
        {view === "forecast" && <ForecastView />}
        {view === "interventions" && <InterventionsView />}
        {view === "advisories" && <AdvisoriesView />}
        {view === "alerts" && isAdmin && <AlertsView />}
        {view === "network" && isAdmin && <NetworkView />}
        {view === "reports" && isAdmin && <ReportsView />}
      </main>

      <AdminLogin />
      <Chatbot />
    </div>
  );
}
