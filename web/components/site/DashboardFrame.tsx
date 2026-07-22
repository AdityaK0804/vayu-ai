"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { aqiCss } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => null,
});

/**
 * The dashboard's Live Map view, rendered as a preview.
 *
 * One component serves both places it appears — the compact card beside the
 * hero headline and the full-width band below it — so the two can never drift
 * apart. `compact` only changes scale and how much of the city list fits; the
 * chrome, nav and map are identical, because the whole point is that this is
 * what opens when you click through.
 *
 * The map is real (deck.gl) but never interactive here: a preview should look
 * live, not invite panning that goes nowhere.
 */

const NAV = [
  "Live Map",
  "Analytics",
  "Overview",
  "AI Forecast",
  "Interventions",
  "Citizen advisory",
  "Alerts",
];

/**
 * Mounts DistrictMap only once it scrolls into view. deck.gl + maplibre are
 * ~250 KB; eagerly importing them here would undo the landing-page bundle work.
 * A 300px root margin starts the download just before the section is reached.
 */
function LiveMapPanel({ minHeight }: { minHeight: number }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", minHeight, minWidth: 0, overflow: "hidden", background: "var(--surface-2)" }}>
      <div
        className="figure"
        style={{
          position: "absolute",
          top: 10,
          left: 12,
          zIndex: 2,
          fontSize: 10.5,
          color: "var(--ink-2)",
          padding: "3px 9px",
          borderRadius: 100,
          background: "color-mix(in oklch, var(--surface), transparent 12%)",
          border: "1px solid var(--line)",
          pointerEvents: "none",
        }}
      >
        <span className="live-dot" /> LIVE · {t("Chhattisgarh districts")}
      </div>

      {mounted ? (
        <DistrictMap
          selected={null}
          onSelect={() => {}}
          showCities={false}
          showCityLabels={false}
          openCityOnFocus={false}
          interactive={true}
          initialZoom={minHeight < 300 ? 2.8 : 5.8}
        />
      ) : (
        <div style={{ display: "grid", placeItems: "center", height: minHeight }}>
          <span className="sub">{t("Loading live map…")}</span>
        </div>
      )}
    </div>
  );
}

export default function DashboardFrame({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");

  const cities = districts?.cities ?? [];
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  const s = compact
    ? { dot: 8, chrome: "8px 11px", url: 9.5, pad: "10px 8px", nav: 10.5, lab: 8.5, map: 340, rows: 8, row: 10.5 }
    : { dot: 10, chrome: "10px 14px", url: 11, pad: "14px 12px", nav: 12.5, lab: 10, map: 380, rows: 9, row: 12.5 };

  const rows = (
    live ??
    cities.map((c) => ({
      city_id: c.id,
      name: c.name,
      current_us_aqi: c.us_aqi,
      measured_us_aqi: c.us_aqi,
    }))
  ).slice(0, s.rows);

  return (
    <div
      className="card"
      style={{
        borderRadius: compact ? 12 : 16,
        overflow: "hidden",
        border: "1px solid var(--line)",
        boxShadow: compact ? "-20px 20px 60px rgba(0,0,0,0.5)" : "0 24px 60px -28px rgba(0,0,0,.45)",
      }}
    >
      {/* browser chrome */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? 6 : 8,
          padding: s.chrome,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {["#ff5f56", "#ffbd2e", "#27c93f"].map((c) => (
          <span key={c} style={{ width: s.dot, height: s.dot, borderRadius: "50%", background: c }} />
        ))}
        <div
          className="figure"
          style={{
            margin: "0 auto",
            fontSize: s.url,
            color: "var(--ink-3)",
            padding: compact ? "3px 22px" : "4px 48px",
            borderRadius: 6,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            whiteSpace: "nowrap",
          }}
        >
          vayu.ai/dashboard · {t("Live Map")}
        </div>
      </div>

      <div className={`platform-live-grid${compact ? " compact" : ""}`}>
        {/* side nav */}
        <aside
          style={{
            borderRight: "1px solid var(--line)",
            padding: s.pad,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div className="lab" style={{ fontSize: s.lab, letterSpacing: ".14em", marginBottom: 8 }}>
            MONITOR
          </div>
          {NAV.map((lab, i) => (
            <div
              key={lab}
              style={{
                padding: compact ? "5px 8px" : "8px 10px",
                borderRadius: 8,
                fontSize: s.nav,
                marginBottom: compact ? 2 : 4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                background: i === 0 ? "var(--surface-2)" : "transparent",
                color: i === 0 ? "var(--accent)" : "var(--ink-2)",
                border: i === 0 ? "1px solid var(--line)" : "1px solid transparent",
              }}
            >
              {t(lab)}
            </div>
          ))}

          {!compact && (
            <>
              <div className="lab" style={{ fontSize: s.lab, letterSpacing: ".14em", margin: "16px 0 8px" }}>
                PROOF
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, padding: "0 4px" }}>
                RMSE @24h{" "}
                <b className="figure" style={{ color: "var(--accent)" }}>
                  {h24?.model_rmse ?? "—"}
                </b>
                <br />
                vs persist{" "}
                <b className="figure">
                  {h24?.vs_persistence_pct != null ? `+${h24.vs_persistence_pct}%` : "—"}
                </b>
              </div>
            </>
          )}
        </aside>

        <LiveMapPanel minHeight={s.map} />

        {/* city list */}
        <aside
          style={{
            borderLeft: "1px solid var(--line)",
            padding: compact ? "9px 9px 12px" : "12px 12px 16px",
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <div className="lab" style={{ display: "flex", justifyContent: "space-between", fontSize: s.lab, letterSpacing: ".14em", marginBottom: 8 }}>
            <span>{t("Cities")}</span>
            <span style={{ paddingRight: 4 }}>{t("AQI")}</span>
          </div>
          {rows.map((c: any) => {
            const aqi = c.measured_us_aqi ?? c.current_us_aqi ?? c.us_aqi ?? null;
            return (
              <div
                key={c.city_id || c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: compact ? "5px 4px" : "8px 6px",
                  borderBottom: "1px solid var(--line)",
                  fontSize: s.row,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: aqiCss(aqi),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.name || c.city_id}
                </span>
                <span className="figure" style={{ color: aqiCss(aqi), fontWeight: 600 }}>
                  {aqi != null ? Math.round(aqi) : "—"}
                </span>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
