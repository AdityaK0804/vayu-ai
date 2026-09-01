"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store";

/**
 * Synchronizes [data-vayu] and [data-theme] on html, body, and the root tree.
 */
export default function ThemeShell({ children }: { children: React.ReactNode }) {
  const theme = useApp((s) => s.theme);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.setAttribute("data-vayu", "");
      document.body.setAttribute("data-theme", theme);
      document.body.setAttribute("data-vayu", "");
    }
  }, [theme]);

  return (
    <div
      data-vayu
      data-theme={theme}
      style={{
        background: "var(--bg)",
        color: "var(--ink)",
        minHeight: "100vh",
        transition: "background .3s ease, color .3s ease",
      }}
    >
      {children}
    </div>
  );
}
