"""Bake citizen health-risk advisories from hospital + school registries.

Inputs
  data/HospitalList.xlsx          — district-level hospital register
  data/schools_ml_ready.csv       — district-level school register
  web/public/data/live/latest.json
  web/public/data/<city>/priority_wards.json  (optional, for PM forecast)

Outputs
  web/public/data/advisories/index.json
  web/public/data/<city>/advisories.json   for korba / jagdalpur demo cities
  data/processed/facilities_by_city.json   for reuse

City → administrative district mapping (Chhattisgarh):
  korba      → KORBA
  raipur     → RAIPUR
  bhilai     → DURG          (Bhilai Steel Plant sits in Durg)
  bilaspur   → BILASPUR
  jagdalpur  → BASTAR / BASTER
  tumidih/milupara/chhal/kunjemara → RAIGARH

Run:  python scripts/bake/bake_advisories.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say, warn  # noqa: E402

WEB = ROOT / "web" / "public" / "data"

# city_id → list of district name patterns (uppercase, flexible match)
CITY_DISTRICTS: dict[str, list[str]] = {
    "korba": ["KORBA"],
    "raipur": ["RAIPUR"],
    "bhilai": ["DURG"],
    "bilaspur": ["BILASPUR"],
    "jagdalpur": ["BASTAR", "BASTER"],
    "tumidih": ["RAIGARH"],
    "milupara": ["RAIGARH"],
    "chhal": ["RAIGARH"],
    "kunjemara": ["RAIGARH"],
}

CITY_NAMES = {
    "korba": "Korba",
    "raipur": "Raipur",
    "bhilai": "Bhilai",
    "bilaspur": "Bilaspur",
    "jagdalpur": "Jagdalpur",
    "tumidih": "Tumidih",
    "milupara": "Milupara",
    "chhal": "Chhal",
    "kunjemara": "Kunjemara",
}


def _norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def _match_district(name: str, patterns: list[str]) -> bool:
    n = _norm(name)
    for p in patterns:
        pn = _norm(p)
        if pn in n or n in pn:
            return True
    return False


def load_hospitals() -> pd.DataFrame:
    p = DATA / "HospitalList.xlsx"
    df = pd.read_excel(p)
    df = df.rename(columns={
        "District Name": "district",
        "Hospital Type": "type",
        "Hospital Name": "name",
        "Hospital Address": "address",
        "Landline No": "landline",
        "Mobile No": "mobile",
    })
    df["district"] = df["district"].astype(str)
    return df


def load_schools() -> pd.DataFrame:
    p = DATA / "schools_ml_ready.csv"
    df = pd.read_csv(p, low_memory=False)
    df = df.rename(columns={
        "District": "district",
        "Block": "block",
        "School": "name",
        "Status": "status",
    })
    df["district"] = df["district"].astype(str)
    # prefer open schools when status present
    if "status" in df.columns:
        open_mask = df["status"].astype(str).str.upper().str.contains("OPEN", na=True)
        df = df[open_mask | df["status"].isna()]
    return df


def facilities_for_city(city_id: str, hospitals: pd.DataFrame, schools: pd.DataFrame) -> dict:
    pats = CITY_DISTRICTS[city_id]
    h = hospitals[hospitals["district"].apply(lambda d: _match_district(d, pats))].copy()
    s = schools[schools["district"].apply(lambda d: _match_district(d, pats))].copy()

    h_public = int((h["type"].astype(str).str.lower() == "public").sum()) if len(h) else 0
    h_private = int(len(h) - h_public)

    hosp_list = []
    for _, r in h.head(40).iterrows():
        hosp_list.append({
            "name": str(r.get("name", ""))[:120],
            "type": str(r.get("type", "")),
            "address": str(r.get("address", ""))[:160] if pd.notna(r.get("address")) else "",
            "district": str(r.get("district", "")),
        })

    school_list = []
    for _, r in s.head(40).iterrows():
        school_list.append({
            "name": str(r.get("name", ""))[:140],
            "block": str(r.get("block", "")) if pd.notna(r.get("block")) else "",
            "district": str(r.get("district", "")),
        })

    return {
        "city_id": city_id,
        "city_name": CITY_NAMES[city_id],
        "districts_matched": pats,
        "hospitals": {
            "total": int(len(h)),
            "public": h_public,
            "private": h_private,
            "sample": hosp_list,
        },
        "schools": {
            "total": int(len(s)),
            "sample": school_list,
        },
    }


def risk_band(pm25: float | None, aqi: float | None) -> tuple[str, str, int]:
    """Return (band_en, band_hi, severity 0-5). Prefer AQI if present else PM2.5 proxy."""
    if aqi is not None and aqi == aqi:
        x = float(aqi)
        if x <= 50:
            return "Good", "अच्छा", 0
        if x <= 100:
            return "Moderate", "मध्यम", 1
        if x <= 150:
            return "Unhealthy for sensitive groups", "संवेदनशील वर्गों के लिए अस्वस्थ", 2
        if x <= 200:
            return "Unhealthy", "अस्वस्थ", 3
        if x <= 300:
            return "Very unhealthy", "बहुत अस्वस्थ", 4
        return "Hazardous", "खतरनाक", 5
    if pm25 is None or pm25 != pm25:
        return "Unknown", "अज्ञात", 1
    # rough CPCB-style PM2.5 breakpoints for messaging
    p = float(pm25)
    if p <= 30:
        return "Good", "अच्छा", 0
    if p <= 60:
        return "Satisfactory", "संतोषजनक", 1
    if p <= 90:
        return "Moderate", "मध्यम", 2
    if p <= 120:
        return "Poor", "खराब", 3
    if p <= 250:
        return "Very poor", "बहुत खराब", 4
    return "Severe", "गंभीर", 5


def actions_for(severity: int, lang: str) -> list[str]:
    en = {
        0: [
            "Normal outdoor activity is fine for most people.",
            "Sensitive groups: enjoy outdoor time as usual.",
        ],
        1: [
            "Sensitive groups (asthma, COPD, elderly, children): limit prolonged outdoor exertion.",
            "Schools: prefer indoor PE if students show respiratory symptoms.",
        ],
        2: [
            "Children, elderly, and patients with heart/lung disease: reduce outdoor time.",
            "Schools: shift outdoor assembly/sports indoors where possible.",
            "Hospitals: expect slight rise in respiratory OPD — keep nebulisers ready.",
        ],
        3: [
            "Avoid outdoor exercise. Wear a mask (N95) if you must go out.",
            "Schools: cancel outdoor sports and morning assembly outdoors.",
            "Hospitals: prioritise respiratory and cardiac cases; inform public helpline.",
            "Workers outdoors: rotate shifts and provide rest breaks.",
        ],
        4: [
            "Stay indoors with windows closed if possible; use air purifier if available.",
            "Schools: consider early closure / remote learning for primary grades.",
            "Hospitals: activate surge plan for respiratory admissions.",
            "Municipal: water-spraying on roads; curb open burning.",
        ],
        5: [
            "Emergency: stay indoors. Avoid all outdoor activity.",
            "Schools: close outdoor activities; protect children with comorbidities.",
            "Hospitals: full surge protocol; coordinate with district administration.",
            "Industry: enforce stack checks and idle-plant controls immediately.",
        ],
    }
    hi = {
        0: ["अधिकांश लोगों के लिए बाहरी गतिविधियाँ सामान्य रखें।", "बच्चे व बुज़ुर्ग सामान्य रूप से बाहर रह सकते हैं।"],
        1: ["अस्थमा/COPD/बुज़ुर्ग/बच्चे: लंबी बाहरी मेहनत सीमित करें।", "स्कूल: लक्षण होने पर खेल-कूद घर के अंदर रखें।"],
        2: ["बच्चे, बुज़ुर्ग, हृदय/फेफड़े के मरीज़: बाहर का समय घटाएँ।", "स्कूल: प्रार्थना/खेल जहाँ संभव हो अंदर करें।", "अस्पताल: साँस संबंधी OPD के लिए तैयार रहें।"],
        3: ["बाहरी व्यायाम न करें। बाहर जाना हो तो N95 मास्क पहनें।", "स्कूल: बाहरी खेल व सभा रद्द करें।", "अस्पताल: साँस/हृदय के मामलों को प्राथमिकता दें।"],
        4: ["जितना हो सके घर के अंदर रहें; खिड़कियाँ बंद रखें।", "स्कूल: प्राथमिक कक्षाओं के लिए वैकल्पिक व्यवस्था सोचें।", "अस्पताल: साँस संबंधी भर्ती के लिए सरज प्लान सक्रिय करें।"],
        5: ["आपातकाल: घर के अंदर रहें। बाहरी गतिविधि पूर्णतः बंद।", "स्कूल: बाहरी गतिविधियाँ बंद; संवेदनशील बच्चों की सुरक्षा।", "अस्पताल: पूर्ण सरज प्रोटोकॉल; प्रशासन से समन्वय।"],
    }
    return (hi if lang == "hi" else en).get(severity, en[1])


def advisory_message(city_name: str, pm25, aqi, band_en, band_hi, n_h, n_s, top_source, lang: str) -> str:
    src = top_source or "mixed sources"
    if lang == "hi":
        return (
            f"{city_name}: वर्तमान वायु गुणवत्ता {band_hi}। "
            f"PM2.5 ≈ {pm25 if pm25 is not None else '—'} µg/m³"
            f"{f', AQI {int(aqi)}' if aqi is not None else ''}। "
            f"मुख्य स्रोत: {src}। "
            f"ज़िले में दर्ज {n_h} अस्पताल व {n_s} स्कूल संवेदनशील आबादी की सेवा करते हैं — "
            f"बच्चों, बुज़ुर्गों व फेफड़ों के मरीज़ों के लिए सलाह लागू करें।"
        )
    return (
        f"{city_name}: air quality is {band_en}. "
        f"PM2.5 ≈ {pm25 if pm25 is not None else '—'} µg/m³"
        f"{f', AQI {int(aqi)}' if aqi is not None else ''}. "
        f"Dominant source: {src}. "
        f"{n_h} hospitals and {n_s} schools are registered in this district — "
        f"prioritise protection for children, elderly, and respiratory patients."
    )


def live_for(city_id: str) -> dict:
    p = WEB / "live" / "latest.json"
    if not p.exists():
        return {}
    rows = json.loads(p.read_text(encoding="utf-8"))
    for r in rows:
        if r.get("city_id") == city_id:
            return r
    return {}


def priority_top(city_id: str) -> dict:
    p = WEB / city_id / "priority_wards.json"
    if not p.exists():
        return {}
    d = json.loads(p.read_text(encoding="utf-8"))
    dossiers = d.get("dossiers") or []
    if not dossiers:
        return {}
    top = dossiers[0]
    # average shares across top dossiers
    keys = ["traffic", "industry", "fire", "dust"]
    acc = {k: 0.0 for k in keys}
    for x in dossiers[:5]:
        sh = x.get("attribution_shares") or x.get("shares") or {}
        for k in keys:
            acc[k] += float(sh.get(k, 0))
    n = min(5, len(dossiers))
    shares = {k: round(acc[k] / n, 3) for k in keys}
    return {
        "predicted_pm25": top.get("predicted_pm25"),
        "top_source": top.get("top_source"),
        "shares": shares,
        "ward": top.get("ward"),
        "n_dossiers": len(dossiers),
    }


def build_city_advisory(city_id: str, fac: dict) -> dict:
    live = live_for(city_id)
    pr = priority_top(city_id)
    pm25 = live.get("current_pm25") or live.get("measured_pm25_24h") or pr.get("predicted_pm25")
    aqi = live.get("current_us_aqi") or live.get("measured_us_aqi")
    if pm25 is not None:
        try:
            pm25 = round(float(pm25), 1)
        except (TypeError, ValueError):
            pm25 = None
    if aqi is not None:
        try:
            aqi = float(aqi)
        except (TypeError, ValueError):
            aqi = None

    band_en, band_hi, sev = risk_band(pm25, aqi)
    n_h = fac["hospitals"]["total"]
    n_s = fac["schools"]["total"]
    top_source = pr.get("top_source") or live.get("source") or "industry"

    return {
        "city_id": city_id,
        "city_name": fac["city_name"],
        "districts_matched": fac["districts_matched"],
        "air": {
            "pm25": pm25,
            "us_aqi": aqi,
            "band_en": band_en,
            "band_hi": band_hi,
            "severity": sev,
            "basis": "measured" if live.get("measured") else ("model" if pr else "live"),
            "top_source": top_source,
            "source_shares": pr.get("shares"),
            "priority_ward": pr.get("ward"),
        },
        "exposure": {
            "hospitals_total": n_h,
            "hospitals_public": fac["hospitals"]["public"],
            "hospitals_private": fac["hospitals"]["private"],
            "schools_total": n_s,
            "vulnerable_note_en": (
                f"{n_s:,} schools and {n_h:,} hospitals in the administrative district "
                f"are exposure-sensitive receptors for this advisory."
            ),
            "vulnerable_note_hi": (
                f"इस ज़िले में {n_s:,} स्कूल व {n_h:,} अस्पताल संवेदनशील रिसेप्टर हैं।"
            ),
        },
        "hospitals_sample": fac["hospitals"]["sample"][:12],
        "schools_sample": fac["schools"]["sample"][:12],
        "messages": {
            "en": advisory_message(fac["city_name"], pm25, aqi, band_en, band_hi, n_h, n_s, top_source, "en"),
            "hi": advisory_message(fac["city_name"], pm25, aqi, band_en, band_hi, n_h, n_s, top_source, "hi"),
        },
        "actions": {
            "en": actions_for(sev, "en"),
            "hi": actions_for(sev, "hi"),
        },
        "audience": [
            {"id": "children", "en": "School children", "hi": "स्कूली बच्चे"},
            {"id": "elderly", "en": "Elderly", "hi": "बुज़ुर्ग"},
            {"id": "patients", "en": "Hospital / chronic patients", "hi": "अस्पताल / दीर्घ रोगी"},
            {"id": "outdoor_workers", "en": "Outdoor workers", "hi": "बाहरी कामगार"},
        ],
    }


def main() -> None:
    print("=" * 80)
    print("BAKE CITIZEN HEALTH ADVISORIES (hospitals + schools)")
    print("=" * 80)

    hospitals = load_hospitals()
    schools = load_schools()
    say(f"hospitals {len(hospitals):,} · schools {len(schools):,}")

    facilities = {}
    advisories = {}
    for city_id in CITY_DISTRICTS:
        fac = facilities_for_city(city_id, hospitals, schools)
        facilities[city_id] = fac
        adv = build_city_advisory(city_id, fac)
        advisories[city_id] = adv
        say(
            f"{city_id}: hospitals={fac['hospitals']['total']:,} "
            f"schools={fac['schools']['total']:,} "
            f"risk={adv['air']['band_en']} pm25={adv['air']['pm25']}"
        )

    # processed snapshot
    out_proc = ensure(DATA / "processed") / "facilities_by_city.json"
    out_proc.write_text(json.dumps(facilities, indent=2, ensure_ascii=False), encoding="utf-8")
    ok(f"wrote {out_proc.relative_to(ROOT)}")

    # public index
    adv_dir = ensure(WEB / "advisories")
    index = {
        "version": "v1",
        "source": {
            "hospitals": "data/HospitalList.xlsx",
            "schools": "data/schools_ml_ready.csv",
        },
        "cities": [
            {
                "city_id": c,
                "city_name": CITY_NAMES[c],
                "hospitals": facilities[c]["hospitals"]["total"],
                "schools": facilities[c]["schools"]["total"],
                "severity": advisories[c]["air"]["severity"],
                "band_en": advisories[c]["air"]["band_en"],
                "pm25": advisories[c]["air"]["pm25"],
            }
            for c in CITY_DISTRICTS
        ],
        "advisories": advisories,
    }
    (adv_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    ok("wrote web/public/data/advisories/index.json")

    # per demo city copy for dashboard hooks
    for city_id in ("korba", "jagdalpur"):
        city_dir = ensure(WEB / city_id)
        payload = advisories[city_id]
        (city_dir / "advisories.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        ok(f"wrote web/public/data/{city_id}/advisories.json")

    print()
    print("PS5 citizen advisory: district hospital + school exposure × live/model AQ")
    print("Languages: EN + HI templates · delivery channels still preview-only")


if __name__ == "__main__":
    main()
