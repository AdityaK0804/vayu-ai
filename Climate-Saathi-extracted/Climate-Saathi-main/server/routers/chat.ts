import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'
import { callGemini, type ChatMessage, type ToolCall } from '@/server/services/gemini'

// ── Tool executors: query live Supabase data ────────────────────

async function execGetAlerts(supabase: any, args: Record<string, unknown>) {
  let q = supabase
    .from('Alert')
    .select('id, type, severity, message, status, triggeredAt, Facility!inner(name, district, block, type)')
    .eq('status', 'ACTIVE')
    .order('triggeredAt', { ascending: false })
    .limit(Number(args.limit) || 10)

  if (args.severity) q = q.eq('severity', args.severity)
  if (args.type) q = q.eq('type', args.type)
  if (args.district) q = q.eq('Facility.district', args.district)

  const { data } = await q
  return (data ?? []).map((a: any) => ({
    type: a.type,
    severity: a.severity,
    message: a.message,
    status: a.status,
    triggeredAt: a.triggeredAt,
    facility: a.Facility?.name,
    district: a.Facility?.district,
    facilityType: a.Facility?.type,
  }))
}

async function execGetFacilities(supabase: any, args: Record<string, unknown>) {
  let q = supabase
    .from('Facility')
    .select('name, type, district, block, lat, lng')
    .order('name')
    .limit(Number(args.limit) || 10)

  if (args.district) q = q.ilike('district', `%${args.district}%`)
  if (args.type) q = q.eq('type', args.type)
  if (args.search) q = q.ilike('name', `%${args.search}%`)

  const { data } = await q
  return data ?? []
}

async function execGetRiskScores(supabase: any, args: Record<string, unknown>) {
  let q = supabase
    .from('RiskScore')
    .select('riskType, overall, heatIndex, fireRisk, floodRisk, diseaseRisk, airQuality, calculatedAt, Facility!inner(name, district)')
    .order('calculatedAt', { ascending: false })
    .limit(Number(args.limit) || 10)

  if (args.district) q = q.eq('Facility.district', args.district)
  if (args.riskType) q = q.eq('riskType', args.riskType)
  if (args.minScore) q = q.gte('overall', args.minScore)

  const { data } = await q
  return (data ?? []).map((r: any) => ({
    facility: r.Facility?.name,
    district: r.Facility?.district,
    overall: r.overall,
    heatIndex: r.heatIndex,
    fireRisk: r.fireRisk,
    floodRisk: r.floodRisk,
    diseaseRisk: r.diseaseRisk,
    airQuality: r.airQuality,
    calculatedAt: r.calculatedAt,
  }))
}

async function execGetForecasts(supabase: any, args: Record<string, unknown>) {
  let q = supabase
    .from('Forecast')
    .select('metric, horizon, values, p10, p90, generatedAt, Facility!inner(name, district)')
    .order('generatedAt', { ascending: false })
    .limit(Number(args.limit) || 10)

  if (args.district) q = q.eq('Facility.district', args.district)
  if (args.metric) q = q.eq('metric', args.metric)

  const { data } = await q
  return (data ?? []).map((f: any) => ({
    facility: f.Facility?.name,
    district: f.Facility?.district,
    metric: f.metric,
    horizon: f.horizon,
    generatedAt: f.generatedAt,
  }))
}

async function execGetDistrictSummary(supabase: any, args: Record<string, unknown>) {
  const district = String(args.district ?? '')
  if (!district) return { error: 'District name required' }

  const [facRes, alertRes, riskRes] = await Promise.all([
    supabase.from('Facility').select('id, type', { count: 'exact' }).ilike('district', `%${district}%`),
    supabase.from('Alert').select('id, severity, Facility!inner(district)').eq('status', 'ACTIVE').ilike('Facility.district', `%${district}%`),
    supabase.from('RiskScore').select('overall, Facility!inner(district)').ilike('Facility.district', `%${district}%`).order('calculatedAt', { ascending: false }).limit(50),
  ])

  const facilities = facRes.data ?? []
  const alerts = alertRes.data ?? []
  const risks = riskRes.data ?? []
  const avgRisk = risks.length > 0 ? (risks.reduce((s: number, r: any) => s + (r.overall ?? 0), 0) / risks.length).toFixed(1) : 'N/A'

  const typeCounts: Record<string, number> = {}
  for (const f of facilities) typeCounts[f.type] = (typeCounts[f.type] || 0) + 1

  return {
    district,
    totalFacilities: facRes.count ?? facilities.length,
    facilityTypes: typeCounts,
    activeAlerts: alerts.length,
    criticalAlerts: alerts.filter((a: any) => a.severity === 'CRITICAL').length,
    highAlerts: alerts.filter((a: any) => a.severity === 'HIGH').length,
    averageRiskScore: avgRisk,
  }
}

const TOOL_MAP: Record<string, (supabase: any, args: Record<string, unknown>) => Promise<unknown>> = {
  getAlerts: execGetAlerts,
  getFacilities: execGetFacilities,
  getRiskScores: execGetRiskScores,
  getForecasts: execGetForecasts,
  getDistrictSummary: execGetDistrictSummary,
}

// ── Chat router ─────────────────────────────────────────────────

export const chatRouter = router({
  send: publicProcedure
    .input(z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'model']),
        text: z.string(),
      })),
      locale: z.enum(['en', 'hi', 'cg']).optional().default('en'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Inject language instruction based on user's selected locale
      const LANG_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi (हिंदी)', cg: 'Chhattisgarhi (छत्तीसगढ़ी)' }
      const langInstruction: ChatMessage = {
        role: 'user',
        parts: [{ text: `[SYSTEM: The user has selected ${LANG_NAMES[input.locale] ?? 'English'} as their language. You MUST respond in ${LANG_NAMES[input.locale] ?? 'English'} only. Do NOT switch to any other language regardless of the data content.]` }],
      }

      // Convert to Gemini format
      const history: ChatMessage[] = [
        langInstruction,
        ...input.messages.map(m => ({
          role: m.role as 'user' | 'model',
          parts: [{ text: m.text }],
        })),
      ]

      // First call: may return text or tool calls
      let result = await callGemini(history)
      let iterations = 0
      const MAX_TOOL_ITERATIONS = 3

      // Handle tool calls (up to 3 rounds)
      while (result.toolCalls && result.toolCalls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
        iterations++
        const pendingToolCalls = result.toolCalls
        const toolResults: { id: string; name: string; response: unknown }[] = []

        for (const call of pendingToolCalls) {
          const executor = TOOL_MAP[call.name]
          if (executor) {
            try {
              const response = await executor(ctx.supabase, call.args)
              toolResults.push({ id: call.id, name: call.name, response })
            } catch (err: any) {
              toolResults.push({ id: call.id, name: call.name, response: { error: err.message } })
            }
          } else {
            toolResults.push({ id: call.id, name: call.name, response: { error: `Unknown tool: ${call.name}` } })
          }
        }

        // Call again with the original tool calls + results so Groq sees matching IDs
        result = await callGemini(history, pendingToolCalls, toolResults)
      }

      return { text: result.text ?? 'Sorry, I could not process your request.' }
    }),
})
