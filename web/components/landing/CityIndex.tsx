"use client";

import Link from "next/link";
import { useLive } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import { SectionHead } from "@/components/site/blocks";
import type { LiveCity } from "@/lib/types";

/** US AQI category -> the design's ramp. */

const SUBTITLE: Record<string, string> = {
  korba: "Coal & power belt",
  bhilai: "Steel corridor",
  raipur: "State capital",
  bilaspur: "Rail & commerce",
  jagdalpur: "No ground sensor",
};

export default function CityIndex() {
  const { t } = useT();
  const { data, isLoading, isError } = useLive();

  return (
    <section
      id="cities"
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        margin: "0 auto",
        padding: "44px clamp(16px,2.5vw,36px)",
      }}
    >
      <SectionHead
        eyebrow={t("LIVE CITY INDEX")}
        title={t("Live city index")}
        size="md"
        mb={12}
      />
      <p
        className="figure"
        style={{
          textAlign: "center",
          fontSize: 12,
          color: "var(--ink-3)",
          margin: "0 0 26px",
        }}
      >
        {isError
          ? t("live feed unavailable — showing nothing rather than stale numbers")
          : data?.[0]?.updated
            ? `Open-Meteo CAMS · US AQI · updated ${new Date(data[0].updated).toUTCString().slice(5, 22)} UTC`
            : t("loading…")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
        }}
      >
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card lift city-card-hover" style={{ padding: 20, height: 168, opacity: 0.5 }} />
          ))}

        {data?.map((c: LiveCity) => {
          // measured (24h CPCB mean) when stations exist, model only when they
          // do not — the same rule the map paints by
          const pm25 = c.measured_pm25_24h ?? c.current_pm25 ?? null;
          const aqi = cpcbAqiFromPm25(pm25);
          const measured = c.measured === true;
          const band = { c: cpcbPm25Css(pm25), label: cpcbPm25Label(pm25) };
          const zeroStation = !measured;
          return (
            <Link
              key={c.city_id}
              href={c.city_id === "jagdalpur" ? "/dashboard?city=jagdalpur" : "/dashboard"}
              className="card lift city-card-hover"
              style={{ display: "block", padding: 20, position: "relative", overflow: "hidden" }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: band.c,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div className="display" style={{ fontSize: 19 }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                    {t(SUBTITLE[c.city_id] ?? "")}
                  </div>
                </div>
                {zeroStation && (
                  <span
                    className="figure"
                    style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".08em" }}
                  >
                    {t("PREDICTED")}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 18 }}>
                <span
                  className="display"
                  style={{ fontWeight: 700, fontSize: 46, lineHeight: 1, color: band.c }}
                >
                  {aqi ?? "—"}
                </span>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>{t("AQI")}</span>
              </div>

              <div
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  padding: "4px 10px",
                  borderRadius: 100,
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: `color-mix(in oklch, ${band.c}, transparent 86%)`,
                  color: band.c,
                }}
              >
                {t(band.label)} · PM2.5 {pm25 ?? "—"} µg/m³
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
