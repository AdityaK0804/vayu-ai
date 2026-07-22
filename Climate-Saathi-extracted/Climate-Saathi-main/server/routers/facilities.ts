import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '@/server/trpc'

export const facilitiesRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          district: z.string().optional(),
          type: z.string().optional(),
          search: z.string().optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1
      const limit = input?.limit ?? 50
      const from = (page - 1) * limit
      const to = from + limit - 1

      let query = ctx.supabase
        .from('Facility')
        .select('id, name, nameHi, type, district, block, lat, lng, metadata', { count: 'exact' })

      if (input?.district) query = query.eq('district', input.district)
      if (input?.type) query = query.eq('type', input.type)
      if (input?.search) query = query.or(`name.ilike.%${input.search}%,district.ilike.%${input.search}%`)

      query = query.order('name', { ascending: true }).range(from, to)

      const { data, count, error } = await query
      if (error) throw new Error(error.message)

      return {
        items: (data ?? []).map((f: any) => ({
          ...f,
          riskScores: [],
          alerts: [],
        })),
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      }
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('Facility')
        .select('*')
        .eq('id', input.id)
        .single()

      if (error || !data) throw new Error(error?.message ?? 'Facility not found')

      // Fetch related data
      const [sensorsRes, riskRes, forecastsRes, alertsRes] = await Promise.all([
        ctx.supabase
          .from('SensorReading')
          .select('*')
          .eq('facilityId', input.id)
          .order('timestamp', { ascending: false })
          .limit(50),
        ctx.supabase
          .from('RiskScore')
          .select('*, ShapValue(*)')
          .eq('facilityId', input.id)
          .order('scoredAt', { ascending: false })
          .limit(1),
        ctx.supabase
          .from('Forecast')
          .select('*')
          .eq('facilityId', input.id)
          .order('createdAt', { ascending: false })
          .limit(4),
        ctx.supabase
          .from('Alert')
          .select('*')
          .eq('facilityId', input.id)
          .order('triggeredAt', { ascending: false })
          .limit(10),
      ])

      return {
        ...data,
        sensors: sensorsRes.data ?? [],
        riskScores: (riskRes.data ?? []).map((r: any) => ({
          ...r,
          shapValues: r.ShapValue ?? [],
        })),
        forecasts: (forecastsRes.data ?? []).map((f: any) => ({
          ...f,
          values: typeof f.values === 'string' ? JSON.parse(f.values) : f.values,
          p10: typeof f.p10 === 'string' ? JSON.parse(f.p10) : f.p10,
          p90: typeof f.p90 === 'string' ? JSON.parse(f.p90) : f.p90,
        })),
        alerts: alertsRes.data ?? [],
      }
    }),

  districts: publicProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('Facility')
      .select('district')

    if (error) throw new Error(error.message)

    const unique = [...new Set((data ?? []).map((d: any) => d.district))].sort()
    return unique
  }),
})
