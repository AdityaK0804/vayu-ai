"use client";

import { useMemo, useState } from "react";

import { useDistricts } from "@/components/DistrictMap";
import { Iphone } from "@/components/magicui/iphone";
import { aqiCss, aqiLabel } from "@/lib/aqiScale";
import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";

/**
 * Multilingual alert preview.
 *
 * The message body is TEMPLATED FROM LIVE DATA — the worst district in the
 * current bake, its real AQI, PM2.5, population and dominant source — so the
 * preview cannot drift from the dashboard behind it.
 *
 * This is a preview of the message format. Delivery (Twilio SMS / WhatsApp /
 * IVR) is not wired yet, which the section says out loud rather than implying
 * messages are already going out.
 */

type Channel = "sms" | "whatsapp" | "ivr";
type AlertLang = "hi" | "cg" | "en";

const CHANNELS: { key: Channel; label: string; icon: string }[] = [
  { key: "sms", label: "SMS", icon: "▤" },
  { key: "whatsapp", label: "WhatsApp", icon: "◉" },
  { key: "ivr", label: "IVR Call", icon: "✆" },
];

const LANGS: { key: AlertLang; label: string; tag: string }[] = [
  { key: "hi", label: "हिंदी", tag: "IN" },
  { key: "cg", label: "छत्तीसगढ़ी", tag: "CG" },
  { key: "en", label: "English", tag: "EN" },
];

interface Facts {
  place: string;
  aqi: number;
  pm25: number;
  band: string;
  people: string;
  source: string;
  basis: "measured" | "model";
  stations: number;
}

const SRC_HI: Record<string, string> = {
  industry: "उद्योग",
  traffic: "यातायात",
  fire: "आग/बायोमास",
  dust: "धूल",
};
const SRC_CG: Record<string, string> = {
  industry: "कारखाना",
  traffic: "गाड़ी",
  fire: "आगी/खेत जलाई",
  dust: "धुर्रा",
};

