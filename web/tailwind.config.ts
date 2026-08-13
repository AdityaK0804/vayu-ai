import type { Config } from "tailwindcss";

// All palette values live in app/theme.css as CSS vars; Tailwind just references
// them, so a new design is a variable swap, not a code change.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carbon: "var(--carbon)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        ink: "var(--ink)",
        inkdim: "var(--ink-dim)",
        accent: "var(--accent)",
        accentdim: "var(--accent-dim)",
        rule: "var(--rule)",
        muted: "var(--surface-2)",
        background: "var(--surface)",
        foreground: "var(--ink)",
        border: "var(--line)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
