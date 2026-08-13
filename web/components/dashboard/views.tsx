"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import ShinyButton from "@/components/magicui/shiny-button";
import { useDistricts, useIndiaIndex, type DistrictProps } from "@/lib/districts";
import MapWorkspace from "@/components/dashboard/MapWorkspace";
import SelectionBar from "@/components/dashboard/SelectionBar";
import type { CityPoint } from "@/lib/districts";
import { cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import type { CityId } from "@/lib/types";
import { BANDS, SOURCE_LABEL, bandFor } from "@/lib/aqi";
import {
  useAttribution,
  useForecast,
  useForecasts72h,
  useInterventions,
  useLive,
  useMetrics,
  usePriority,
  useStations,
} from "@/lib/data";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { selectFrame } from "@/lib/types";

const DistrictMap = dynamic(() => import("@/components/DistrictMap"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center">
      <span className="label">Loading districts…</span>
    </div>
  ),
});

/* ------------------------------------------------------------------ shared */
export function Head({ crumb, title, sub }: { crumb: string; title: string; sub?: string }) {
  const { t } = useT();
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="crumb">{t(crumb)}</div>
      <h1 className="disp">{t(title)}</h1>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

function Kpi({
  lab,
  val,
  unit,
  delta,
  deltaColor,
  accent,
}: {
  lab: string;
  val: string | number;
  unit?: string;
  delta?: string;
  deltaColor?: string;
  accent?: boolean;
}) {
  return (
    <div className="card kpi">
      <div className="top">
        <span className="lab">{lab}</span>
      </div>
      <div className="val" style={{ color: accent ? "var(--accent)" : "var(--ink)" }}>
        {val}
        {unit && <span className="unit"> {unit}</span>}
      </div>
      {delta && (
        <span
          className="delta"
          style={{
            background: `color-mix(in oklch, ${deltaColor ?? "var(--ink-3)"}, transparent 88%)`,
            color: deltaColor ?? "var(--ink-3)",
          }}
        >
          {delta}
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- OVERVIEW */
export function OverviewView() {
  const { setView } = useApp();
  const { data: metrics } = useMetrics("korba");
  const { data: live } = useLive();
  const { data: interventions } = useInterventions();

  const h24 = metrics?.forecast_vs_baselines.find((h) => h.horizon_h === 24);
  const top = interventions?.items?.[0];
  const nAction = interventions?.n_items ?? 0;

  return (
    <div className="section">
      <Head
        crumb="Monitor / Overview"
        title="Multi-city command overview"
        sub="Statewide live feed + model proof + ranked interventions across cities (not Korba-only)."
      />

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi
          lab="Cities live"
          val={live?.length ?? "—"}
          delta="Chhattisgarh feed"
          deltaColor="var(--accent)"
        />
        <Kpi
          lab="Forecast RMSE @24h"
          val={h24?.model_rmse ?? "—"}
          unit="µg/m³"
          delta={h24?.vs_persistence_pct != null ? `▼ ${h24.vs_persistence_pct}% vs persist` : undefined}
          deltaColor="var(--aqi-1)"
          accent
        />
        <Kpi
          lab="Zero-station RMSE"
          val={metrics?.zero_station_loso.rmse_satellite_subset ?? "—"}
          unit="µg/m³"
          delta={
            metrics?.zero_station_loso.beats_cams_by_pct != null
              ? `▼ ${metrics.zero_station_loso.beats_cams_by_pct}% vs CAMS`
              : undefined
          }
          deltaColor="var(--aqi-1)"
          accent
        />
        <Kpi
          lab="Cities needing action"
          val={nAction}
          delta={top ? `Top: ${top.city_name}` : "None elevated"}
          deltaColor={top?.category_hex ?? "var(--aqi-1)"}
        />
      </div>

      {/* multi-city live strip */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>Live cities</h3>
          <span className="sub">PM2.5 · CPCB category from National AQI scale</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, padding: 14 }}>
          {(live ?? []).map((l) => {
            const pm = l.current_pm25 ?? l.measured_pm25_24h ?? null;
            const cat = cpcbPm25Label(pm);
            const hex = cpcbPm25Css(pm);
            return (
              <div key={l.city_id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)" }}>
                <div className="lab" style={{ textTransform: "capitalize" }}>{l.name || l.city_id}</div>
                <div className="figure" style={{ fontSize: 22, fontWeight: 700, color: hex, marginTop: 4 }}>
                  {pm != null ? pm : "—"}
                  <span style={{ fontSize: 11, marginLeft: 4 }}>µg/m³</span>
                </div>
                <div style={{ fontSize: 11, color: hex, marginTop: 2 }}>{cat}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
        <div className="card">
          <div className="card-h">
            <h3>Model vs baselines</h3>
            <span className="sub">time-ordered split, test rows only</span>
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            <table style={{ width: "100%", fontSize: 12.5 }}>
              <thead>
                <tr className="crumb">
                  <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 400 }}>Horizon</th>
                  <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>VAYU</th>
                  <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>Persist.</th>
                  <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>CAMS</th>
                </tr>
              </thead>
              <tbody className="figure">
                {metrics?.forecast_vs_baselines.map((h) => (
                  <tr key={h.horizon_h} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "7px 0", color: "var(--ink-2)" }}>{h.horizon_h}h</td>
                    <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>
                      {h.model_rmse}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--ink-3)" }}>
                      {h.persistence_rmse}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--ink-3)" }}>{h.cams_bc_rmse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Top multi-city intervention</h3>
            <span className="ai-badge">AI RANKED</span>
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            {top ? (
              <>
                <div className="figure" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {top.city_name} · {top.ward}
                  {top.demo_episode ? " · demo episode" : ""}
                </div>
                <div className="disp" style={{ fontSize: 30, marginTop: 6, color: top.category_hex }}>
                  {top.pm25}
                  <span className="unit"> µg/m³</span>
                </div>
                <div style={{ fontSize: 12, color: top.category_hex, marginTop: 4 }}>
                  CPCB {top.cpcb_category} (AQI {top.cpcb_aqi_range}) · {SOURCE_LABEL[top.top_source] ?? top.top_source}
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                  {top.reason}
                </p>
                <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                  {top.n_schools_district.toLocaleString()} schools in district · {top.affected_schools.length} listed for action
                </p>
                <ShinyButton className="btn pri" style={{ marginTop: 14 }} onClick={() => setView("interventions")}>
                  Open interventions →
                </ShinyButton>
              </>
            ) : (
              <span className="sub">No elevated cities right now.</span>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Dataset</h3>
            <span className="sub">what the model was trained on</span>
          </div>
          <div style={{ padding: "14px 18px 18px", fontSize: 12.5 }}>
            {[
              ["Training rows", metrics?.dataset.pooled_target_rows?.toLocaleString() ?? "—"],
              ["Ground stations", String(metrics?.dataset.stations ?? "—")],
              [
                "Window",
                metrics?.dataset.window
                  ? `${metrics.dataset.window[0].slice(0, 7)} → ${metrics.dataset.window[1].slice(0, 7)}`
                  : "—",
              ],
              ["Features", String(metrics?.dataset.n_features ?? 95)],
              ["Cities with action", String(nAction)],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "7px 0",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span style={{ color: "var(--ink-2)" }}>{k}</span>
                <span className="figure">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- LIVE MAP */
export function MapView() {
  const { t } = useT();
  const { data: districts } = useDistricts();
  const [district, setDistrict] = useState<DistrictProps | null>(null);
  const [openCity, setOpenCity] = useState<CityPoint | null>(null);
  const [q, setQ] = useState("");
  const { data: india } = useIndiaIndex();
  const [focus, setFocus] = useState<
    | {
        kind: "district" | "city" | "india";
        name: string;
        nonce: number;
        bb?: [number, number, number, number];
        lat?: number;
        lon?: number;
      }
    | null
  >(null);
  const [welcome, setWelcome] = useState<string | null>(null);

  // search across both districts and modelled cities
  type Hit = {
    kind: "district" | "city" | "india";
    name: string;
    aqi?: number | null;
    bb?: [number, number, number, number];
    lat?: number;
    lon?: number;
    note?: string;
  };

  const results = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const cgNames = new Set((districts?.features ?? []).map((f) => f.properties.name));
    const c: Hit[] = (districts?.cities ?? [])
      .filter((x) => x.name.toLowerCase().includes(s))
      .slice(0, 4)
      .map((x) => ({ kind: "city", name: x.name, aqi: x.us_aqi, note: "modelled city" }));
    const d: Hit[] = (districts?.features ?? [])
      .filter((f) => f.properties.name.toLowerCase().includes(s))
      .slice(0, 5)
      .map((f) => ({ kind: "district", name: f.properties.name, aqi: f.properties.us_aqi, note: "Chhattisgarh" }));
    // anywhere else in India — no prediction there, we just travel to it
    const i: Hit[] = (india?.districts ?? [])
      .filter((x) => x.n.toLowerCase().includes(s) && !cgNames.has(x.n))
      .slice(0, 5)
      .map((x) => ({ kind: "india", name: x.n, bb: x.bb, lat: x.lat, lon: x.lon, note: "India" }));
    return [...c, ...d, ...i].slice(0, 9);
  }, [q, districts, india]);

  const go = (h: Hit) => {
    setFocus({ kind: h.kind, name: h.name, nonce: Date.now(), bb: h.bb, lat: h.lat, lon: h.lon });
    setQ("");
    setWelcome(h.name);
    window.setTimeout(() => setWelcome(null), 3200);
  };

  return (
    <div className="section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SelectionBar city={openCity} district={district} />

      <MapWorkspace
        selected={district}
        onSelectDistrict={setDistrict}
        openCity={openCity}
        setOpenCity={setOpenCity}
      />


      {welcome && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: 118,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 30,
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            animation: "vayuRise .45s both",
          }}
        >
          <span style={{ color: "var(--accent)" }}>◉</span>
          <span style={{ fontSize: 13 }}>
            {t("Welcome to")} <b style={{ fontFamily: "var(--font-display)" }}>{welcome}</b>
          </span>
        </div>
      )}

    </div>
  );
}

/* --------------------------------------------------------------- FORECAST */
export function ForecastView() {
  const { city, setCity } = useApp();
  const { data: multi } = useForecasts72h();
  const { data: forecast } = useForecast(city);
  const { data: metrics } = useMetrics("korba");
  const [h, setH] = useState<24 | 48 | 72>(24);
  const [focus, setFocus] = useState<string | null>(null);

  const cities = multi?.cities ?? [];
  const proof = multi?.proof?.forecast_vs_baselines ?? metrics?.forecast_vs_baselines ?? [];
  const hRow = proof.find((x) => x.horizon_h === h);
  const activeId = focus ?? city;

  const active = useMemo(
    () => cities.find((c) => c.city_id === activeId) ?? cities[0],
    [cities, activeId],
  );
  const hz = active?.horizons?.[String(h)];

  // grid trajectory for selected city (korba / jagdalpur)
  const traj = multi?.grid_trajectories?.[activeId];
  const trajMax = useMemo(() => {
    const vals = (traj?.grid_mean_pm25 ?? []).filter((v): v is number => v != null);
    return Math.max(...vals, 1);
  }, [traj]);

  // keep station-level bake for map city when present
  const sf = forecast?.station_forecast?.filter((s) => s.horizon_h === h) ?? [];

  return (
    <div className="section">
      <Head
        crumb="Monitor / AI Forecast"
        title="72-hour PM2.5 forecast — all cities"
        sub={
          multi?.model_note ??
          "Trained LightGBM (log1p) at +24 / +48 / +72h · live feed shown alongside model origin"
        }
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg">
          {([24, 48, 72] as const).map((x) => (
            <button key={x} className={h === x ? "on" : ""} onClick={() => setH(x)}>
              +{x}h
            </button>
          ))}
        </div>
        <span className="sub">
          Point models + P10–P90 bands · CPCB category on predicted PM2.5
        </span>
      </div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi lab="Cities forecast" val={cities.length} />
        <Kpi
          lab={`RMSE @${h}h`}
          val={hRow?.model_rmse ?? "—"}
          unit="µg/m³"
          accent
        />
        <Kpi
          lab={`vs persistence @${h}h`}
          val={hRow?.vs_persistence_pct != null ? `+${hRow.vs_persistence_pct}` : "—"}
          unit="%"
          accent
        />
        <Kpi
          lab={`vs CAMS @${h}h`}
          val={hRow?.vs_cams_bc_pct != null ? `+${hRow.vs_cams_bc_pct}` : "—"}
          unit="%"
          accent
        />
      </div>

      {/* multi-city table */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <h3>All cities · +{h}h</h3>
          <span className="sub">click a row for detail · live now vs model forecast</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr className="crumb">
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 400 }}>City</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 400 }}>Live now</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 400 }}>Model origin PM</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 400 }}>+{h}h pred</th>
                <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 400 }}>P10–P90</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 400 }}>CPCB</th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 400 }}>Path</th>
              </tr>
            </thead>
            <tbody className="figure">
              {cities.map((c) => {
                const row = c.horizons?.[String(h)];
                const pred = row?.pred_pm25;
                const hex = row?.cpcb?.hex ?? cpcbPm25Css(pred ?? null);
                const livePm = c.live?.pm25 ?? null;
                const sel = c.city_id === activeId;
                return (
                  <tr
                    key={c.city_id}
                    onClick={() => {
                      setFocus(c.city_id);
                      if (c.city_id === "korba" || c.city_id === "jagdalpur") {
                        setCity(c.city_id as CityId);
                      }
                    }}
                    style={{
                      borderTop: "1px solid var(--line)",
                      cursor: "pointer",
                      background: sel ? "var(--surface-2)" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>{c.city_name}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--ink-2)" }}>
                      {livePm != null ? livePm : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--ink-3)" }}>
                      {c.latest_observed_pm25 ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: hex,
                      }}
                    >
                      {pred != null ? pred : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--ink-3)", fontSize: 11 }}>
                      {row?.p10 != null && row?.p90 != null
                        ? `${row.p10}–${row.p90}`
                        : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: hex }}>
                      {row?.cpcb?.label ?? cpcbPm25Label(pred ?? null)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--ink-3)", fontSize: 11 }}>
                      {c.has_stations ? "station LGBM" : "zero-station / grid"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* detail for selected city */}
      {active && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, marginBottom: 16 }}>
          <div className="card">
            <div className="card-h">
              <h3>{active.city_name} · horizons</h3>
              <span className="sub">{active.model ?? "trained model"}</span>
            </div>
            <div style={{ padding: "12px 16px 16px" }}>
              <div className="grid kpis" style={{ marginBottom: 12 }}>
                <Kpi lab="Live PM2.5" val={active.live?.pm25 ?? "—"} unit="µg/m³" />
                <Kpi
                  lab={`+${h}h`}
                  val={hz?.pred_pm25 ?? "—"}
                  unit="µg/m³"
                  accent
                />
              </div>
              {([24, 48, 72] as const).map((hh) => {
                const r = active.horizons?.[String(hh)];
                if (!r) return null;
                const max = Math.max(r.pred_pm25, r.p90 ?? 0, r.pm25_lag0 ?? 0, 1);
                return (
                  <div key={hh} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                      <b>+{hh}h</b>
                      <span style={{ color: r.cpcb?.hex }}>{r.cpcb?.label}</span>
                    </div>
                    {[
                      ["now (origin)", r.pm25_lag0, "var(--ink-3)"],
                      ["pred", r.pred_pm25, "var(--accent)"],
                      ["CAMS@t+h", r.cams_target, "#818cf8"],
                    ].map(([lab, v, col]) =>
                      v == null ? null : (
                        <div key={lab as string} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                          <span style={{ width: 88, fontSize: 11, color: "var(--ink-2)" }}>{lab as string}</span>
                          <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 4 }}>
                            <div
                              style={{
                                width: `${(Number(v) / max) * 100}%`,
                                height: "100%",
                                background: col as string,
                                borderRadius: 4,
                              }}
                            />
                          </div>
                          <span className="figure" style={{ width: 40, textAlign: "right", fontSize: 12 }}>
                            {v as number}
                          </span>
                        </div>
                      ),
                    )}
                    {r.p10 != null && r.p90 != null && (
                      <div className="sub" style={{ marginTop: 6 }}>
                        Uncertainty band P10–P90: {r.p10} – {r.p90} µg/m³
                        {r.valid_time ? ` · valid ${String(r.valid_time).slice(0, 16)}` : ""}
                      </div>
                    )}
                  </div>
                );
              })}
              {active.note && <p className="sub" style={{ marginTop: 10 }}>{active.note}</p>}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Grid trajectory</h3>
              <span className="sub">
                {traj
                  ? `${traj.n_cells?.toLocaleString() ?? "—"} cells · step ${traj.frame_step_hours}h`
                  : "available for Korba & Jagdalpur grid bakes"}
              </span>
            </div>
            <div style={{ padding: "14px 16px 18px" }}>
              {!traj && (
                <p className="sub">
                  Full H3 field trajectory is baked for hero/reveal cities. Point forecasts above
                  cover every city from the trained models.
                </p>
              )}
              {traj && (
                <>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 100 }}>
                    {(traj.grid_mean_pm25 ?? []).map((v, i) => (
                      <div
                        key={i}
                        title={`${traj.timestamps[i]}: ${v}`}
                        style={{
                          flex: 1,
                          height: `${((v ?? 0) / trajMax) * 100}%`,
                          minHeight: 4,
                          borderRadius: 3,
                          background: cpcbPm25Css(v),
                          opacity: 0.9,
                        }}
                      />
                    ))}
                  </div>
                  <div className="sub" style={{ marginTop: 8 }}>
                    Origin {traj.origin?.slice(0, 16)} · mean PM2.5 over grid each frame
                  </div>
                </>
              )}

              {/* station-level for map city bake */}
              {sf.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="lab" style={{ marginBottom: 8 }}>
                    Station check (map city bake)
                  </div>
                  {sf.map((s) => {
                    const err =
                      s.actual_pm25 != null ? Math.abs(s.pred_pm25 - s.actual_pm25) : null;
                    return (
                      <div key={s.cell + s.horizon_h} className="sub" style={{ marginBottom: 6 }}>
                        +{s.horizon_h}h pred {s.pred_pm25}
                        {s.actual_pm25 != null ? ` · actual ${s.actual_pm25}` : ""}
                        {err != null ? ` · |err| ${err.toFixed(1)}` : ""}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* proof strip */}
      <div className="card">
        <div className="card-h">
          <h3>Model proof (held-out test)</h3>
          <span className="sub">same metrics as Analytics · not live AQI</span>
        </div>
        <div style={{ padding: "12px 16px 16px", overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr className="crumb">
                <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 400 }}>H</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>RMSE</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>vs persist</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 400 }}>vs CAMS</th>
              </tr>
            </thead>
            <tbody className="figure">
              {proof.map((r) => (
                <tr key={r.horizon_h} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "7px 0" }}>{r.horizon_h}h</td>
                  <td style={{ textAlign: "right", color: "var(--accent)", fontWeight: 600 }}>
                    {r.model_rmse}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.vs_persistence_pct != null ? `+${r.vs_persistence_pct}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.vs_cams_bc_pct != null ? `+${r.vs_cams_bc_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {multi?.proof?.headline && (
            <p className="sub" style={{ marginTop: 10 }}>{multi.proof.headline}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- INTERVENTIONS */
export function InterventionsView() {
  const { t } = useT();
  const { setView, setCity } = useApp();
  const { data: interventions } = useInterventions();
  const [open, setOpen] = useState<number | null>(1);
  const [filter, setFilter] = useState<"all" | "urgent" | "industry" | "traffic">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const items = interventions?.items ?? [];
  const filteredItems = useMemo(() => {
    if (filter === "urgent") return items.filter((d) => d.urgency === "urgent" || d.severity >= 3);
    if (filter === "industry") return items.filter((d) => d.top_source === "industry");
    if (filter === "traffic") return items.filter((d) => d.top_source === "traffic");
    return items;
  }, [items, filter]);

  const worstPm = items.reduce((m, d) => Math.max(m, d.pm25 ?? 0), 0);
  const schoolHits = items.reduce((n, d) => n + (d.affected_schools?.length ?? 0), 0);
  const demoN = items.filter((d) => d.demo_episode).length;

  const handleCopyOrder = (d: any) => {
    const text = `[VAYU MUNICIPAL INTERVENTION ORDER]\nTarget City: ${d.city_name}\nWard: ${d.ward}\nPredicted PM2.5: ${d.pm25} µg/m³ (${d.cpcb_category})\nTop Source: ${d.top_source}\nUrgency: ${d.urgency.toUpperCase()}\n\nReason: ${d.reason}\n\nActions Required:\n${d.remedies.map((r: any) => `- [${r.type.toUpperCase()}] ${r.action}`).join('\n')}\n\nAffected Schools: ${d.affected_schools.map((s: any) => s.name).join(', ')}`;
    navigator.clipboard.writeText(text);
    setCopiedId(`${d.city_id}-${d.rank}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="section interv-section" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Head
        crumb="Act / Interventions"
        title="Intervention Command Center"
        sub={
          interventions
            ? `${items.length} priority dossiers · school & hospital remedies · automated enforcement orders`
            : "Loading intervention dossiers…"
        }
      />

      {/* Top Metric Cards */}
      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">QUEUED DOSSIERS</span>
            <span style={{ fontSize: 16, color: "var(--accent)" }}>📋</span>
          </div>
          <div className="val">{items.length || "—"}</div>
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>Priority Cities</span>
        </div>

        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">PEAK PM2.5 THREAT</span>
            <span style={{ fontSize: 16, color: "var(--aqi-5)" }}>🔥</span>
          </div>
          <div className="val" style={{ color: "var(--aqi-5)" }}>{worstPm || "—"} <span style={{ fontSize: 13 }}>µg/m³</span></div>
          <span style={{ fontSize: 11, color: "var(--aqi-5)", marginTop: 4 }}>Very Poor Category</span>
        </div>

        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">SCHOOLS AT RISK</span>
            <span style={{ fontSize: 16, color: "var(--aqi-3)" }}>🏫</span>
          </div>
          <div className="val">{schoolHits || "—"}</div>
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>Named Sensitive Sites</span>
        </div>

        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">PROTOCOL SPEED</span>
            <span style={{ fontSize: 16, color: "var(--accent)" }}>⚡</span>
          </div>
          <div className="val" style={{ fontSize: 24, color: "var(--accent)" }}>&lt; 5s</div>
          <span style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>Signal → Action Order</span>
        </div>
      </div>

      {/* Filter Tabs Header */}
      <div className="card-h" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All Dossiers (${items.length})` },
            { id: "urgent", label: "Urgent Priority" },
            { id: "industry", label: "Industrial Stacks" },
            { id: "traffic", label: "Traffic Corridors" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`chip${filter === f.id ? " on" : ""}`}
              style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600 }}
            >
              {f.label}
            </button>
          ))}
        </div>
        {demoN > 0 && (
          <span className="pill" style={{ background: "var(--surface-2)", color: "var(--ink-2)", fontSize: 11 }}>
            Includes {demoN} verified demo enforcement scenarios
          </span>
        )}
      </div>

      {/* Main Dossiers Board */}
      <div style={{ display: "grid", gap: 16 }}>
        {filteredItems.map((d) => {
          const sel = open === d.rank;
          const src = SOURCE_LABEL[d.top_source] ?? d.top_source;
          const copyKey = `${d.city_id}-${d.rank}`;
          const isCopied = copiedId === copyKey;

          return (
            <article
              key={`${d.city_id}-${d.rank}`}
              className="card"
              style={{
                border: sel ? "1px solid var(--accent)" : "1px solid var(--line)",
                transition: "all .25s ease",
                overflow: "hidden",
                boxShadow: sel ? "0 10px 30px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {/* Header Bar */}
              <div
                onClick={() => setOpen(sel ? null : d.rank)}
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  background: sel ? "color-mix(in oklch, var(--surface-2) 90%, transparent)" : "var(--surface)",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: d.category_hex,
                      border: `1.5px solid ${d.category_hex}`,
                      background: `color-mix(in oklch, ${d.category_hex}, transparent 90%)`,
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    0{d.rank}
                  </span>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <b style={{ fontSize: 17, fontFamily: "var(--font-display)" }}>{d.city_name}</b>
                      {d.demo_episode && (
                        <span className="pill" style={{ fontSize: 10, background: "var(--surface-2)", color: "var(--ink-3)" }}>
                          DEMO EPISODE
                        </span>
                      )}
                    </div>
                    <div className="crumb" style={{ fontSize: 11, marginTop: 2 }}>
                      Ward: <b>{d.ward}</b> · Primary Source: <b style={{ color: "var(--accent)" }}>{src}</b>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" }}>
                  <div style={{ textAlign: "right" }}>
                    <div className="figure" style={{ fontSize: 24, fontWeight: 700, color: d.category_hex, lineHeight: 1.1 }}>
                      {d.pm25} <span style={{ fontSize: 11, fontWeight: 400 }}>µg/m³</span>
                    </div>
                    <span className="pill" style={{ fontSize: 10, background: `color-mix(in oklch, ${d.category_hex}, transparent 85%)`, color: d.category_hex, marginTop: 2 }}>
                      CPCB {d.cpcb_category} (AQI {d.cpcb_aqi_range})
                    </span>
                  </div>
                  <span style={{ fontSize: 16, color: "var(--ink-3)", transform: sel ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}>
                    ▼
                  </span>
                </div>
              </div>

              {/* Expanded Details Panel */}
              {sel && (
                <div style={{ padding: "18px 20px 22px", borderTop: "1px solid var(--line)", background: "var(--surface-2)" }}>
                  {/* AI Rationale Box */}
                  <div style={{ padding: 14, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)", marginBottom: 16 }}>
                    <div className="crumb" style={{ color: "var(--accent)", fontSize: 10.5, fontWeight: 700, marginBottom: 4 }}>
                      THREAT DRIVER & ATTRIBUTION RATIONALE
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
                      {d.reason}
                    </p>
                  </div>

                  {/* Dual Grid: Remedies & Schools */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 18 }}>
                    {/* Targeted Remedies */}
                    <div style={{ background: "var(--surface)", padding: 16, borderRadius: 10, border: "1px solid var(--line)" }}>
                      <div className="crumb" style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 10 }}>
                        RECOMMENDED ACTION ORDERS ({d.remedies.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {d.remedies.map((r, i) => (
                          <div key={i} style={{ display: "flex", gap: 10, alignItems: "start", fontSize: 12, lineHeight: 1.5, color: "var(--ink-2)" }}>
                            <span
                              className="pill"
                              style={{
                                fontSize: 9.5,
                                padding: "2px 6px",
                                background: r.type === "school" ? "color-mix(in oklch, var(--aqi-3), transparent 85%)" : "color-mix(in oklch, var(--accent), transparent 85%)",
                                color: r.type === "school" ? "var(--aqi-3)" : "var(--accent)",
                                flex: "none",
                              }}
                            >
                              {r.type.toUpperCase()}
                            </span>
                            <span>{r.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sensitive Schools */}
                    <div style={{ background: "var(--surface)", padding: 16, borderRadius: 10, border: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span className="crumb" style={{ fontSize: 10.5, fontWeight: 700 }}>
                          VULNERABLE SCHOOLS ({d.affected_schools.length})
                        </span>
                        <span className="crumb" style={{ fontSize: 10 }}>
                          {d.n_schools_district.toLocaleString()} in district
                        </span>
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {d.affected_schools.map((s, i) => (
                          <div key={i} style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--line)", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontWeight: 500 }}>🏫 {s.name}</span>
                            {s.block && <span className="crumb" style={{ fontSize: 10 }}>{s.block}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons Footer */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                    <button
                      type="button"
                      className="btn pri"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12 }}
                      onClick={() => {
                        if (d.city_id === "korba" || d.city_id === "jagdalpur") {
                          setCity(d.city_id as CityId);
                        }
                        setView("map");
                      }}
                    >
                      🗺 View on Risk Map
                    </button>

                    <button
                      type="button"
                      className="btn"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12 }}
                      onClick={() => handleCopyOrder(d)}
                    >
                      {isCopied ? "✓ Order Copied!" : "📋 Export Action Order"}
                    </button>

                    <button
                      type="button"
                      className="btn"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12, marginLeft: "auto" }}
                      onClick={() => setView("advisories")}
                    >
                      📢 Dispatch Advisory
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ALERTS */
export function AlertsView() {
  const { city, selectCell, setView } = useApp();
  const { data: priority } = usePriority(city);
  const { data: forecast } = useForecast(city);
  const [read, setRead] = useState<Set<string>>(new Set());

  // Alerts are DERIVED from real forecast exceedances — not a hand-written list.
  const alerts = useMemo(() => {
    if (!priority || !forecast) return [];
    const thr = priority.threshold_ug_m3;
    return priority.dossiers
      .filter((d) => d.predicted_pm25 > thr)
      .map((d) => {
        const cell = forecast.cells.find((c) => c.c === d.cell);
        const peak = cell ? Math.max(...cell.v) : d.predicted_pm25;
        const peakIdx = cell ? cell.v.indexOf(peak) : 0;
        return {
          id: d.cell,
          ward: d.ward,
          severity: peak > 120 ? "Very poor" : peak > 90 ? "Poor" : "Moderate",
          color: bandFor(peak).hex,
          peak,
          when: forecast.timestamps[peakIdx]?.slice(0, 16) ?? "",
          people: d.population_affected,
          sites: d.vulnerable_sites,
          source: d.top_source,
        };
      })
      .sort((a, b) => b.peak - a.peak);
  }, [priority, forecast]);

  return (
    <div className="section">
      <Head
        crumb="Act / Alerts"
        title="Threshold & forecast alerts"
        sub={`${alerts.length} active · derived from the forecast field crossing ${priority?.threshold_ug_m3 ?? 60} µg/m³`}
      />

      {alerts.length === 0 ? (
        <div className="card" style={{ padding: 20 }}>
          <span className="sub">
            No cell is forecast to exceed the standard in this window. Nothing to raise.
          </span>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`alert-row${read.has(a.id) ? "" : " unread"}`}
              onClick={() => {
                setRead((s) => new Set(s).add(a.id));
                selectCell(a.id);
                setView("map");
              }}
            >
              <span
                style={{ width: 9, height: 9, borderRadius: "50%", background: a.color, flex: "none" }}
              />
              <span style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>{a.ward}</b>
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>
                  Forecast peak {a.peak} µg/m³ at {a.when} · {a.source}-driven ·{" "}
                  {a.people.toLocaleString()} residents, {a.sites} schools/hospitals
                </span>
              </span>
              <span
                className="pill"
                style={{ background: `color-mix(in oklch, ${a.color}, transparent 86%)`, color: a.color }}
              >
                {a.severity}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- NETWORK */
export function NetworkView() {
  const { city } = useApp();
  const { data: stations } = useStations(city);
  const { data: metrics } = useMetrics(city);

  return (
    <div className="section">
      <Head
        crumb="System / Sensor Network"
        title="Ground station health"
        sub={`${metrics?.dataset.stations ?? "—"} CPCB stations statewide · ${stations?.stations.length ?? 0} in ${city}`}
      />

      {!stations?.has_stations ? (
        <div className="card" style={{ padding: 24, textAlign: "center" }}>
          <div className="disp" style={{ fontSize: 22 }}>
            Zero ground sensors
          </div>
          <p className="sub" style={{ maxWidth: "48ch", margin: "10px auto 0" }}>
            {stations?.note ??
              "This city has no CPCB monitoring station. Every value shown for it is predicted."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {stations.stations.map((s) => {
            const band = bandFor(s.latest_pm25 ?? 0);
            const fresh =
              s.latest_time != null && new Date(s.latest_time) > new Date("2025-06-01");
            return (
              <div
                key={s.station_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "15px 16px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className={fresh ? "live-dot" : ""}
                  style={
                    fresh
                      ? undefined
                      : { width: 7, height: 7, borderRadius: "50%", background: "var(--ink-3)" }
                  }
                />
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{s.name}</b>
                  <span className="figure" style={{ display: "block", fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>
                    {s.station_id} · {s.lat.toFixed(4)}, {s.lon.toFixed(4)} · last{" "}
                    {s.latest_time?.slice(0, 10) ?? "—"}
                  </span>
                </span>
                <span
                  className="pill"
                  style={{
                    background: s.use_in_training
                      ? "color-mix(in oklch, var(--aqi-1), transparent 88%)"
                      : "color-mix(in oklch, var(--aqi-5), transparent 88%)",
                    color: s.use_in_training ? "var(--aqi-1)" : "var(--aqi-5)",
                  }}
                >
                  {s.use_in_training ? "in training" : "excluded"}
                </span>
                <span className="figure" style={{ fontSize: 15, color: band.hex, width: 62, textAlign: "right" }}>
                  {s.latest_pm25 ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- REPORTS */
export function ReportsView() {
  const { city } = useApp();
  const { data: priority } = usePriority(city);
  const { data: metrics } = useMetrics(city);
  const { data: stations } = useStations(city);
  const [done, setDone] = useState<string | null>(null);

  // Export runs entirely in the browser from the already-loaded bake — no API.
  function download(name: string, text: string, mime: string) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    setDone(name);
  }

  function dossiersCsv() {
    if (!priority) return;
    const head = [
      "rank", "ward", "cell", "lat", "lon", "predicted_pm25", "exceedance_over_60",
      "top_source", "population_affected", "vulnerable_sites", "named_upwind_source",
      "confidence", "recommended_action",
    ];
    const rows = priority.dossiers.map((d) =>
      [
        d.rank, d.ward, d.cell, d.lat, d.lon, d.predicted_pm25, d.exceedance_over_60,
        d.top_source, d.population_affected, d.vulnerable_sites,
        d.named_upwind_source ?? "", d.confidence, d.recommended_action,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    download(`vayu_${city}_dossiers.csv`, [head.join(","), ...rows].join("\n"), "text/csv");
  }

  function stationsCsv() {
    if (!stations) return;
    const head = ["station_id", "name", "lat", "lon", "latest_pm25", "latest_time", "use_in_training"];
    const rows = stations.stations.map((s) =>
      [s.station_id, s.name, s.lat, s.lon, s.latest_pm25 ?? "", s.latest_time ?? "", s.use_in_training]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    download(`vayu_${city}_stations.csv`, [head.join(","), ...rows].join("\n"), "text/csv");
  }

  return (
    <div className="section">
      <Head
        crumb="System / Reports & Export"
        title="Compliance export"
        sub="Everything exports from the baked bundle already in the browser — works with the network off."
      />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>Enforcement dossiers</h3>
          <p className="sub">
            {priority?.dossiers.length ?? 0} ranked wards with action, exposure and attribution.
          </p>
          <ShinyButton className="btn pri" style={{ marginTop: 14 }} onClick={dossiersCsv}>
            Export CSV
          </ShinyButton>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>Station register</h3>
          <p className="sub">{stations?.stations.length ?? 0} stations with latest reading and training flag.</p>
          <ShinyButton className="btn" style={{ marginTop: 14 }} onClick={stationsCsv}>
            Export CSV
          </ShinyButton>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>Model metrics</h3>
          <p className="sub">RMSE vs persistence and CAMS, LOSO, dataset provenance.</p>
          <ShinyButton
            className="btn"
            style={{ marginTop: 14 }}
            onClick={() =>
              metrics &&
              download(`vayu_${city}_metrics.json`, JSON.stringify(metrics, null, 2), "application/json")
            }
          >
            Export JSON
          </ShinyButton>
        </div>
      </div>

      {done && (
        <div className="card" style={{ padding: 14, marginTop: 16 }}>
          <span className="figure" style={{ fontSize: 12, color: "var(--aqi-1)" }}>
            ✓ downloaded {done}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---- small presentational helpers used by the district panel ---- */
function Rowk({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
      <dt style={{ color: "var(--ink-2)" }}>{k}</dt>
      <dd className="figure" style={{ textAlign: "right" }}>{v}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="crumb" style={{ marginBottom: 8 }}>{t(title)}</div>
      {children}
    </div>
  );
}
