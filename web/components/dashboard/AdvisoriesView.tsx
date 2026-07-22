"use client";

import { useMemo, useState } from "react";

import { aqiCss, aqiLabel } from "@/lib/aqiScale";
import { useAdvisory, useAdvisoryIndex } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import type { CityId } from "@/lib/types";
import { Head } from "./views";

/**
 * Citizen Health Risk Advisory — PS5 requirement.
 * Real hospital (xlsx) + school (csv) registers × live/model AQ × model sources.
 */

export default function AdvisoriesView() {
  const { t } = useT();
  const { city } = useApp();
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
        <Head
          crumb="Act / Citizen advisory"
          title={t("Citizen health advisory")}
          sub={t("Loading hospital & school exposure…")}
        />
      </div>
    );
  }

  const air = row.air;
  const msg = row.messages[lang];
  const actions = row.actions[lang];
  const aqiColor = aqiCss(air.us_aqi ?? (air.pm25 != null ? air.pm25 * 2 : null));

  return (
    // one AQI value tints the banner rail, the message border, the action ticks
    // and the vulnerability note — set once here rather than threaded through
    // every child as a prop
    <div className="section" style={{ ["--adv-risk" as string]: aqiColor }}>
      <Head
        crumb="Act / Citizen advisory"
        title={t("Citizen health advisory")}
        sub={t(
          "Ward- and district-level risk messaging mapped to real hospital & school registries — EN / HI.",
        )}
      />

      <div className="adv-toolbar">
        {cities.map((c) => (
          <button
            key={c.city_id}
            className={`chip${c.city_id === activeId ? " on" : ""}`}
            onClick={() => setPick(c.city_id)}
          >
            {c.city_name}
            <span className="figure adv-chip-meta">
              {c.hospitals}H · {c.schools}S
            </span>
          </button>
        ))}
        <div className="adv-lang">
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              className={`chip${lang === l ? " on" : ""}`}
              onClick={() => setLang(l)}
            >
              {l === "en" ? "English" : "हिंदी"}
            </button>
          ))}
        </div>
      </div>

      {/* Risk band first and largest — an official scanning this screen needs
          "how bad, and driven by what" before any of the detail below. */}
      <div className="adv-banner">
        <div>
          <div className="crumb" style={{ fontSize: 10 }}>
            {cities.find((c) => c.city_id === activeId)?.city_name ?? activeId} · {t("Risk band")}
          </div>
          <div className="adv-banner-band">{lang === "hi" ? air.band_hi : air.band_en}</div>
          <p className="adv-banner-sub">
            {t("Dominant source")}: <b style={{ color: "var(--ink)" }}>{air.top_source ?? "—"}</b>
            {air.priority_ward ? ` · ${air.priority_ward}` : ""}
          </p>
          <span className="adv-basis">
            {air.basis === "measured" ? (
              <>
                <span className="live-dot" /> {t("measured")}
              </>
            ) : (
              t("model estimate")
            )}
          </span>
        </div>

        <div className="adv-banner-figs">
          <div className="adv-fig">
            <div className="v figure" style={{ color: aqiColor }}>
              {air.us_aqi != null ? Math.round(air.us_aqi) : "—"}
            </div>
            <div className="k">{t("US AQI")}</div>
          </div>
          <div className="adv-fig">
            <div className="v figure">{air.pm25 != null ? air.pm25 : "—"}</div>
            <div className="k">PM2.5 µg/m³</div>
          </div>
          <div className="adv-fig">
            <div className="v figure">
              {(row.exposure.hospitals_total + row.exposure.schools_total).toLocaleString()}
            </div>
            <div className="k">{t("facilities exposed")}</div>
          </div>
        </div>
      </div>

      <div className="adv-grid-2">
        <div className="card">
          <div className="card-h">
            <h3>{t("Advisory message")}</h3>
            <span className="sub">{lang === "hi" ? "हिंदी" : "English"}</span>
          </div>
          <div className="adv-card-body">
            <p className="adv-msg">{msg}</p>
            <div className="crumb adv-actions-title">{t("Recommended actions")}</div>
            <ul className="adv-actions">
              {actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            {air.source_shares ? (
              <p className="sub adv-source-mix">
                {t("Model source mix")}:{" "}
                {Object.entries(air.source_shares)
                  .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>{t("Vulnerable receptors")}</h3>
            <span className="sub">{t("district hospital & school registers")}</span>
          </div>
          <div className="adv-card-body">
            <div className="grid kpis adv-kpis-inner">
              <div className="card kpi adv-kpi-flat">
                <div className="lab">{t("Hospitals")}</div>
                <div className="val">{row.exposure.hospitals_total.toLocaleString()}</div>
                <div className="sub">
                  {row.exposure.hospitals_public} {t("public")} · {row.exposure.hospitals_private}{" "}
                  {t("private")}
                </div>
              </div>
              <div className="card kpi adv-kpi-flat">
                <div className="lab">{t("Schools")}</div>
                <div className="val">{row.exposure.schools_total.toLocaleString()}</div>
                <div className="sub">{row.districts_matched.join(", ")}</div>
              </div>
            </div>
            <p className="adv-note">
              {lang === "hi" ? row.exposure.vulnerable_note_hi : row.exposure.vulnerable_note_en}
            </p>
            <div className="crumb adv-actions-title">{t("Priority audiences")}</div>
            <div className="adv-audience">
              {row.audience.map((a) => (
                <span key={a.id} className="chip adv-chip-static">
                  {lang === "hi" ? a.hi : a.en}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="adv-grid-2 adv-mt">
        <div className="card">
          <div className="card-h">
            <h3>{t("Hospitals")}</h3>
            <span className="adv-count">
              {row.hospitals_sample.length} / {row.exposure.hospitals_total.toLocaleString()}
            </span>
          </div>
          <div className="adv-list">
            {row.hospitals_sample.map((h, i) => (
              <div key={i} className="adv-list-row">
                <div className="adv-list-name">{h.name}</div>
                <div className="sub">
                  {h.type}
                  {h.address ? ` · ${h.address.slice(0, 80)}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>{t("Schools")}</h3>
            <span className="adv-count">
              {row.schools_sample.length} / {row.exposure.schools_total.toLocaleString()}
            </span>
          </div>
          <div className="adv-list">
            {row.schools_sample.map((s, i) => (
              <div key={i} className="adv-list-row">
                <div className="adv-list-name">{s.name}</div>
                <div className="sub">
                  {s.block ? `${s.block} · ` : ""}
                  {s.district}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="sub adv-foot">
        {t(
          "Delivery (SMS / WhatsApp / IVR) is shown as a format preview elsewhere on the site. This panel is the intelligence: real facilities × real air × model source.",
        )}{" "}
        AQI: {aqiLabel(air.us_aqi)}.
      </p>
    </div>
  );
}
