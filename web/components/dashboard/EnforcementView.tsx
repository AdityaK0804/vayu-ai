"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { usePriority } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { cpcbPm25Css } from "@/lib/aqiScale";
import { Head } from "./views";

export function EnforcementView() {
  const { t } = useT();
  const { city } = useApp();
  const { data: priority, isLoading } = usePriority(city);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="section">
        <Head crumb="Act / Enforcement" title="Municipal Enforcement" sub="Loading dossiers..." />
      </div>
    );
  }

  const dossiers = priority?.dossiers ?? [];

  const handleCopyOrder = (d: any) => {
    const text = `[VAYU MUNICIPAL ENFORCEMENT ORDER]\nCity: ${city.toUpperCase()}\nWard: ${d.ward}\nPredicted PM2.5: ${d.predicted_pm25} µg/m³\nTop Source: ${d.top_source}\nRecommended Action: ${d.recommended_action}\n\nAffected Population: ${d.population_affected}\nVulnerable Sites: ${d.vulnerable_sites}\nPriority Score: ${d.priority_score.toFixed(2)}`;
    navigator.clipboard.writeText(text);
    setCopiedId(d.ward);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="section interv-section">
      <Head
        crumb="Act / Enforcement"
        title="Municipal Enforcement"
        sub={`${dossiers.length} ward-level actionable priority dossiers generated for ${city}.`}
      />

      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">CRITICAL DOSSIERS</span>
            <span style={{ fontSize: 16, color: "var(--aqi-5)" }}>🚨</span>
          </div>
          <div className="val">{dossiers.length || "—"}</div>
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>Wards above standard</span>
        </div>

        <div className="card kpi" style={{ padding: "16px 20px" }}>
          <div className="top">
            <span className="lab">PEAK PREDICTION</span>
            <span style={{ fontSize: 16, color: "var(--aqi-4)" }}>📈</span>
          </div>
          <div className="val" style={{ color: "var(--aqi-4)" }}>
            {dossiers[0]?.predicted_pm25 ?? "—"} <span style={{ fontSize: 13 }}>µg/m³</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--aqi-4)", marginTop: 4 }}>Top affected ward</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {dossiers.map((d) => (
          <div key={d.ward} className="card" style={{ padding: 20, display: "flex", gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: cpcbPm25Css(d.predicted_pm25),
                  }}
                />
                <h3 style={{ fontSize: 18, margin: 0 }}>
                  Rank {d.rank}: {d.ward}
                </h3>
              </div>
              <p className="sub" style={{ marginBottom: 12 }}>
                Predicted PM2.5: <strong style={{ color: cpcbPm25Css(d.predicted_pm25) }}>{d.predicted_pm25} µg/m³</strong> (+{d.exceedance_over_60} over standard).
              </p>
              <div style={{ fontSize: 13, color: "var(--ink-2)", display: "flex", gap: 20, marginBottom: 12 }}>
                <div>
                  <strong>Top Source:</strong> <span style={{ textTransform: "capitalize" }}>{d.top_source}</span>
                </div>
                <div>
                  <strong>Population:</strong> {d.population_affected.toLocaleString()}
                </div>
                <div>
                  <strong>Vulnerable Sites:</strong> {d.vulnerable_sites}
                </div>
              </div>
              
              {d.upwind_sources && d.upwind_sources.length > 0 && (
                <div style={{ marginBottom: 12, fontSize: 13, background: "var(--surface-2)", padding: 8, borderRadius: 6 }}>
                  <strong>Upwind Sources: </strong>
                  {d.upwind_sources.map((s, i) => (
                    <span key={i}>
                      {s.name} ({s.type}, {s.km}km) {i < d.upwind_sources.length - 1 ? " | " : ""}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 14, color: "var(--ink)", background: "color-mix(in oklch, var(--accent) 15%, transparent)", padding: 12, borderRadius: 8 }}>
                <strong>Directive: </strong> {d.recommended_action}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
              <button
                className="btn primary"
                onClick={() => handleCopyOrder(d)}
                style={{ minWidth: 160 }}
              >
                {copiedId === d.ward ? "Copied!" : "Copy Order"}
              </button>
              <button className="btn outline" style={{ minWidth: 160 }}>
                Generate PDF Dossier
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
