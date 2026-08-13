"use client";

import { useT } from "@/lib/i18n";
import { PAD } from "./SiteChrome";
import { SectionHead } from "./blocks";
import DashboardFrame from "./DashboardFrame";

/**
 * "Live platform preview" — its own section band below the hero.
 *
 * The frame itself is DashboardFrame, shared with the compact card beside the
 * hero headline, so the two previews can never show different chrome.
 */
export default function PlatformLivePreview() {
  const { t } = useT();

  return (
    <section
      id="preview"
      aria-label={t("Live platform preview")}
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: `56px ${PAD} 56px`,
        position: "relative",
        zIndex: 1,
      }}
    >
      <SectionHead
        eyebrow={t("LIVE PLATFORM PREVIEW")}
        title={t("The command centre — live map, not a static mock")}
        lede={t(
          "This is a preview only. District colours and city AQI come from the same live feed the dashboard reads.",
        )}
        mb={34}
      />

      <DashboardFrame />
    </section>
  );
}
