"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { useDistricts, type CityPoint, type DistrictProps } from "@/components/DistrictMap";
import { AQI_BANDS, aqiCss, aqiLabel } from "@/lib/aqiScale";
import { useLive, usePriority } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import type { CityId } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="label">Loading map…</span>
    </div>
  ),
});

type Focus = {
  kind: "district" | "city" | "india";
  name: string;
  nonce: number;
  bb?: [number, number, number, number];
  lat?: number;
  lon?: number;
};

/**
 * Three-column workspace: cities to pick from on the left, the Chhattisgarh
 * risk map in the middle, live alerts on the right — the layout from the
 * reference. Selecting anywhere in the left rail flies the map and opens the
 * district panel, so the columns stay in sync.
 */
export default function MapWorkspace({
  onSelectDistrict,
  selected,
}: {
  onSelectDistrict: (d: DistrictProps | null) => void;
  selected: DistrictProps | null;
}) {
  const { t } = useT();
  const { city, setCity } = useApp();
  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: priority } = usePriority(city);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [q, setQ] = useState("");

  const cities: CityPoint[] = districts?.cities ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cities;
    return cities.filter((c) => c.name.toLowerCase().includes(s));
  }, [q, cities]);

  const goCity = (c: CityPoint) => {
    setCity(c.id as CityId);
    setFocus({ kind: "city", name: c.name, nonce: Date.now() });
  };

  // Alerts derive from the live district field crossing the CPCB standard —
  // never a hand-written list.
  const alerts = useMemo(() => {
    if (!districts) return [];
    return districts.features
      .map((f) => f.properties)
      .filter((p) => (p.display_aqi ?? 0) > 100)
      .sort((a, b) => (b.display_aqi ?? 0) - (a.display_aqi ?? 0))
      .slice(0, 12);
  }, [districts]);

  return (
    <div className="mapws">
      {/* ---------------- left: cities ---------------- */}
      <aside className="card mapws-col">
        <div className="mapws-head">
          <span style={{ color: "var(--accent)" }}>◉</span>
          <b>{t("Cities")}</b>
          <span className="n-badge" style={{ marginLeft: "auto" }}>
            {cities.length}
          </span>
        </div>

        <div style={{ padding: "10px 12px 6px" }}>
          <div className="search" style={{ maxWidth: "none", width: "100%" }}>
            <span>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search city…")}
              aria-label={t("Search city…")}
            />
          </div>
        </div>

        <div className="thin-scroll mapws-list">
          {filtered.map((c) => {
            const l = live?.find((x) => x.city_id === c.id);
            const aqi = l?.measured_us_aqi ?? c.us_aqi;
            const on = city === c.id;
            return (
              <button
                key={c.id}
                onClick={() => goCity(c)}
                className={`mapws-city${on ? " on" : ""}`}
                style={{ borderLeftColor: on ? aqiCss(aqi) : "transparent" }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{c.name}</b>
                  <span
                    style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}
                  >
                    {c.has_stations
                      ? `${c.n_stations} ${t("CPCB stations")}`
                      : t("No ground sensor")}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="figure" style={{ fontSize: 16, color: aqiCss(aqi) }}>
                    {aqi}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 9, color: "var(--ink-3)" }}
                    className="figure"
                  >
                    {l?.measured ? t("measured") : t("predicted")}
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--ink-3)" }}>
              {t("No match")}
            </div>
          )}
        </div>
      </aside>

      {/* ---------------- middle: risk map ---------------- */}
      <section className="card mapws-col" style={{ overflow: "hidden" }}>
        <div className="mapws-head">
          <span style={{ color: "var(--accent)" }}>◉</span>
          <b>{t("Risk Map")}</b>
          <span className="sub" style={{ margin: 0, fontSize: 11 }}>
            {districts?.meta?.n_districts ?? 28} {t("districts")} ·{" "}
            {districts?.meta_live?.mode === "live" ? t("live") : t("model")}
          </span>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <DistrictMap selected={selected?.name ?? null} onSelect={onSelectDistrict} focus={focus} />

          <div className="mapws-legend card">
            <div className="crumb" style={{ marginBottom: 6 }}>
              {t("US AQI")}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {AQI_BANDS.map((b) => (
                <span
                  key={b.label}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5 }}
                >
                  <span
                    style={{ width: 13, height: 8, borderRadius: 3, background: b.hex, flex: "none" }}
                  />
                  <span style={{ color: "var(--ink-2)" }}>{t(b.label)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- right: live alerts ---------------- */}
      <aside className="card mapws-col">
        <div className="mapws-head">
          <span style={{ color: alerts.length ? "var(--aqi-4)" : "var(--ink-3)" }}>◔</span>
          <b>{t("Live Alerts")}</b>
          <span
            className="n-badge"
            style={{
              marginLeft: "auto",
              background: alerts.length ? "var(--aqi-5)" : "var(--surface-2)",
              color: alerts.length ? "#fff" : "var(--ink-3)",
            }}
          >
            {alerts.length}
          </span>
        </div>

        <div className="thin-scroll mapws-list">
          {alerts.length === 0 ? (
            <div style={{ padding: "36px 18px", textAlign: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  margin: "0 auto 12px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                  background: "color-mix(in oklch, var(--aqi-1), transparent 88%)",
                  color: "var(--aqi-1)",
                }}
              >
                ◔
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{t("No active alerts")}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {t("No district is above AQI 100 right now.")}
              </div>
            </div>
          ) : (
            alerts.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  onSelectDistrict(p);
                  setFocus({ kind: "district", name: p.name, nonce: Date.now() });
                }}
                className="mapws-alert"
                style={{ borderLeftColor: aqiCss(p.display_aqi) }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ fontSize: 13 }}>{p.name}</b>
                  <span
                    style={{ display: "block", fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}
                  >
                    {p.display_pm25} µg/m³ · {p.population.toLocaleString()} {t("people")}
                  </span>
                </span>
                <span
                  className="pill"
                  style={{
                    background: `color-mix(in oklch, ${aqiCss(p.display_aqi)}, transparent 85%)`,
                    color: aqiCss(p.display_aqi),
                    fontSize: 10.5,
                  }}
                >
                  {p.display_aqi}
                </span>
              </button>
            ))
          )}
        </div>

        {priority?.dossiers?.[0] && (
          <div style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
            <div className="crumb" style={{ marginBottom: 6 }}>
              {t("Top enforcement target")}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-2)" }}>
              {priority.dossiers[0].recommended_action}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
