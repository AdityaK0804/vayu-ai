"use client";

import Link from "next/link";
import { motion } from "motion/react";
import React from "react";

import { cn } from "@/lib/utils";

const animationProps = {
  initial: { "--x": "100%" },
  animate: { "--x": "-100%" },
  whileTap: { scale: 0.97 },
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
  },
} as const;

const MotionLink = motion.create(Link);

/**
 * ShinyButton's sweep applied to a next/link. Most VAYU CTAs navigate, and
 * wrapping a Link in a <button> would nest interactive elements, so this keeps
 * the same `--x` mask animation on a real anchor.
 */
export const ShinyLink = React.forwardRef<
  HTMLAnchorElement,
  { href: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }
>(({ href, children, className, style }, ref) => {
  return (
    <MotionLink
      ref={ref}
      href={href}
      className={cn("relative overflow-hidden", className)}
      style={style}
      {...animationProps}
    >
      <span
        className="relative z-[1] block"
        style={{
          maskImage:
            "linear-gradient(-75deg,var(--primary) calc(var(--x) + 20%),transparent calc(var(--x) + 30%),var(--primary) calc(var(--x) + 100%))",
          WebkitMaskImage:
            "linear-gradient(-75deg,var(--primary) calc(var(--x) + 20%),transparent calc(var(--x) + 30%),var(--primary) calc(var(--x) + 100%))",
        }}
      >
        {children}
      </span>
      <span
        aria-hidden
        style={{
          mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
          WebkitMask:
            "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
          backgroundImage:
            "linear-gradient(-75deg,color-mix(in oklch,var(--primary),transparent 90%) calc(var(--x)+20%),color-mix(in oklch,var(--primary),transparent 45%) calc(var(--x)+25%),color-mix(in oklch,var(--primary),transparent 90%) calc(var(--x)+100%))",
        }}
        className="absolute inset-0 z-[2] block rounded-[inherit] p-px"
      />
    </MotionLink>
  );
});

ShinyLink.displayName = "ShinyLink";

export default ShinyLink;
