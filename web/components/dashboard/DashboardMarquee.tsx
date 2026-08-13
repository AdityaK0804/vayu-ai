"use client";

import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@/components/magicui/scroll-based-velocity";
import { useT } from "@/lib/i18n";

const ITEMS_EN = [
  "Live CPCB surface",
  "72h AI forecast",
  "Zero-station coverage",
  "CPCB-aligned AQI",
  "Source attribution",
  "Bilingual alerts",
  "Chhattisgarh command center",
  "NexGen · Vayu.AI",
];

/**
 * One-direction headline marquee under the dashboard topbar.
 * Uses Magic UI scroll-based velocity (single row, leftward).
 */
export default function DashboardMarquee() {
  const { t } = useT();

  const line = ITEMS_EN.map((s) => t(s)).join("   ·   ");

  return (
    <div className="dash-marquee" aria-hidden>
      <ScrollVelocityContainer className="dash-marquee-inner">
        <ScrollVelocityRow baseVelocity={18} direction={1} className="dash-marquee-row">
          <span className="dash-marquee-text">{line}</span>
          <span className="dash-marquee-gap" aria-hidden>
            {"   ·   "}
          </span>
        </ScrollVelocityRow>
      </ScrollVelocityContainer>
      <div className="dash-marquee-fade dash-marquee-fade-l" />
      <div className="dash-marquee-fade dash-marquee-fade-r" />
    </div>
  );
}
