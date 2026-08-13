"use client";

import { useEffect, useRef, useState } from "react";

import { useDistricts } from "@/lib/districts";
import { useLive, useMetrics, usePriority } from "@/lib/data";
import { cpcbAqiFromPm25, cpcbPm25Label } from "@/lib/aqiScale";
import { useT, useLangStore, type Lang } from "@/lib/i18n";

/**
 * VAYU Assistant — visuals ported 1:1 from the design's initChat() in
 * index.dc.html (launcher, gradient header, bubble geometry, chips, composer).
 *
 * The design's ANSWERS are hard-coded placeholders ("Korba AQI 312",
 * "94.2% accuracy", "4 active alerts"). Those are not real, so only the shell
 * is taken. Replies come from:
 *   1. Groq via /api/chat when GROQ_API_KEY is set — handed the dashboard's real
 *      numbers as context and told never to estimate; or
 *   2. deterministic lookups over the same baked data, when there is no key,
 *      no network, or a bad completion.
 */

interface Msg {
  role: "user" | "bot";
  text: string;
  chips?: string[];
  pending?: boolean;
  model?: string;
}

const GREETING: Record<Lang, string> = {
  en: "Namaste! 🌱 I'm <b>Vayu Assist</b>. How can I help with the region's air today?",
  hi: "नमस्ते! 🌱 मैं <b>Vayu Assist</b> हूँ। आज क्षेत्र की हवा के बारे में कैसे मदद करूँ?",
};

const CHIPS = ["Korba AQI", "72h forecast", "Worst district", "Recommend actions"];

