"use client";

import { aqiCss } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";

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

  const feats = districts?.features ?? [];
  const cities = districts?.cities ?? [];
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  // simple grid of districts as "map cells" sorted roughly by name
  const cells = [...feats]
    .map((f) => f.properties)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

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
            {["Live Map", "Analytics", "AI Forecast", "Citizen advisory"].map((lab, i) => (
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

          {/* map canvas */}
          <div
            style={{
              position: "relative",
              background:
                "radial-gradient(ellipse at 30% 20%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 50%), var(--surface-2)",
              padding: 16,
              minHeight: 360,
            }}
          >
            <div
              className="figure"
              style={{
                position: "absolute",
                top: 12,
                left: 14,
                fontSize: 11,
                color: "var(--ink-3)",
                zIndex: 2,
              }}
            >
              ● LIVE · Chhattisgarh districts
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
                gap: 6,
                marginTop: 28,
                maxHeight: 300,
                overflow: "hidden",
              }}
            >
              {cells.map((p) => {
                const aqi = p.display_aqi ?? p.us_aqi ?? 0;
                return (
                  <div
                    key={p.name}
                    title={`${p.name}: AQI ${aqi}`}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 8,
                      background: aqiCss(aqi),
                      opacity: 0.88,
                      border: "1px solid color-mix(in oklab, #000 15%, transparent)",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        lineHeight: 1.1,
                        color: "#0b1220",
                        fontWeight: 600,
                        textShadow: "0 0 4px rgba(255,255,255,.5)",
                        overflow: "hidden",
                        maxHeight: 22,
                      }}
                    >
                      {(p.name || "").slice(0, 8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

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
