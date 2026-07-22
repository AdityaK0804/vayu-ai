"use client";

import Link from "next/link";
import { useState } from "react";

import { aqiCss } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";

/**
 * Hero-side dashboard preview, in a tilted browser frame.
 *
 * The frame renders the real command centre in miniature rather than a captured
 * screenshot. Two reasons: a PNG cannot expand its nav groups or fold to a rail,
 * and it silently goes stale the moment the dashboard changes — whereas the AQI
 * values, district count and RMSE below are the same live data the dashboard
 * itself reads. It also keeps ~210 KB of image off the landing page.
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
      { id: "alerts", ico: "◔", label: "Alerts" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { id: "network", ico: "◇", label: "Sensor Network" },
      { id: "reports", ico: "▤", label: "Reports & Export" },
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

  // the frame is a link; the controls inside it are not meant to navigate
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const feats = districts?.features ?? [];
  const cities = (districts?.cities ?? []).slice(0, 5);
  const overCount = feats.filter((f) => (f.properties.display_aqi ?? 0) > 100).length;
  const alertCount = feats.filter((f) => (f.properties.display_aqi ?? 0) > 150).length;
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  // every district as one thin column, sorted and coloured by its live AQI
  const strip = feats.map((f) => f.properties.display_aqi ?? 0).sort((a, b) => a - b);

  return (
    <div style={{ perspective: 1500, width: "100%", maxWidth: 750, margin: "0 auto" }}>
      <Link
        href="/dashboard"
        aria-label={t("Open Dashboard →")}
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
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = TILT_HOVER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = TILT_REST;
        }}
      >
        {/* ---------------- Safari bar ---------------- */}
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
            <span style={{ opacity: 0.6 }}>🔒</span> <span>vayu.ai/dashboard</span>
          </div>
        </div>

        {/* ---------------- live dashboard, in miniature ---------------- */}
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
                      onClick={(e) => {
                        stop(e);
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
                            className={`dash-win-item${active === it.id ? " active" : ""}`}
                            title={t(it.label)}
                            onMouseEnter={() => setActive(it.id)}
                            onClick={stop}
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
              className="dash-win-collapse"
              onClick={(e) => {
                stop(e);
                setRail((r) => !r);
              }}
              title={rail ? t("Expand sidebar") : t("Collapse sidebar")}
            >
              <span className="chev">«</span>
              <span className="lab">{t("Collapse sidebar")}</span>
            </button>
          </div>

          <div className="dash-win-main">
            <div className="dash-win-stats">
              {[
                {
                  k: t("Districts"),
                  v: String(districts?.meta?.n_districts ?? feats.length ?? 28),
                },
                {
                  k: t("Cells over standard"),
                  v: String(overCount),
                  c: overCount ? "var(--aqi-4)" : "var(--aqi-1)",
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

            {strip.length > 0 && (
              <div className="dash-win-strip" aria-hidden>
                {strip.map((a, i) => (
                  <i
                    key={i}
                    style={{ background: aqiCss(a), height: `${28 + Math.min(1, a / 120) * 72}%` }}
                  />
                ))}
              </div>
            )}

            <div className="dash-win-rows">
              {cities.map((c) => {
                const l = live?.find((x) => x.city_id === c.id);
                const aqi = l?.measured_us_aqi ?? c.us_aqi;
                return (
                  <div key={c.id} className="dash-win-row">
                    <span className="dot" style={{ background: aqiCss(aqi) }} />
                    <span className="nm">{c.name}</span>
                    <span className="figure v" style={{ color: aqiCss(aqi) }}>
                      {aqi}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
