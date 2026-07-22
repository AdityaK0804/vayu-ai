"use client";

import SiteShell, { PageHero, WorkflowSlot } from "@/components/site/SiteChrome";
import FlowSteps from "@/components/site/FlowSteps";

export default function HowAiWorksPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="HOW THE AI WORKS"
        title="From raw signal to clean-air action."
        sub="VAYU fuses CPCB stations, satellite columns, meteorology and emissions inventories, forecasts PM2.5 72 hours ahead, and turns that into ranked, evidence-backed interventions."
      />
      <FlowSteps />
      <WorkflowSlot label="How AI Works" />
    </SiteShell>
  );
}
