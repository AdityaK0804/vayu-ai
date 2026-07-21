"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import React from "react";

import { cn } from "@/lib/utils";

const animationProps = {
  initial: { "--x": "100%", scale: 0.8 },
  animate: { "--x": "-100%", scale: 1 },
  whileTap: { scale: 0.95 },
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
    scale: {
      type: "spring",
      stiffness: 200,
      damping: 5,
      mass: 0.5,
    },
  },
} as const;

interface ShinyButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  children: React.ReactNode;
  className?: string;
}

/**
 * Magic UI ShinyButton — a sweeping mask highlight driven by the `--x` motion value.
 * `--primary` is defined in theme.css and mapped to the VAYU accent, so the sweep
 * picks up whichever theme is active.
 */
export const ShinyButton = React.forwardRef<HTMLButtonElement, ShinyButtonProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        className={cn(
          "relative cursor-pointer rounded-lg px-6 py-2 font-medium backdrop-blur-xl border transition-shadow duration-300 ease-in-out hover:shadow",
          className,
        )}
        {...animationProps}
        {...props}
      >
        <span
          className="relative block size-full tracking-wide"
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
          style={{
            mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
            WebkitMask:
              "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box exclude,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
            backgroundImage:
              "linear-gradient(-75deg,color-mix(in oklch,var(--primary),transparent 90%) calc(var(--x)+20%),color-mix(in oklch,var(--primary),transparent 50%) calc(var(--x)+25%),color-mix(in oklch,var(--primary),transparent 90%) calc(var(--x)+100%))",
          }}
          className="absolute inset-0 z-10 block rounded-[inherit] p-px"
        />
      </motion.button>
    );
  },
);

ShinyButton.displayName = "ShinyButton";

export default ShinyButton;
