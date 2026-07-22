"use client";

import { useState } from "react";

import { aqiCss } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";

/**
 * Hero-side dashboard PREVIEW (not a link).
 * Main pane defaults to Live Map colours from real district AQI.
 * Clicking the card does nothing — it is preview-only.
 */

const GROUPS: {
  title: string;
  items: { id: string; ico: string; label: string; badge?: string }[];
}[] = [
  {
    title: "MONITOR",
    items: [
      { id: "map", ico: "◍", label: "Live Map" },
      { id: "analytics", ico: "◑", label: "Analytics" },
      { id: "overview", ico: "◫", label: "Overview" },
      { id: "forecast", ico: "◈", label: "AI Forecast", badge: "72h" },
    ],
  },
  {
    title: "ACT",
    items: [
      { id: "interventions", ico: "◎", label: "Interventions" },
      { id: "advisories", ico: "♡", label: "Citizen advisory" },
      { id: "alerts", ico: "◔", label: "Alerts" },
    ],
  },
];

const TILT_REST = "rotateY(-12deg) rotateX(4deg) scale(0.95)";
const TILT_HOVER = "rotateY(-4deg) rotateX(2deg) scale(1.02)";

export default function DashboardPreview() {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");

  const [active, setActive] = useState("map");
  const [rail, setRail] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const feats = districts?.features ?? [];
  const cities = (districts?.cities ?? []).slice(0, 5);
  const overCount = feats.filter((f) => (f.properties.display_aqi ?? 0) > 100).length;
  const alertCount = feats.filter((f) => (f.properties.display_aqi ?? 0) > 150).length;
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  // map cells from real district AQI
  const mapCells = [...feats]
    .map((f) => f.properties)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, 48);

  return (
    <div
      style={{
        perspective: 1500,
        width: "100%",
        maxWidth: 750,
        // small nudge down so the frame sits level with the headline rather
        // than the LIVE badge above it
        margin: "clamp(8px, 2vw, 28px) auto 0",
      }}
    >
      <div
        role="img"
        aria-label={t("Dashboard preview — live map (not clickable)")}
        className="dash-preview-card"
        style={{
          display: "block",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          overflow: "hidden",
          boxShadow: "-20px 20px 60px rgba(0,0,0,0.5)",
          transformStyle: "preserve-3d",
          transform: TILT_REST,
          transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          cursor: "default",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = TILT_HOVER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = TILT_REST;
        }}
        onClick={(e) => {
          // preview only — never navigate
          e.preventDefault();
        }}
      >
        {/* Safari bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "12px 14px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
          <div
            style={{
              margin: "0 auto",
              padding: "4px 60px",
              background: "var(--surface)",
              borderRadius: 6,
              border: "1px solid var(--line)",
              fontSize: 10,
              color: "var(--ink-3)",
              fontFamily: "var(--font-mono)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ opacity: 0.6 }}>🔒</span> <span>vayu.ai/dashboard · Live Map</span>
          </div>
        </div>

        <div className={`dash-win-body${rail ? " rail" : ""}`}>
          <div className="dash-win-side">
            <div className="dash-win-brand">
              <span className="dash-win-logo">
                <span />
              </span>
              <span className="lab">
                <b>Vayu AI</b>
                <small>{t("COMMAND CENTER")}</small>
              </span>
            </div>

            <div className="dash-win-nav">
              {GROUPS.map((g) => {
                const isClosed = !!closed[g.title];
                return (
                  <div key={g.title}>
                    <button
                      className="dash-win-grp"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setClosed((c) => ({ ...c, [g.title]: !c[g.title] }));
                      }}
                    >
                      <span className="lab">{g.title}</span>
                      <span className={`caret${isClosed ? " closed" : ""}`}>⌄</span>
                    </button>
                    <div className={`dash-win-items${isClosed ? " closed" : ""}`}>
                      {g.items.map((it) => {
                        const badge =
                          it.badge ??
                          (it.id === "alerts" && alertCount
                            ? String(alertCount)
                            : it.id === "interventions" && overCount
                              ? String(overCount)
                              : undefined);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            className={`dash-win-item${active === it.id ? " active" : ""}`}
                            title={t(it.label)}
                            onMouseEnter={() => setActive(it.id)}
                            onClick={(e) => {
                              e.preventDefault();
                              setActive(it.id);
                            }}
                          >
                            <span className="ico">{it.ico}</span>
                            <span className="lab">{t(it.label)}</span>
                            {badge && <span className="badge lab">{badge}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="dash-win-collapse"
              onClick={(e) => {
                e.preventDefault();
                setRail((r) => !r);
              }}
              title={rail ? t("Expand sidebar") : t("Collapse sidebar")}
            >
              <span className="chev">«</span>
              <span className="lab">{t("Collapse sidebar")}</span>
            </button>
          </div>

          <div className="dash-win-main" style={{ display: "flex", flexDirection: "column" }}>
            <div className="dash-win-stats">
              {[
                {
                  k: t("Districts"),
                  v: String(districts?.meta?.n_districts ?? feats.length ?? 28),
                },
                {
                  k: t("Live Map"),
                  v: "ON",
                  c: "var(--aqi-1)",
                },
                {
                  k: t("µg/m³ RMSE @24h"),
                  v: h24?.model_rmse != null ? String(h24.model_rmse) : "—",
                },
              ].map((s) => (
                <div key={s.k} className="dash-win-stat">
                  <div className="figure v" style={{ color: s.c ?? "var(--accent)" }}>
                    {s.v}
                  </div>
                  <div className="k">{s.k}</div>
                </div>
              ))}
            </div>

            {/* LIVE MAP preview (not analytics) */}
            <div
              style={{
                flex: 1,
                margin: "8px 10px 6px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background:
                  "radial-gradient(ellipse at 40% 30%, color-mix(in oklab, var(--accent) 14%, transparent), var(--surface-2))",
                padding: 8,
                minHeight: 120,
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 3,
                alignContent: "start",
              }}
            >
              {mapCells.map((p, i) => {
                const aqi = p.display_aqi ?? p.us_aqi ?? 40;
                return (
                  <div
                    key={i}
                    title={`${p.name}: ${aqi}`}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 4,
                      background: aqiCss(aqi),
                      opacity: 0.9,
                    }}
                  />
                );
              })}
            </div>

            <div className="dash-win-rows" style={{ maxHeight: 110 }}>
              {cities.map((c) => {
                const l = live?.find((x) => x.city_id === c.id);
                const aqi = l?.measured_us_aqi ?? l?.current_us_aqi ?? c.us_aqi;
                return (
                  <div key={c.id} className="dash-win-row">
                    <span className="dot" style={{ background: aqiCss(aqi) }} />
                    <span className="nm">{c.name}</span>
                    <span className="figure v" style={{ color: aqiCss(aqi) }}>
                      {aqi != null ? Math.round(aqi) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
