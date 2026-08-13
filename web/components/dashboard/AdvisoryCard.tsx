"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import * as Switch from "@radix-ui/react-switch";
import { useAdvisoryQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";

interface AdvisoryCardProps {
  city_id: string;
  pm25: number;
  aqi: number;
  top_source: string;
  lang: "en" | "hi";
}

export default function AdvisoryCard({ city_id, pm25, aqi, top_source, lang }: AdvisoryCardProps) {
  const { t } = useT();
  const [asthma, setAsthma] = useState(false);
  const [child, setChild] = useState(false);
  const [elderly, setElderly] = useState(false);

  const { data, isLoading, isError } = useAdvisoryQuery({
    city_id,
    pm25,
    aqi,
    top_source,
    asthma,
    child,
    elderly,
  });

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="card-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3>{t("Dynamic Advisory (AI)")}</h3>
          <span className="sub">{t("Tailored to personal health profiles")}</span>
        </div>
      </div>

      <div className="adv-card-body" style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 20px 22px" }}>
        
        {/* Profile Toggles */}
        <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: "var(--ink-2)" }}>
            <Switch.Root
              checked={asthma}
              onCheckedChange={setAsthma}
              style={{
                width: 32, height: 18, backgroundColor: asthma ? "var(--accent)" : "var(--surface-3)",
                borderRadius: 9999, position: "relative", border: "none", cursor: "pointer",
              }}
            >
              <Switch.Thumb style={{ display: "block", width: 14, height: 14, backgroundColor: "white", borderRadius: 9999, transform: `translateX(${asthma ? "16px" : "2px"})`, transition: "transform 100ms" }} />
            </Switch.Root>
            {t("Asthma")}
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: "var(--ink-2)" }}>
            <Switch.Root
              checked={child}
              onCheckedChange={setChild}
              style={{
                width: 32, height: 18, backgroundColor: child ? "var(--accent)" : "var(--surface-3)",
                borderRadius: 9999, position: "relative", border: "none", cursor: "pointer",
              }}
            >
              <Switch.Thumb style={{ display: "block", width: 14, height: 14, backgroundColor: "white", borderRadius: 9999, transform: `translateX(${child ? "16px" : "2px"})`, transition: "transform 100ms" }} />
            </Switch.Root>
            {t("Children")}
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: "var(--ink-2)" }}>
            <Switch.Root
              checked={elderly}
              onCheckedChange={setElderly}
              style={{
                width: 32, height: 18, backgroundColor: elderly ? "var(--accent)" : "var(--surface-3)",
                borderRadius: 9999, position: "relative", border: "none", cursor: "pointer",
              }}
            >
              <Switch.Thumb style={{ display: "block", width: 14, height: 14, backgroundColor: "white", borderRadius: 9999, transform: `translateX(${elderly ? "16px" : "2px"})`, transition: "transform 100ms" }} />
            </Switch.Root>
            {t("Elderly")}
          </label>
        </div>

        <div style={{ flex: 1, overflowY: "auto", fontSize: 13.5, lineHeight: 1.6, opacity: isLoading ? 0.5 : 1, transition: "opacity 200ms" }}>
          {isError ? (
            <div style={{ color: "var(--aqi-4)" }}>{t("Failed to load advisory.")}</div>
          ) : data ? (
            <ReactMarkdown components={{
              h1: ({node, ...props}) => <h3 style={{marginTop: 10, marginBottom: 10, fontSize: 14, fontWeight: 600}} {...props} />,
              h2: ({node, ...props}) => <h4 style={{marginTop: 10, marginBottom: 8, fontSize: 13, fontWeight: 600}} {...props} />,
              h3: ({node, ...props}) => <h5 style={{marginTop: 10, marginBottom: 8, fontSize: 13, fontWeight: 600}} {...props} />,
              p: ({node, ...props}) => <p style={{marginBottom: 10}} {...props} />,
              ul: ({node, ...props}) => <ul style={{marginBottom: 10, paddingLeft: 18, listStyleType: "disc"}} {...props} />,
              li: ({node, ...props}) => <li style={{marginBottom: 4}} {...props} />,
            }}>
              {data[lang]}
            </ReactMarkdown>
          ) : (
            <div style={{ color: "var(--ink-3)" }}>{t("Loading advisory...")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
