import { NextResponse } from "next/server";

/**
 * Groq-backed chat.
 *
 * The model is given the page's real numbers as context and told, firmly, to
 * answer only from them — an LLM guessing an AQI would be worse than no chatbot
 * at all. With no GROQ_API_KEY set this returns `{ ok: false }` and the client
 * falls back to its deterministic lookup answers, so the assistant still works
 * offline and at a demo with no network.
 */

const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

const SYSTEM = `You are the VAYU assistant for an urban air-quality platform covering Chhattisgarh, India.

HARD RULES:
- Answer ONLY from the CONTEXT JSON provided. It is the live state of the dashboard.
- Never invent or estimate a number. If the context does not contain it, say you don't have it.
- Never claim a place has a sensor unless the context says so. Districts with
  n_stations = 0 are PREDICTED from satellite, meteorology and emissions data.
- Distinguish measured (display_basis "measured") from modelled ("model") values.
- Be concise: 2-4 sentences. Use µg/m³ and US AQI. Bold key figures with **…**.`;

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json(
      { ok: false, reason: "no_key", hint: "Set GROQ_API_KEY in web/.env.local to enable the LLM." },
      { status: 200 },
    );
  }

  let body: { message?: string; context?: unknown; history?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const message = (body.message ?? "").toString().slice(0, 1000);
  if (!message.trim()) return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "system",
            content: `CONTEXT (the dashboard's real current data):\n${JSON.stringify(
              body.context ?? {},
            ).slice(0, 24000)}`,
          },
          ...(body.history ?? []).slice(-6).map((m) => ({
            role: m.role === "bot" ? "assistant" : "user",
            content: String(m.content).slice(0, 800),
          })),
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { ok: false, reason: "upstream", status: res.status, detail: detail.slice(0, 300) },
        { status: 200 },
      );
    }
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content?.trim();
    if (!text) return NextResponse.json({ ok: false, reason: "empty_completion" }, { status: 200 });
    return NextResponse.json({ ok: true, text, model: MODEL });
  } catch (e) {
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", detail: String(e).slice(0, 200) },
      { status: 200 },
    );
  }
}