function build(f: Facts, ch: Channel, lang: AlertLang) {
  const basisHi =
    f.basis === "measured" ? `${f.stations} CPCB स्टेशन से मापा गया` : "मॉडल से अनुमानित";
  const basisCg =
    f.basis === "measured" ? `${f.stations} CPCB स्टेशन ले नापे गे` : "मॉडल ले अंदाजा";
  const basisEn =
    f.basis === "measured" ? `measured at ${f.stations} CPCB station(s)` : "model estimate";

  if (ch === "sms") {
    if (lang === "hi")
      return {
        header: "⚠️ VAYU वायु चेतावनी",
        body: `${f.place}: AQI ${f.aqi} (${f.band}), PM2.5 ${f.pm25} µg/m³। मुख्य स्रोत ${SRC_HI[f.source] ?? f.source}। ${f.people} लोग प्रभावित। बाहरी काम सीमित करें।`,
        footer: "जवाब दें: 1=स्वीकार 2=अनदेखा",
      };
    if (lang === "cg")
      return {
        header: "⚠️ VAYU हवा चेतावनी",
        body: `${f.place}: AQI ${f.aqi} (${f.band}) हवय, PM2.5 ${f.pm25} µg/m³। मुख्य कारन ${SRC_CG[f.source] ?? f.source}। ${f.people} मनखे प्रभावित। बाहिर के काम कम करव।`,
        footer: "जवाब देव: 1=मंजूर 2=छोड़व",
      };
    return {
      header: "⚠️ VAYU Air Alert",
      body: `${f.place}: AQI ${f.aqi} (${f.band}), PM2.5 ${f.pm25} µg/m³. Dominant source ${f.source}. ${f.people} residents affected. Limit outdoor work.`,
      footer: "Reply: 1=Acknowledge 2=Dismiss",
    };
  }

  if (ch === "whatsapp") {
    if (lang === "hi")
      return {
        header: "🔴 वायु गुणवत्ता अलर्ट",
        body: `📍 ${f.place}, छत्तीसगढ़\n🌫️ AQI: ${f.aqi} (${f.band})\n📊 PM2.5: ${f.pm25} µg/m³\n🏭 मुख्य स्रोत: ${SRC_HI[f.source] ?? f.source}\n👥 प्रभावित: ${f.people} लोग\n🔎 आधार: ${basisHi}\n\n✅ सुझाई गई कार्रवाई:\n1. उद्योग निरीक्षण भेजें\n2. स्कूलों में बाहरी गतिविधि रोकें\n3. सड़कों पर पानी छिड़कें`,
        footer: "VAYU · वायु बुद्धिमत्ता",
      };
    if (lang === "cg")
      return {
        header: "🔴 हवा के गुणवत्ता चेतावनी",
        body: `📍 ${f.place}, छत्तीसगढ़\n🌫️ AQI: ${f.aqi} (${f.band})\n📊 PM2.5: ${f.pm25} µg/m³\n🏭 मुख्य कारन: ${SRC_CG[f.source] ?? f.source}\n👥 परभावित: ${f.people} मनखे\n🔎 आधार: ${basisCg}\n\n✅ का करे के हवय:\n1. कारखाना के जाँच करावव\n2. स्कूल म बाहिर के खेल बंद करव\n3. सड़क म पानी छिड़कव`,
        footer: "VAYU · हवा के जानकारी",
      };
    return {
      header: "🔴 Air Quality Alert",
      body: `📍 ${f.place}, Chhattisgarh\n🌫️ AQI: ${f.aqi} (${f.band})\n📊 PM2.5: ${f.pm25} µg/m³\n🏭 Dominant source: ${f.source}\n👥 Affected: ${f.people} residents\n🔎 Basis: ${basisEn}\n\n✅ Recommended actions:\n1. Dispatch industrial inspection\n2. Pause outdoor activity in schools\n3. Begin road water-spraying`,
      footer: "VAYU · Air Intelligence",
    };
  }

  if (lang === "hi")
    return {
      header: "📞 IVR कॉल — हिंदी",
      body: `"नमस्ते। यह VAYU की ओर से वायु गुणवत्ता चेतावनी है। ${f.place} में वायु गुणवत्ता सूचकांक ${f.aqi} है, जो ${f.band} श्रेणी में आता है। मुख्य स्रोत ${SRC_HI[f.source] ?? f.source} है। कृपया बाहरी गतिविधियाँ सीमित करें। स्वीकार करने के लिए 1 दबाएँ।"`,
      footer: "अवधि ~16 सेकंड · auto-retry 3x",
    };
  if (lang === "cg")
    return {
      header: "📞 IVR कॉल — छत्तीसगढ़ी",
      body: `"जोहार। ये VAYU कोती ले हवा के चेतावनी हवय। ${f.place} म हवा के इंडेक्स ${f.aqi} हवय, जउन ${f.band} श्रेणी म आथे। मुख्य कारन ${SRC_CG[f.source] ?? f.source} हरे। बाहिर के काम कम करव। मंजूर करे बर 1 दबाव।"`,
      footer: "अवधि ~18 सेकंड · auto-retry 3x",
    };
  return {
    header: "📞 IVR Call — English",
    body: `"Hello. This is an air quality alert from VAYU. In ${f.place} the air quality index is ${f.aqi}, which falls in the ${f.band} category. The dominant source is ${f.source}. Please limit outdoor activity. Press 1 to acknowledge."`,
    footer: "Duration ~14 seconds · auto-retry 3x",
  };
}

