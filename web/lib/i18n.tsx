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

  // analytics view + collapsible sidebar
  Analytics: "विश्लेषण",
  "Collapse sidebar": "साइडबार छोटा करें",
  "Expand sidebar": "साइडबार बड़ा करें",
  "Pollutant load, source mix and model performance — all from live measurements.":
    "प्रदूषक भार, स्रोत मिश्रण और मॉडल प्रदर्शन — सब लाइव मापन से।",
  "Pollutant load by city": "शहर अनुसार प्रदूषक भार",
  "share of each pollutant's CPCB 24h limit": "प्रत्येक प्रदूषक की CPCB 24घं सीमा का हिस्सा",
  "of CPCB limit": "CPCB सीमा का",
  "Closest to its limit": "अपनी सीमा के सबसे निकट",
  "of the permissible limit": "अनुमेय सीमा का",
  "Slices are each pollutant's concentration divided by its own CPCB standard. Raw µg/m³ are not comparable across pollutants, so this normalisation is what makes the comparison meaningful.":
    "हर हिस्सा उस प्रदूषक की सांद्रता को उसके अपने CPCB मानक से भाग देकर बनाया गया है। अलग-अलग प्रदूषकों के कच्चे µg/m³ की तुलना नहीं हो सकती, इसलिए यही सामान्यीकरण तुलना को अर्थपूर्ण बनाता है।",
  "No live pollutant readings for this city right now.":
    "इस शहर के लिए अभी कोई लाइव प्रदूषक रीडिंग नहीं है।",
  "Emissions by sector": "क्षेत्र अनुसार उत्सर्जन",
  "of emissions": "उत्सर्जन का",
  attributed: "आवंटित",
  stations: "स्टेशन",
  "Power generation": "विद्युत उत्पादन",
  "Road transport": "सड़क परिवहन",
  Residential: "आवासीय",
  "Ag. burning": "कृषि जलाना",
  Agriculture: "कृषि",
  "Districts by AQI category": "AQI श्रेणी के अनुसार ज़िले",
  "Measured vs modelled": "मापा गया बनाम मॉडल",
  "Most polluted districts": "सर्वाधिक प्रदूषित ज़िले",
  "RMSE µg/m³ · lower is better": "RMSE µg/m³ · कम बेहतर है",
  "People above AQI 100": "AQI 100 से ऊपर की आबादी",
  "Measured live": "लाइव मापा गया",
  "population-weighted SHAP": "जनसंख्या-भारित SHAP",
  "Enforcement pipeline": "प्रवर्तन पाइपलाइन",
  "signal → dossier": "सिग्नल → डोज़ियर",
  "No metrics yet.": "अभी कोई मेट्रिक नहीं।",
  coverage: "कवरेज",
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


  /* ---- city cards ---- */
  "Coal & power belt": "कोयला और बिजली क्षेत्र",
  "Steel corridor": "इस्पात गलियारा",
  "State capital": "राज्य की राजधानी",
  "Rail & commerce": "रेल और वाणिज्य",
  "No ground sensor": "कोई ज़मीनी सेंसर नहीं",
  PREDICTED: "पूर्वानुमानित",
  AQI: "AQI",
  "No data": "डेटा नहीं",
  "Very poor": "बहुत ख़राब",
  Severe: "गंभीर",
  "live feed unavailable — showing nothing rather than stale numbers":
    "लाइव फ़ीड उपलब्ध नहीं — पुराने आँकड़े दिखाने के बजाय कुछ नहीं दिखाया जा रहा",
  "loading…": "लोड हो रहा है…",

  /* ---- feature cards ---- */
  "Live PM2.5 surface": "लाइव PM2.5 सतह",
  "An H3 hex grid rendered over real geography — 8,360 cells for Korba alone — with ground stations, ranked wards and a 72-hour scrubber.":
    "वास्तविक भूगोल पर H3 हेक्स ग्रिड — अकेले कोरबा के लिए 8,360 कोशिकाएँ — ज़मीनी स्टेशनों, क्रमबद्ध वार्डों और 72-घंटे स्लाइडर के साथ।",
  "Measured, not claimed": "मापा गया, दावा नहीं",
  "Every number is benchmarked against persistence and bias-corrected CAMS on a time-ordered split. The proof panel ships with the app.":
    "हर आँकड़ा समय-क्रम विभाजन पर persistence और सुधारित CAMS के मुक़ाबले जाँचा गया है। प्रमाण पैनल ऐप के साथ ही आता है।",
  "72-hour forecasting": "72-घंटे का पूर्वानुमान",
  "A gradient-boosted spatio-temporal model (one regressor per horizon) trained on 285,522 station-hours across 14 stations.":
    "14 स्टेशनों के 285,522 स्टेशन-घंटों पर प्रशिक्षित ग्रेडिएंट-बूस्टेड स्थानिक-कालिक मॉडल (हर अवधि के लिए अलग रिग्रेसर)।",
  "Source attribution": "स्रोत विश्लेषण",
  "SHAP over source features splits each cell into industry / traffic / fire / dust, cross-checked against the EDGAR emissions inventory.":
    "SHAP हर कोशिका को उद्योग / यातायात / आग / धूल में बाँटता है, और EDGAR उत्सर्जन सूची से मिलान करता है।",
  "Zero-station prediction": "बिना-सेंसर पूर्वानुमान",
  "Leave-one-station-out validation proves a never-seen location can be predicted from satellite, weather and emissions geography alone.":
    "Leave-one-station-out सत्यापन सिद्ध करता है कि कभी न देखी गई जगह का अनुमान केवल उपग्रह, मौसम और उत्सर्जन भूगोल से लगाया जा सकता है।",
  "Enforcement dossiers": "प्रवर्तन फ़ाइलें",
  "Ranked wards with population and school/hospital exposure, the named upwind plant, and a templated inspection action — in seconds.":
    "क्रमबद्ध वार्ड — जनसंख्या, स्कूल/अस्पताल जोखिम, नामित अपवात संयंत्र और तैयार निरीक्षण कार्रवाई के साथ — कुछ ही सेकंड में।",

  /* ---- steps ---- */
  "01 — INGEST": "01 — संग्रहण",
  "02 — PREDICT": "02 — पूर्वानुमान",
  "03 — INTERVENE": "03 — हस्तक्षेप",
  "Fuse every signal": "हर संकेत को जोड़ें",
  "CPCB station hours, Open-Meteo weather and CAMS, Sentinel-5P and MODIS columns, EDGAR emissions, WorldPop and OSM roads — harmonised onto one H3 grid and hourly clock.":
    "CPCB स्टेशन-घंटे, Open-Meteo मौसम और CAMS, Sentinel-5P व MODIS स्तंभ, EDGAR उत्सर्जन, WorldPop और OSM सड़कें — सब एक H3 ग्रिड और प्रति-घंटा घड़ी पर एकीकृत।",
  "Model the plume": "प्रदूषण-प्रवाह का मॉडल",
  "Gradient-boosted models forecast PM2.5 at +24/48/72h from lagged observations, meteorology and CAMS; a no-lag spatial model covers cells with no sensor history.":
    "ग्रेडिएंट-बूस्टेड मॉडल पिछले अवलोकनों, मौसम और CAMS से +24/48/72घं का PM2.5 पूर्वानुमान लगाते हैं; बिना-लैग स्थानिक मॉडल उन कोशिकाओं को कवर करता है जिनका कोई सेंसर इतिहास नहीं।",
  "Attribute & rank": "स्रोत पहचानें और क्रम दें",
  "SHAP attribution plus an upwind wind-cone names the likely source, then wards are ranked by exceedance × population × vulnerability into an action list.":
    "SHAP विश्लेषण और अपवात पवन-शंकु संभावित स्रोत बताते हैं, फिर वार्ड अतिक्रमण × जनसंख्या × संवेदनशीलता के आधार पर कार्रवाई सूची में क्रमबद्ध होते हैं।",

  /* ---- page heroes ---- */
  "LIVE CITIES · CHHATTISGARH": "लाइव शहर · छत्तीसगढ़",
  "Five cities. One live view of the air.": "पाँच शहर। हवा का एक लाइव दृश्य।",
  "Real-time PM2.5, US AQI and category for Korba, Bhilai, Raipur, Bilaspur — and Jagdalpur, which has no ground sensor and is predicted outright. Tap any city to open it on the live map.":
    "कोरबा, भिलाई, रायपुर, बिलासपुर के लिए वास्तविक-समय PM2.5, US AQI और श्रेणी — और जगदलपुर, जिसका कोई ज़मीनी सेंसर नहीं और जो पूरी तरह पूर्वानुमानित है। किसी भी शहर पर टैप करके लाइव मानचित्र खोलें।",
  "One control room for a region's air.": "पूरे क्षेत्र की हवा के लिए एक नियंत्रण कक्ष।",
  "From live hex-grid heatmaps to 72-hour forecasting and a ranked enforcement engine — everything a smart-city team needs to see, predict and act on urban air quality.":
    "लाइव हेक्स-ग्रिड हीटमैप से लेकर 72-घंटे पूर्वानुमान और क्रमबद्ध प्रवर्तन इंजन तक — शहरी वायु गुणवत्ता देखने, अनुमान लगाने और कार्रवाई करने के लिए ज़रूरी सब कुछ।",
  "HOW THE AI WORKS": "AI कैसे काम करता है",
  "From raw signal to clean-air action.": "कच्चे संकेत से स्वच्छ-वायु कार्रवाई तक।",
  "VAYU fuses CPCB stations, satellite columns, meteorology and emissions inventories, forecasts PM2.5 72 hours ahead, and turns that into ranked, evidence-backed interventions.":
    "VAYU, CPCB स्टेशनों, उपग्रह स्तंभों, मौसम और उत्सर्जन सूचियों को जोड़कर 72 घंटे आगे का PM2.5 पूर्वानुमान लगाता है, और उसे प्रमाण-आधारित क्रमबद्ध हस्तक्षेपों में बदलता है।",
  "VAYU fuses CPCB ground stations, satellite columns, meteorology and emissions inventories into one forecasting engine — predicting PM2.5 72 hours out, attributing it to a named source, and ranking where enforcement should go first. Including Jagdalpur, which has no ground sensor at all.":
    "VAYU, CPCB ज़मीनी स्टेशनों, उपग्रह स्तंभों, मौसम और उत्सर्जन सूचियों को एक पूर्वानुमान इंजन में जोड़ता है — 72 घंटे आगे का PM2.5 बताता है, उसे नामित स्रोत से जोड़ता है, और तय करता है कि प्रवर्तन पहले कहाँ जाए। जगदलपुर सहित, जहाँ कोई ज़मीनी सेंसर ही नहीं है।",
  "workflow slot": "वर्कफ़्लो स्लॉट",
  "This page is ready for the custom workflow you'll define. Tell me what to show here and I'll build it into this space.":
    "यह पृष्ठ आपके तय किए गए कस्टम वर्कफ़्लो के लिए तैयार है। बताइए यहाँ क्या दिखाना है, मैं इसी जगह बना दूँगा।",


  /* ---- flow steps ---- */
  "STEP 01": "चरण 01",
  "STEP 02": "चरण 02",
  "STEP 03": "चरण 03",
  "Data Ingestion": "डेटा संग्रहण",
  "ML Processing": "ML प्रसंस्करण",
  "Act & Enforce": "कार्रवाई और प्रवर्तन",
  "Sensors & Satellite": "सेंसर और उपग्रह",
  "AI Risk Scoring": "AI जोखिम आकलन",
  "Alerts & Actions": "चेतावनी और कार्रवाई",
  "14 CPCB reference stations via OpenAQ, Open-Meteo weather and CAMS, Sentinel-5P NO₂/SO₂ and MODIS AOD, EDGAR v8.1 emissions, WorldPop and OSM roads — harmonised onto one H3 grid and hourly clock.":
    "OpenAQ से 14 CPCB संदर्भ स्टेशन, Open-Meteo मौसम व CAMS, Sentinel-5P NO₂/SO₂ और MODIS AOD, EDGAR v8.1 उत्सर्जन, WorldPop और OSM सड़कें — सब एक H3 ग्रिड और प्रति-घंटा घड़ी पर एकीकृत।",
  "Gradient-boosted models forecast PM2.5 at +24/48/72 h, while a no-lag spatial model scores districts with no sensor at all. SHAP splits every cell into industry, traffic, fire and dust.":
    "ग्रेडिएंट-बूस्टेड मॉडल +24/48/72 घंटे का PM2.5 पूर्वानुमान देते हैं, और बिना-लैग स्थानिक मॉडल उन ज़िलों को आँकता है जहाँ कोई सेंसर ही नहीं। SHAP हर कोशिका को उद्योग, यातायात, आग और धूल में बाँटता है।",
  "Wards are ranked by exceedance × population × vulnerability, each with the named upwind plant, schools and hospitals exposed, and a templated inspection order — in English or Hindi.":
    "वार्ड अतिक्रमण × जनसंख्या × संवेदनशीलता के आधार पर क्रमबद्ध होते हैं — नामित अपवात संयंत्र, प्रभावित स्कूल-अस्पताल और तैयार निरीक्षण आदेश के साथ, अंग्रेज़ी या हिन्दी में।",
  "Forecast horizon": "पूर्वानुमान अवधि",
  "µg/m³ with no sensor": "µg/m³ बिना सेंसर",
  Languages: "भाषाएँ",

  /* ---- map workspace ---- */
  Cities: "शहर",
  "Search city…": "शहर खोजें…",
  "No match": "कोई मिलान नहीं",
  "Live Alerts": "लाइव चेतावनियाँ",
  "No active alerts": "कोई सक्रिय चेतावनी नहीं",
  "No district is above AQI 100 right now.": "अभी कोई ज़िला AQI 100 से ऊपर नहीं है।",
  people: "लोग",
  districts: "ज़िले",
  live: "लाइव",
  model: "मॉडल",
  View: "दृश्य",
  Wards: "वार्ड",


  /* ---- alert preview ---- */
  "MULTILINGUAL ALERTS": "बहुभाषी चेतावनियाँ",
  "Alerts that speak their language": "चेतावनी, उनकी अपनी भाषा में",
  "Every alert goes out in Hindi, Chhattisgarhi or English — on whichever channel reaches that official fastest. Built from the live reading, not a template.":
    "हर चेतावनी हिन्दी, छत्तीसगढ़ी या अंग्रेज़ी में जाती है — उसी माध्यम से जो अधिकारी तक सबसे तेज़ पहुँचे। लाइव रीडिंग से बनी, किसी तयशुदा साँचे से नहीं।",
  CHANNEL: "माध्यम",
  LANGUAGE: "भाषा",
  "Alert languages": "चेतावनी भाषाएँ",
  "Delivery channels": "वितरण माध्यम",
  "Live worst AQI": "लाइव सर्वाधिक AQI",
  "Auto-retry on no ACK": "उत्तर न मिलने पर पुनःप्रयास",
  "Preview of the message format. Delivery via Twilio (SMS / WhatsApp / IVR) is not connected yet — nothing is being sent.":
    "यह संदेश के प्रारूप की झलक है। Twilio (SMS / WhatsApp / IVR) से वितरण अभी जुड़ा नहीं है — कुछ भी भेजा नहीं जा रहा।",
  "just now": "अभी",
  "incoming call": "आती हुई कॉल",

  /* ---- city detail ---- */
  City: "शहर",
  LIVE: "लाइव",
  "PREDICTED · no sensor here": "पूर्वानुमानित · यहाँ सेंसर नहीं",
  "Model prediction": "मॉडल पूर्वानुमान",
  Role: "भूमिका",
  "Measured now at this city": "इस शहर पर अभी मापा गया",
  "as of": "समय",
  "This city has no CPCB station. Its value is predicted from satellite, meteorology and emissions geography — the basis the leave-one-station-out test validated.":
    "इस शहर में कोई CPCB स्टेशन नहीं है। इसका मान उपग्रह, मौसम और उत्सर्जन भूगोल से अनुमानित है — वही आधार जिसे leave-one-station-out परीक्षण ने सत्यापित किया।",


  /* ---- selection bar / preview / alerts ---- */
  Selection: "चयन",
  "Pick a city on the left or a district on the map to see its conditions.":
    "स्थिति देखने के लिए बाएँ से शहर या मानचित्र से ज़िला चुनें।",
  Category: "श्रेणी",
  "View all": "सभी देखें",
  "BILINGUAL ALERTS": "द्विभाषी चेतावनियाँ",
  "Every alert goes out in English or Hindi — on whichever channel reaches that official fastest. Built from the live reading, not a template.":
    "हर चेतावनी अंग्रेज़ी या हिन्दी में जाती है — उसी माध्यम से जो अधिकारी तक सबसे तेज़ पहुँचे। लाइव रीडिंग से बनी, किसी साँचे से नहीं।",

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
