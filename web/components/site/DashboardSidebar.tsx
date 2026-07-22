"use client";

import { useState } from "react";
import Link from "next/link";

import { useDistricts } from "@/lib/districts";
import { aqiCss } from "@/lib/aqiScale";
import { useLive } from "@/lib/data";
import { useT } from "@/lib/i18n";

/**
 * Hero-side dashboard sidebar preview.
 *
 * Reproduces the exact Climate Saathi dashboard sidebar as a floating card
 * in the hero section. Items are grouped under MONITOR / ACT / SYSTEM with
 * icons, badges, and an active highlight. Clicking anywhere opens the real
 * dashboard.
 */

interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  badgeAccent?: boolean;
}

const ICON_MAP = (
  <>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
    </svg>
  </>
);

const ICON_ANALYTICS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const ICON_OVERVIEW = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </svg>
);

const ICON_FORECAST = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M21 7v5h-5" />
  </svg>
);

const ICON_INTERVENTIONS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.5" fill="currentColor" />
  </svg>
);

const ICON_ALERTS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const ICON_SENSOR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.48M7.76 16.24a6 6 0 0 1 0-8.48M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </svg>
);

const ICON_REPORTS = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
);

export default function DashboardSidebar() {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const [activeItem, setActiveItem] = useState("analytics");

  const stationCount = districts?.meta?.n_stations ?? 14;
  const alertCount = (districts?.features ?? []).filter(
    (f) => (f.properties.display_aqi ?? 0) > 150,
  ).length || 4;
  const interventionCount = (districts?.features ?? []).filter(
    (f) => (f.properties.display_aqi ?? 0) > 100,
  ).length || 6;

  const worstCity = live?.[0];
  const worstAqi = worstCity?.current_us_aqi ?? 0;

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: "MONITOR",
      items: [
        { id: "map", icon: ICON_MAP, label: t("Live Map") },
        { id: "analytics", icon: ICON_ANALYTICS, label: t("Analytics") },
        { id: "overview", icon: ICON_OVERVIEW, label: t("Overview") },
        { id: "forecast", icon: ICON_FORECAST, label: t("AI Forecast"), badge: "72h" },
      ],
    },
    {
      title: "ACT",
      items: [
        {
          id: "interventions",
          icon: ICON_INTERVENTIONS,
          label: t("Interventions"),
          badge: interventionCount,
        },
        {
          id: "alerts",
          icon: ICON_ALERTS,
          label: t("Alerts"),
          badge: alertCount,
          badgeAccent: true,
        },
      ],
    },
    {
      title: "SYSTEM",
      items: [
        { id: "network", icon: ICON_SENSOR, label: t("Sensor Network") },
        { id: "reports", icon: ICON_REPORTS, label: t("Reports & Export") },
      ],
    },
  ];

  return (
    <Link
      href="/dashboard"
      className="dash-sidebar"
      aria-label={t("Open Dashboard →")}
      style={{ animation: "vayuRise .8s .3s both" }}
    >
      {groups.map((g) => (
        <div key={g.title}>
          <div className="dash-sidebar-group">{g.title}</div>
          {g.items.map((item) => (
            <div
              key={item.id}
              className={`dash-sidebar-item${activeItem === item.id ? " active" : ""}`}
              onMouseEnter={() => setActiveItem(item.id)}
            >
              <span className="dash-sidebar-icon">{item.icon}</span>
              <span className="dash-sidebar-label">{item.label}</span>
              {item.badge != null && (
                <span
                  className={`dash-sidebar-badge${item.badgeAccent ? " accent" : ""}`}
                >
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* mini AQI bar */}
      {worstCity && (
        <div className="dash-sidebar-aqi">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: aqiCss(worstAqi),
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {worstCity.name}
          </span>
          <span className="figure" style={{ fontSize: 12, color: aqiCss(worstAqi), fontWeight: 600 }}>
            {worstAqi}
          </span>
        </div>
      )}

      <div className="dash-sidebar-foot">
        Vayu.AI · demo build
      </div>
    </Link>
  );
}
