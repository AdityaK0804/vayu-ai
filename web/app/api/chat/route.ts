import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

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
    return new Response(
      "Namaste! The AI assistant requires a GEMINI_API_KEY in your environment to generate live custom responses. Currently operating in deterministic offline mode.",
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const model =
    process.env.GEMINI_MODEL ??
    (isGemini ? "gemini-2.0-flash" : process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile");

  const endpoint = isGemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  let body: { messages?: { role: string; content: string }[]; context?: unknown; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  
  const lang = body.lang === "hi" ? "hi" : "en";
  const langLine =
    lang === "hi"
      ? "LANGUAGE: Reply in Hindi (Devanagari script). Keep place names and units as-is."
      : "LANGUAGE: Reply in English.";

  const messages = body.messages ?? [];
  if (messages.length === 0) return NextResponse.json({ ok: false, reason: "empty" }, { status: 400 });

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
        const provider = isGemini 
          ? createGoogleGenerativeAI({ apiKey: currentKey }) 
          : createOpenAI({ apiKey: currentKey, baseURL: "https://api.groq.com/openai/v1" });

        const result = await streamText({
          model: provider(mTarget) as any,
          system: `${SYSTEM}\n\n${langLine}\n\nCONTEXT (the dashboard's real current data):\n${JSON.stringify(
            body.context ?? {},
          ).slice(0, 24000)}`,
          messages: messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
          })),
        });

        // Add model name to custom headers so client knows which model succeeded
        return result.toTextStreamResponse({
          headers: {
            "x-vayu-model": mTarget,
          }
        });

      } catch (e: any) {
        lastErrorDetail = String(e.message || e);
        lastStatus = e.statusCode || 500;
        
        if (lastStatus === 404 || lastStatus === 400) {
          if (mTarget !== modelsToTry[modelsToTry.length - 1]) continue;
        }
        if (lastStatus !== 429 && lastStatus !== 403) {
          break; // Hard fail on non-rate-limit errors
        }
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
