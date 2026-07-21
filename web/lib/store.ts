"use client";

import { create } from "zustand";
import type { CityId } from "./types";

export type LayerKind = "forecast" | "priority";
export type Theme = "light" | "dark";
export type ViewId =
  | "overview" | "map" | "forecast"
  | "interventions" | "alerts" | "network" | "reports";

/**
 * In-memory only. No localStorage / sessionStorage anywhere in this app —
 * a refresh resets to Korba at frame 0, which is the intended demo entry state.
 */
interface AppState {
  city: CityId;
  timeIndex: number;
  layer: LayerKind;
  playing: boolean;
  selectedCell: string | null;
  revealed: boolean; // jagdalpur: false = "no stations", true = full grid
  view: ViewId;
  sideOpen: boolean;
  theme: Theme;      // in-memory ONLY — the source design persisted this to
                     // localStorage, which the build brief forbids

  setCity: (c: CityId) => void;
  setTimeIndex: (i: number) => void;
  setLayer: (l: LayerKind) => void;
  togglePlaying: () => void;
  setPlaying: (p: boolean) => void;
  selectCell: (h3: string | null) => void;
  setRevealed: (r: boolean) => void;
  setView: (v: ViewId) => void;
  toggleSide: () => void;
  toggleTheme: () => void;
}

export const useApp = create<AppState>((set) => ({
  city: "korba",
  timeIndex: 0,
  layer: "forecast",
  playing: false,
  selectedCell: null,
  revealed: false,
  view: "overview",
  sideOpen: false,
  theme: "dark", // site opens in dark mode; toggle switches to light

  // switching city resets the scrub + selection; reveal re-arms for jagdalpur
  setCity: (city) =>
    set({ city, timeIndex: 0, selectedCell: null, playing: false, revealed: city !== "jagdalpur" }),
  setTimeIndex: (timeIndex) => set({ timeIndex }),
  setLayer: (layer) => set({ layer }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),
  selectCell: (selectedCell) => set({ selectedCell }),
  setRevealed: (revealed) => set({ revealed }),
  setView: (view) => set({ view, sideOpen: false }),
  toggleSide: () => set((s) => ({ sideOpen: !s.sideOpen })),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
}));
