"use client";

import Link from "next/link";

import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";

const PILLARS = [
  {
    ico: "🛰️",
    title: "Sensor-sparse first",
    body: "Forecasts and risk maps that still work where CPCB stations do not — satellite, meteorology and emissions geography fill the gaps.",
  },
  {
    ico: "⚖️",
    title: "CPCB-aligned",
    body: "India-facing AQI categories and PM2.5 breakpoints on the map and in alerts — so officers and citizens read the same language.",
  },
  {
    ico: "🎯",
    title: "Actionable, not just pretty",
    body: "Source attribution, ranked wards and bilingual channels turn a forecast into something an inspector or resident can act on.",
  },
];

/**
 * Landing “team” block — NexGen only (no individual names).
 * Sits after bilingual alerts; product story, not a people grid.
 */
export default function TeamSection() {
  const { t } = useT();

  return (
    <section
      id="team"
      className="nexgen-team"
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        margin: "0 auto",
        padding: `56px ${PAD}`,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          className="section-eyebrow"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(13px, 1.35vw, 15px)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--eyebrow)",
            marginBottom: 14,
          }}
        >
          {t("THE TEAM")}
        </div>
        <h2
          className="display"
          style={{ fontSize: "clamp(28px,4.4vw,48px)", lineHeight: 1.08, marginBottom: 14 }}
        >
          {t("Built by NexGen")}
        </h2>
        <p
          style={{
            fontSize: "clamp(14px,1.7vw,17px)",
            lineHeight: 1.6,
            color: "var(--ink-2)",
            maxWidth: "58ch",
            margin: "0 auto",
          }}
        >
          {t(
            "NexGen ships Vayu — a multi-agent air-quality command layer for Chhattisgarh: live surfaces, 72h forecasts, and alerts that reach people in their language.",
          )}
        </p>
      </div>

      <div className="card nexgen-team-card">
        <div className="nexgen-team-brand">
          <div>
            <div
              className="figure"
              style={{ fontSize: 11, letterSpacing: ".16em", color: "var(--accent)", marginBottom: 10 }}
            >
              NEXGEN
            </div>
            <div
              className="display"
              style={{ fontSize: "clamp(28px,3.2vw,36px)", fontWeight: 700, letterSpacing: "-0.02em" }}
            >
              NexGen
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 14.5, lineHeight: 1.55, color: "var(--ink-2)" }}>
              {t("Product · research · ops for cleaner air in sensor-sparse India.")}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Vayu.AI", "Chhattisgarh", "CPCB · CAMS · S5P", "Open demo"].map((tag) => (
              <span
                key={tag}
                className="figure"
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  color: "var(--ink-2)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="nexgen-team-pillars">
          {PILLARS.map((p) => (
            <div key={p.title} className="nexgen-team-row">
              <div className="nexgen-team-ico">{p.ico}</div>
              <div>
                <div style={{ fontWeight: 650, fontSize: 15, marginBottom: 4 }}>{t(p.title)}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{t(p.body)}</div>
              </div>
            </div>
          ))}
          <div style={{ paddingTop: 4 }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 600,
                fontSize: 14,
                color: "var(--accent)",
              }}
            >
              {t("Open the live command center →")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
