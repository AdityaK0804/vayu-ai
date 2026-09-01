"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";

import ShinyLink from "@/components/magicui/shiny-link";

import CityIndex from "@/components/landing/CityIndex";
import HeroAqiSearch from "@/components/landing/HeroAqiSearch";
import SiteShell, { PAD } from "@/components/site/SiteChrome";
import { FeatureGrid, Section, SectionHead } from "@/components/site/blocks";
import DashboardPreview from "@/components/site/DashboardPreview";
import { TypingAnimation } from "@/components/ui/typing-animation";
import { useMetrics } from "@/lib/data";
import { useT } from "@/lib/i18n";

/* lazy-load below-the-fold sections for faster initial paint */
const PlatformLivePreview = dynamic(() => import("@/components/site/PlatformLivePreview"), {
  ssr: false,
});
const FlowSteps = dynamic(() => import("@/components/site/FlowSteps"), { ssr: false });
const AlertPreview = dynamic(() => import("@/components/site/AlertPreview"), { ssr: false });
const TeamSection = dynamic(() => import("@/components/site/TeamSection"), { ssr: false });

/* ---------------------------------------------------------------------------
   VAYU landing — ported from the design's index.dc.html.
   Layout, type scale, colour and motion follow the design. The NUMBERS do not:
   the design ships placeholders ("41 sensors", "94.2% accuracy", AQI 312) and
   its own footer says "data simulated for prototype". Everything numeric here
   reads from the real pipeline instead.
--------------------------------------------------------------------------- */

