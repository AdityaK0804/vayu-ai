"use client";

import { useMetrics } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";
import { SectionHead } from "./blocks";

/**
 * "How it works" as a left-to-right flow with connecting arrows.
 *
 * Copy describes THIS system: the sources we actually ingest, the models we
 * actually train (gradient-boosted per horizon + a no-lag spatial model), and
 * the dossiers we actually emit. The stat strip reads from metrics.json rather
 * than being typed in, so it cannot drift from the pipeline.
 */

const STEPS = [
  {
    n: "01",
    step: "STEP 01",
    tag: "Data Ingestion",
    icon: "🛰️",
    title: "Sensors & Satellite",
    body: "14 CPCB reference stations via OpenAQ, Open-Meteo weather and CAMS, Sentinel-5P NO₂/SO₂ and MODIS AOD, EDGAR v8.1 emissions, WorldPop and OSM roads — harmonised onto one H3 grid and hourly clock.",
    accent: "var(--accent)",
  },
  {
    n: "02",
    step: "STEP 02",
    tag: "ML Processing",
    icon: "🧠",
    title: "AI Risk Scoring",
    body: "Gradient-boosted models forecast PM2.5 at +24/48/72 h, while a no-lag spatial model scores districts with no sensor at all. SHAP splits every cell into industry, traffic, fire and dust.",
    accent: "#e11d48",
  },
  {
    n: "03",
    step: "STEP 03",
    tag: "Act & Enforce",
    icon: "🔔",
    title: "Alerts & Actions",
    body: "Wards are ranked by exceedance × population × vulnerability, each with the named upwind plant, schools and hospitals exposed, and a templated inspection order — in English or Hindi.",
    accent: "var(--accent-2)",
  },
];

function Arrow() {
  return (
    <div
      aria-hidden
      className="flow-arrow"
      style={{ display: "grid", placeItems: "center", flex: "0 0 auto", padding: "0 4px" }}
    >
      <svg width="34" height="16" viewBox="0 0 34 16" fill="none">
        <path
          d="M0 8h27"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.75"
        />
        <path
          d="M26 2.5 33 8l-7 5.5"
          stroke="var(--accent)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

export default function FlowSteps() {
  const { t } = useT();
  const { data: metrics } = useMetrics("korba");
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  const stats = [
    { v: "72h", k: "Forecast horizon" },
    { v: h24?.model_rmse != null ? `${h24.model_rmse}` : "—", k: "µg/m³ RMSE @24h" },
    {
      v: metrics?.zero_station_loso.rmse_satellite_subset != null
        ? `${metrics.zero_station_loso.rmse_satellite_subset}`
        : "—",
      k: "µg/m³ with no sensor",
    },
    { v: "2", k: "Languages" },
  ];

  return (
    <section
      id="how"
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        margin: "0 auto",
        padding: `56px ${PAD}`,
      }}
    >
      <SectionHead
        eyebrow={t("HOW THE MODEL WORKS")}
        title={t("From raw signal to clean-air action in three steps")}
        mb={34}
      />

      <div className="flow-row">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flow-item">
            <article className="card lift flow-card" style={{ padding: 22 }}>
              {/* ghost numeral */}
              <span
                aria-hidden
                className="display"
                style={{
                  position: "absolute",
                  top: -14,
                  right: 6,
                  fontSize: 108,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "var(--ink)",
                  opacity: 0.05,
                  pointerEvents: "none",
                }}
              >
                {s.n}
              </span>

              <header
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span
                  className="figure"
                  style={{
                    fontSize: 11,
                    letterSpacing: ".16em",
                    color: s.accent,
                    fontWeight: 600,
                  }}
                >
                  {t(s.step)}
                </span>
                <span className="figure" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                  {t(s.tag)}
                </span>
              </header>

              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 15,
                  margin: "18px 0 16px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  background: `color-mix(in oklch, ${s.accent}, transparent 88%)`,
                  border: `1px solid color-mix(in oklch, ${s.accent}, transparent 70%)`,
                }}
              >
                {s.icon}
              </div>

              <h3 className="display" style={{ fontSize: 19, marginBottom: 9 }}>
                {t(s.title)}
              </h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-2)" }}>{t(s.body)}</p>
            </article>

            {i < STEPS.length - 1 && <Arrow />}
          </div>
        ))}
      </div>

      {/* real figures, read from metrics.json */}
      <div className="flow-stats">
        {stats.map((s) => (
          <div key={s.k} style={{ textAlign: "center" }}>
            <div
              className="figure"
              style={{ fontSize: 22, fontWeight: 600, color: "var(--accent)" }}
            >
              {s.v}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>{t(s.k)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
