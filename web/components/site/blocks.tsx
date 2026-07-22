"use client";

import { PAD } from "./SiteChrome";
import { useT } from "@/lib/i18n";

export const FEATURES = [
  {
    icon: "🗺️",
    title: "Live PM2.5 surface",
    body: "An H3 hex grid rendered over real geography — 8,360 cells for Korba alone — with ground stations, ranked wards and a 72-hour scrubber.",
  },
  {
    icon: "📊",
    title: "Measured, not claimed",
    body: "Every number is benchmarked against persistence and bias-corrected CAMS on a time-ordered split. The proof panel ships with the app.",
  },
  {
    icon: "🧠",
    title: "72-hour forecasting",
    body: "A gradient-boosted spatio-temporal model (one regressor per horizon) trained on 285,522 station-hours across 14 stations.",
  },
  {
    icon: "🎯",
    title: "Source attribution",
    body: "SHAP over source features splits each cell into industry / traffic / fire / dust, cross-checked against the EDGAR emissions inventory.",
  },
  {
    icon: "🛰️",
    title: "Zero-station prediction",
    body: "Leave-one-station-out validation proves a never-seen location can be predicted from satellite, weather and emissions geography alone.",
  },
  {
    icon: "📄",
    title: "Enforcement dossiers",
    body: "Ranked wards with population and school/hospital exposure, the named upwind plant, and a templated inspection action — in seconds.",
  },
];

export const STEPS = [
  {
    n: "01",
    tag: "STEP 01",
    label: "Data Ingestion",
    icon: "📡",
    title: "Sensors & Satellite",
    body: "CPCB station hours, Open-Meteo weather and CAMS, Sentinel-5P and MODIS columns, EDGAR emissions, WorldPop and OSM roads — harmonised onto one H3 grid and hourly clock.",
  },
  {
    n: "02",
    tag: "STEP 02",
    label: "AI Processing",
    icon: "🧠",
    title: "AI Risk Scoring",
    body: "Gradient-boosted models forecast PM2.5 at +24/48/72h from lagged observations, meteorology and CAMS; a no-lag spatial model covers cells with no sensor history.",
  },
  {
    n: "03",
    tag: "STEP 03",
    label: "Multi-channel",
    icon: "🔔",
    title: "Alerts & Actions",
    body: "SHAP attribution plus an upwind wind-cone names the likely source, then wards are ranked by exceedance × population × vulnerability into an action list.",
  },
];

export function FeatureGrid() {
  const { t } = useT();
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20 }}
    >
      {FEATURES.map((f) => (
        <div key={f.title} className="card lift" style={{ padding: 24, borderRadius: 18 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "color-mix(in oklch, var(--accent), transparent 90%)",
              border: "1px solid color-mix(in oklch, var(--accent), transparent 75%)",
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              marginBottom: 16,
            }}
          >
            {f.icon}
          </div>
          <h3 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {t(f.title)}
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{t(f.body)}</p>
        </div>
      ))}
    </div>
  );
}

export function StepsPanel({ heading }: { heading?: string }) {
  const { t } = useT();
  return (
    <div style={{ position: "relative" }}>
      {heading && (
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div
            className="figure"
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".2em",
              color: "var(--accent)",
              marginBottom: 10,
              textTransform: "uppercase",
            }}
          >
            HOW IT WORKS
          </div>
          <h2
            className="display"
            style={{
              fontSize: "clamp(28px,4vw,44px)",
              fontWeight: 700,
              maxWidth: "24ch",
              margin: "0 auto",
              lineHeight: 1.1,
            }}
          >
            {heading}
          </h2>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
          gap: 22,
        }}
      >
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="card lift"
            style={{
              padding: "26px 26px 30px",
              borderRadius: 20,
              position: "relative",
              overflow: "hidden",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                right: 18,
                top: 8,
                fontSize: 72,
                fontWeight: 800,
                opacity: 0.05,
                fontFamily: "var(--font-display, sans-serif)",
                pointerEvents: "none",
                userSelect: "none",
              }}
            >
              {s.n}
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <span
                  className="figure"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".12em",
                    color: "var(--accent)",
                    textTransform: "uppercase",
                  }}
                >
                  {s.tag}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", opacity: 0.85 }}>
                  {s.label}
                </span>
              </div>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 14,
                  background: "color-mix(in oklch, var(--accent), transparent 90%)",
                  border: "1px solid color-mix(in oklch, var(--accent), transparent 75%)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  marginBottom: 20,
                }}
              >
                {s.icon}
              </div>
              <h3 className="display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>
                {t(s.title)}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{t(s.body)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Section({
  id,
  children,
  pt = 20,
  pb = 40,
}: {
  id?: string;
  children: React.ReactNode;
  pt?: number;
  pb?: number;
}) {
  return (
    <section
      id={id}
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        margin: "0 auto",
        padding: `${pt}px ${PAD} ${pb}px`,
      }}
    >
      {children}
    </section>
  );
}

/**
 * Centred section header.
 *
 * Every landing section is its own band, so they should announce themselves
 * the same way. This is the arrangement the bilingual-alerts section already
 * used — accent eyebrow, display heading, optional lede capped at 62ch and
 * centred — lifted out so the other sections stop each inventing their own
 * left-aligned variant.
 */
export function SectionHead({
  eyebrow,
  title,
  lede,
  size = "lg",
  mb = 40,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  /** "lg" for top-level bands, "md" where the heading sits above dense content */
  size?: "lg" | "md";
  mb?: number;
}) {
  return (
    <div style={{ textAlign: "center", marginBottom: mb }}>
      {eyebrow && (
        <div
          className="figure"
          style={{
            fontSize: 12,
            letterSpacing: ".18em",
            color: "var(--accent)",
            marginBottom: 12,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        className="display"
        style={{
          fontSize: size === "lg" ? "clamp(28px,4.4vw,48px)" : "clamp(24px,3.4vw,38px)",
          lineHeight: 1.08,
          marginBottom: lede ? 14 : 0,
        }}
      >
        {title}
      </h2>
      {lede && (
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: "var(--ink-2)",
            maxWidth: "62ch",
            margin: "0 auto",
          }}
        >
          {lede}
        </p>
      )}
    </div>
  );
}
