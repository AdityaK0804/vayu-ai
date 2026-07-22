import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'
import { redis, riskCacheKey, RISK_CACHE_TTL } from '@/lib/redis'

export const riskRouter = router({
  byFacility: publicProcedure
    .input(z.object({ facilityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data } = await ctx.supabase
        .from('RiskScore')
        .select('*, ShapValue(*)')
        .eq('facilityId', input.facilityId)
        .order('scoredAt', { ascending: false })
        .limit(1)
        .single()
      if (!data) return null
      return { ...data, shapValues: data.ShapValue ?? [] }
    }),

  dashboard: publicProcedure
    .input(z.object({ district: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Get facilities (paginated to avoid huge payload)
      let query = ctx.supabase
        .from('Facility')
        .select('id, name, nameHi, type, lat, lng, district')
        .order('name', { ascending: true })
        .limit(1000)

      if (input.district) query = query.eq('district', input.district)

      const { data: facilities } = await query
      if (!facilities?.length) return []

      // Fetch latest risk scores for these facilities
      const facilityIds = facilities.map((f: any) => f.id)
      const { data: riskScores } = await ctx.supabase
        .from('RiskScore')
        .select('facilityId, overallRisk')
        .in('facilityId', facilityIds)
        .order('scoredAt', { ascending: false })

      // Build a map of facilityId → latest overallRisk
      const riskMap = new Map<string, number>()
      if (riskScores) {
        for (const rs of riskScores) {
          if (!riskMap.has(rs.facilityId)) {
            riskMap.set(rs.facilityId, rs.overallRisk)
          }
        }
      }

      return facilities.map((f: any) => ({
        id: f.id,
        name: f.name,
        nameHi: f.nameHi ?? null,
        type: f.type,
        lat: f.lat,
        lng: f.lng,
        district: f.district,
        overallRisk: riskMap.get(f.id) ?? 0,
      }))
    }),

  score: publicProcedure
    .input(z.object({ facilityId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check Redis cache first
      const cacheKey = riskCacheKey(input.facilityId)
      if (redis) {
        try {
          const cached = await redis.get(cacheKey)
          if (cached) return JSON.parse(cached)
        } catch { /* Redis unavailable — continue to ML */ }
      }

      // 2. Fetch recent sensor readings (last 48h)
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
      const { data: readings } = await ctx.supabase
        .from('SensorReading')
        .select('*')
        .eq('facilityId', input.facilityId)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false })

      // 2. Call ML API with 10s timeout
      const MLResponseSchema = z.object({
        waterRisk:      z.number(),
        energyRisk:     z.number(),
        sanitationRisk: z.number(),
        diseaseRisk:    z.number(),
        overallRisk:    z.number(),
        shapValues: z.array(z.object({
          featureName: z.string(),
          shapValue:   z.number(),
          rank:        z.number(),
        })),
      })

      let mlData: z.infer<typeof MLResponseSchema> | null = null
      try {
        const res = await fetch(`${process.env.ML_API_URL}/api/v1/risk/score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.ML_API_KEY ?? '',
          },
          body: JSON.stringify({ facilityId: input.facilityId, readings: readings ?? [] }),
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error(`ML API error: ${res.status}`)
        mlData = MLResponseSchema.parse(await res.json())
      } catch {
        // Fallback: return most recent cached score
        const { data } = await ctx.supabase
          .from('RiskScore')
          .select('*, ShapValue(*)')
          .eq('facilityId', input.facilityId)
          .order('scoredAt', { ascending: false })
          .limit(1)
          .single()
        return data ? { ...data, shapValues: data.ShapValue ?? [] } : null
      }

      // 3. Persist RiskScore + ShapValues
      const { data: riskScore, error } = await ctx.supabase
        .from('RiskScore')
        .insert({
          facilityId:     input.facilityId,
          waterRisk:      mlData.waterRisk,
          energyRisk:     mlData.energyRisk,
          sanitationRisk: mlData.sanitationRisk,
          diseaseRisk:    mlData.diseaseRisk,
          overallRisk:    mlData.overallRisk,
        })
        .select()
        .single()

      if (error || !riskScore) throw new Error(error?.message ?? 'Failed to create risk score')

      // Insert shap values
      if (mlData.shapValues.length > 0) {
        await ctx.supabase.from('ShapValue').insert(
          mlData.shapValues.map(sv => ({
            riskScoreId: riskScore.id,
            featureName: sv.featureName,
            shapValue:   sv.shapValue,
            rank:        sv.rank,
          }))
        )
      }

      const result = { ...riskScore, shapValues: mlData.shapValues }

      // 4. Write result to Redis cache
      if (redis) {
        try {
          await redis.set(cacheKey, JSON.stringify(result), 'EX', RISK_CACHE_TTL)
        } catch { /* non-critical */ }
      }

      return result
    }),
})
