import type { PrismaClient } from '@prisma/client'

interface RiskScoreData {
  waterRisk: number
  energyRisk: number
  sanitationRisk: number
  diseaseRisk: number
  overallRisk: number
}

const THRESHOLDS: Record<string, { field: keyof RiskScoreData; HIGH: number; CRITICAL: number }> = {
  WATER_SHORTAGE: { field: 'waterRisk',      HIGH: 0.7, CRITICAL: 0.9 },
  SOLAR_FAILURE:  { field: 'energyRisk',     HIGH: 0.7, CRITICAL: 0.9 },
  HEAT_STRESS:    { field: 'diseaseRisk',    HIGH: 0.65, CRITICAL: 0.85 },
  DISEASE_RISK:   { field: 'diseaseRisk',    HIGH: 0.6, CRITICAL: 0.8 },
  TURBIDITY:      { field: 'sanitationRisk', HIGH: 0.7, CRITICAL: 0.9 },
}

function buildMessage(alertType: string, severity: string, value: number): string {
  const labels: Record<string, string> = {
    WATER_SHORTAGE: 'Water shortage risk',
    SOLAR_FAILURE:  'Solar system failure risk',
    HEAT_STRESS:    'Heat stress risk',
    DISEASE_RISK:   'Disease outbreak risk',
    TURBIDITY:      'Water turbidity risk',
  }
  const label = labels[alertType] ?? alertType
  const pct = Math.round(value * 100)
  return `${severity} — ${label} detected at ${pct}% confidence. Immediate attention recommended.`
}

/**
 * After a risk score is computed, check thresholds and create alerts.
 * Deduplicates: won't create if an active alert of the same type already exists.
 */
export async function generateAlertsFromRiskScore(
  prisma: PrismaClient,
  facilityId: string,
  riskScore: RiskScoreData,
) {
  const created: string[] = []

  for (const [alertType, config] of Object.entries(THRESHOLDS)) {
    const value = riskScore[config.field]
    let severity: 'HIGH' | 'CRITICAL' | null = null

    if (value >= config.CRITICAL) severity = 'CRITICAL'
    else if (value >= config.HIGH) severity = 'HIGH'

    if (!severity) continue

    // Check for existing active/acknowledged alert of same type
    const existing = await prisma.alert.findFirst({
      where: {
        facilityId,
        type: alertType as any,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
      },
    })

    if (existing) continue

    const alert = await prisma.alert.create({
      data: {
        facilityId,
        type: alertType as any,
        severity,
        message: buildMessage(alertType, severity, value),
        confidence: value,
      },
    })

    // Create IN_APP channel record (always)
    await prisma.alertChannel.create({
      data: {
        alertId: alert.id,
        channel: 'IN_APP',
        recipient: 'dashboard',
        language: 'ENGLISH',
        status: 'DELIVERED',
        sentAt: new Date(),
      },
    })

    // For HIGH/CRITICAL, also create SMS + WHATSAPP channel records
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      const recipients = await prisma.user.findMany({
        where: {
          role: { in: ['BLOCK_ENGINEER', 'DISTRICT_OFFICER', 'HEADMASTER', 'ANM'] },
          phone: { not: null },
        },
        select: { phone: true },
        take: 10,
      })

      for (const r of recipients) {
        if (!r.phone) continue
        await prisma.alertChannel.create({
          data: {
            alertId: alert.id,
            channel: 'SMS',
            recipient: r.phone,
            language: 'HINDI',
            status: 'PENDING',
          },
        })
        if (severity === 'CRITICAL') {
          await prisma.alertChannel.create({
            data: {
              alertId: alert.id,
              channel: 'WHATSAPP',
              recipient: r.phone,
              language: 'HINDI',
              status: 'PENDING',
            },
          })
        }
      }
    }

    created.push(alert.id)
  }

  return created
}
