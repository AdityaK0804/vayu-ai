"use client";

import { useMemo, useState } from "react";

import { cpcbAqiFromPm25, cpcbPm25Css, cpcbPm25Label } from "@/lib/aqiScale";
import { useAdvisory, useAdvisoryIndex } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import type { CityId } from "@/lib/types";
import { Head } from "./views";

/**
 * Citizen health advisory — messaging only.
 * Long hospital/school lists removed (those live under Interventions).
 * Counts still shown for exposure context.
 */

export default function AdvisoriesView() {
  const { t } = useT();
  const { city, setView } = useApp();
  const { data: index } = useAdvisoryIndex();
  const { data: cityAdv } = useAdvisory(city);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [pick, setPick] = useState<string | null>(null);

  const activeId = (pick as CityId) || city;
  const row = useMemo(() => {
    if (cityAdv && cityAdv.city_id === activeId) return cityAdv;
    return index?.advisories?.[activeId] ?? cityAdv ?? null;
  }, [cityAdv, index, activeId]);

  const cities = index?.cities ?? [];

  if (!row) {
    return (
      <div className="section">
        <Head crumb="Act / Citizen advisory" title={t("Citizen health advisory")} sub="Loading…" />
      </div>
    );
  }

  const air = row.air;
  const msg = row.messages[lang];
  const actions = row.actions[lang];
  const aqiColor = cpcbPm25Css(air.pm25);
  const cpcb = cpcbPm25Label(air.pm25);
  const cpcbAqi = cpcbAqiFromPm25(air.pm25);

  return (
    <div className="section" style={{ paddingBottom: 90, maxWidth: 1200, margin: "0 auto" }}>
      <Head
        crumb="Act / Citizen advisory"
        title={t("Citizen health advisory")}
        sub={t("EN/HI risk messages for the public — school-level action lists are under Interventions.")}
      />

      <div className="adv-toolbar" style={{ marginBottom: 18 }}>
        {cities.map((c) => (
          <button
            key={c.city_id}
            className={`chip${c.city_id === activeId ? " on" : ""}`}
            onClick={() => setPick(c.city_id)}
          >
            {c.city_name}
          </button>
        ))}
        <div className="adv-lang">
          {(["en", "hi"] as const).map((l) => (
            <button key={l} className={`chip${lang === l ? " on" : ""}`} onClick={() => setLang(l)}>
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid kpis adv-kpis" style={{ marginBottom: 20 }}>
        {[
          { lab: t("Risk band"), val: lang === "hi" ? air.band_hi : air.band_en, c: aqiColor },
          { lab: "PM2.5", val: air.pm25 != null ? `${air.pm25}` : "—", sub: "µg/m³" },
          { lab: "CPCB category", val: cpcb, c: aqiColor },
          { lab: t("Dominant source"), val: air.top_source ?? "—" },
        ].map((k) => (
          <div key={k.lab} className="card kpi">
            <div className="top">
              <span className="lab">{k.lab}</span>
            </div>
            <div className="val" style={{ color: k.c }}>
              {k.val}
              {k.sub ? <span className="sub"> {k.sub}</span> : null}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, alignItems: "stretch", marginBottom: 20 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="card-h">
            <h3>{t("Advisory message")}</h3>
            <span className="sub">
              {air.basis === "measured" ? t("measured") : t("model estimate")}
            </span>
          </div>
          <div className="adv-card-body" style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 20px 22px" }}>
            <p className="adv-msg" style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>{msg}</p>
            <div className="crumb adv-actions-title" style={{ marginTop: "auto", paddingTop: 14 }}>{t("Recommended actions")}</div>
            <ul className="adv-actions">
              {actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="card-h">
            <h3>{t("Exposure context")}</h3>
            <span className="sub">{t("district register totals — no long lists")}</span>
          </div>
          <div className="adv-card-body" style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 20px 22px" }}>
            <div className="grid kpis adv-kpis-inner" style={{ marginBottom: 14 }}>
              <div className="card kpi adv-kpi-flat">
                <div className="lab">{t("Hospitals")}</div>
                <div className="val">{row.exposure.hospitals_total.toLocaleString()}</div>
              </div>
              <div className="card kpi adv-kpi-flat">
                <div className="lab">{t("Schools")}</div>
                <div className="val">{row.exposure.schools_total.toLocaleString()}</div>
              </div>
            </div>
            <p className="adv-note" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>
              {lang === "hi" ? row.exposure.vulnerable_note_hi : row.exposure.vulnerable_note_en}
            </p>
            <div className="crumb adv-actions-title" style={{ margin: "10px 0 8px" }}>{t("Priority audiences")}</div>
            <div className="adv-audience" style={{ marginBottom: 18 }}>
              {row.audience.map((a) => (
                <span key={a.id} className="chip adv-chip-static">
                  {lang === "hi" ? a.hi : a.en}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="btn pri"
              style={{
                marginTop: "auto",
                width: "100%",
                padding: "11px 16px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onClick={() => setView("interventions")}
            >
              See schools & remedies in Interventions →
            </button>
          </div>
        </div>
      </div>

      <p className="sub adv-foot" style={{ marginTop: 14 }}>
        CPCB AQI: {cpcbAqi ?? "—"}. CPCB PM2.5 class: {cpcb}. Named school lists +
        source remedies are on the Interventions screen.
      </p>
    </div>
  );
}
