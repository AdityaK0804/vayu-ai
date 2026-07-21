"use client";

import { Moon, SunDim } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";

import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

type Props = {
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Magic UI AnimatedThemeToggler.
 *
 * Adapted in exactly one place: the upstream component owns theme state itself
 * (`documentElement.classList.toggle("dark")`, or next-themes). This app already
 * has a single source of truth in Zustand — and next-themes would persist to
 * localStorage, which this build forbids. So the flushSync + View Transition
 * circular-reveal is kept verbatim and only the state write is swapped.
 */
export const AnimatedThemeToggler = ({ className, style }: Props) => {
  const { theme, toggleTheme } = useApp();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const isDarkMode = theme === "dark";

  const changeTheme = async () => {
    if (!buttonRef.current) return;

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    // Browsers without the View Transitions API just get an instant swap.
    if (!doc.startViewTransition) {
      toggleTheme();
      return;
    }

    await doc.startViewTransition(() => {
      flushSync(() => {
        toggleTheme();
      });
    }).ready;

    const { top, left, width, height } = buttonRef.current.getBoundingClientRect();
    const y = top + height / 2;
    const x = left + width / 2;

    const right = window.innerWidth - left;
    const bottom = window.innerHeight - top;
    const maxRad = Math.hypot(Math.max(left, right), Math.max(top, bottom));

    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRad}px at ${x}px ${y}px)`],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  };

  return (
    <button
      ref={buttonRef}
      onClick={changeTheme}
      title="Toggle theme"
      aria-label="Toggle colour theme"
      className={cn(className)}
      style={style}
    >
      {isDarkMode ? <SunDim size={17} /> : <Moon size={16} />}
    </button>
  );
};

export default AnimatedThemeToggler;
