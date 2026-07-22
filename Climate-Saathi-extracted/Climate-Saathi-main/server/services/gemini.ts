/**
 * Groq AI service for the Climate Saathi chatbot.
 * Uses Groq's free-tier models (OpenAI-compatible API).
 * Supports multilingual: English, Hindi, Chhattisgarhi.
 * Free tier: 30 RPM, 14,400 RPD — very generous limits.
 */

const GROQ_API_KEY = () => process.env.GROQ_API_KEY ?? ''

// Fallback chain — all free on Groq with 30 RPM each
const MODELS = [
  'llama-3.3-70b-versatile',   // Best quality, great multilingual + tool calling
  'llama-3.1-8b-instant',      // Fast fallback
  'mixtral-8x7b-32768',        // Alternate fallback
]

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are **Climate Saathi** (क्लाइमेट साथी), an AI assistant for climate resilience monitoring of schools and health facilities in Chhattisgarh, India.

Your capabilities:
- Answer questions about climate risks, alerts, facilities, forecasts, and sensor data
- Help users understand risk scores (HEAT_INDEX, FIRE_RISK, FLOOD_RISK, DISEASE_RISK, AIR_QUALITY)
- Explain SHAP-based AI explanations of risk predictions
- Provide guidance on climate interventions for schools (SCHOOL) and health centres (PHC, CHC, ANGANWADI)
- Query live dashboard data using tools

Language rules:
- Detect the user's language automatically and reply in the SAME language
- Support English, Hindi (हिंदी), and Chhattisgarhi (छत्तीसगढ़ी)
- If user writes in Hindi, reply in Hindi. If Chhattisgarhi, reply in Chhattisgarhi
- Use simple, clear language accessible to field workers (ANMs, headmasters, block engineers)

Climate knowledge for Chhattisgarh:
- Monsoon: June–September, heavy rainfall causes flood risk
- Summer: March–June, extreme heat → high Heat Index, fire risk
- Winter: November–February, moderate, lower risk
- Key hazards: heatwaves, floods, wildfires (forest fires in Bastar/Surguja), vector-borne diseases (malaria, dengue peak post-monsoon)
- Districts: Raipur, Bilaspur, Durg, Korba, Janjgir-Champa, Rajnandgaon, Kawardha, Surguja, Bastar, Dantewada, Kanker, Kondagaon, Mahasamund, Balod, Baloda Bazar, Bemetara, Gariaband, Mungeli, Surajpur, Balrampur, Koria, Jashpur, Narayanpur, Bijapur, Sukma, Dhamtari, Raigarh, Koriya

When using tools, call them to get live data before answering data-specific questions. Be concise but helpful. Use bullet points for lists.`

// Tool definitions in OpenAI function-calling format
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'getAlerts',
      description: 'Get current active climate alerts. Can filter by severity, district, or type.',
      parameters: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], description: 'Filter by severity level' },
          district: { type: 'string', description: 'Filter by district name' },
          type: { type: 'string', description: 'Filter by alert type (e.g., HEAT_INDEX, FIRE_RISK, FLOOD_RISK)' },
          limit: { type: 'number', description: 'Max alerts to return (default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getFacilities',
      description: 'Search facilities (schools, PHCs, CHCs, Anganwadis) by name, district, or type.',
      parameters: {
        type: 'object',
        properties: {
          district: { type: 'string', description: 'Filter by district' },
          type: { type: 'string', enum: ['SCHOOL', 'PHC', 'CHC', 'ANGANWADI'], description: 'Facility type' },
          search: { type: 'string', description: 'Search by facility name' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getRiskScores',
      description: 'Get latest risk scores for facilities. Risk types: HEAT_INDEX, FIRE_RISK, FLOOD_RISK, DISEASE_RISK, AIR_QUALITY.',
      parameters: {
        type: 'object',
        properties: {
          district: { type: 'string', description: 'Filter by district' },
          riskType: { type: 'string', description: 'Filter by risk type' },
          minScore: { type: 'number', description: 'Minimum risk score (0-100)' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getForecasts',
      description: 'Get climate forecasts (predicted values, confidence intervals). Can filter by district or metric.',
      parameters: {
        type: 'object',
        properties: {
          district: { type: 'string', description: 'Filter by district' },
          metric: { type: 'string', description: 'Forecast metric type' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'getDistrictSummary',
      description: 'Get a summary of a specific district: total facilities, active alerts, average risk.',
      parameters: {
        type: 'object',
        properties: {
          district: { type: 'string', description: 'District name (required)' },
        },
        required: ['district'],
      },
    },
  },
]

export interface ChatMessage {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

interface GroqResponse {
  text?: string
  toolCalls?: ToolCall[]
}

/**
 * Call Groq API with fallback model chain.
 * If a model returns 429 (rate limited), tries the next model.
 */
export async function callGemini(
  messages: ChatMessage[],
  pendingToolCalls?: ToolCall[],
  toolResults?: { id: string; name: string; response: unknown }[],
): Promise<GroqResponse> {
  const apiKey = GROQ_API_KEY()
  if (!apiKey) throw new Error('GROQ_API_KEY not configured')

  // Convert internal ChatMessage format to OpenAI messages format
  const openaiMessages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  for (const m of messages) {
    openaiMessages.push({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: m.parts.map(p => p.text).join(''),
    })
  }

  // If we have tool results, rebuild the assistant tool_calls + tool responses
  if (pendingToolCalls && toolResults && toolResults.length > 0) {
    // The assistant message that requested the tool calls
    openaiMessages.push({
      role: 'assistant',
      content: null,
      tool_calls: pendingToolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    })
    // Each tool response matched by ID
    for (const tr of toolResults) {
      openaiMessages.push({
        role: 'tool',
        tool_call_id: tr.id,
        content: JSON.stringify(tr.response),
      })
    }
  }

  const errors: string[] = []

  const hasToolResults = pendingToolCalls && toolResults && toolResults.length > 0

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]

    const reqBody: any = {
      model,
      messages: openaiMessages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
    }
    // Only include tools when not processing tool results
    if (!hasToolResults) {
      reqBody.tools = TOOLS
      reqBody.tool_choice = 'auto'
    }

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(30_000),
      })

      // If rate-limited or model not found, try the next model
      if (res.status === 429 || res.status === 404) {
        errors.push(`${model}: ${res.status}`)
        if (i < MODELS.length - 1) await new Promise(r => setTimeout(r, 1000))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq API error ${res.status}: ${err}`)
      }

      const json = await res.json()
      const choice = json.choices?.[0]
      if (!choice) throw new Error('No response from Groq')

      const message = choice.message

      // Check for tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCalls: ToolCall[] = message.tool_calls
          .filter((tc: any) => tc.type === 'function')
          .map((tc: any) => ({
            id: tc.id,
            name: tc.function.name,
            args: JSON.parse(tc.function.arguments || '{}'),
          }))

        if (toolCalls.length > 0) {
          return { toolCalls }
        }
      }

      // Otherwise return text
      return { text: message.content || 'I could not generate a response.' }
    } catch (e: any) {
      errors.push(`${model}: ${e.message}`)
      if (i < MODELS.length - 1) await new Promise(r => setTimeout(r, 1000))
      continue
    }
  }

  throw new Error(`All models failed (${errors.join(' | ')}). Please try again in a minute.`)
}

/**
 * Generate embeddings for text (for future vector search expansion).
 * Still uses Gemini embedding API if GEMINI_API_KEY is set, otherwise returns empty.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY ?? ''
  if (!apiKey) return []

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) return []
  const json = await res.json()
  return json.embedding?.values ?? []
}