export default function Landing() {
  const { t } = useT();
  const { data: metrics } = useMetrics("korba");
  const h24 = metrics?.forecast_vs_baselines.find((h) => h.horizon_h === 24);

  // Scroll to top and reset hash on page load
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  }, []);

  const stats = [
    { v: "72h", k: t("forecast horizon") },
    { v: h24?.model_rmse != null ? `${h24.model_rmse}` : "—", k: t("µg/m³ RMSE @24h") },
    {
      v:
        metrics?.zero_station_loso.rmse_satellite_subset != null
          ? `${metrics.zero_station_loso.rmse_satellite_subset}`
          : "—",
      k: t("µg/m³ zero-station"),
    },
    { v: String(metrics?.dataset.stations ?? "—"), k: t("ground stations") },
  ];

  return (
    <SiteShell>
      {/* ---------------- hero (2-column: text left, sidebar right) ---------------- */}
      <header
        id="top"
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1400,
          margin: "0 auto",
          padding: `clamp(115px,10vw,140px) ${PAD} 40px`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "clamp(24px, 4vw, 56px)",
          alignItems: "start",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "5%",
            left: "10%",
            width: 450,
            height: 450,
            background: "radial-gradient(circle, color-mix(in oklch, var(--accent), transparent 82%) 0%, transparent 70%)",
            filter: "blur(60px)",
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
        {/* ---------- left: hero text ---------- */}
        <div style={{ minWidth: 0 }}>
          <div
            className="figure"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 14px",
              borderRadius: 100,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              fontSize: 12,
              color: "var(--ink-2)",
              animation: "vayuRise .6s both",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--aqi-1)",
                animation: "vayuPulse 1.8s infinite",
              }}
            />
            LIVE · {metrics?.dataset.stations ?? "—"} stations · 9 cities · Chhattisgarh
          </div>

          <h1
            className="display"
            style={{
              fontWeight: 700,
              fontSize: "clamp(38px,6.6vw,80px)",
              lineHeight: 1.02,
              margin: "22px 0 0",
              maxWidth: "15ch",
              animation: "vayuRise .7s .05s both",
            }}
          >
            {t("No sensors")}
            <br />
            {t("No problem")}
            <br />
            <TypingAnimation
              as="span"
              duration={70}
              delay={900}
              startOnView={false}
              style={{
                display: "inline-block",
                fontSize: "inherit",
                fontWeight: "inherit",
                letterSpacing: "inherit",
                lineHeight: "inherit",
                background: "linear-gradient(120deg,var(--accent),var(--accent-2))",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {t("AI fix the gaps")}
            </TypingAnimation>
          </h1>

          <p
            style={{
              fontSize: "clamp(16px,1.9vw,20px)",
              lineHeight: 1.6,
              color: "var(--ink-2)",
              maxWidth: "56ch",
              margin: "26px 0 0",
              animation: "vayuRise .7s .12s both",
            }}
          >
            {t(
              "VAYU fuses satellite, ground, and emissions data to forecast PM2.5 72 hours out. It pinpoints pollution sources and prioritizes enforcement across the state-even in districts without physical sensors.",
            )}
          </p>

          {/* Instant Search & Live AQI Inspector */}
          <div style={{ marginTop: 32, animation: "vayuRise .7s .15s both" }}>
            <HeroAqiSearch />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              marginTop: 24,
              animation: "vayuRise .7s .18s both",
            }}
          >
            <ShinyLink
              href="/map"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "14px 24px",
                borderRadius: 12,
                background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
                color: "#fff",
                fontWeight: 700,
                fontSize: 15,
                boxShadow: "0 14px 34px -12px var(--accent)",
              }}
            >
              🗺️ {t("Open Live Chhattisgarh Map →")}
            </ShinyLink>
            <ShinyLink
              href="/dashboard"
              className="card"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "14px 24px",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              📊 {t("Regulator Dashboard")}
            </ShinyLink>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 28,
              marginTop: 52,
              paddingTop: 30,
              borderTop: "1px solid var(--line)",
              animation: "vayuRise .7s .24s both",
            }}
          >
            {stats.map((s) => (
              <div key={s.k}>
                <div className="display" style={{ fontWeight: 700, fontSize: 30 }}>
                  {s.v}
                </div>
                <div className="figure" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                  {s.k}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- right: dashboard preview (NOT a link) ---------- */}
        <DashboardPreview />
      </header>

      {/* full-width live map platform preview (Climate Saathi style) */}
      <div style={{ marginTop: 80, marginBottom: 80 }}>
        <PlatformLivePreview />
      </div>

      <div style={{ marginTop: 80, marginBottom: 80 }}>
        <CityIndex />
      </div>

      {/* ---------------- platform ---------------- */}
      <Section id="features" pt={100} pb={100}>
        <SectionHead
          eyebrow={t("THE PLATFORM")}
          title={t("One control room for the air a region breathes")}
          mb={34}
        />
        <FeatureGrid />
      </Section>

      {/* ---------------- how it works ---------------- */}
      <div style={{ marginTop: 100, marginBottom: 100 }}>
        <FlowSteps />
      </div>

      {/* ---------------- multilingual alerts ---------------- */}
      <div style={{ marginTop: 100, marginBottom: 100 }}>
        <AlertPreview />
      </div>

      {/* ---------------- team: NexGen ---------------- */}
      <div style={{ marginTop: 100, marginBottom: 100 }}>
        <TeamSection />
      </div>

      {/* ---------------- CTA ---------------- */}
      <Section pt={20} pb={70}>
        <div
          style={{
            background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
            borderRadius: 24,
            padding: "clamp(30px,5vw,60px)",
            color: "#fff",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.18,
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          <div style={{ position: "relative" }}>
            <h2
              className="display"
              style={{
                fontWeight: 700,
                fontSize: "clamp(26px,4vw,44px)",
                maxWidth: "20ch",
                margin: "0 auto 14px",
              }}
            >
              {t("Ready to clear the air over your city?")}
            </h2>
            <p
              style={{
                fontSize: "clamp(15px,1.8vw,18px)",
                opacity: 0.92,
                maxWidth: "52ch",
                margin: "0 auto 28px",
              }}
            >
              {t("Step into the live command center — no login needed for the demo.")}
            </p>
            <ShinyLink
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "15px 30px",
                borderRadius: 12,
                background: "#fff",
                color: "#0f1c1a",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {t("Open the dashboard →")}
            </ShinyLink>
          </div>
        </div>
      </Section>
    </SiteShell>
  );
}
