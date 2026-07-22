import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Gemini-backed chat with multi-key pool & rate-limit auto-failover.
 *
 * If a key hits rate limits (429) or quota errors (403), the system automatically
 * retries with the next available key in your key pool before giving up.
 */

const SYSTEM = `You are Vayu Assist, the assistant for VAYU — an urban air-quality
platform covering Chhattisgarh, India.

You may answer ANY question the user asks, including general knowledge, health
advice, or how to interpret air-quality science. Be genuinely helpful.

The one hard rule: whenever you state a NUMBER about this platform's places
(AQI, PM2.5, population, station counts, model accuracy), it must come from the
CONTEXT JSON below — that is the live state of the dashboard. Never invent or
estimate those. If the context lacks a figure, say so plainly.

Also:
- Districts with n_stations = 0 have NO ground sensor; their values are
  PREDICTED from satellite, meteorology and emissions data. Never imply otherwise.
- Distinguish measured (basis "measured") from modelled (basis "model") values.
- Keep replies to 2-5 sentences unless asked for more. Use µg/m³ and US AQI.
- Bold key figures with **…**.
- Reply in the language requested by the LANGUAGE directive.`;

function getApiKeys(): { keys: string[]; isGemini: boolean } {
  const keys: string[] = [];

  const addKeysFromStr = (str?: string) => {
    if (!str) return;
    for (const k of str.split(/[\s,]+/)) {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    }
  };

  // 1. Process environment variables
  addKeysFromStr(process.env.GEMINI_API_KEYS);
  addKeysFromStr(process.env.GEMINI_API_KEY);
  addKeysFromStr(process.env.GEMINI_API_KEY_1);
  addKeysFromStr(process.env.GEMINI_API_KEY_2);
  addKeysFromStr(process.env.GEMINI_API_KEY_3);
  addKeysFromStr(process.env.GEMINI_API_KEY_4);

  // Fallback to Groq if set and no Gemini keys
  if (keys.length === 0 && process.env.GROQ_API_KEY) {
    addKeysFromStr(process.env.GROQ_API_KEY);
    return { keys, isGemini: false };
  }

  // 2. Read root .env file (../.env relative to web directory)
  try {
    const rootEnvPath = path.resolve(process.cwd(), "../.env");
    if (fs.existsSync(rootEnvPath)) {
      const content = fs.readFileSync(rootEnvPath, "utf-8");

      // Match GEMINI_API_KEY, GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
      const matches = Array.from(content.matchAll(/^GEMINI_API_KEY[_\d]*=["']?\s*([^"'\r\n]+)\s*["']?/gm));
      for (const m of matches) {
        if (m[1]) addKeysFromStr(m[1]);
      }
      const keysMatches = Array.from(content.matchAll(/^GEMINI_API_KEYS=["']?([^"'\r\n]+)["']?/gm));
      for (const m of keysMatches) {
        if (m[1]) addKeysFromStr(m[1]);
      }

      // Check Groq in .env if still no Gemini keys found
      if (keys.length === 0) {
        const groqMatch = content.match(/^GROQ_API_KEY=["']?([^"'\r\n]+)["']?/m);
        if (groqMatch?.[1]) {
          addKeysFromStr(groqMatch[1]);
          return { keys, isGemini: false };
        }
      }
    }
  } catch {
    /* ignore file reading errors */
  }

  return { keys, isGemini: true };
}

export async function POST(req: Request) {
  const { keys, isGemini } = getApiKeys();

  if (keys.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "no_key", hint: "Set GEMINI_API_KEY (or GEMINI_API_KEY_1, GEMINI_API_KEY_2) in your root .env file." },
      { status: 200 },
    );
  }

  const model =
    process.env.GEMINI_MODEL ??
    (isGemini ? "gemini-2.0-flash" : process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile");

  const endpoint = isGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  let body: { message?: string; context?: unknown; history?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  const lang = (body as { lang?: string }).lang === "hi" ? "hi" : "en";
  const langLine =
    lang === "hi"
      ? "LANGUAGE: Reply in Hindi (Devanagari script). Keep place names and units as-is."
      : "LANGUAGE: Reply in English.";
  const message = (body.message ?? "").toString().slice(0, 1000);
  if (!message.trim()) return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });

  // Shuffle starting key index so load is spread across keys
  const startIdx = Math.floor(Math.random() * keys.length);
  let lastErrorDetail = "";
  let lastStatus = 500;

  // Try each key in the pool if rate limited or failed
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[(startIdx + i) % keys.length];

    const modelsToTry = [model];

    for (const mTarget of modelsToTry) {
      try {
        if (isGemini) {
          // Native Google Generative AI REST Endpoint
          const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${mTarget}:generateContent?key=${currentKey}`;
          const nativeRes = await fetch(nativeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: {
                parts: [
                  {
                    text: `${SYSTEM}\n\nCONTEXT (the dashboard's real current data):\n${JSON.stringify(
                      body.context ?? {},
                    ).slice(0, 24000)}`,
                  },
                ],
              },
              contents: [
                ...(body.history ?? []).slice(-6).map((m) => ({
                  role: m.role === "bot" ? "model" : "user",
                  parts: [{ text: String(m.content).slice(0, 800) }],
                })),
                { role: "user", parts: [{ text: message }] },
              ],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 400,
              },
            }),
          });

          if (nativeRes.ok) {
            const json = await nativeRes.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              return NextResponse.json({ ok: true, text, model: mTarget });
            }
          }

          lastStatus = nativeRes.status;
          const errText = await nativeRes.text();
          lastErrorDetail = errText;

          // If status is 404 or 400, try next Gemini model
          if ((nativeRes.status === 404 || nativeRes.status === 400) && mTarget !== modelsToTry[modelsToTry.length - 1]) {
            continue;
          }
          if (nativeRes.status !== 429 && nativeRes.status !== 403) {
            break;
          }
        } else {
          // Groq / OpenAI Compatible Endpoint
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentKey}`,
            },
            body: JSON.stringify({
              model: mTarget,
              temperature: 0.2,
              max_tokens: 400,
              messages: [
                { role: "system", content: `${SYSTEM}

${langLine}` },
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

          if (res.ok) {
            const json = await res.json();
            const text = json?.choices?.[0]?.message?.content?.trim();
            if (text) {
              return NextResponse.json({ ok: true, text, model: mTarget });
            }
          }

          lastStatus = res.status;
          lastErrorDetail = await res.text();

          if (res.status !== 429 && res.status !== 403) {
            break;
          }
        }
      } catch (e) {
        lastErrorDetail = String(e);
      }
    }
  }

  let formattedHint = lastErrorDetail;
  if (lastStatus === 404 || lastStatus === 400) {
    formattedHint = "Invalid API Key or Unactivated Project. Ensure your key comes from https://aistudio.google.com/ (starts with AIzaSy...).";
  }

  return NextResponse.json(
    { ok: false, reason: "upstream_failed", status: lastStatus, detail: formattedHint },
    { status: 200 },
  );
}
