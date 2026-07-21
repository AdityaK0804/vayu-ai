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
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};
export default config;
