import { z } from 'zod'
import { router, publicProcedure } from '@/server/trpc'

/**
 * Digital Twin router — unified facility state endpoint + what-if simulation.
 */
export const digitalTwinRouter = router({
  /**
   * Returns the unified "digital twin" for a facility:
   *  - facility metadata
   *  - latest sensor readings (one per type)
   *  - current risk scores + SHAP values
   *  - PV health (physics model output from ML API)
   *  - latest climate context
   *  - 14-day forecast summary
   *  - recent alerts
   */
  state: publicProcedure
    .input(z.object({ facilityId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Parallel fetch everything
      const [facilityRes, riskRes, alertsRes, forecastsRes, sensorsRes] = await Promise.all([
        ctx.supabase
          .from('Facility')
          .select('*')
          .eq('id', input.facilityId)
          .single(),
        ctx.supabase
          .from('RiskScore')
          .select('*, ShapValue(*)')
          .eq('facilityId', input.facilityId)
          .order('scoredAt', { ascending: false })
          .limit(1)
          .maybeSingle(),
        ctx.supabase
          .from('Alert')
          .select('*')
          .eq('facilityId', input.facilityId)
          .in('status', ['ACTIVE', 'ACKNOWLEDGED'])
          .order('triggeredAt', { ascending: false })
          .limit(5),
        ctx.supabase
          .from('Forecast')
          .select('*')
          .eq('facilityId', input.facilityId)
          .order('createdAt', { ascending: false })
          .limit(4),
        ctx.supabase
          .from('SensorReading')
          .select('*')
          .eq('facilityId', input.facilityId)
          .order('timestamp', { ascending: false })
          .limit(50),
      ])

      const facility = facilityRes.data
      if (!facility) return null

      // Dedupe sensors — latest per type
      const sensorsList = (sensorsRes.data ?? []) as Array<Record<string, any>>
      const sensorMap: Record<string, Record<string, any>> = {}
      for (const s of sensorsList) {
        if (!sensorMap[s.sensorType]) sensorMap[s.sensorType] = s
      }

      const risk = riskRes.data
      const shapValues = risk?.ShapValue ?? []

      // PV health — call ML API if possible
      let pvHealth: { expected_kw: number; actual_kw: number; derating: number; anomaly: boolean; status: string } | null = null
      const ghi = sensorMap['SOLAR_OUTPUT']?.value ?? null
      const temperature = sensorMap['TEMPERATURE']?.value ?? null

      if (ghi !== null && temperature !== null) {
        try {
          const mlRes = await fetch(`${process.env.ML_API_URL}/api/v1/pv/health`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.ML_API_KEY ?? '',
            },
            body: JSON.stringify({
              facilityId: input.facilityId,
              ghi_actual: ghi,
              temperature,
            }),
            signal: AbortSignal.timeout(5000),
          })
          if (mlRes.ok) pvHealth = await mlRes.json()
        } catch {
          // ML API unavailable — compute a simple local estimate
          pvHealth = localPvEstimate(ghi, temperature)
        }
      }

      // Build forecast summaries
      const forecasts = (forecastsRes.data ?? []).map((f: any) => ({
        ...f,
        values: typeof f.values === 'string' ? JSON.parse(f.values) : f.values,
        p10: typeof f.p10 === 'string' ? JSON.parse(f.p10) : f.p10,
        p90: typeof f.p90 === 'string' ? JSON.parse(f.p90) : f.p90,
      }))

      return {
        facility: {
          id: facility.id,
          name: facility.name,
          nameHi: facility.nameHi,
          type: facility.type,
          district: facility.district,
          block: facility.block,
          lat: facility.lat,
          lng: facility.lng,
        },
        sensors: Object.values(sensorMap),
        riskScores: risk
          ? {
              waterRisk: risk.waterRisk,
              energyRisk: risk.energyRisk,
              sanitationRisk: risk.sanitationRisk,
              diseaseRisk: risk.diseaseRisk,
              overallRisk: risk.overallRisk,
              scoredAt: risk.scoredAt,
              shapValues: shapValues.map((sv: any) => ({
                featureName: sv.featureName,
                shapValue: sv.shapValue,
                rank: sv.rank,
              })),
            }
          : null,
        pvHealth,
        forecasts,
        activeAlerts: alertsRes.data ?? [],
        timestamp: new Date().toISOString(),
      }
    }),

  /**
   * What-if simulation: re-score risk with overridden climate values.
   * Falls back to local heuristic if ML API is unavailable.
   */
  whatIf: publicProcedure
    .input(
      z.object({
        facilityId: z.string(),
        district: z.string().optional(),
        overrides: z.record(z.string(), z.number()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Try ML API first
      try {
        const mlRes = await fetch(`${process.env.ML_API_URL}/api/v1/whatif`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.ML_API_KEY ?? '',
          },
          body: JSON.stringify({
            facilityId: input.facilityId,
            district: input.district,
            overrides: input.overrides,
          }),
          signal: AbortSignal.timeout(10000),
        })
        if (mlRes.ok) {
          return await mlRes.json() as {
            baseline: Record<string, number>
            simulated: Record<string, number>
            deltas: Record<string, number>
          }
        }
      } catch {
        // Fall through to local heuristic
      }

      // Local heuristic fallback — fetch current risk, apply simple adjustments
      const { data: risk } = await ctx.supabase
        .from('RiskScore')
        .select('waterRisk, energyRisk, sanitationRisk, diseaseRisk, overallRisk')
        .eq('facilityId', input.facilityId)
        .order('scoredAt', { ascending: false })
        .limit(1)
        .maybeSingle()

      const baseline: Record<string, number> = {
        waterRisk: risk?.waterRisk ?? 0.3,
        energyRisk: risk?.energyRisk ?? 0.3,
        sanitationRisk: risk?.sanitationRisk ?? 0.3,
        diseaseRisk: risk?.diseaseRisk ?? 0.3,
        overallRisk: risk?.overallRisk ?? 0.3,
      }

      const simulated = { ...baseline }
      const o = input.overrides

      // Temperature → disease + energy risk
      if (o.temperature !== undefined) {
        const tempDelta = (o.temperature - 30) / 20 // normalized
        simulated.diseaseRisk = clamp(baseline.diseaseRisk + tempDelta * 0.15)
        simulated.energyRisk = clamp(baseline.energyRisk + tempDelta * 0.08)
      }

      // Rainfall → water + sanitation risk (low rain = water risk, high rain = sanitation risk)
      if (o.rainfall !== undefined) {
        const rainDelta = (o.rainfall - 5) / 30
        simulated.waterRisk = clamp(baseline.waterRisk - rainDelta * 0.2)
        simulated.sanitationRisk = clamp(baseline.sanitationRisk + rainDelta * 0.15)
      }

      // Humidity → disease risk
      if (o.humidity !== undefined) {
        const humDelta = (o.humidity - 60) / 40
        simulated.diseaseRisk = clamp(simulated.diseaseRisk + humDelta * 0.1)
      }

      // GHI → energy risk (low GHI = more energy risk)
      if (o.ghi !== undefined) {
        const ghiDelta = (5 - o.ghi) / 5
        simulated.energyRisk = clamp(simulated.energyRisk + ghiDelta * 0.15)
      }

      // Recalculate overall
      simulated.overallRisk = clamp(
        simulated.waterRisk * 0.3 +
        simulated.energyRisk * 0.2 +
        simulated.sanitationRisk * 0.25 +
        simulated.diseaseRisk * 0.25
      )

      const deltas: Record<string, number> = {}
      for (const key of Object.keys(baseline)) {
        deltas[key] = Math.round((simulated[key] - baseline[key]) * 10000) / 10000
      }

      return { baseline, simulated, deltas }
    }),
})

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v))
}

/** Local PV estimate when ML API is unavailable */
function localPvEstimate(ghi: number, temperature: number) {
  const panelArea = 2.0
  const eta = 0.18
  const beta = -0.004
  const tCell = temperature + 0.0256 * ghi
  const pExp = panelArea * eta * ghi * (1 + beta * (tCell - 25))
  const expKw = Math.max(pExp / 1000, 0)
  const actualKw = (ghi / 1000) * panelArea * eta
  const derating = expKw > 0.001 ? Math.min(Math.max(actualKw / expKw, 0), 2) : 1
  return {
    expected_kw: Math.round(expKw * 1000) / 1000,
    actual_kw: Math.round(actualKw * 1000) / 1000,
    derating: Math.round(derating * 1000) / 1000,
    anomaly: derating < 0.7,
    status: derating < 0.5 ? 'CRITICAL' : derating < 0.7 ? 'WARNING' : 'NORMAL',
  }
}
