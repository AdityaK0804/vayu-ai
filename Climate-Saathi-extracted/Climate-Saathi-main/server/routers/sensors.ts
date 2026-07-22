import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'

export const sensorsRouter = router({
  latest: publicProcedure
    .input(z.object({ facilityId: z.string() }))
    .query(async ({ ctx, input }) => {
      const types = ['WATER_LEVEL', 'SOLAR_OUTPUT', 'TEMPERATURE', 'CHLORINE', 'TURBIDITY', 'HUMIDITY', 'BATTERY']
      const readings = await Promise.all(
        types.map(async (type) => {
          const { data } = await ctx.supabase
            .from('SensorReading')
            .select('*')
            .eq('facilityId', input.facilityId)
            .eq('sensorType', type)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single()
          return data
        })
      )
      return readings.filter(Boolean)
    }),

  history: publicProcedure
    .input(z.object({
      facilityId: z.string(),
      sensorType: z.string(),
      days: z.number().min(1).max(90).default(14),
    }))
    .query(async ({ ctx, input }) => {
      const since = new Date()
      since.setDate(since.getDate() - input.days)
      const { data } = await ctx.supabase
        .from('SensorReading')
        .select('*')
        .eq('facilityId', input.facilityId)
        .eq('sensorType', input.sensorType)
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: true })
      return data ?? []
    }),
})
