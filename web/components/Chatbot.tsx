"use client";

import { useEffect, useRef, useState } from "react";

import { useDistricts } from "@/components/DistrictMap";
import { useLive, useMetrics, usePriority } from "@/lib/data";
import { aqiCss, aqiLabel } from "@/lib/aqiScale";

/**
 * VAYU assistant.
 *
 * Two-tier by design:
 *  1. If GROQ_API_KEY is set, /api/chat asks Groq — but the model is handed the
 *     dashboard's real numbers as context and instructed to answer only from
 *     them, never to estimate.
 *  2. With no key, no network, or a bad completion, it falls back to the
 *     deterministic lookups below.
 *
 * Either way an answer traces to measured data, and the assistant still works
 * at a demo with the wifi down.
 */

interface Msg {
  role: "user" | "bot";
  text: string;
  chips?: string[];
  pending?: boolean;
}

const GREETING =
  "Hi — I'm the VAYU assistant. Ask me about any Chhattisgarh district or modelled city: air quality, what's driving it, who's exposed, or how the model performs.";

const SUGGESTIONS = [
  "Air quality in Korba",
  "Which district is worst?",
  "How accurate is the model?",
  "Where has no sensor?",
  "Top enforcement priority",
];

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: GREETING, chips: SUGGESTIONS }]);
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");
  const { data: priority } = usePriority("korba");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  function answer(raw: string): string {
    const s = raw.toLowerCase().trim();
    if (!s) return "Ask me about a district, a city, or the model.";

    // --- named place lookup (districts first, then modelled cities) ---
    const d = districts?.features.find((f) => s.includes(f.properties.name.toLowerCase()));
    const c = districts?.cities?.find((x) => s.includes(x.name.toLowerCase()));
    const lc = live?.find((x) => s.includes(x.name.toLowerCase()));

    if (d || c) {
      const p = d?.properties;
      if (p) {
        const drv = Object.entries(p.shares ?? {}).sort((a, b) => b[1] - a[1])[0];
        const meas = p.measured?.pm25;
        return [
          `**${p.name}** — predicted PM2.5 ${p.pm25} µg/m³ (AQI ${p.us_aqi}, ${aqiLabel(p.us_aqi)}).`,
          meas != null
            ? `Its ${p.n_stations} CPCB station${p.n_stations > 1 ? "s" : ""} last measured ${meas} µg/m³.`
            : `It has no ground sensor — that figure is predicted from satellite, meteorology and emissions geography.`,
          drv ? `Main driver: ${drv[0]} (${Math.round(drv[1] * 100)}% of the model's source attribution).` : "",
          `Population in the district: ${p.population.toLocaleString()}.`,
        ]
          .filter(Boolean)
          .join(" ");
      }
      if (c) {
        const l = live?.find((x) => x.city_id === c.id);
        return [
          `**${c.name}** — model predicts ${c.pm25} µg/m³ (AQI ${c.us_aqi}).`,
          l?.measured_pm25_24h != null
            ? `Live CPCB stations there read ${l.measured_pm25_24h} µg/m³ over the last 24 h (AQI ${l.measured_us_aqi}).`
            : c.has_stations
              ? ""
              : `It has no ground sensor at all — this is the zero-station prediction.`,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    if (lc) {
      return `**${lc.name}** live: ${lc.measured_pm25_24h ?? lc.current_pm25} µg/m³, AQI ${
        lc.measured_us_aqi ?? lc.current_us_aqi
      }${lc.measured ? ` from ${lc.n_stations} CPCB station(s)` : " (CAMS model — no station here)"}.`;
    }

    // --- superlatives ---
    if (/(worst|highest|most pollut|dangerous)/.test(s) && districts) {
      const top = [...districts.features].sort((a, b) => b.properties.us_aqi - a.properties.us_aqi)[0];
      return `Worst right now is **${top.properties.name}** at AQI ${top.properties.us_aqi} (${top.properties.pm25} µg/m³, ${aqiLabel(top.properties.us_aqi)}), affecting ${top.properties.population.toLocaleString()} people.`;
    }
    if (/(cleanest|best|lowest)/.test(s) && districts) {
      const low = [...districts.features].sort((a, b) => a.properties.us_aqi - b.properties.us_aqi)[0];
      return `Cleanest is **${low.properties.name}** at AQI ${low.properties.us_aqi} (${low.properties.pm25} µg/m³).`;
    }

    // --- model performance ---
    if (/(accura|rmse|perform|how good|validat|baseline|cams|benchmark)/.test(s) && metrics) {
      const h = metrics.forecast_vs_baselines.find((x) => x.horizon_h === 24);
      return `At 24 h the model's RMSE is ${h?.model_rmse} µg/m³ — ${h?.vs_persistence_pct}% better than persistence and ${h?.vs_cams_bc_pct}% better than bias-corrected CAMS. Predicting a station it has never seen (leave-one-station-out) it still gets ${metrics.zero_station_loso.rmse_satellite_subset} µg/m³, beating CAMS by ${metrics.zero_station_loso.beats_cams_by_pct}%. Trained on ${metrics.dataset.pooled_target_rows?.toLocaleString()} station-hours from ${metrics.dataset.stations} stations.`;
    }

    // --- zero-station ---
    if (/(no sensor|zero.?station|without sensor|unmonitored|jagdalpur)/.test(s) && districts) {
      const none = districts.features.filter((f) => f.properties.n_stations === 0).length;
      return `${none} of ${districts.features.length} districts have no CPCB station — including Bastar, where Jagdalpur sits. Their air quality is predicted entirely from satellite, weather and emissions geography, and the leave-one-station-out test says that holds up to ${metrics?.zero_station_loso.rmse_satellite_subset ?? "~20"} µg/m³ RMSE.`;
    }

    // --- enforcement ---
    if (/(enforce|priorit|inspect|action|dossier|ward)/.test(s) && priority?.dossiers?.[0]) {
      const t = priority.dossiers[0];
      return `Top priority is **${t.ward}** — forecast ${t.predicted_pm25} µg/m³, ${t.top_source}-driven, ${t.population_affected.toLocaleString()} residents and ${t.vulnerable_sites} schools/hospitals exposed.${t.named_upwind_source ? ` Nearest upwind source: ${t.named_upwind_source}.` : ""}`;
    }

    // --- data provenance ---
    if (/(data|source|where.*from|dataset)/.test(s)) {
      return "Everything here is measured: CPCB station hours via OpenAQ, Open-Meteo weather + CAMS, Sentinel-5P and MODIS columns, EDGAR v8.1 emissions, WorldPop and the Global Power Plant Database. Nothing on this dashboard is simulated.";
    }

    return "I can answer from the baked pipeline data only — try a district name (e.g. Korba, Raigarh, Bastar), \"which district is worst\", \"how accurate is the model\", or \"top enforcement priority\". I'd rather say I don't know than invent a number.";
  }

  // Compact snapshot of exactly what is on screen — this is all the LLM may use.
  function buildContext() {
    return {
      generated_at: districts?.meta_live?.origin ?? null,
      mode: districts?.meta_live?.mode ?? null,
      districts: (districts?.features ?? []).map((f) => {
        const p = f.properties;
        return {
          name: p.name,
          pm25: p.display_pm25 ?? p.pm25,
          us_aqi: p.display_aqi ?? p.us_aqi,
          basis: p.display_basis,
          n_stations: p.n_stations,
          population: p.population,
          top_source: Object.entries(p.shares ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0],
        };
      }),
      cities: districts?.cities ?? [],
      live_city_readings: live ?? [],
      model_metrics: metrics ?? null,
      top_dossiers: (priority?.dossiers ?? []).slice(0, 3),
    };
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: "user", text: t }, { role: "bot", text: "…", pending: true }]);
    setQ("");

    let reply: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, context: buildContext(), history }),
      });
      const j = await res.json();
      if (j?.ok && j.text) reply = j.text as string;
    } catch {
      /* fall through to the local answer */
    }
    // No key, no network, or a bad completion -> deterministic grounded answer.
    setMsgs((m) => [...m.filter((x) => !x.pending), { role: "bot", text: reply ?? answer(t) }]);
  }

  const render = (t: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? (
        <b key={i} style={{ color: "var(--accent)" }}>
          {part.slice(2, -2)}
        </b>
      ) : (
        <span key={i}>{part}</span>
      ),
    );

  return (
    <>
      {/* launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        style={{
          position: "fixed",
          right: 22,
          bottom: 22,
          zIndex: 60,
          width: 54,
          height: 54,
          borderRadius: "50%",
          border: 0,
          cursor: "pointer",
          background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
          color: "#fff",
          fontSize: 22,
          boxShadow: "0 14px 34px -10px var(--accent)",
          display: "grid",
          placeItems: "center",
          transition: "transform .28s cubic-bezier(.34,1.56,.64,1)",
          transform: open ? "scale(.92) rotate(90deg)" : "scale(1)",
        }}
      >
        {open ? "✕" : "◕"}
      </button>

      {/* panel */}
      <div
        className="card"
        style={{
          position: "fixed",
          right: 22,
          bottom: 88,
          zIndex: 60,
          width: "min(380px, calc(100vw - 44px))",
          height: 500,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transformOrigin: "bottom right",
          transition: "opacity .26s ease, transform .3s cubic-bezier(.34,1.56,.64,1)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : "scale(.9) translateY(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          style={{
            padding: "13px 16px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontSize: 14,
            }}
          >
            ◕
          </span>
          <div>
            <b style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>VAYU assistant</b>
            <div className="crumb" style={{ fontSize: 9 }}>
              answers from measured data only
            </div>
          </div>
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div
                style={{
                  maxWidth: "88%",
                  marginLeft: m.role === "user" ? "auto" : 0,
                  background: m.role === "user" ? "var(--accent)" : "var(--surface-2)",
                  color: m.role === "user" ? "#fff" : "var(--ink)",
                  border: m.role === "user" ? "0" : "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "9px 12px",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                {m.pending ? <span className="typing">● ● ●</span> : render(m.text)}
              </div>
              {m.chips && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                  {m.chips.map((c) => (
                    <button key={c} className="chip" style={{ fontSize: 11 }} onClick={() => send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(q)}
            placeholder="Ask about a district or the model…"
            aria-label="Ask the assistant"
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              color: "var(--ink)",
              fontFamily: "inherit",
              fontSize: 12.5,
              outline: "none",
            }}
          />
          <button className="btn pri" style={{ padding: "9px 14px" }} onClick={() => send(q)}>
            ↑
          </button>
        </div>
      </div>
    </>
  );
}
