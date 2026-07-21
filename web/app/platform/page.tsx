"use client";

import SiteShell, { PageHero, WorkflowSlot } from "@/components/site/SiteChrome";
import { FeatureGrid, Section } from "@/components/site/blocks";

export default function PlatformPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="THE PLATFORM"
        title="One control room for a region's air."
        sub="From live hex-grid heatmaps to 72-hour forecasting and a ranked enforcement engine — everything a smart-city team needs to see, predict and act on urban air quality."
      />
      <Section pt={20} pb={20}>
        <FeatureGrid />
      </Section>
      <WorkflowSlot label="Platform" />
    </SiteShell>
  );
}
