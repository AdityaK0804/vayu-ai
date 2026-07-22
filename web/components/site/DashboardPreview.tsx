"use client";

import { useT } from "@/lib/i18n";
import DashboardFrame from "./DashboardFrame";

/**
 * Hero-side dashboard preview, in a tilted browser frame.
 *
 * Renders the exact same DashboardFrame as the "Live platform preview" section
 * below, just at compact scale — previously this was a separate hand-built mock
 * that drifted out of sync with it. Preview only: the map is non-interactive
 * and nothing here navigates.
 */

const TILT_REST = "rotateY(-12deg) rotateX(4deg) scale(0.95)";
const TILT_HOVER = "rotateY(-4deg) rotateX(2deg) scale(1.02)";

export default function DashboardPreview() {
  const { t } = useT();

  return (
    <div
      style={{
        perspective: 1500,
        width: "100%",
        maxWidth: 750,
        // small nudge down so the frame sits level with the headline rather
        // than the LIVE badge above it
        margin: "clamp(8px, 2vw, 28px) auto 0",
      }}
    >
      <div
        role="img"
        aria-label={t("Dashboard preview — live map (not clickable)")}
        className="dash-preview-card"
        style={{
          transformStyle: "preserve-3d",
          transform: TILT_REST,
          transition: "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          cursor: "default",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = TILT_HOVER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = TILT_REST;
        }}
      >
        <DashboardFrame compact />
      </div>
    </div>
  );
}
