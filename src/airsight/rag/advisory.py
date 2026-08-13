"""Lightweight RAG health advisories (EN + HI) with deterministic fallback.

Uses in-process chunk store + keyword retrieval (no vector DB required for demo).
If OPENAI_API_KEY / GEMINI_API_KEY present, optional LLM polish — otherwise pure templates.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Chunk:
    id: str
    source: str
    text_en: str
    text_hi: str
    tags: tuple[str, ...]


# Seed corpus — WHO / CPCB-style guidance (paraphrased, not copyrighted copies)
CORPUS: list[Chunk] = [
    Chunk(
        "who_pm_general",
        "WHO AQ guidelines (paraphrase)",
        "When PM2.5 is elevated, reduce outdoor exertion, especially for children, elderly, and people with asthma or heart disease.",
        "जब PM2.5 अधिक हो, बाहरी मेहनत कम करें; बच्चे, बुजुर्ग और अस्थमा/हृदय रोग वाले विशेष सावधानी रखें।",
        ("pm25", "general", "asthma", "child", "elderly"),
    ),
    Chunk(
        "cpcb_moderate",
        "CPCB citizen advisory (paraphrase)",
        "Moderate air quality: sensitive groups should limit prolonged outdoor activity; keep rescue inhalers handy.",
        "मध्यम वायु गुणवत्ता: संवेदनशील वर्ग लंबी बाहरी गतिविधि सीमित रखें; इनहेलर साथ रखें।",
        ("moderate", "asthma", "cpcb"),
    ),
    Chunk(
        "cpcb_poor",
        "CPCB citizen advisory (paraphrase)",
        "Poor or worse AQI: avoid outdoor sports, use N95 if travel is essential, keep windows closed during peak hours.",
        "खराब या उससे अधिक AQI: बाहरी खेल से बचें, आवश्यक यात्रा पर N95 पहनें, पीक समय खिड़कियाँ बंद रखें।",
        ("poor", "severe", "n95", "cpcb"),
    ),
    Chunk(
        "cpcb_severe",
        "CPCB health emergency (paraphrase)",
        "Severe/Hazardous band: schools may restrict outdoor assembly; seek medical care if breathing difficulty persists.",
        "गंभीर/खतरनाक स्तर: स्कूल बाहरी सभा सीमित कर सकते हैं; साँस लेने में तकलीफ हो तो चिकित्सा सहायता लें।",
        ("severe", "hazardous", "school", "child"),
    ),
    Chunk(
        "remedy_traffic",
        "Municipal playbook",
        "Traffic-dominated days: stagger office hours, wet-sweep corridors, prioritize public transport and odd-even if notified.",
        "यातायात-प्रधान दिन: कार्यालय समय बिखेरें, गलियारों की गीली सफाई, सार्वजनिक परिवहन और अधिसूचित विषम-सम को प्राथमिकता।",
        ("traffic", "remedy"),
    ),
    Chunk(
        "remedy_industry",
        "Industrial belt playbook",
        "Industry-linked spikes: tighten stack monitoring, pause non-essential dusty operations, deploy water cannons downwind of plants.",
        "उद्योग-संबंधी उछाल: स्टैक निगरानी कड़ी करें, गैर-ज़रूरी धूल वाले काम रोकें, संयंत्रों की पवन दिशा में वॉटर कैनन।",
        ("industry", "remedy"),
    ),
    Chunk(
        "remedy_fire",
        "Fire / biomass playbook",
        "Fire smoke: stay indoors, use wet cloth seals on doors, avoid open burning; support rapid fireline response upwind.",
        "आग का धुआँ: घर के अंदर रहें, दरवाज़ों पर गीले कपड़े, खुली जलन से बचें; पवन की दिशा में अग्निशमन तेज़ करें।",
        ("fire", "remedy"),
    ),
    Chunk(
        "remedy_dust",
        "Construction dust playbook",
        "Construction dust: mandatory covering of debris, on-site sprinkling every 2–3 hours, wheel wash at exits.",
        "निर्माण धूल: मलबे का ढकाव अनिवार्य, हर 2–3 घंटे छिड़काव, निकास पर व्हील वॉश।",
        ("dust", "construction", "remedy"),
    ),
]


def _band(pm25: float | None, aqi: float | None) -> str:
    v = aqi if aqi is not None else (None if pm25 is None else _pm_to_cpcb_aqi(pm25))
    if v is None:
        return "moderate"
    if v <= 50:
        return "good"
    if v <= 100:
        return "satisfactory"
    if v <= 200:
        return "moderate"
    if v <= 300:
        return "poor"
    if v <= 400:
        return "very_poor"
    return "severe"


def _pm_to_cpcb_aqi(pm: float) -> float:
    # coarse CPCB PM2.5 breakpoints
    bps = [
        (0, 30, 0, 50),
        (30, 60, 51, 100),
        (60, 90, 101, 200),
        (90, 120, 201, 300),
        (120, 250, 301, 400),
        (250, 500, 401, 500),
    ]
    for lo, hi, a_lo, a_hi in bps:
        if pm <= hi:
            if hi == lo:
                return a_hi
            return a_lo + (a_hi - a_lo) * (pm - lo) / (hi - lo)
    return 500.0


def retrieve(
    *,
    band: str,
    top_source: str | None,
    profile: dict[str, bool],
    k: int = 4,
) -> list[Chunk]:
    tags_wanted = {band, "general"}
    if top_source:
        tags_wanted.add(top_source.lower())
    for key in ("asthma", "child", "elderly"):
        if profile.get(key):
            tags_wanted.add(key)
    if band in {"poor", "very_poor", "severe"}:
        tags_wanted.update({"n95", "school", "severe"})

    scored: list[tuple[int, Chunk]] = []
    for ch in CORPUS:
        score = sum(1 for t in ch.tags if t in tags_wanted)
        if "remedy" in ch.tags and top_source and top_source.lower() in ch.tags:
            score += 2
        scored.append((score, ch))
    scored.sort(key=lambda x: (-x[0], x[1].id))
    picked = [c for s, c in scored if s > 0][:k]
    if not picked:
        picked = [CORPUS[0], CORPUS[1]]
    return picked


def _template_advisory(
    *,
    city_id: str,
    band: str,
    pm25: float | None,
    top_source: str | None,
    chunks: list[Chunk],
    profile: dict[str, bool],
) -> dict[str, str]:
    src = top_source or "mixed sources"
    pm_s = f"{pm25:.0f} µg/m³" if pm25 is not None else "elevated levels"
    who = [c for c in chunks if "remedy" not in c.tags]
    rem = [c for c in chunks if "remedy" in c.tags]
    en_body = " ".join(c.text_en for c in who[:2])
    hi_body = " ".join(c.text_hi for c in who[:2])
    en_act = rem[0].text_en if rem else "Follow local municipal guidance and limit outdoor exposure."
    hi_act = rem[0].text_hi if rem else "स्थानीय नगरपालिका निर्देशों का पालन करें और बाहरी संपर्क सीमित रखें।"

    profile_bits_en = []
    profile_bits_hi = []
    if profile.get("asthma"):
        profile_bits_en.append("asthma: keep inhaler accessible")
        profile_bits_hi.append("अस्थमा: इनहेलर पास रखें")
    if profile.get("child"):
        profile_bits_en.append("children: avoid outdoor PE/play")
        profile_bits_hi.append("बच्चे: बाहरी खेल/PT से बचें")
    if profile.get("elderly"):
        profile_bits_en.append("elderly: prefer indoor rest midday")
        profile_bits_hi.append("बुजुर्ग: दोपहर में घर के अंदर विश्राम")

    en = (
        f"[{city_id.title()} · {band.replace('_', ' ').title()}] "
        f"Current PM2.5 around {pm_s}; dominant signal: {src}. "
        f"{en_body} Action: {en_act}"
    )
    if profile_bits_en:
        en += " Profile notes: " + "; ".join(profile_bits_en) + "."

    hi = (
        f"[{city_id.title()} · {band.replace('_', ' ')}] "
        f"वर्तमान PM2.5 लगभग {pm_s}; प्रमुख संकेत: {src}. "
        f"{hi_body} कार्रवाई: {hi_act}"
    )
    if profile_bits_hi:
        hi += " प्रोफ़ाइल: " + "; ".join(profile_bits_hi) + "।"

    return {"en": en, "hi": hi}


def _maybe_llm_polish(en: str, hi: str) -> tuple[str, str, str]:
    """Optional polish. Returns (en, hi, mode). Never raises."""
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("OPENAI_API_KEY"):
        # Keep deterministic demo path unless explicitly forced
        if os.environ.get("VAYU_RAG_USE_LLM", "").lower() not in {"1", "true", "yes"}:
            return en, hi, "template"  # key present but default still template for demo safety
        return en, hi, "template_llm_stub"
    return en, hi, "template"


def generate_advisory(
    *,
    city_id: str = "raipur",
    pm25: float | None = 95.0,
    aqi: float | None = None,
    top_source: str | None = "traffic",
    asthma: bool = False,
    child: bool = False,
    elderly: bool = False,
) -> dict[str, Any]:
    profile = {"asthma": asthma, "child": child, "elderly": elderly}
    band = _band(pm25, aqi)
    chunks = retrieve(band=band, top_source=top_source, profile=profile)
    texts = _template_advisory(
        city_id=city_id,
        band=band,
        pm25=pm25,
        top_source=top_source,
        chunks=chunks,
        profile=profile,
    )
    en, hi, mode = _maybe_llm_polish(texts["en"], texts["hi"])
    return {
        "city_id": city_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "band": band,
        "pm25": pm25,
        "aqi": aqi if aqi is not None else (_pm_to_cpcb_aqi(pm25) if pm25 is not None else None),
        "top_source": top_source,
        "profile": profile,
        "mode": mode,
        "advisory_en": en,
        "advisory_hi": hi,
        "citations": [
            {"id": c.id, "source": c.source, "tags": list(c.tags)} for c in chunks
        ],
        "whatsapp_preview": {
            "en": en,
            "hi": hi,
            "channel": "whatsapp",
        },
    }
