"use client";

import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@/components/magicui/scroll-based-velocity";
import { useT } from "@/lib/i18n";

const ITEMS = [
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
 * Landing-only headline strip — in document flow under the nav (not fixed).
 * Single direction scroll.
 */
export default function LandingMarquee() {
  const { t } = useT();
  const line = ITEMS.map((s) => t(s)).join("   ·   ");

  return (
    <div className="landing-marquee" aria-hidden>
      <ScrollVelocityContainer className="landing-marquee-inner">
        <ScrollVelocityRow baseVelocity={16} direction={1} className="landing-marquee-row">
          <span>{line}</span>
          <span className="landing-marquee-gap">{"   ·   "}</span>
        </ScrollVelocityRow>
      </ScrollVelocityContainer>
    </div>
  );
}
