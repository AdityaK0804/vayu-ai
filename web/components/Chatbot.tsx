"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "ai/react";
import ReactMarkdown from "react-markdown";

import { useApp } from "@/lib/store";
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

interface ChatbotProps {
  initialAlertText?: string;
  onClearAlert?: () => void;
}

const GREETING: Record<Lang, string> = {
  en: "Namaste! 🌱 I'm <b>Vayu Assist</b>. How can I help with the region's air today?",
  hi: "नमस्ते! 🌱 मैं <b>Vayu Assist</b> हूँ। आज क्षेत्र की हवा के बारे में कैसे मदद करूँ?",
};

const CHIPS = [
  "Korba AQI",
  "72h forecast",
  "Zero-station Jagdalpur",
  "Enforcement targets",
  "Model accuracy RMSE",
];

const BUBBLE_ICON = (
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
);
const CLOSE_ICON = <path d="M18 6 6 18M6 6l12 12" />;

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { t } = useT();
  const { lang, setLang } = useLangStore();
  
  // Connect to global chat payload trigger
  const { chatMessage, setChatMessage } = useApp();

  const { data: districts } = useDistricts();
  const { data: live } = useLive();
  const { data: metrics } = useMetrics("korba");
  const { data: priority } = usePriority("korba");

  const [hasGreeted, setHasGreeted] = useState(false);

  const contextBody = {
    lang,
    context: {
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
    }
  };

  const { messages, input, handleInputChange, handleSubmit, setMessages, append, isLoading } = useChat({
    api: "/api/chat",
    body: contextBody,
  });

  // Open and append initial alert from global state
  useEffect(() => {
    if (chatMessage) {
      setOpen(true);
      append({ role: "user", content: chatMessage });
      setChatMessage(null); // clear it so it doesn't re-trigger
    }
  }, [chatMessage, append, setChatMessage]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  // greet on first open, exactly as the design does
  useEffect(() => {
    if (open && !hasGreeted && messages.length === 0) {
      setHasGreeted(true);
      setMessages([
        { id: "greet", role: "assistant", content: GREETING[lang] }
      ]);
    }
  }, [open, hasGreeted, messages.length, lang, setMessages]);

  // switching language mid-conversation re-greets rather than leaving a
  // half-English, half-Hindi thread on screen
  useEffect(() => {
    if (messages.length > 0 && messages[0].id === "greet") {
      setMessages([{ id: "greet", role: "assistant", content: GREETING[lang] }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

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
          {messages.map((m: any) => {
            const me = m.role === "user";
            return (
              <div key={m.id} style={{ display: "contents" }}>
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
                    }}
                  >
                    <ReactMarkdown
                      components={{
                        p: ({node, ...props}) => <p style={{margin: 0}} {...props} />,
                        a: ({node, ...props}) => <a style={{color: me ? "#fff" : "var(--accent)"}} {...props} />,
                        strong: ({node, ...props}) => <b style={{fontWeight: 600}} {...props} />,
                        ul: ({node, ...props}) => <ul style={{margin: 0, paddingLeft: 18}} {...props} />,
                        ol: ({node, ...props}) => <ol style={{margin: 0, paddingLeft: 18}} {...props} />,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
                {!me && m.id === "greet" && CHIPS.length > 0 && (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 7, alignSelf: "flex-start", marginTop: 4 }}
                  >
                    {CHIPS.map((chipText) => (
                      <button
                        key={chipText}
                        onClick={() => append({ role: "user", content: t(chipText) })}
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
                        {t(chipText)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {isLoading && (
            <div style={{ alignSelf: "flex-start", opacity: 0.6, fontSize: 12, marginLeft: 6 }}>
              {t("typing…")}
            </div>
          )}
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
          <form
            onSubmit={handleSubmit}
            style={{
              flex: 1,
              display: "flex",
            }}
          >
            <input
              value={input}
              onChange={handleInputChange}
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
            type="submit"
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
          </form>
        </div>
      </div>
    </>
  );
}
