"use client";

import { useMemo, useState } from "react";

import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { PieWithLegend, type PieData } from "@/components/charts/PieChart";
import { aqiCss } from "@/lib/aqiScale";
import { SOURCE_LABEL } from "@/lib/aqi";
import { useAttribution, useInterventions, useMetrics, usePriority, useStationsLive } from "@/lib/data";
import { useDistricts } from "@/lib/districts";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { Head } from "./views";

/* --------------------------------------------------------------- constants
   CPCB National Ambient Air Quality Standards. These are the real limits the
   sub-index below is computed against — not invented reference points.
   PM2.5/PM10/NO2/SO2 are 24-hour averages; O3 and CO are 8-hour.
   CO arrives from OpenAQ in mg/m³, everything else in µg/m³.
--------------------------------------------------------------------------- */
const NAAQS: Record<string, { limit: number; unit: string; label: string; color: string }> = {
  pm25: { limit: 60, unit: "µg/m³", label: "PM2.5", color: "#f43f5e" },
  pm10: { limit: 100, unit: "µg/m³", label: "PM10", color: "#fb923c" },
  no2: { limit: 80, unit: "µg/m³", label: "NO₂", color: "#38bdf8" },
  so2: { limit: 80, unit: "µg/m³", label: "SO₂", color: "#a78bfa" },
  o3: { limit: 100, unit: "µg/m³", label: "O₃", color: "#34d399" },
  co: { limit: 2, unit: "mg/m³", label: "CO", color: "#fbbf24" },
};

/** EDGAR v8.1 emission sectors, in the order the bake writes them. */
const EDGAR_SECTORS: { key: string; label: string; color: string }[] = [
  { key: "edgar_share_ene", label: "Power generation", color: "#f43f5e" },
  { key: "edgar_share_ind", label: "Industry", color: "#fb923c" },
  { key: "edgar_share_tro", label: "Road transport", color: "#38bdf8" },
  { key: "edgar_share_rco", label: "Residential", color: "#a78bfa" },
  { key: "edgar_share_awb", label: "Ag. burning", color: "#fbbf24" },
  { key: "edgar_share_ags", label: "Agriculture", color: "#34d399" },
];

