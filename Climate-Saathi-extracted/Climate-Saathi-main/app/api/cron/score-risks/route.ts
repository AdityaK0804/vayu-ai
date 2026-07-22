import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAlertsFromRiskScore } from '@/server/services/alertGenerator'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const facilities = await prisma.facility.findMany({
    select: { id: true },
  })

  let scored = 0
  let failed = 0
  let alertsGenerated = 0

  for (const f of facilities) {
    try {
      const since = new Date(Date.now() - 48 * 3600 * 1000)
      const readings = await prisma.sensorReading.findMany({
        where: { facilityId: f.id, timestamp: { gte: since } },
        orderBy: { timestamp: 'desc' },
      })

      const res = await fetch(`${process.env.ML_API_URL}/api/v1/risk/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ML_API_KEY ?? '',
        },
        body: JSON.stringify({ facilityId: f.id, readings }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        failed++
        continue
      }

      const mlData = await res.json()

      // Persist risk score
      const riskScore = await prisma.riskScore.create({
        data: {
          facilityId: f.id,
          waterRisk: mlData.waterRisk,
          energyRisk: mlData.energyRisk,
          sanitationRisk: mlData.sanitationRisk,
          diseaseRisk: mlData.diseaseRisk,
          overallRisk: mlData.overallRisk,
          shapValues: {
            create: (mlData.shapValues ?? []).map((sv: { featureName: string; shapValue: number; rank: number }) => ({
              featureName: sv.featureName,
              shapValue: sv.shapValue,
              rank: sv.rank,
            })),
          },
        },
      })

      // Generate alerts from risk score
      const alerts = await generateAlertsFromRiskScore(prisma, f.id, mlData)
      alertsGenerated += alerts.length

      scored++
    } catch {
      failed++
    }
  }

  return NextResponse.json({
    total: facilities.length,
    scored,
    failed,
    alertsGenerated,
    timestamp: new Date().toISOString(),
  })
}
