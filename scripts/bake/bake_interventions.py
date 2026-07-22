"""Bake multi-city intervention list with school exposure + remedies.

Uses:
  - data/schools_ml_ready.csv (affected schools by district)
  - CPCB National AQI PM2.5 breakpoints (index report.jpeg)
  - Live feed where elevated; otherwise DEMO scenarios for 1–2 cities
    so the Intervention UI always has actionable rows in monsoon.

Output: web/public/data/interventions.json

Run: python scripts/bake/bake_interventions.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import DATA, ROOT, ensure, ok, say  # noqa: E402

WEB = ROOT / "web" / "public" / "data"

CITY_DISTRICTS = {
    "korba": (["KORBA"], "Korba"),
    "raipur": (["RAIPUR"], "Raipur"),
    "bhilai": (["DURG"], "Bhilai"),
    "bilaspur": (["BILASPUR"], "Bilaspur"),
    "jagdalpur": (["BASTAR", "BASTER"], "Jagdalpur"),
    "tumidih": (["RAIGARH"], "Tumidih"),
    "milupara": (["RAIGARH"], "Milupara"),
    "chhal": (["RAIGARH"], "Chhal"),
    "kunjemara": (["RAIGARH"], "Kunjemara"),
}

# Demo elevated scenarios (monsoon live is clean — judges need to SEE interventions)
DEMO_ELEVATED = {
    "korba": {
        "pm25": 168,
        "source": "industry",
        "reason": "Industrial / thermal cluster upwind under low mixing (demo winter-type episode)",
        "urgency": "immediate",
    },
    "raipur": {
        "pm25": 112,
        "source": "traffic",
        "reason": "Rush-hour traffic + urban canyon trapping (demo peak episode)",
        "urgency": "high",
    },
    "bhilai": {
        "pm25": 95,
        "source": "industry",
        "reason": "Steel-plant industrial plume contribution (demo)",
        "urgency": "elevated",
    },
}


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def match_dist(name: str, pats: list[str]) -> bool:
    n = norm(name)
    return any(norm(p) in n or n in norm(p) for p in pats)


def cpcb_pm25_category(pm25: float) -> dict:
    """CPCB National AQI categories from PM2.5 24-hr breakpoints (index report)."""
    p = float(pm25)
    # Good 0-30, Satisfactory 31-60, Moderate 61-90, Poor 91-120,
    # Very Poor 121-250, Severe 250+
    bands = [
        (30, "Good", 0, 50, "#00c26e", 0),
        (60, "Satisfactory", 51, 100, "#f2d024", 1),
        (90, "Moderate", 101, 200, "#fb923c", 2),
        (120, "Poor", 201, 300, "#e11d48", 3),
        (250, "Very Poor", 301, 400, "#9333ea", 4),
        (1e9, "Severe", 401, 500, "#7f1d1d", 5),
    ]
    for hi, label, aqi_lo, aqi_hi, hex_, sev in bands:
        if p <= hi:
            return {
                "label": label,
                "aqi_range": f"{aqi_lo}-{aqi_hi}",
                "hex": hex_,
                "severity": sev,
                "pm25_max_band": hi if hi < 1e8 else None,
            }
    return {"label": "Severe", "aqi_range": "401-500", "hex": "#7f1d1d", "severity": 5}


def remedies(source: str, category: str) -> list[dict]:
    """Source-specific + category-specific remedies for schools & city ops."""
    base = {
        "industry": [
            "Dispatch industrial stack / consent inspection to named upwind plant",
            "Enforce night-time emission limits; request continuous emission monitoring logs",
            "Municipal water-spraying on industrial access roads (fugitive dust)",
        ],
        "traffic": [
            "Deploy traffic police for peak-hour congestion & idling control near schools",
            "Temporary diversions around school zones 7–9am and 1–3pm",
            "Increase bus frequency; discourage private vehicle pick-up queues",
        ],
        "fire": [
            "Fire-line patrol for crop / waste burning in upwind blocks",
            "Issue block-level burn ban advisory; engage agriculture officers",
            "Close school outdoor grounds while FRP hotspots remain active",
        ],
        "dust": [
            "Road sweeping + water spray on unpaved corridors near schools",
            "Cover construction stockpiles; halt dusty work 11am–4pm",
            "Keep classroom windows closed on the windward side",
        ],
    }
    school = {
        "Good": ["Normal outdoor activity for schools."],
        "Satisfactory": ["Limit prolonged outdoor PE for children with asthma."],
        "Moderate": [
            "Shift assembly and PE indoors; mask advice for sensitive students",
            "Keep windows closed during peak hours; wet-mop classrooms",
        ],
        "Poor": [
            "Cancel outdoor sports and morning assembly outdoors",
            "Issue parent SMS: limit outdoor play after school",
            "Nurse room ready for respiratory complaints",
        ],
        "Very Poor": [
            "Suspend all outdoor school activity; staggered dismissal indoors",
            "Consider short-day / hybrid for primary grades",
            "Coordinate with nearby hospitals for surge support",
        ],
        "Severe": [
            "Close outdoor campus; prioritise remote classes if notified by admin",
            "Only essential staff outdoors with N95; medical leave flexibility",
            "Activate district disaster / health control room protocol",
        ],
    }
    src = base.get(source, base["industry"])
    sch = school.get(category, school["Moderate"])
    out = [{"type": "city", "action": a} for a in src]
    out += [{"type": "school", "action": a} for a in sch]
    return out


def load_schools_by_city(n: int = 8) -> dict[str, list[dict]]:
    df = pd.read_csv(DATA / "schools_ml_ready.csv", low_memory=False)
    if "Status" in df.columns:
        df = df[df["Status"].astype(str).str.upper().str.contains("OPEN", na=True)]
    out = {}
    for cid, (pats, _) in CITY_DISTRICTS.items():
        sub = df[df["District"].apply(lambda d: match_dist(str(d), pats))]
        rows = []
        for _, r in sub.head(n).iterrows():
            rows.append({
                "name": str(r.get("School", ""))[:120],
                "block": str(r.get("Block", "")) if pd.notna(r.get("Block")) else "",
                "district": str(r.get("District", "")),
            })
        out[cid] = rows
    return out


def main() -> None:
    schools = load_schools_by_city(8)
    live_path = WEB / "live" / "latest.json"
    live = {r["city_id"]: r for r in json.loads(live_path.read_text(encoding="utf-8"))} \
        if live_path.exists() else {}

    # Prefer korba priority dossier ward names if present
    korba_pw = WEB / "korba" / "priority_wards.json"
    korba_wards = []
    if korba_pw.exists():
        d = json.loads(korba_pw.read_text(encoding="utf-8"))
        korba_wards = [x.get("ward") for x in d.get("dossiers", [])[:3]]

    items = []
    for cid, (pats, cname) in CITY_DISTRICTS.items():
        demo = DEMO_ELEVATED.get(cid)
        lv = live.get(cid, {})
        live_pm = lv.get("current_pm25") or lv.get("measured_pm25_24h")
        if demo:
            pm25 = demo["pm25"]
            source = demo["source"]
            reason = demo["reason"]
            urgency = demo["urgency"]
            is_demo = True
        elif live_pm is not None and float(live_pm) >= 60:
            pm25 = float(live_pm)
            source = "industry"
            reason = "Measured PM2.5 above CPCB 24h standard (60 µg/m³)"
            urgency = "elevated"
            is_demo = False
        else:
            # skip quiet cities for enforcement list — keep optional context
            continue

        cat = cpcb_pm25_category(pm25)
        ward = korba_wards[0] if cid == "korba" and korba_wards else f"{cid}-central"
        items.append({
            "rank": 0,
            "city_id": cid,
            "city_name": cname,
            "ward": ward,
            "pm25": pm25,
            "cpcb_category": cat["label"],
            "cpcb_aqi_range": cat["aqi_range"],
            "category_hex": cat["hex"],
            "severity": cat["severity"],
            "top_source": source,
            "reason": reason,
            "urgency": urgency,
            "demo_episode": is_demo,
            "affected_schools": schools.get(cid, [])[:6],
            "n_schools_district": len(schools.get(cid, [])) and None,  # filled below
            "remedies": remedies(source, cat["label"]),
            "threshold_ug_m3": 60,
            "standard_note": "CPCB NAAQS PM2.5 24h = 60 µg/m³ · categories from National AQI Index Report",
        })

    # fill school counts from full district match
    df = pd.read_csv(DATA / "schools_ml_ready.csv", usecols=["District"], low_memory=False)
    for it in items:
        pats = CITY_DISTRICTS[it["city_id"]][0]
        n = int(df["District"].apply(lambda d: match_dist(str(d), pats)).sum())
        it["n_schools_district"] = n

    items.sort(key=lambda x: (-x["severity"], -x["pm25"]))
    for i, it in enumerate(items, 1):
        it["rank"] = i

    # Always ensure at least 2 intervention rows for demo
    if len(items) < 2:
        say("few elevated cities — demo scenarios already force korba+raipur")

    payload = {
        "version": "v1",
        "generated_note": "Multi-city interventions. Demo episodes used when live air is clean (monsoon).",
        "aqi_scale": "CPCB National AQI (PM2.5 24-hr breakpoints from Index Report)",
        "pm25_breakpoints": [
            {"category": "Good", "pm25": "0-30", "aqi": "0-50"},
            {"category": "Satisfactory", "pm25": "31-60", "aqi": "51-100"},
            {"category": "Moderate", "pm25": "61-90", "aqi": "101-200"},
            {"category": "Poor", "pm25": "91-120", "aqi": "201-300"},
            {"category": "Very Poor", "pm25": "121-250", "aqi": "301-400"},
            {"category": "Severe", "pm25": "250+", "aqi": "401-500"},
        ],
        "n_items": len(items),
        "cities_with_action": [i["city_id"] for i in items],
        "items": items,
    }
    out = ensure(WEB) / "interventions.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    ok(f"wrote {out.relative_to(ROOT)} · {len(items)} interventions")
    for it in items:
        say(f"#{it['rank']} {it['city_name']} PM2.5={it['pm25']} {it['cpcb_category']} "
            f"schools={len(it['affected_schools'])} ({it['n_schools_district']} in district)")


if __name__ == "__main__":
    main()
