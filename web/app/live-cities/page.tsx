"use client";

import CityIndex from "@/components/landing/CityIndex";
import SiteShell, { PageHero, WorkflowSlot } from "@/components/site/SiteChrome";

export default function LiveCitiesPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="LIVE CITIES · CHHATTISGARH"
        title="Five cities. One live view of the air."
        sub="Real-time PM2.5, US AQI and category for Korba, Bhilai, Raipur, Bilaspur — and Jagdalpur, which has no ground sensor and is predicted outright. Tap any city to open it on the live map."
      />
      <CityIndex />
      <WorkflowSlot label="Live Cities" />
    </SiteShell>
  );
}
