"use client";

import { useT } from "@/lib/i18n";
import DashboardFrame from "./DashboardFrame";
import { useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/**
 * Hero-side dashboard preview, in a tilted browser frame.
 *
 * Renders the exact same DashboardFrame as the "Live platform preview" section
 * below, just at compact scale — previously this was a separate hand-built mock
 * that drifted out of sync with it. Preview only: the map is non-interactive
 * and nothing here navigates.
 */

export default function DashboardPreview() {
  const { t } = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  
  // 3D tilt on mouse
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [8, -8]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-12, 4]), { stiffness: 150, damping: 20 }); // slightly skewed by default

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: 1500,
        width: "100%",
        maxWidth: 850,
        margin: "clamp(8px, 2vw, 28px) auto 0",
        padding: "20px", 
        animation: "vayuFloat 6s ease-in-out infinite", 
      }}
    >
      <motion.div
        role="img"
        aria-label={t("Dashboard preview — live map (not clickable)")}
        style={{
          transformStyle: "preserve-3d",
          rotateX,
          rotateY,
          transform: "scale(1.0)",
          pointerEvents: "none", // Prevent children from messing with mouse hover state
        }}
        className="glass-panel"
      >
        <DashboardFrame compact />
      </motion.div>
    </div>
  );
}