export default function AlertPreview() {
  const { t } = useT();
  const { data } = useDistricts();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [lang, setLang] = useState<AlertLang>("hi");

  const facts: Facts = useMemo(() => {
    const worst = [...(data?.features ?? [])].sort(
      (a, b) => (b.properties.display_aqi ?? 0) - (a.properties.display_aqi ?? 0),
    )[0]?.properties;
    if (!worst)
      return {
        place: "—",
        aqi: 0,
        pm25: 0,
        band: "—",
        people: "—",
        source: "industry",
        basis: "model",
        stations: 0,
      };
    const top = Object.entries(worst.shares ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "industry";
    return {
      place: worst.name,
      aqi: worst.display_aqi ?? worst.us_aqi,
      pm25: worst.display_pm25 ?? worst.pm25,
      band: aqiLabel(worst.display_aqi ?? worst.us_aqi),
      people: worst.population.toLocaleString("en-IN"),
      source: top,
      basis: worst.display_basis ?? "model",
      stations: worst.live_stations ?? worst.n_stations ?? 0,
    };
  }, [data]);

  const msg = build(facts, channel, lang);
  const tone = aqiCss(facts.aqi);

  return (
    <section
      id="alerts"
      style={{
        position: "relative",
        zIndex: 1,
        maxWidth: 1220,
        margin: "0 auto",
        padding: `56px ${PAD}`,
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div
          className="figure"
          style={{ fontSize: 12, letterSpacing: ".18em", color: "var(--accent)", marginBottom: 12 }}
        >
          {t("MULTILINGUAL ALERTS")}
        </div>
        <h2
          className="display"
          style={{ fontSize: "clamp(28px,4.4vw,48px)", lineHeight: 1.08, marginBottom: 14 }}
        >
          {t("Alerts that speak their language")}
        </h2>
        <p
          style={{
            fontSize: "clamp(14px,1.7vw,17px)",
            lineHeight: 1.6,
            color: "var(--ink-2)",
            maxWidth: "62ch",
            margin: "0 auto",
          }}
        >
          {t(
            "Every alert goes out in Hindi, Chhattisgarhi or English — on whichever channel reaches that official fastest. Built from the live reading, not a template.",
          )}
        </p>
      </div>

      <div className="alert-preview">
        {/* ---- controls ---- */}
        <div>
          <div className="crumb" style={{ marginBottom: 10 }}>
            {t("CHANNEL")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 26 }}>
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`chip${channel === c.key ? " on" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px" }}
              >
                <span aria-hidden>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>

          <div className="crumb" style={{ marginBottom: 10 }}>
            {t("LANGUAGE")}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 26 }}>
            {LANGS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLang(l.key)}
                className={`chip${lang === l.key ? " on" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px" }}
              >
                <span className="figure" style={{ fontSize: 10, opacity: 0.7 }}>
                  {l.tag}
                </span>
                {l.label}
              </button>
            ))}
          </div>

          <div className="alert-stats">
            {[
              { v: "3", k: t("Alert languages") },
              { v: "3", k: t("Delivery channels") },
              { v: facts.aqi ? `${facts.aqi}` : "—", k: t("Live worst AQI") },
              { v: "3x", k: t("Auto-retry on no ACK") },
            ].map((s) => (
              <div key={s.k} className="card" style={{ padding: "14px 16px" }}>
                <div className="figure" style={{ fontSize: 21, fontWeight: 600, color: "var(--accent)" }}>
                  {s.v}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>{s.k}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--ink-3)", marginTop: 18 }}>
            {t(
              "Preview of the message format. Delivery via Twilio (SMS / WhatsApp / IVR) is not connected yet — nothing is being sent.",
            )}
          </p>
        </div>

        {/* ---- phone ---- */}
        <div style={{ display: "grid", placeItems: "center" }}>
          <Iphone width={330} height={672}>
            <div
              style={{
                padding: "58px 14px 18px",
                minHeight: "100%",
                background:
                  channel === "whatsapp"
                    ? "linear-gradient(180deg, #0b1f1a, #071411)"
                    : "var(--surface-2)",
              }}
            >
              {/* app row */}
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: "linear-gradient(140deg,var(--accent),var(--accent-2))",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    fontSize: 13,
                    flex: "none",
                  }}
                >
                  ◉
                </span>
                <div style={{ lineHeight: 1.25 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>VAYU</div>
                  <div style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                    {channel === "ivr" ? t("incoming call") : t("just now")}
                  </div>
                </div>
              </div>

              {/* message bubble */}
              <div
                style={{
                  borderRadius: 14,
                  borderTopLeftRadius: 4,
                  padding: "11px 13px",
                  background: channel === "whatsapp" ? "#10312a" : "var(--surface)",
                  border: `1px solid ${channel === "whatsapp" ? "#1c4d42" : "var(--line)"}`,
                  boxShadow: "0 8px 22px -12px rgba(0,0,0,.6)",
                }}
              >
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: tone,
                    marginBottom: 7,
                    lineHeight: 1.3,
                  }}
                >
                  {msg.header}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.62,
                    color: "var(--ink)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {msg.body}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    color: "var(--ink-3)",
                    marginTop: 10,
                    paddingTop: 8,
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  {msg.footer}
                </div>
              </div>

              {channel === "ivr" && (
                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  {["✆", "1"].map((k, i) => (
                    <span
                      key={k}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 15,
                        color: "#fff",
                        background: i === 0 ? "var(--aqi-1)" : "var(--surface)",
                        border: i === 0 ? "0" : "1px solid var(--line)",
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Iphone>
        </div>
      </div>
    </section>
  );
}
