"use client";

import { PAD } from "./SiteChrome";

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
    n: "01 — INGEST",
    title: "Fuse every signal",
    body: "CPCB station hours, Open-Meteo weather and CAMS, Sentinel-5P and MODIS columns, EDGAR emissions, WorldPop and OSM roads — harmonised onto one H3 grid and hourly clock.",
  },
  {
    n: "02 — PREDICT",
    title: "Model the plume",
    body: "Gradient-boosted models forecast PM2.5 at +24/48/72h from lagged observations, meteorology and CAMS; a no-lag spatial model covers cells with no sensor history.",
  },
  {
    n: "03 — INTERVENE",
    title: "Attribute & rank",
    body: "SHAP attribution plus an upwind wind-cone names the likely source, then wards are ranked by exceedance × population × vulnerability into an action list.",
  },
];

export function FeatureGrid() {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}
    >
      {FEATURES.map((f) => (
        <div key={f.title} className="card lift" style={{ padding: 24 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              display: "grid",
              placeItems: "center",
              fontSize: 20,
              marginBottom: 16,
            }}
          >
            {f.icon}
          </div>
          <h3 className="display" style={{ fontSize: 18, marginBottom: 8 }}>
            {f.title}
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{f.body}</p>
        </div>
      ))}
    </div>
  );
}

export function StepsPanel({ heading }: { heading?: string }) {
  return (
    <div
      className="card"
      style={{
        borderRadius: 24,
        padding: "clamp(26px,4vw,52px)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.5,
          background:
            "repeating-linear-gradient(90deg,transparent,transparent 22px,var(--line) 22px,var(--line) 23px)",
          maskImage: "linear-gradient(180deg,#000,transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>
        {heading && (
          <>
            <div
              className="figure"
              style={{ fontSize: 12, letterSpacing: ".18em", color: "var(--accent)", marginBottom: 12 }}
            >
              HOW THE MODEL WORKS
            </div>
            <h2
              className="display"
              style={{ fontSize: "clamp(24px,3.4vw,38px)", maxWidth: "20ch", marginBottom: 34 }}
            >
              {heading}
            </h2>
          </>
        )}
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 24 }}
        >
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="figure" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                {s.n}
              </div>
              <h3 className="display" style={{ fontSize: 20, margin: "10px 0 8px" }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{s.body}</p>
            </div>
          ))}
        </div>
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
        maxWidth: 1220,
        margin: "0 auto",
        padding: `${pt}px ${PAD} ${pb}px`,
      }}
    >
      {children}
    </section>
  );
}
