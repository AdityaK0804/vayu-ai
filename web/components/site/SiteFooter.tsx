"use client";

import Link from "next/link";

import { useMetrics } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";

/**
 * Site footer.
 *
 * The data-source column is the part that matters: this project's whole claim
 * is that its numbers are measured rather than asserted, so the sources are
 * named in full — with the live station count read from the metrics file, not
 * typed in. The source design's footer said "data simulated for prototype";
 * this one says the opposite, and means it.
 */
export default function SiteFooter() {
  const { t } = useT();
  const { data: metrics } = useMetrics("korba");
  const year = new Date().getFullYear();

  const columns: { title: string; items: { label: string; href?: string }[] }[] = [
    {
      title: t("Platform"),
      items: [
        { label: t("Live Map"), href: "/dashboard" },
        { label: t("Analytics"), href: "/dashboard" },
        { label: t("AI Forecast"), href: "/dashboard" },
        { label: t("Citizen advisory"), href: "/dashboard" },
      ],
    },
    {
      title: t("Explore"),
      items: [
        { label: t("Live Cities"), href: "/live-cities" },
        { label: t("Platform"), href: "/platform" },
        { label: t("How AI Works"), href: "/how-ai-works" },
      ],
    },
    {
      title: t("Data sources"),
      items: [
        { label: "CPCB · OpenAQ v3" },
        { label: "Open-Meteo · CAMS" },
        { label: "Sentinel-5P · MODIS" },
        { label: "EDGAR v8.1 · WorldPop" },
        { label: "GPPD · geoBoundaries" },
      ],
    },
  ];

  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        background: "var(--surface)",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: `48px ${PAD} 28px` }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: 34,
            alignItems: "start",
          }}
        >
          {/* brand */}
          <div style={{ minWidth: 0 }}>
            <Link
              href="/"
              style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 12 }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  flex: "none",
                }}
              >
                <svg width="30" height="30" viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 25 45 C 20 45 15 40 15 35 C 15 30 18 26 23 25 C 25 15 33 10 42 12 C 48 5 58 5 63 12 C 72 10 80 15 82 25 C 87 26 90 30 90 35 C 90 40 85 45 80 45 L 25 45 Z" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(96,165,250,0.8))" }}></path>
                  <path d="M 25 45 L 80 45" fill="none" stroke="#60a5fa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(96,165,250,0.8))" }}></path>
                  <path d="M 12 35 L 35 35 L 43 45 L 53 15 L 63 45 L 70 35 L 92 35" fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(74,222,128,0.8))" }}></path>
                  <circle cx="53" cy="15" r="5" fill="#fbbf24" style={{ filter: "drop-shadow(0 0 4px rgba(251,191,36,0.8))" }}></circle>
                </svg>
              </span>
              <span
                className="display"
                style={{ fontWeight: 700, fontSize: 17, letterSpacing: ".1em" }}
              >
                Vayu.AI
              </span>
            </Link>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: "34ch" }}>
              {t(
                "Forecast, attribute and act on urban air quality across Chhattisgarh — including cities with no ground sensors.",
              )}
            </p>
            <div
              className="figure"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 14,
                padding: "5px 11px",
                borderRadius: 100,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 11,
                color: "var(--ink-2)",
              }}
            >
              <span className="live-dot" />
              {metrics?.dataset.stations ?? "—"} {t("ground stations")} · {t("live")}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title} style={{ minWidth: 0 }}>
              <div
                className="figure"
                style={{
                  fontSize: 10.5,
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: "var(--ink-3)",
                  marginBottom: 13,
                }}
              >
                {col.title}
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
                {col.items.map((it) => (
                  <li key={it.label} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    {it.href ? (
                      <Link href={it.href} className="footer-link">
                        {it.label}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--ink-2)" }}>{it.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11.5,
            color: "var(--ink-3)",
          }}
        >
          <span>© {year} Vayu.AI · Chhattisgarh</span>
          <span className="figure" style={{ textAlign: "right" }}>
            {t("Every figure on this site is measured from the pipeline — nothing is simulated.")}
          </span>
        </div>
      </div>
    </footer>
  );
}
