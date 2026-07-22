"use client";

import type { DistrictProps } from "@/components/DistrictMap";
import { aqiCss, aqiLabel } from "@/lib/aqiScale";
import { SOURCE_LABEL } from "@/lib/aqi";
import { useT } from "@/lib/i18n";

/** District detail, rendered in the right column rather than over the map. */
export default function DistrictDetail({
  district: d,
  onClose,
}: {
  district: DistrictProps;
  onClose: () => void;
}) {
  const { t } = useT();
  const tone = aqiCss(d.display_aqi);
  const measured = d.display_basis === "measured";

  return (
    <div className="thin-scroll" style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
        <div>
          <div className="crumb">{t("District")}</div>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{d.name}</b>
        </div>
        <button onClick={onClose} aria-label={t("Close")} title={t("Close")} className="close-x">
          ✕
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
        <span className="disp" style={{ fontSize: 36, color: tone }}>
          {d.display_pm25}
        </span>
        <span className="unit">µg/m³ PM2.5</span>
        <span
          className="pill"
          style={{
            marginLeft: "auto",
            background: `color-mix(in oklch, ${tone}, transparent 84%)`,
            color: tone,
          }}
        >
          AQI {d.display_aqi}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
        <span
          className="pill"
          style={{
            background: measured
              ? "color-mix(in oklch, var(--aqi-1), transparent 84%)"
              : "color-mix(in oklch, var(--accent), transparent 86%)",
            color: measured ? "var(--aqi-1)" : "var(--accent)",
          }}
        >
          {measured ? (
            <>
              <span className="live-dot" /> {t("LIVE")} · {d.live_stations} {t("stations")}
            </>
          ) : (
            <>{t("PREDICTED · no sensor here")}</>
          )}
        </span>
        <span className="crumb" style={{ fontSize: 9.5 }}>
          {t(aqiLabel(d.display_aqi))}
        </span>
      </div>

      <dl style={{ marginTop: 16, fontSize: 11.5, display: "grid", gap: 6 }}>
        <Row k={t("Model forecast (this hour)")} v={`${d.pm25} µg/m³`} />
        <Row k={t("Population")} v={d.population.toLocaleString("en-IN")} />
        <Row k={t("CPCB stations")} v={String(d.n_stations)} />
      </dl>

      <Block title={t("Model attribution (SHAP)")}>
        {(["industry", "traffic", "fire", "dust"] as const).map((k) => {
          const pct = (d.shares?.[k] ?? 0) * 100;
          return (
            <div key={k} style={{ marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "var(--ink-2)" }}>{t(SOURCE_LABEL[k] ?? k)}</span>
                <span className="figure">{pct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, marginTop: 3 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: "var(--accent)",
                    transition: "width .4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </Block>

      <Block title={t("EDGAR v8.1 emissions here")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(
            [
              ["PM2.5", d.edgar_pm25],
              ["NOₓ", d.edgar_nox],
              ["SO₂", d.edgar_so2],
            ] as const
          ).map(([label, v]) => (
            <div
              key={label}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 9,
                padding: "7px 9px",
              }}
            >
              <div className="crumb" style={{ fontSize: 9.5 }}>
                {label}
              </div>
              <div className="figure" style={{ fontSize: 12.5, marginTop: 2 }}>
                {Number(v ?? 0).toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title={t("Model inputs at this hour")}>
        <dl style={{ fontSize: 11.5, display: "grid", gap: 5 }}>
          <Row k={t("CAMS PM2.5")} v={`${d.cams_pm25} µg/m³`} />
          <Row k={t("Temperature")} v={`${d.temp_c} °C`} />
          <Row k={t("Relative humidity")} v={`${d.rh_pct} %`} />
          <Row k={t("Wind speed")} v={`${d.wind_speed} m/s`} />
          <Row k={t("Boundary layer")} v={`${d.blh_m} m`} />
          <Row
            k={t("Nearest power plant")}
            v={`${d.gppd_nearest_km} km · ${d.gppd_nearest_mw} MW`}
          />
        </dl>
      </Block>

      {d.n_stations > 0 ? (
        <Block title={t("Measured at CPCB stations")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {(
              [
                ["pm25", "PM2.5", "µg/m³"],
                ["pm10", "PM10", "µg/m³"],
                ["no2", "NO₂", "µg/m³"],
                ["so2", "SO₂", "µg/m³"],
              ] as const
            )
              .filter(([k]) => d.measured?.[k] != null)
              .map(([k, label, unit]) => (
                <div
                  key={k}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    borderRadius: 9,
                    padding: "7px 9px",
                  }}
                >
                  <div className="crumb" style={{ fontSize: 9.5 }}>
                    {label}
                  </div>
                  <div className="figure" style={{ fontSize: 13, marginTop: 2 }}>
                    {d.measured[k] as number}
                    <span style={{ fontSize: 9, color: "var(--ink-3)" }}> {unit}</span>
                  </div>
                </div>
              ))}
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <dt style={{ color: "var(--ink-2)" }}>{k}</dt>
      <dd className="figure" style={{ textAlign: "right" }}>
        {v}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="crumb" style={{ marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
