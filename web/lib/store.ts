"use client";

import { create } from "zustand";
import type { CityId } from "./types";

export type LayerKind = "forecast" | "priority";
export type Theme = "light" | "dark";
export type ViewId =
  | "map" | "overview" | "analytics" | "forecast"
  | "interventions" | "advisories" | "alerts" | "network" | "reports";

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
  sideOpen: boolean;      // mobile drawer
  sideCollapsed: boolean; // desktop: collapse the sidebar to an icon rail
  theme: Theme;      // in-memory ONLY
  
  // WhatIf Scenario State
  scenarioActive: boolean;
  scenario: {
    traffic_delta: number;
    industry_delta: number;
    fire_reduction: number;
    ward_sprinkling: boolean;
  };

  // Chatbot Auto-Fill
  chatMessage: string | null;

  setCity: (c: CityId) => void;
  setTimeIndex: (i: number) => void;
  setLayer: (l: LayerKind) => void;
  togglePlaying: () => void;
  setPlaying: (p: boolean) => void;
  selectCell: (h3: string | null) => void;
  setRevealed: (r: boolean) => void;
  setView: (v: ViewId) => void;
  toggleSide: () => void;
  toggleCollapse: () => void;
  toggleTheme: () => void;
  setScenarioActive: (a: boolean) => void;
  setScenario: (s: Partial<AppState["scenario"]>) => void;
  setChatMessage: (m: string | null) => void;
}

export const useApp = create<AppState>((set) => ({
  city: "korba",
  timeIndex: 0,
  layer: "forecast",
  playing: false,
  selectedCell: null,
  revealed: false,
  view: "map", // the map is the product — open on it, not on a summary page
  sideOpen: false,
  sideCollapsed: false,
  theme: "dark", // site opens in dark mode; toggle switches to light
  scenarioActive: false,
  scenario: {
    traffic_delta: 0,
    industry_delta: 0,
    fire_reduction: 0,
    ward_sprinkling: false,
  },
  chatMessage: null,

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
  toggleCollapse: () => set((s) => ({ sideCollapsed: !s.sideCollapsed })),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  setScenarioActive: (scenarioActive) => set({ scenarioActive }),
  setScenario: (partial) => set((s) => ({ scenario: { ...s.scenario, ...partial } })),
  setChatMessage: (chatMessage) => set({ chatMessage }),
}));
