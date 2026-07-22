"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { aqiCss } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => null,
});

/**
 * The real deck.gl district map, mounted only once this section scrolls into
 * view.
 *
 * It has to be the real map — a grid of coloured squares is not "how it opens
 * when you click Dashboard", which is the whole claim this section makes. But
 * DistrictMap drags in deck.gl + maplibre (~250 KB), and eagerly importing it
 * here would undo the landing-page bundle work. An IntersectionObserver with a
 * 300px margin means the chunk starts downloading just before the section is
 * reached, so first paint stays cheap and the map is ready by the time it is
 * actually on screen.
 */
function LiveMapPanel() {
  const { t } = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // no IntersectionObserver (very old browser) -> just show it
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
    <div ref={ref} style={{ position: "relative", minHeight: 380, background: "var(--surface-2)" }}>
      <div
        className="figure"
        style={{
          position: "absolute",
          top: 12,
          left: 14,
          zIndex: 2,
          fontSize: 11,
          color: "var(--ink-2)",
          padding: "4px 10px",
          borderRadius: 100,
          background: "color-mix(in oklch, var(--surface), transparent 12%)",
          border: "1px solid var(--line)",
          pointerEvents: "none",
        }}
      >
        <span className="live-dot" /> LIVE · {t("Chhattisgarh districts")}
      </div>

      {mounted ? (
        <DistrictMap selected={null} onSelect={() => {}} showCities openCityOnFocus={false} />
      ) : (
        <div style={{ display: "grid", placeItems: "center", height: 380 }}>
          <span className="sub">{t("Loading live map…")}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Full-width platform preview BELOW the hero (Climate Saathi style).
 * Shows a live-map style canvas using real district AQI colours — not Analytics.
 * Not a navigation link; pure preview.
 */
export default function PlatformLivePreview() {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");

  const cities = districts?.cities ?? [];
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  return (
    <section
      aria-label={t("Live platform preview")}
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: `8px ${PAD} 56px`,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ maxWidth: "52ch", marginBottom: 18 }}>
        <div
          className="figure"
          style={{ fontSize: 12, letterSpacing: ".18em", color: "var(--accent)", marginBottom: 8 }}
        >
          {t("LIVE PLATFORM PREVIEW")}
        </div>
        <h2 className="display" style={{ fontSize: "clamp(22px,3vw,34px)", lineHeight: 1.1, margin: 0 }}>
          {t("The command centre — live map, not a static mock")}
        </h2>
        <p style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>
          {t(
            "This is a preview only. District colours and city AQI come from the same live feed the dashboard reads. Click Launch to open the full platform.",
          )}
        </p>
      </div>

      <div
        className="card"
        style={{
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 60px -28px rgba(0,0,0,.45)",
        }}
      >
        {/* browser chrome */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
          <div
            className="figure"
            style={{
              margin: "0 auto",
              fontSize: 11,
              color: "var(--ink-3)",
              padding: "4px 48px",
              borderRadius: 6,
              border: "1px solid var(--line)",
              background: "var(--surface)",
            }}
          >
            vayu.ai/dashboard · {t("Live Map")}
          </div>
        </div>

        <div className="platform-live-grid">
          {/* side nav mock */}
          <aside
            style={{
              borderRight: "1px solid var(--line)",
              padding: "14px 12px",
              background: "var(--surface)",
            }}
          >
            <div className="lab" style={{ fontSize: 10, letterSpacing: ".14em", marginBottom: 10 }}>
              MONITOR
            </div>
            {["Live Map", "Analytics", "Overview", "AI Forecast", "Interventions", "Citizen advisory", "Alerts"].map((lab, i) => (
              <div
                key={lab}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 12.5,
                  marginBottom: 4,
                  background: i === 0 ? "var(--surface-2)" : "transparent",
                  color: i === 0 ? "var(--accent)" : "var(--ink-2)",
                  border: i === 0 ? "1px solid var(--line)" : "1px solid transparent",
                }}
              >
                {t(lab)}
              </div>
            ))}
            <div
              className="lab"
              style={{ fontSize: 10, letterSpacing: ".14em", margin: "16px 0 8px" }}
            >
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
          </aside>

          {/* map canvas — the real deck.gl map, not a mock */}
          <LiveMapPanel />

          {/* city list */}
          <aside
            style={{
              borderLeft: "1px solid var(--line)",
              padding: "12px 12px 16px",
              background: "var(--surface)",
              overflow: "auto",
            }}
          >
            <div className="lab" style={{ fontSize: 10, letterSpacing: ".14em", marginBottom: 10 }}>
              {t("Cities")}
            </div>
            {(live ?? cities.map((c) => ({
              city_id: c.id,
              name: c.name,
              current_us_aqi: c.us_aqi,
              measured_us_aqi: c.us_aqi,
            }))).slice(0, 9).map((c: any) => {
              const aqi = c.measured_us_aqi ?? c.current_us_aqi ?? c.us_aqi ?? null;
              return (
                <div
                  key={c.city_id || c.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 6px",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 12.5,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: aqiCss(aqi),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{c.name || c.city_id}</span>
                  <span className="figure" style={{ color: aqiCss(aqi), fontWeight: 600 }}>
                    {aqi != null ? Math.round(aqi) : "—"}
                  </span>
                </div>
              );
            })}
            <p className="sub" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.4 }}>
              {t("Preview only — does not open the dashboard.")}
            </p>
          </aside>
        </div>
      </div>

    </section>
  );
}
