"use client";

import Link from "next/link";

import { useDistricts } from "@/components/DistrictMap";
import { aqiCss, aqiLabel } from "@/lib/aqiScale";
import { useLive, useMetrics } from "@/lib/data";
import { useT } from "@/lib/i18n";

/**
 * Hero-side dashboard preview.
 *
 * A live miniature of the real command centre rather than a screenshot — the
 * city rows, AQI values and alert count are the same data the dashboard shows,
 * so it can never go stale. The whole card links through.
 */
export default function DashboardPreview() {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");

  const cities = (districts?.cities ?? []).slice(0, 5);
  const overCount = (districts?.features ?? []).filter(
    (f) => (f.properties.display_aqi ?? 0) > 100,
  ).length;
  const h24 = metrics?.forecast_vs_baselines.find((x) => x.horizon_h === 24);

  return (
    <Link href="/dashboard" className="card lift dash-preview" aria-label={t("Open Dashboard →")}>
      {/* faux topbar */}
      <div className="dash-preview-bar">
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
            display: "grid",
            placeItems: "center",
            flex: "none",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />
        </span>
        <b style={{ fontFamily: "var(--font-display)", fontSize: 12.5, letterSpacing: ".06em" }}>
          Vayu AI
        </b>
        <span className="crumb" style={{ fontSize: 9 }}>
          {t("COMMAND CENTER")}
        </span>
        <span
          className="pill"
          style={{
            marginLeft: "auto",
            fontSize: 9.5,
            background: "var(--surface-2)",
            color: "var(--ink-2)",
          }}
        >
          <span className="live-dot" /> {t("live")}
        </span>
      </div>

      <div className="dash-preview-body">
        {/* left: city rows */}
        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
          {cities.map((c) => {
            const l = live?.find((x) => x.city_id === c.id);
            const aqi = l?.measured_us_aqi ?? c.us_aqi;
            return (
              <div key={c.id} className="dash-preview-row">
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}
                </span>
                <span className="figure" style={{ fontSize: 12, color: aqiCss(aqi) }}>
                  {aqi}
                </span>
              </div>
            );
          })}
        </div>

        {/* right: headline stats */}
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {[
            {
              k: t("Cells over standard"),
              v: overCount ? `${overCount}` : "0",
              c: overCount ? "var(--aqi-4)" : "var(--aqi-1)",
            },
            { k: t("µg/m³ RMSE @24h"), v: h24?.model_rmse != null ? `${h24.model_rmse}` : "—" },
            {
              k: t("Districts"),
              v: String(districts?.meta?.n_districts ?? 28),
            },
          ].map((s) => (
            <div key={s.k} className="dash-preview-stat">
              <div className="figure" style={{ fontSize: 15, color: s.c ?? "var(--accent)" }}>
                {s.v}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 1 }}>{s.k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-preview-foot">
        <span style={{ fontSize: 11, color: "var(--ink-2)" }}>
          {aqiLabel(cities[0]?.us_aqi ?? 0)} · {cities.length} {t("Cities")}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>
          {t("Open Dashboard →")}
        </span>
      </div>
    </Link>
  );
}