const BUBBLE_ICON = (
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
);
const CLOSE_ICON = <path d="M18 6 6 18M6 6l12 12" />;

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { t } = useT();
  const { lang, setLang } = useLangStore();

  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");
  const { data: priority } = usePriority("korba");

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, open]);

  // greet on first open, exactly as the design does
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ role: "bot", text: GREETING[lang], chips: CHIPS.map((c) => t(c)) }]);
    }
  }, [open, msgs.length, lang, t]);

  // switching language mid-conversation re-greets rather than leaving a
  // half-English, half-Hindi thread on screen
  useEffect(() => {
    if (msgs.length > 0) setMsgs([{ role: "bot", text: GREETING[lang], chips: CHIPS.map((c) => t(c)) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /* ----------------------------------------------------- grounded answers */
  function answer(raw: string): string {
    const s = raw.toLowerCase().trim();
    if (!s) return "Ask me about a district, a city, or the model.";

    if (/^(hi|hello|hey|namaste)/.test(s))
      return "Namaste! Ask me about air quality in any Chhattisgarh district or city, how the model performs, or where enforcement should go first.";

    const d = districts?.features.find((f) => s.includes(f.properties.name.toLowerCase()));
    const c = districts?.cities?.find((x) => s.includes(x.name.toLowerCase()));

    if (d) {
      const p = d.properties;
      const pm = p.display_pm25 ?? p.pm25;
      const aq = cpcbAqiFromPm25(pm) ?? p.display_aqi ?? p.us_aqi;
      const drv = Object.entries(p.shares ?? {}).sort((a, b) => b[1] - a[1])[0];
      return [
        `<b>${p.name}</b> is at <b>${pm} µg/m³ (CPCB AQI ${aq}, ${cpcbPm25Label(pm)})</b>.`,
        p.display_basis === "measured"
          ? `That is measured live by ${p.live_stations} CPCB station${p.live_stations > 1 ? "s" : ""}.`
          : `There is no ground sensor here — it is predicted from satellite, meteorology and emissions geography.`,
        drv ? `Main driver: <b>${drv[0]}</b> (${Math.round(drv[1] * 100)}% of attribution).` : "",
        `Population ${p.population.toLocaleString()}.`,
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (c) {
      const l = live?.find((x) => x.city_id === c.id);
      return [
        `<b>${c.name}</b> — model predicts <b>${c.pm25} µg/m³ (CPCB AQI ${cpcbAqiFromPm25(c.pm25) ?? c.us_aqi})</b>.`,
        l?.measured_pm25_24h != null
          ? `Live CPCB stations read ${l.measured_pm25_24h} µg/m³ over 24 h (AQI ${l.measured_us_aqi}).`
          : c.has_stations
            ? ""
            : `It has no ground sensor at all — this is the zero-station prediction.`,
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (/(worst|highest|most pollut|dangerous)/.test(s) && districts) {
      const t = [...districts.features].sort(
        (a, b) => (b.properties.display_aqi ?? 0) - (a.properties.display_aqi ?? 0),
      )[0].properties;
      return `Worst right now is <b>${t.name}</b> at <b>AQI ${t.display_aqi}</b> (${t.display_pm25} µg/m³), affecting ${t.population.toLocaleString()} people.`;
    }
    if (/(cleanest|best|lowest)/.test(s) && districts) {
      const t = [...districts.features].sort(
        (a, b) => (a.properties.display_aqi ?? 0) - (b.properties.display_aqi ?? 0),
      )[0].properties;
      return `Cleanest is <b>${t.name}</b> at <b>AQI ${t.display_aqi}</b> (${t.display_pm25} µg/m³).`;
    }
    if (/(forecast|predict|72|tomorrow|accura|rmse|perform)/.test(s) && metrics) {
      const h = metrics.forecast_vs_baselines.find((x) => x.horizon_h === 24);
      return `The model forecasts <b>72 hours ahead</b>. At 24 h its RMSE is <b>${h?.model_rmse} µg/m³</b> — ${h?.vs_persistence_pct}% better than persistence and ${h?.vs_cams_bc_pct}% better than bias-corrected CAMS. On a station it has never seen it still reaches ${metrics.zero_station_loso.rmse_satellite_subset} µg/m³.`;
    }
    if (/(no sensor|zero.?station|unmonitored|jagdalpur)/.test(s) && districts) {
      const none = districts.features.filter((f) => f.properties.n_stations === 0).length;
      return `<b>${none} of ${districts.features.length}</b> districts have no CPCB station — including Bastar, where Jagdalpur sits. Their air quality is predicted entirely from satellite, weather and emissions data.`;
    }
    if (/(alert|warning)/.test(s) && priority) {
      return `<b>${priority.cells_over_threshold.toLocaleString()}</b> of ${priority.cells_scored.toLocaleString()} cells are forecast over the ${priority.threshold_ug_m3} µg/m³ standard in Korba. The Alerts view lists each one.`;
    }
    if (/(interven|action|reduce|fix|enforce|priorit|inspect)/.test(s) && priority?.dossiers?.[0]) {
      const t = priority.dossiers[0];
      return `Top priority is <b>${t.ward}</b> — forecast ${t.predicted_pm25} µg/m³, ${t.top_source}-driven, ${t.population_affected.toLocaleString()} residents and ${t.vulnerable_sites} schools/hospitals exposed.${t.named_upwind_source ? ` Nearest upwind source: ${t.named_upwind_source}.` : ""}`;
    }
    if (/(data|source|where.*from|dataset)/.test(s)) {
      return "Everything is measured: CPCB stations via OpenAQ, Open-Meteo weather + CAMS, Sentinel-5P and MODIS, EDGAR v8.1, WorldPop and the Global Power Plant Database. Nothing here is simulated.";
    }
    return 'I can help with live AQI, 72h forecasts, source attribution and enforcement priorities. Try a district like <b>Korba</b> or <b>Raigarh</b>, or ask "which district is worst". I would rather say I do not know than invent a number.';
  }

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
    const t2 = text.trim();
    if (!t2) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.text }));
    setMsgs((m) => [...m, { role: "user", text: t2 }, { role: "bot", text: t("typing…"), pending: true }]);
    setQ("");

    let reply: string | null = null;
    let modelName: string | undefined = undefined;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t2, context: buildContext(), history, lang }),
      });
      const j = await res.json();
      if (j?.ok && j.text) {
        reply = String(j.text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
        modelName = j.model ?? "gemini-2.0-flash";
      } else if (j?.reason || j?.detail || j?.hint) {
        const errorDetail = j?.detail ? (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail)) : j?.hint ?? j?.reason;
        reply = `⚠️ <b>Gemini API Note (${j?.status || j?.reason})</b>: ${errorDetail}`;
      }
    } catch (err) {
      console.warn("[Vayu Assist Fetch Error]:", err);
    }
    setMsgs((m) => [
      ...m.filter((x) => !x.pending),
      { role: "bot", text: reply ?? answer(t2), model: reply && !reply.startsWith("⚠️") ? modelName : undefined },
    ]);
  }

  /* --------------------------------------------------------------- render */
  return (
    <>
      <button
        id="vayuChatBtn"
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 9998,
          width: 60,
          height: 60,
          border: 0,
          borderRadius: "50%",
          cursor: "pointer",
          background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
          boxShadow:
            "0 14px 34px -10px var(--accent), 0 0 0 6px color-mix(in oklch,var(--accent),transparent 86%)",
          display: "grid",
          placeItems: "center",
          transition: "transform .25s cubic-bezier(.34,1.56,.64,1)",
          transform: open ? "scale(.9)" : "scale(1)",
        }}
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? CLOSE_ICON : BUBBLE_ICON}
        </svg>
      </button>

      <div
        id="vayuChatPanel"
        style={{
          position: "fixed",
          right: 24,
          bottom: 96,
          zIndex: 9998,
          width: "min(370px, calc(100vw - 32px))",
          height: "min(520px, calc(100vh - 140px))",
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 20,
          boxShadow: "0 30px 70px -24px rgba(0,0,0,.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transformOrigin: "bottom right",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(14px) scale(.94)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .25s ease, transform .25s cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        {/* gradient header */}
        <div
          style={{
            padding: "16px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
            color: "#fff",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: "rgba(255,255,255,.18)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
            }}
          >
            ✦
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>
              Vayu Assist
            </div>
            <div
              style={{
                fontSize: 11,
                opacity: 0.9,
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#7CFFB2",
                  boxShadow: "0 0 6px #7CFFB2",
                }}
              />
              Online · Powered by Gemini ✨
            </div>
          </div>
          <div style={{ display: "flex", gap: 3, marginRight: 4 }}>
            {(["en", "hi"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                style={{
                  border: 0,
                  borderRadius: 7,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: lang === l ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.10)",
                  color: "#fff",
                }}
              >
                {l === "en" ? "EN" : "हिं"}
              </button>
            ))}
          </div>
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            style={{
              width: 30,
              height: 30,
              border: 0,
              borderRadius: 9,
              background: "rgba(255,255,255,.16)",

              color: "#fff",
              cursor: "pointer",
              fontSize: 17,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* messages */}
        <div
          ref={bodyRef}
          className="thin-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13.5,
          }}
        >
          {msgs.map((m, i) => {
            const me = m.role === "user";
            return (
              <div key={i} style={{ display: "contents" }}>
                <div style={{ display: "flex", flexDirection: "column", alignSelf: me ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                  <div
                    style={{
                      padding: "10px 13px",
                      borderRadius: 14,
                      lineHeight: 1.5,
                      background: me ? "var(--ink)" : "var(--surface-2)",
                      color: me ? "var(--bg)" : "var(--ink)",
                      border: me ? "0" : "1px solid var(--line)",
                      borderBottomRightRadius: me ? 4 : 14,
                      borderBottomLeftRadius: me ? 14 : 4,
                      opacity: m.pending ? 0.6 : 1,
                    }}
                    dangerouslySetInnerHTML={{ __html: m.text }}
                  />
                  {!me && m.model && (
                    <div
                      style={{
                        fontSize: 10,
                        opacity: 0.65,
                        marginTop: 3,
                        marginLeft: 4,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: "monospace",
                      }}
                    >
                      <span style={{ color: "var(--accent, #3B82F6)" }}>✨</span> {m.model}
                    </div>
                  )}
                </div>
                {m.chips && (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 7, alignSelf: "flex-start" }}
                  >
                    {m.chips.map((t) => (
                      <button
                        key={t}
                        onClick={() => send(t)}
                        style={{
                          padding: "7px 12px",
                          borderRadius: 100,
                          border: "1px solid color-mix(in oklch,var(--accent),transparent 60%)",
                          background: "color-mix(in oklch,var(--accent),transparent 90%)",
                          color: "var(--accent)",
                          fontFamily: "inherit",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* composer */}
        <div
          style={{
            padding: 10,
            borderTop: "1px solid var(--line)",
            display: "flex",
            gap: 8,
            background: "var(--surface)",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(q)}
            placeholder={t("Ask about AQI, alerts, cities…")}
            aria-label="Ask the assistant"
            style={{
              flex: 1,
              padding: "11px 13px",
              borderRadius: 11,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              color: "var(--ink)",
              fontFamily: "inherit",
              fontSize: 13.5,
              outline: "none",
            }}
          />
          <button
            aria-label="Send"
            onClick={() => send(q)}
            style={{
              width: 42,
              border: 0,
              borderRadius: 11,
              background: "var(--ink)",
              color: "var(--bg)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
