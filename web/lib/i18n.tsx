"use client";

import { createContext, useContext, useMemo } from "react";
import { create } from "zustand";

/**
 * Site-wide English / Hindi.
 *
 * In-memory only (no localStorage, per the build rules). Place names, station
 * names and units are deliberately NOT translated — they are proper nouns and
 * scientific units, and transliterating "Raigarh" or "µg/m³" would make the
 * dashboard harder to read, not easier.
 */

export type Lang = "en" | "hi";

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}
export const useLangStore = create<LangState>((set) => ({
  lang: "en",
  setLang: (lang) => set({ lang }),
}));

type Dict = Record<string, string>;

const HI: Dict = {
  /* ---- nav / chrome ---- */
  "Live Cities": "लाइव शहर",
  Platform: "प्लेटफ़ॉर्म",
  "How AI Works": "AI कैसे काम करता है",
  "Open Dashboard →": "डैशबोर्ड खोलें →",
  "AIR INTELLIGENCE": "वायु बुद्धिमत्ता",
  "Urban Air Quality Intelligence": "शहरी वायु गुणवत्ता बुद्धिमत्ता",
  "Toggle theme": "थीम बदलें",
  Language: "भाषा",

  /* ---- landing hero ---- */
  "No sensors.": "सेंसर नहीं।",
  "No problem.": "कोई बात नहीं।",
  "AI fills the gaps.": "AI कमी पूरी करता है।",
  "Launch the platform →": "प्लेटफ़ॉर्म शुरू करें →",
  "Explore the live map": "लाइव मानचित्र देखें",
  "forecast horizon": "पूर्वानुमान अवधि",
  "µg/m³ RMSE @24h": "µg/m³ RMSE @24घं",
  "µg/m³ zero-station": "µg/m³ बिना-सेंसर",
  "ground stations": "ज़मीनी स्टेशन",
  "Live city index": "लाइव शहर सूचकांक",
  "One control room for the air a region breathes":
    "पूरे क्षेत्र की हवा के लिए एक नियंत्रण कक्ष",
  "THE PLATFORM": "प्लेटफ़ॉर्म",
  "HOW THE MODEL WORKS": "मॉडल कैसे काम करता है",
  "From raw signal to clean-air action in three steps":
    "कच्चे संकेत से स्वच्छ-वायु कार्रवाई तक — तीन चरणों में",
  "Ready to clear the air over your city?": "अपने शहर की हवा साफ़ करने को तैयार हैं?",
  "Step into the live command center — no login needed for the demo.":
    "लाइव कमांड सेंटर में प्रवेश करें — डेमो के लिए लॉगिन आवश्यक नहीं।",
  "Open the dashboard →": "डैशबोर्ड खोलें →",

  /* ---- dashboard nav ---- */
  MONITOR: "निगरानी",
  ACT: "कार्रवाई",
  SYSTEM: "सिस्टम",
  Overview: "अवलोकन",
  "Live Map": "लाइव मानचित्र",
  "AI Forecast": "AI पूर्वानुमान",
  Interventions: "हस्तक्षेप",
  Alerts: "चेतावनियाँ",
  "Sensor Network": "सेंसर नेटवर्क",
  "Reports & Export": "रिपोर्ट और निर्यात",
  "COMMAND CENTER": "कमांड सेंटर",
  "Search wards, stations, sources…": "वार्ड, स्टेशन, स्रोत खोजें…",

  /* ---- map card ---- */
  "Risk Map": "जोखिम मानचित्र",
  Districts: "ज़िले",
  "Forecast grid": "पूर्वानुमान ग्रिड",
  "Search district or city…": "ज़िला या शहर खोजें…",
  "US AQI": "US AQI",
  Good: "अच्छा",
  Moderate: "मध्यम",
  "Unhealthy (sensitive)": "संवेदनशील के लिए अस्वस्थ",
  Unhealthy: "अस्वस्थ",
  "Very unhealthy": "अत्यंत अस्वस्थ",
  Hazardous: "ख़तरनाक",
  "city · ring = no sensor": "शहर · घेरा = सेंसर नहीं",
  "Welcome to": "आपका स्वागत है",
  District: "ज़िला",
  Close: "बंद करें",
  "Risk index": "जोखिम सूचकांक",
  "Model forecast (this hour)": "मॉडल पूर्वानुमान (इस घंटे)",
  Population: "जनसंख्या",
  "CPCB stations": "CPCB स्टेशन",
  Basis: "आधार",
  "Measured at CPCB stations": "CPCB स्टेशनों पर मापा गया",
  "Model attribution (SHAP)": "मॉडल स्रोत-विश्लेषण (SHAP)",
  "EDGAR v8.1 emissions here": "यहाँ EDGAR v8.1 उत्सर्जन",
  "Model inputs at this hour": "इस घंटे मॉडल इनपुट",
  "Stations here": "यहाँ के स्टेशन",
  Industry: "उद्योग",
  Traffic: "यातायात",
  "Fire / biomass": "आग / बायोमास",
  Dust: "धूल",
  Power: "बिजली",
  Transport: "परिवहन",
  Residential: "आवासीय",
  "Ag. burning": "कृषि जलावन",
  "CAMS PM2.5": "CAMS PM2.5",
  Temperature: "तापमान",
  "Relative humidity": "सापेक्ष आर्द्रता",
  "Wind speed": "हवा की गति",
  "Boundary layer": "सीमा परत",
  "Nearest power plant": "निकटतम बिजली संयंत्र",
  "Capacity ≤25 km": "क्षमता ≤25 किमी",

  /* ---- dashboard views ---- */
  "Monitor / Overview": "निगरानी / अवलोकन",
  "Monitor / AI Forecast": "निगरानी / AI पूर्वानुमान",
  "Act / Intervention Engine": "कार्रवाई / हस्तक्षेप इंजन",
  "Act / Alerts": "कार्रवाई / चेतावनियाँ",
  "System / Sensor Network": "सिस्टम / सेंसर नेटवर्क",
  "System / Reports & Export": "सिस्टम / रिपोर्ट और निर्यात",
  "Live PM2.5": "लाइव PM2.5",
  "Forecast RMSE @24h": "पूर्वानुमान RMSE @24घं",
  "Zero-station RMSE": "बिना-सेंसर RMSE",
  "Cells over standard": "मानक से ऊपर कोशिकाएँ",
  "Model vs baselines": "मॉडल बनाम आधाररेखा",
  "Top enforcement target": "शीर्ष प्रवर्तन लक्ष्य",
  Dataset: "डेटासेट",
  "Training rows": "प्रशिक्षण पंक्तियाँ",
  Stations: "स्टेशन",
  Window: "अवधि",
  "Open dossier →": "फ़ाइल खोलें →",
  "Ranked enforcement dossiers": "क्रमबद्ध प्रवर्तन फ़ाइलें",
  "Threshold & forecast alerts": "सीमा और पूर्वानुमान चेतावनियाँ",
  "Ground station health": "ज़मीनी स्टेशन स्थिति",
  "Compliance export": "अनुपालन निर्यात",
  "Export CSV": "CSV निर्यात करें",
  "Export JSON": "JSON निर्यात करें",
  "Zero ground sensors": "कोई ज़मीनी सेंसर नहीं",
  "in training": "प्रशिक्षण में",
  excluded: "बाहर रखा गया",
  "72-hour PM2.5 forecast": "72-घंटे PM2.5 पूर्वानुमान",
  "Station forecast vs measured": "स्टेशन पूर्वानुमान बनाम मापा गया",
  predicted: "पूर्वानुमानित",
  measured: "मापा गया",
  Frames: "फ़्रेम",

  /* ---- chatbot ---- */
  "VAYU Assistant": "VAYU सहायक",
  "Online · air quality help": "ऑनलाइन · वायु गुणवत्ता सहायता",
  "Ask about AQI, alerts, cities…": "AQI, चेतावनियों, शहरों के बारे में पूछें…",
  "Korba AQI": "कोरबा AQI",
  "72h forecast": "72घं पूर्वानुमान",
  "Worst district": "सबसे ख़राब ज़िला",
  "Recommend actions": "कार्रवाई सुझाएँ",
  "typing…": "लिख रहे हैं…",
  Send: "भेजें",
};

const LangCtx = createContext<{ lang: Lang; t: (k: string) => string }>({
  lang: "en",
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const lang = useLangStore((s) => s.lang);
  const value = useMemo(
    () => ({
      lang,
      // English is the source language, so `t` is identity there. A missing
      // Hindi entry falls back to English rather than rendering a blank.
      t: (k: string) => (lang === "hi" ? (HI[k] ?? k) : k),
    }),
    [lang],
  );
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT() {
  return useContext(LangCtx);
}
