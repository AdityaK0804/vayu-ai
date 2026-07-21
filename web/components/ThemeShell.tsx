"use client";

import { useApp } from "@/lib/store";

/**
 * Applies the design's [data-vayu][data-theme] contract to the whole tree.
 * Theme lives in Zustand (in-memory) — the source design wrote it to
 * localStorage, which this build explicitly forbids.
 */
export default function ThemeShell({ children }: { children: React.ReactNode }) {
  const theme = useApp((s) => s.theme);
  return (
    <div
      data-vayu
      data-theme={theme}
      style={{
        background: "var(--bg)",
        color: "var(--ink)",
        minHeight: "100vh",
        transition: "background .4s, color .4s",
      }}
    >
      {children}
    </div>
  );
}
