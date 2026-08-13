"use client";

/**
 * Polls FastAPI /api/v1/ui/toast (via Next rewrite) and shows a solid toast.
 * Phase 5.4 — alert pipeline UI trigger.
 */

import { useEffect, useState } from "react";
import { liveApiBase } from "@/lib/liveClient";

type ToastPayload = {
  type?: string;
  title?: string;
  detail?: string;
  severity?: string;
  ts?: string;
  id?: number;
};

export default function AlertToast() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [hiddenId, setHiddenId] = useState<number | string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`${liveApiBase()}/api/v1/ui/toast`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { toast: ToastPayload | null };
        if (!alive || !j.toast) return;
        const id = j.toast.id ?? j.toast.ts ?? j.toast.title;
        if (id != null && id === hiddenId) return;
        setToast(j.toast);
      } catch {
        /* API optional */
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hiddenId]);

  if (!toast) return null;

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
          {toast.severity === "critical" ? "Critical alert" : "Alert"} · {toast.title}
        </b>
        <button
          type="button"
          className="chip"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={() => {
            setHiddenId(toast.id ?? toast.ts ?? toast.title ?? "x");
            setToast(null);
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, color: "var(--ink-2, #b6c2c6)" }}>{toast.detail}</div>
    </div>
  );
}
