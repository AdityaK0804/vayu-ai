"use client";

import { useMemo } from "react";
import type { SourceKey } from "@/lib/types";

export const SOURCE_COLORS: Record<SourceKey, string> = {
  industry: "#eab308", // yellow
  traffic: "#f43f5e",  // rose
  fire: "#f97316",     // orange
  dust: "#a8a29e",     // stone
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  industry: "Industry",
  traffic: "Traffic",
  fire: "Biomass / Fire",
  dust: "Dust",
};

interface SourceContributionPieChartProps {
  shares: Record<SourceKey, number>;
  size?: number;
}

export default function SourceContributionPieChart({
  shares,
  size = 120,
}: SourceContributionPieChartProps) {
  const slices = useMemo(() => {
    const rawEntries = Object.entries(shares || {}) as [SourceKey, number][];
    const sortedEntries = rawEntries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const total = sortedEntries.reduce((acc, [, v]) => acc + (v || 0), 0);

    if (total <= 0) {
      return sortedEntries.map(([key]) => ({
        key,
        val: 0,
        pct: 0,
        pathData: "",
        color: SOURCE_COLORS[key] || "#94a3b8",
      }));
    }

    let currentAngle = 0;
    const radius = size / 2;
    const center = size / 2;

    return sortedEntries.map(([key, val]) => {
      const v = Math.max(0, val || 0);
      const angle = (v / total) * Math.PI * 2;

      const x1 = center + radius * Math.cos(currentAngle);
      const y1 = center + radius * Math.sin(currentAngle);

      const x2 = center + radius * Math.cos(currentAngle + angle);
      const y2 = center + radius * Math.sin(currentAngle + angle);

      const largeArc = angle > Math.PI ? 1 : 0;

      // If the slice is exactly 100%, render a circle instead of an arc
      const pathData =
        angle >= Math.PI * 2 * 0.999
          ? `M ${center} ${center - radius} A ${radius} ${radius} 0 1 1 ${center} ${center + radius} A ${radius} ${radius} 0 1 1 ${center} ${center - radius}`
          : `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      currentAngle += angle;

      return {
        key,
        val: v,
        pct: (v / total) * 100,
        pathData,
        color: SOURCE_COLORS[key] || "#94a3b8",
      };
    });
  }, [shares, size]);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s) => (
          <path
            key={s.key}
            d={s.pathData}
            fill={s.color}
            stroke="var(--surface)"
            strokeWidth="1.5"
            style={{ transition: "all 0.3s ease" }}
          />
        ))}
        {/* Inner donut hole */}
        <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="var(--surface)" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {slices.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ flex: 1, color: "var(--ink-2)" }}>{SOURCE_LABELS[s.key as SourceKey] || s.key}</span>
            <span className="figure" style={{ fontWeight: 600 }}>{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
