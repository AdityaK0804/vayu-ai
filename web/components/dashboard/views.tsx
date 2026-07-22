"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";

import ShinyButton from "@/components/magicui/shiny-button";
import { useDistricts, useIndiaIndex, type DistrictProps } from "@/lib/districts";
import MapWorkspace from "@/components/dashboard/MapWorkspace";
import SelectionBar from "@/components/dashboard/SelectionBar";
import type { CityPoint } from "@/lib/districts";
import { AQI_BANDS, aqiCss, aqiLabel } from "@/lib/aqiScale";
import type { CityId } from "@/lib/types";
import { BANDS, SOURCE_LABEL, bandFor } from "@/lib/aqi";
import {
  useAttribution,
  useForecast,
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
  const { city, setView } = useApp();
  const { data: metrics } = useMetrics(city);
  const { data: priority } = usePriority(city);
  const { data: stations } = useStations(city);
  const { data: live } = useLive();

  const h24 = metrics?.forecast_vs_baselines.find((h) => h.horizon_h === 24);
  const cityLive = live?.find((l) => l.city_id === city);
  const band = bandFor(cityLive?.current_pm25 ?? 0);

  return (
    <div className="section">
      <Head
        crumb="Monitor / Overview"
        title={`${city[0].toUpperCase()}${city.slice(1)} command overview`}
        sub="Every figure below is measured from the pipeline — nothing on this screen is simulated."
      />

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi
          lab="Live PM2.5"
          val={cityLive?.current_pm25 ?? "—"}
          unit="µg/m³"
          delta={cityLive ? `AQI ${cityLive.current_us_aqi} · ${band.label}` : undefined}
          deltaColor={band.hex}
        />
        <Kpi
          lab="Forecast RMSE @24h"
          val={h24?.model_rmse ?? "—"}
          unit="µg/m³"
          delta={h24?.vs_cams_bc_pct != null ? `▼ ${h24.vs_cams_bc_pct}% vs CAMS` : undefined}
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
          lab="Cells over standard"
          val={priority ? priority.cells_over_threshold.toLocaleString() : "—"}
          unit={priority ? `/ ${priority.cells_scored.toLocaleString()}` : ""}
          delta={priority ? `${priority.threshold_ug_m3} µg/m³ CPCB` : undefined}
          deltaColor="var(--aqi-4)"
        />
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
            <h3>Top enforcement target</h3>
            <span className="ai-badge">AI RANKED</span>
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            {priority?.dossiers[0] ? (
              <>
                <div className="figure" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {priority.dossiers[0].ward}
                </div>
                <div
                  className="disp"
                  style={{ fontSize: 30, marginTop: 6, color: bandFor(priority.dossiers[0].predicted_pm25).hex }}
                >
                  {priority.dossiers[0].predicted_pm25}
                  <span className="unit"> µg/m³</span>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 10 }}>
                  {priority.dossiers[0].recommended_action}
                </p>
                <ShinyButton className="btn pri" style={{ marginTop: 14 }} onClick={() => setView("interventions")}>
                  Open dossier →
                </ShinyButton>
              </>
            ) : (
              <span className="sub">No dossiers.</span>
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
              ["Stations in this city", String(stations?.stations.length ?? 0)],
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
  const { city } = useApp();
  const { data: forecast } = useForecast(city);
  const { data: metrics } = useMetrics(city);
  const [h, setH] = useState<24 | 48 | 72>(24);

  const sf = forecast?.station_forecast?.filter((s) => s.horizon_h === h) ?? [];
  const frames = forecast?.timestamps ?? [];
  const cells = useMemo(() => selectFrame(forecast, 0), [forecast]);
  const cityMean =
    cells.length > 0 ? Math.round(cells.reduce((a, c) => a + c.pm25, 0) / cells.length) : null;

  return (
    <div className="section">
      <Head
        crumb="Monitor / AI Forecast"
        title="72-hour PM2.5 forecast"
        sub={`${forecast?.grid_model ?? ""} across the grid · ${forecast?.station_forecast_model ?? "trained model"} at stations`}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="seg">
          {([24, 48, 72] as const).map((x) => (
            <button key={x} className={h === x ? "on" : ""} onClick={() => setH(x)}>
              +{x}h
            </button>
          ))}
        </div>
      </div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi lab="Frames" val={frames.length} unit={`× ${forecast?.frame_step_hours ?? 6}h`} />
        <Kpi lab="Grid mean (T+0)" val={cityMean ?? "—"} unit="µg/m³" />
        <Kpi
          lab={`RMSE @${h}h`}
          val={metrics?.forecast_vs_baselines.find((x) => x.horizon_h === h)?.model_rmse ?? "—"}
          unit="µg/m³"
          accent
        />
        <Kpi
          lab={`Beats CAMS @${h}h`}
          val={metrics?.forecast_vs_baselines.find((x) => x.horizon_h === h)?.vs_cams_bc_pct ?? "—"}
          unit="%"
          accent
        />
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Station forecast vs measured</h3>
          <span className="sub">the trained lag model at real CPCB stations</span>
        </div>
        <div style={{ padding: "14px 18px 18px" }}>
          {sf.length === 0 && (
            <p className="sub">
              No station forecast at this horizon — this city has no ground station (that is the
              point of the zero-station reveal).
            </p>
          )}
          {sf.map((s) => {
            const err = s.actual_pm25 != null ? Math.abs(s.pred_pm25 - s.actual_pm25) : null;
            const max = Math.max(s.pred_pm25, s.actual_pm25 ?? 0, 1);
            return (
              <div key={s.cell + s.horizon_h} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span className="figure" style={{ color: "var(--ink-3)" }}>
                    {s.cell.slice(4, 11)} · valid {s.valid_time.slice(0, 16)}
                  </span>
                  {err != null && (
                    <span className="figure" style={{ color: err < 15 ? "var(--aqi-1)" : "var(--aqi-4)" }}>
                      err {err.toFixed(1)}
                    </span>
                  )}
                </div>
                {[
                  ["predicted", s.pred_pm25, "var(--accent)"],
                  ["measured", s.actual_pm25, "var(--ink-3)"],
                ].map(([lab, v, col]) => (
                  <div key={lab as string} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                    <span style={{ width: 66, fontSize: 11, color: "var(--ink-2)" }}>{lab as string}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: 4 }}>
                      <div
                        style={{
                          width: `${((v as number) / max) * 100}%`,
                          height: "100%",
                          background: col as string,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span className="figure" style={{ width: 44, textAlign: "right", fontSize: 12 }}>
                      {v ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- INTERVENTIONS */
export function InterventionsView() {
  const { city, selectedCell, selectCell, setView } = useApp();
  const { data: priority } = usePriority(city);

  return (
    <div className="section">
      <Head
        crumb="Act / Intervention Engine"
        title="Ranked enforcement dossiers"
        sub={
          priority
            ? `${priority.cells_over_threshold.toLocaleString()} of ${priority.cells_scored.toLocaleString()} cells over ${priority.threshold_ug_m3} µg/m³ · signal→dossier ${priority.signal_to_dossier_seconds}s`
            : undefined
        }
      />

      {priority?.cells_over_threshold === 0 && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 16, borderColor: "color-mix(in oklch,var(--accent),transparent 60%)" }}
        >
          <span className="sub">
            No cell exceeds the standard in this window — these are ranked for context, not
            enforcement.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {priority?.dossiers.map((d) => {
          const sel = d.cell === selectedCell;
          const band = bandFor(d.predicted_pm25);
          return (
            <button
              key={d.cell}
              className={`interv${sel ? " sel" : ""}`}
              onClick={() => selectCell(sel ? null : d.cell)}
            >
              <span className="rank" style={{ color: band.hex }}>
                {d.rank}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontFamily: "var(--font-display)", fontSize: 15 }}>{d.ward}</b>
                  <span
                    className="pill"
                    style={{
                      background: `color-mix(in oklch, ${band.hex}, transparent 86%)`,
                      color: band.hex,
                    }}
                  >
                    {d.predicted_pm25} µg/m³
                  </span>
                  <span className="pill" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
                    {SOURCE_LABEL[d.top_source] ?? d.top_source}
                  </span>
                  {d.edgar_agreement.match && (
                    <span className="pill" style={{ background: "var(--surface-2)", color: "var(--aqi-1)" }}>
                      EDGAR ✓
                    </span>
                  )}
                </span>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>
                  {d.recommended_action}
                </p>
                <span className="row">
                  {d.population_affected.toLocaleString()} residents · {d.vulnerable_sites}{" "}
                  schools/hospitals · confidence {(d.confidence * 100).toFixed(0)}%
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <span className="figure" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  score
                </span>
                <span className="disp" style={{ display: "block", fontSize: 18 }}>
                  {(d.priority_score / 1e6).toFixed(1)}M
                </span>
                <span
                  className="chip"
                  style={{ marginTop: 8, display: "inline-block" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectCell(d.cell);
                    setView("map");
                  }}
                >
                  View on map
                </span>
              </span>
            </button>
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
