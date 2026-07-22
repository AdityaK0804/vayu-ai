import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'

export const analyticsRouter = router({
  summary: publicProcedure
    .input(z.object({ district: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let facQuery = ctx.supabase.from('Facility').select('id', { count: 'exact', head: true })
      if (input?.district) facQuery = facQuery.eq('district', input.district)
      const { count: totalFacilities } = await facQuery

      let alertQuery = ctx.supabase.from('Alert').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE')
      let critQuery = ctx.supabase.from('Alert').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').eq('severity', 'CRITICAL')

      const [{ count: activeAlerts }, { count: criticalAlerts }] = await Promise.all([alertQuery, critQuery])

      return {
        totalFacilities: totalFacilities ?? 0,
        activeAlerts: activeAlerts ?? 0,
        criticalAlerts: criticalAlerts ?? 0,
      }
    }),

  kpis: publicProcedure
    .query(async ({ ctx }) => {
      const [{ count: totalAlerts }, { count: resolvedCount }, { count: totalSensorReadings }, { count: totalRiskScores }] = await Promise.all([
        ctx.supabase.from('Alert').select('id', { count: 'exact', head: true }),
        ctx.supabase.from('Alert').select('id', { count: 'exact', head: true }).eq('status', 'RESOLVED'),
        ctx.supabase.from('SensorReading').select('id', { count: 'exact', head: true }),
        ctx.supabase.from('RiskScore').select('id', { count: 'exact', head: true }),
      ])
      const resolutionRate = (totalAlerts ?? 0) > 0 ? Math.round(((resolvedCount ?? 0) / (totalAlerts ?? 1)) * 1000) / 10 : 0

      // Sensor uptime: % of readings with GOOD quality flag
      const { count: goodReadings } = await ctx.supabase.from('SensorReading').select('id', { count: 'exact', head: true }).eq('qualityFlag', 'GOOD')
      const sensorUptime = (totalSensorReadings ?? 0) > 0 ? Math.round(((goodReadings ?? 0) / (totalSensorReadings ?? 1)) * 1000) / 10 : 0

      return {
        modelAccuracy: 0,
        avgResponseHours: 0,
        sensorUptime,
        resolutionRate,
        totalRiskScores: totalRiskScores ?? 0,
        totalResolvedAlerts: resolvedCount ?? 0,
        totalSensorReadings: totalSensorReadings ?? 0,
        totalAlerts: totalAlerts ?? 0,
      }
    }),

  alertsByType: publicProcedure
    .input(z.object({ district: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      const { data } = await ctx.supabase.from('Alert').select('type')
      if (!data?.length) return []
      const counts: Record<string, number> = {}
      for (const row of data) {
        counts[row.type] = (counts[row.type] ?? 0) + 1
      }
      const typeLabels: Record<string, string> = {
        WATER_SHORTAGE: 'Water Shortage',
        SOLAR_FAILURE: 'Solar Failure',
        HEAT_STRESS: 'Heat Stress',
        DISEASE_RISK: 'Disease Risk',
        TURBIDITY: 'Turbidity',
      }
      return Object.entries(counts).map(([type, count]) => ({
        type,
        name: typeLabels[type] ?? type,
        count,
      }))
    }),

  districtRisk: publicProcedure
    .query(async ({ ctx }) => {
      // Aggregate facility counts by district
      const { data: facilities } = await ctx.supabase
        .from('Facility')
        .select('district')

      if (!facilities?.length) return []

      const byDistrict: Record<string, number> = {}
      for (const f of facilities) {
        const d = f.district?.toUpperCase()
        if (d) byDistrict[d] = (byDistrict[d] ?? 0) + 1
      }

      // Get average overallRisk per district from RiskScore
      const { data: riskScores } = await ctx.supabase
        .from('RiskScore')
        .select('facilityId, overallRisk')

      const riskByFacility = new Map<string, number>()
      if (riskScores) {
        for (const rs of riskScores) {
          riskByFacility.set(rs.facilityId, rs.overallRisk)
        }
      }

      // Compute average risk per district from facilities
      const { data: allFacs } = await ctx.supabase
        .from('Facility')
        .select('id, district')

      const districtRisk: Record<string, number[]> = {}
      if (allFacs) {
        for (const f of allFacs) {
          const risk = riskByFacility.get(f.id)
          if (risk !== undefined) {
            const d = f.district?.toUpperCase()
            if (d) {
              if (!districtRisk[d]) districtRisk[d] = []
              districtRisk[d].push(risk)
            }
          }
        }
      }

      // Title-case the district names for display
      const titleCase = (s: string) =>
        s.toLowerCase().replace(/(?:^|\s|-)\S/g, c => c.toUpperCase())

      return Object.entries(byDistrict).map(([district, count]) => {
        const risks = districtRisk[district]
        const avgRisk = risks?.length ? Math.round(risks.reduce((a, b) => a + b, 0) / risks.length * 10) / 10 : 0
        return {
          name: titleCase(district),
          risk: avgRisk,
          facilities: count,
        }
      })
    }),

  sensorHealthByDay: publicProcedure
    .query(async ({ ctx }) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const now = new Date()
      const result: { day: string; online: number; offline: number }[] = []
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now)
        dayStart.setDate(dayStart.getDate() - i)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(dayStart)
        dayEnd.setHours(23, 59, 59, 999)

        const { count: goodCount } = await ctx.supabase
          .from('SensorReading')
          .select('id', { count: 'exact', head: true })
          .eq('qualityFlag', 'GOOD')
          .gte('timestamp', dayStart.toISOString())
          .lte('timestamp', dayEnd.toISOString())

        const { count: badCount } = await ctx.supabase
          .from('SensorReading')
          .select('id', { count: 'exact', head: true })
          .in('qualityFlag', ['BAD', 'SUSPECT', 'MISSING'])
          .gte('timestamp', dayStart.toISOString())
          .lte('timestamp', dayEnd.toISOString())

        result.push({
          day: days[dayStart.getDay()],
          online: goodCount ?? 0,
          offline: badCount ?? 0,
        })
      }
      return result
    }),

  forecast: publicProcedure
    .query(async ({ ctx }) => {
      const { data: forecast } = await ctx.supabase
        .from('Forecast')
        .select('*, Facility(name, district)')
        .order('createdAt', { ascending: false })
        .limit(1)
        .single()

      if (!forecast) return null
      const parse = (v: unknown): number[] => {
        if (Array.isArray(v)) return v
        if (typeof v === 'string') try { return JSON.parse(v) } catch { return [] }
        return []
      }
      return {
        facilityName: forecast.Facility?.name ?? '',
        district: forecast.Facility?.district ?? '',
        forecastType: forecast.forecastType,
        values: parse(forecast.values),
        p10: parse(forecast.p10),
        p90: parse(forecast.p90),
        horizonDays: forecast.horizonDays,
        createdAt: forecast.createdAt,
      }
    }),
})
