"use client";

/**
 * Polls FastAPI /api/v1/ui/toast (via Next rewrite) and shows a solid toast.
 * Phase 5.4 — alert pipeline UI trigger.
 */

import { useEffect, useState } from "react";
import { useLiveAlerts } from "@/lib/data";
import type { AlertEvent } from "@/lib/data";

export default function AlertToast() {
  const { alerts } = useLiveAlerts();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Find the most recent alert that hasn't been dismissed
  const visibleAlert = alerts.find(a => !hiddenIds.has(a.id));

  if (!visibleAlert) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        zIndex: 1200,
        maxWidth: 360,
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--surface, #12181a)",
        border: "1px solid color-mix(in oklab, var(--aqi-4, #ef4444) 55%, var(--line))",
        boxShadow: "0 12px 40px rgba(0,0,0,.45)",
        color: "var(--ink, #e8eef0)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <b style={{ fontSize: 13, color: "var(--aqi-4, #f87171)" }}>
          {visibleAlert.type === "critical" ? "Critical alert" : "Alert"} · {visibleAlert.city_id}
        </b>
        <button
          type="button"
          className="chip"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={() => {
            setHiddenIds((prev) => new Set(prev).add(visibleAlert.id));
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-2, #b6c2c6)" }}>{visibleAlert.message}</div>
    </div>
  );
}
