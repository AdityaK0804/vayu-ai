"use client";

import type { CityPoint, DistrictProps } from "@/lib/districts";
import { aqiCss, aqiLabel } from "@/lib/aqiScale";
import { useLive } from "@/lib/data";
import { useT } from "@/lib/i18n";

/**
 * Summary strip under the topbar for whatever is currently selected — the
 * conditions row from the reference dashboard. Reads the selection rather than
 * owning it, so the map, the city rail and this bar can never disagree.
 */
export default function SelectionBar({
  city,
  district,
}: {
  city: CityPoint | null;
  district: DistrictProps | null;
}) {
  const { t } = useT();
  const { data: live } = useLive();

  const l = city ? live?.find((x) => x.city_id === city.id) : null;

  const name = city?.name ?? district?.name ?? null;
  const kind = city ? t("City") : district ? t("District") : null;
  const pm25 = city ? (l?.measured_pm25_24h ?? city.pm25) : district?.display_pm25;
  const aqi = city ? (l?.measured_us_aqi ?? city.us_aqi) : district?.display_aqi;
  const measured = city ? l?.measured === true : district?.display_basis === "measured";

  if (!name || pm25 == null || aqi == null) {
    return (
      <div className="selbar card">
        <span className="crumb">{t("Selection")}</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
          {t("Pick a city on the left or a district on the map to see its conditions.")}
        </span>
      </div>
    );
  }

  const tone = aqiCss(aqi);

  const cells: { k: string; v: string; c?: string }[] = [
    { k: t("US AQI"), v: String(aqi), c: tone },
    { k: "PM2.5", v: `${pm25} µg/m³` },
    { k: t("Category"), v: t(aqiLabel(aqi)), c: tone },
  ];
  if (district) {
    cells.push(
      { k: t("Temperature"), v: `${district.temp_c} °C` },
      { k: t("Relative humidity"), v: `${district.rh_pct} %` },
      { k: t("Wind speed"), v: `${district.wind_speed} m/s` },
      { k: t("Population"), v: district.population.toLocaleString("en-IN") },
    );
  } else if (city) {
    cells.push(
      { k: t("CPCB stations"), v: String(city.n_stations) },
      { k: t("Model prediction"), v: `${city.pm25} µg/m³` },
    );
  }

  return (
    <div className="selbar card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: tone, flex: "none" }} />
        <div style={{ lineHeight: 1.25 }}>
          <div className="crumb" style={{ fontSize: 9.5 }}>
            {kind}
          </div>
          <b style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{name}</b>
        </div>
        <span
          className="pill"
          style={{
            background: measured
              ? "color-mix(in oklch, var(--aqi-1), transparent 86%)"
              : "color-mix(in oklch, var(--accent), transparent 88%)",
            color: measured ? "var(--aqi-1)" : "var(--accent)",
            fontSize: 10,
          }}
        >
          {measured ? t("LIVE") : t("predicted")}
        </span>
      </div>

      <div className="selbar-cells">
        {cells.map((c) => (
          <div key={c.k}>
            <div className="crumb" style={{ fontSize: 9.5 }}>
              {c.k}
            </div>
            <div className="figure" style={{ fontSize: 15, marginTop: 2, color: c.c ?? "var(--ink)" }}>
              {c.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