/* ------------------------------------------------------------------- bars */
function Bars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{ display: "grid", gridTemplateColumns: "110px 1fr 44px", gap: 10, alignItems: "center" }}
        >
          <span
            style={{
              fontSize: 11.5,
              color: "var(--ink-2)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
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

/** Colours for the three forecast series, shared by chart and legend. */
const MODEL_SERIES = [
  { key: "model", label: "Vayu AI", fill: "var(--accent)" },
  { key: "persistence", label: "Persistence", fill: "#94a3b8" },
  { key: "cams", label: "CAMS", fill: "#818cf8" },
];

/* ------------------------------------------------------------------- view */
export default function AnalyticsView() {
  const { t } = useT();
  const { city } = useApp();
  const { data: districts } = useDistricts();
  const { data: metrics } = useMetrics(city);
  const { data: priority } = usePriority(city);
  const { data: attribution } = useAttribution(city);
  const { data: interventions } = useInterventions();
  const { data: stationsLive } = useStationsLive();

  const props = useMemo(
    () => (districts?.features ?? []).map((f) => f.properties),
    [districts],
  );

  /* ---- which cities actually report multi-pollutant data right now ---- */
  const pollutantCities = useMemo(() => {
    const ids = new Set<string>();
    for (const s of stationsLive?.stations ?? []) if (s.city_id) ids.add(s.city_id);
    return Array.from(ids).sort();
  }, [stationsLive]);

  const [pCity, setPCity] = useState<string | null>(null);
  const activeCity = pCity && pollutantCities.includes(pCity) ? pCity : pollutantCities[0] ?? null;

  /**
   * Pollutant load for the selected city, as a share of each pollutant's own
   * CPCB limit. Averaging raw µg/m³ across pollutants and pie-charting it would
   * be meaningless — 10 µg/m³ of SO2 and 10 of PM2.5 are not comparable amounts
   * of harm. Normalising each by its standard is exactly how CPCB builds its
   * sub-indices, so the slice sizes answer a real question: which pollutant is
   * closest to breaching its limit here?
   */
  const pollutantMix = useMemo<PieData[]>(() => {
    const rows = (stationsLive?.stations ?? []).filter((s) => s.city_id === activeCity);
    if (!rows.length) return [];
    const out: PieData[] = [];
    for (const [key, cfg] of Object.entries(NAAQS)) {
      const vals = rows
        .map((r) => (r as any)[key])
        .filter((v): v is number => typeof v === "number" && v > 0);
      if (!vals.length) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const pct = Math.round((mean / cfg.limit) * 1000) / 10; // % of limit, 1dp
      if (pct > 0) {
        out.push({
          label: cfg.label,
          value: pct,
          color: cfg.color,
          note: `${mean.toFixed(1)} ${cfg.unit}`,
        });
      }
    }
    return out;
  }, [stationsLive, activeCity]);

  const worstPollutant = useMemo(
    () => [...pollutantMix].sort((a, b) => b.value - a.value)[0],
    [pollutantMix],
  );

  /**
   * Source mix from the TRAINED attribution model — prefer city priority dossiers
   * (SHAP shares on model cells), then baked attribution cells, then district shares.
   */
  const sourceMix = useMemo<PieData[]>(() => {
    const colors: Record<string, string> = {
      industry: "#fb923c",
      traffic: "#38bdf8",
      fire: "#f43f5e",
      dust: "#a78bfa",
    };
    const toPie = (shares: Record<string, number>) =>
      Object.entries(shares)
        .map(([k, v]) => ({
          label: t(SOURCE_LABEL[k] ?? k),
          value: Math.round(v * 1000) / 10,
          color: colors[k] ?? "#94a3b8",
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value);

    // 1) priority dossiers for the selected hero city (model enforcement path)
    const dossiers = priority?.dossiers ?? [];
    if (dossiers.length) {
      const acc: Record<string, number> = { industry: 0, traffic: 0, fire: 0, dust: 0 };
      let n = 0;
      for (const d of dossiers) {
        const sh = (d as any).attribution_shares ?? (d as any).shares;
        if (!sh) continue;
        n += 1;
        for (const k of Object.keys(acc)) acc[k] += Number(sh[k] ?? 0);
      }
      if (n) {
        for (const k of Object.keys(acc)) acc[k] /= n;
        return toPie(acc);
      }
    }

    // 2) baked attribution cells for this city
    const cells = attribution?.cells ?? [];
    if (cells.length) {
      const acc: Record<string, number> = { industry: 0, traffic: 0, fire: 0, dust: 0 };
      for (const c of cells) {
        const sh = c.shares ?? {};
        for (const k of Object.keys(acc)) acc[k] += Number((sh as any)[k] ?? 0);
      }
      for (const k of Object.keys(acc)) acc[k] /= cells.length;
      return toPie(acc);
    }

    // 3) statewide population-weighted district shares (model bake on districts)
    const acc: Record<string, number> = { industry: 0, traffic: 0, fire: 0, dust: 0 };
    let tot = 0;
    for (const p of props) {
      const w = p.population || 1;
      tot += w;
      for (const k of Object.keys(acc)) acc[k] += (p.shares?.[k] ?? 0) * w;
    }
    if (!tot) return [];
    for (const k of Object.keys(acc)) acc[k] /= tot;
    return toPie(acc);
  }, [props, t, priority, attribution]);

  /* ---- EDGAR emission sectors for the district holding the selected city ---- */
  const sectorMix = useMemo<PieData[]>(() => {
    if (!props.length) return [];
    // population-weighted statewide average of the per-district sector shares
    const acc = new Map<string, number>();
    let tot = 0;
    for (const p of props) {
      const w = p.population || 1;
      tot += w;
      for (const s of EDGAR_SECTORS) {
        acc.set(s.key, (acc.get(s.key) ?? 0) + ((p as any)[s.key] ?? 0) * w);
      }
    }
    return EDGAR_SECTORS.map((s) => ({
      label: t(s.label),
      value: Math.round(((acc.get(s.key) ?? 0) / (tot || 1)) * 1000) / 10,
      color: s.color,
    })).filter((d) => d.value > 0);
  }, [props, t]);

  const compare = useMemo(
    () =>
      (metrics?.forecast_vs_baselines ?? []).map((h) => ({
        horizon: `+${h.horizon_h}h`,
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

  const nStations = (stationsLive?.stations ?? []).filter((s) => s.city_id === activeCity).length;

  return (
    <div className="section">
      <Head
        crumb="Monitor / Analytics"
        title="Analytics"
        sub={t(
          "Pollutant load from live stations; source mix from the trained attribution model; RMSE from held-out test.",
        )}
      />

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        {[
          { lab: t("Districts"), val: String(props.length) },
          {
            lab: t("Measured live"),
            val: `${props.filter((p) => p.display_basis === "measured").length}/${props.length}`,
          },
          {
            lab: t("People above AQI 100"),
            val: exposed ? exposed.toLocaleString("en-IN") : "0",
          },
          {
            lab: t("µg/m³ RMSE @24h"),
            val: String(
              metrics?.forecast_vs_baselines.find((h) => h.horizon_h === 24)?.model_rmse ?? "—",
            ),
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

      {/* ---------------- pollutant breakdown (hero chart) ---------------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h" style={{ flexWrap: "wrap" }}>
          <div>
            <h3>{t("Pollutant load by city")}</h3>
            <span className="sub">
              {t("share of each pollutant's CPCB 24h limit")}
              {nStations ? ` · ${nStations} ${t("stations")}` : ""}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pollutantCities.map((c) => (
              <button
                key={c}
                className={`chip${c === activeCity ? " on" : ""}`}
                onClick={() => setPCity(c)}
                style={{ textTransform: "capitalize" }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "18px 18px 20px" }}>
          {pollutantMix.length ? (
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "center" }}>
              <PieWithLegend
                data={pollutantMix}
                size={220}
                innerRadius={66}
                centerLabel={t("of CPCB limit")}
                centerSuffix="%"
                centerDecimals={1}
                formatValue={(v) => `${v}%`}
              />
              {worstPollutant && (
                <div
                  style={{
                    flex: "1 1 220px",
                    minWidth: 200,
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <div className="crumb" style={{ fontSize: 10 }}>
                    {t("Closest to its limit")}
                  </div>
                  <div
                    className="figure"
                    style={{
                      fontSize: 27,
                      fontWeight: 600,
                      marginTop: 6,
                      color: worstPollutant.color,
                    }}
                  >
                    {worstPollutant.label}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 4 }}>
                    {worstPollutant.note} — {worstPollutant.value}% {t("of the permissible limit")}
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 12, lineHeight: 1.5 }}>
                    {t(
                      "Slices are each pollutant's concentration divided by its own CPCB standard. Raw µg/m³ are not comparable across pollutants, so this normalisation is what makes the comparison meaningful.",
                    )}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <span className="sub">{t("No live pollutant readings for this city right now.")}</span>
          )}
        </div>
      </div>

      {/* ---------------- source + sector pies ---------------- */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(400px,1fr))" }}>
        <div className="card">
          <div className="card-h">
            <h3>{t("Source mix")}</h3>
            <span className="sub">{t("trained model SHAP · city dossiers")}</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <PieWithLegend
              data={sourceMix}
              centerLabel={t("attributed")}
              centerSuffix="%"
              formatValue={(v) => `${v}%`}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{t("Emissions by sector")}</h3>
            <span className="sub">EDGAR v8.1</span>
          </div>
          <div style={{ padding: "16px 18px 20px" }}>
            <PieWithLegend
              data={sectorMix}
              centerLabel={t("of emissions")}
              centerSuffix="%"
              centerDecimals={1}
              formatValue={(v) => `${v}%`}
            />
          </div>
        </div>
      </div>

      {/* ---------------- model vs baselines, full width ---------------- */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div>
            <h3>{t("Model vs baselines")}</h3>
            <span className="sub">{t("RMSE µg/m³ · lower is better")}</span>
          </div>
          <span className="sub">
            {t("time-ordered test split · real CPCB labels")}
          </span>
        </div>
        <div style={{ padding: "16px 20px 22px" }}>
          {compare.length ? (
            <>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
                {MODEL_SERIES.map((s) => (
                  <span
                    key={s.key}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}
                  >
                    <span
                      style={{ width: 10, height: 10, borderRadius: 3, background: s.fill, flex: "none" }}
                    />
                    <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
                  </span>
                ))}
              </div>
              <BarChart
                data={compare}
                xDataKey="horizon"
                aspectRatio="3 / 1"
                barGap={0.35}
                margin={{ top: 24, right: 24, bottom: 40, left: 52 }}
              >
                <Grid horizontal />
                {MODEL_SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} fill={s.fill} lineCap="round" />
                ))}
                <BarXAxis showAllLabels />
                <ChartTooltip />
              </BarChart>
              <p style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 12, lineHeight: 1.55 }}>
                {t(
                  "Persistence repeats the last measured value; CAMS is the bias-corrected Copernicus model. Both are scored on the same held-out hours as ours — the split is time-ordered, never shuffled, so no future data leaks into training.",
                )}
              </p>
            </>
          ) : (
            <span className="sub">{t("No metrics yet.")}</span>
          )}
        </div>
      </div>

      {/* Multi-city enforcement — not Korba-only */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h3>{t("Enforcement pipeline")}</h3>
          <span className="sub">
            {interventions
              ? `${interventions.n_items} cities · multi-city · CPCB PM2.5 scale`
              : t("signal → dossier")}
          </span>
        </div>
        <div style={{ padding: "14px 18px 18px" }}>
          {(interventions?.items?.length ?? 0) > 0 ? (
            <Bars
              rows={(interventions?.items ?? []).map((d) => ({
                label: d.city_name,
                value: Math.round(d.pm25),
                color: d.category_hex,
              }))}
            />
          ) : priority ? (
            <Bars
              rows={priority.dossiers.slice(0, 6).map((d) => ({
                label: d.ward,
                value: Math.round(d.predicted_pm25),
                color: aqiCss(d.predicted_pm25 * 2),
              }))}
            />
          ) : (
            <span className="sub">{t("No enforcement rows.")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
