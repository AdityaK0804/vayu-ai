"use client";

import { useMemo } from "react";

import { useDistricts } from "@/components/DistrictMap";
import { AQI_BANDS, aqiCss, aqiLabel } from "@/lib/aqiScale";
import { SOURCE_LABEL } from "@/lib/aqi";
import { useMetrics, usePriority } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Head } from "./views";

/* ------------------------------------------------------------------ charts
   Hand-rolled SVG rather than a charting library: every series here is tiny
   (a handful of districts or horizons), and a dependency would add ~120 KB
   plus its own theming layer to fight with our CSS variables.
------------------------------------------------------------------------- */

function Donut({
  slices,
  size = 168,
  thickness = 26,
  centre,
  sub,
}: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centre: string;
  sub: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} style={{ flex: "none" }}>
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          <circle r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
          {slices.map((s) => {
            const frac = s.value / total;
            const dash = `${frac * c} ${c - frac * c}`;
            const el = (
              <circle
                key={s.label}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset * c}
              />
            );
            offset += frac;
            return el;
          })}
        </g>
        <text
          x="50%"
          y="47%"
          textAnchor="middle"
          className="figure"
          style={{ fontSize: 26, fill: "var(--ink)", fontWeight: 600 }}
        >
          {centre}
        </text>
        <text
          x="50%"
          y="61%"
          textAnchor="middle"
          style={{ fontSize: 10, fill: "var(--ink-3)" }}
        >
          {sub}
        </text>
      </svg>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: "none" }}
            />
            <span style={{ color: "var(--ink-2)", flex: 1 }}>{s.label}</span>
            <span className="figure">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 44px", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.label}
          </span>
          <div style={{ height: 9, background: "var(--surface-2)", borderRadius: 5 }}>
            <div
              style={{
                width: `${(r.value / max) * 100}%`,
                height: "100%",
                borderRadius: 5,
                background: r.color,
                transition: "width .5s cubic-bezier(.34,1.56,.64,1)",
              }}
            />
          </div>
          <span className="figure" style={{ fontSize: 12, textAlign: "right" }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Grouped bars comparing our model against each baseline, per horizon. */
function ModelCompare({
  rows,
}: {
  rows: { h: number; model: number; persistence: number; cams: number }[];
}) {
  const max = Math.max(...rows.flatMap((r) => [r.model, r.persistence, r.cams]), 1);
  const series = [
    { k: "model" as const, label: "Vayu AI", color: "var(--accent)" },
    { k: "persistence" as const, label: "Persistence", color: "var(--ink-3)" },
    { k: "cams" as const, label: "CAMS", color: "var(--accent-2)" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span key={s.k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 22, alignItems: "flex-end", height: 168 }}>
        {rows.map((r) => (
          <div key={r.h} style={{ flex: 1, display: "grid", gap: 6, justifyItems: "center" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 132 }}>
              {series.map((s) => (
                <div
                  key={s.k}
                  title={`${s.label}: ${r[s.k]}`}
                  style={{
                    width: 20,
                    height: `${(r[s.k] / max) * 100}%`,
                    background: s.color,
                    borderRadius: "4px 4px 0 0",
                    transition: "height .6s cubic-bezier(.34,1.56,.64,1)",
                  }}
                />
              ))}
            </div>
            <span className="crumb" style={{ fontSize: 10 }}>
              +{r.h}h
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- view */
export default function AnalyticsView() {
  const { t } = useT();
  const { city } = useApp();
  const { data: districts } = useDistricts();
  const { data: metrics } = useMetrics(city);
  const { data: priority } = usePriority(city);

  const props = useMemo(
    () => (districts?.features ?? []).map((f) => f.properties),
    [districts],
  );

  // districts per AQI category
  const byBand = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of props) {
      const lbl = aqiLabel(p.display_aqi);
      counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
    }
    return AQI_BANDS.filter((b) => counts.get(b.label))
      .map((b) => ({ label: t(b.label), value: counts.get(b.label) ?? 0, color: b.hex }));
  }, [props, t]);

  // measured vs modelled coverage
  const coverage = useMemo(() => {
    const m = props.filter((p) => p.display_basis === "measured").length;
    return [
      { label: t("measured"), value: m, color: "var(--aqi-1)" },
      { label: t("model"), value: props.length - m, color: "var(--accent-2)" },
    ];
  }, [props, t]);

  // statewide source mix, weighted by population
  const sourceMix = useMemo(() => {
    const acc: Record<string, number> = { industry: 0, traffic: 0, fire: 0, dust: 0 };
    let tot = 0;
    for (const p of props) {
      const w = p.population || 1;
      tot += w;
      for (const k of Object.keys(acc)) acc[k] += (p.shares?.[k] ?? 0) * w;
    }
    const colors: Record<string, string> = {
      industry: "#f97316",
      traffic: "#38bdf8",
      fire: "#e11d48",
      dust: "#a78bfa",
    };
    return Object.entries(acc)
      .map(([k, v]) => ({
        label: t(SOURCE_LABEL[k] ?? k),
        value: Math.round((v / (tot || 1)) * 100),
        color: colors[k],
      }))
      .sort((a, b) => b.value - a.value);
  }, [props, t]);

  const topDistricts = useMemo(
    () =>
      [...props]
        .sort((a, b) => (b.display_aqi ?? 0) - (a.display_aqi ?? 0))
        .slice(0, 8)
        .map((p) => ({
          label: p.name,
          value: p.display_aqi ?? 0,
          color: aqiCss(p.display_aqi),
        })),
    [props],
  );

  const compare = useMemo(
    () =>
      (metrics?.forecast_vs_baselines ?? []).map((h) => ({
        h: h.horizon_h,
        model: h.model_rmse ?? 0,
        persistence: h.persistence_rmse ?? 0,
        cams: h.cams_bc_rmse ?? 0,
      })),
    [metrics],
  );

  const exposed = useMemo(
    () => props.filter((p) => (p.display_aqi ?? 0) > 100).reduce((a, p) => a + p.population, 0),
    [props],
  );

  return (
    <div className="section">
      <Head
        crumb="Monitor / Analytics"
        title="Analytics"
        sub={t("Distribution, source mix and model performance across all districts.")}
      />

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        {[
          { lab: t("Districts"), val: String(props.length) },
          {
            lab: t("Measured live"),
            val: `${coverage[0]?.value ?? 0}/${props.length}`,
          },
          {
            lab: t("People above AQI 100"),
            val: exposed ? exposed.toLocaleString("en-IN") : "0",
          },
          {
            lab: t("µg/m³ RMSE @24h"),
            val: String(metrics?.forecast_vs_baselines.find((h) => h.horizon_h === 24)?.model_rmse ?? "—"),
          },
        ].map((k) => (
          <div key={k.lab} className="card kpi">
            <div className="top">
              <span className="lab">{k.lab}</span>
            </div>
            <div className="val">{k.val}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))" }}>
        <div className="card">
          <div className="card-h">
            <h3>{t("Districts by AQI category")}</h3>
            <span className="sub">{t("live")}</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <Donut
              slices={byBand}
              centre={String(props.length)}
              sub={t("districts")}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{t("Measured vs modelled")}</h3>
            <span className="sub">{t("coverage")}</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <Donut
              slices={coverage}
              centre={`${Math.round(((coverage[0]?.value ?? 0) / (props.length || 1)) * 100)}%`}
              sub={t("measured")}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{t("Source mix")}</h3>
            <span className="sub">{t("population-weighted SHAP")}</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <Donut
              slices={sourceMix}
              centre={`${sourceMix[0]?.value ?? 0}%`}
              sub={sourceMix[0]?.label ?? ""}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{t("Most polluted districts")}</h3>
            <span className="sub">US AQI</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <Bars rows={topDistricts} />
          </div>
        </div>

        <div className="card" style={{ gridColumn: "span 2", minWidth: 0 }}>
          <div className="card-h">
            <h3>{t("Model vs baselines")}</h3>
            <span className="sub">{t("RMSE µg/m³ · lower is better")}</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            {compare.length ? (
              <ModelCompare rows={compare} />
            ) : (
              <span className="sub">{t("No metrics yet.")}</span>
            )}
          </div>
        </div>
      </div>

      {priority && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h3>{t("Enforcement pipeline")}</h3>
            <span className="sub">
              {priority.signal_to_dossier_seconds}s {t("signal → dossier")}
            </span>
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            <Bars
              rows={priority.dossiers.slice(0, 6).map((d) => ({
                label: d.ward,
                value: Math.round(d.predicted_pm25),
                color: aqiCss(d.predicted_pm25 * 2),
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
