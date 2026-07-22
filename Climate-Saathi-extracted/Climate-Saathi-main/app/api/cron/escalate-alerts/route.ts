import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000)

  // Level 1: Un-acknowledged after 15 minutes — re-notify
  const level1 = await prisma.alert.findMany({
    where: {
      status: 'ACTIVE',
      triggeredAt: { lt: fifteenMinAgo, gte: oneHourAgo },
    },
    include: { facility: true },
  })

  // Level 2: Un-acknowledged after 1 hour — escalate to district officer
  const level2 = await prisma.alert.findMany({
    where: {
      status: 'ACTIVE',
      triggeredAt: { lt: oneHourAgo, gte: fourHoursAgo },
    },
    include: { facility: true },
  })

  // Level 3: CRITICAL still active after 4 hours — escalate to state officer
  const level3 = await prisma.alert.findMany({
    where: {
      status: 'ACTIVE',
      severity: 'CRITICAL',
      triggeredAt: { lt: fourHoursAgo },
    },
    include: { facility: true },
  })

  // For level 2+3, create additional AlertChannel records for higher-level officers
  for (const alert of [...level2, ...level3]) {
    const officers = await prisma.user.findMany({
      where: {
        role: { in: level3.includes(alert) ? ['STATE_OFFICER', 'ADMIN'] : ['DISTRICT_OFFICER'] },
        phone: { not: null },
      },
      select: { phone: true },
      take: 5,
    })

    for (const officer of officers) {
      if (!officer.phone) continue
      const existing = await prisma.alertChannel.findFirst({
        where: { alertId: alert.id, recipient: officer.phone, channel: 'SMS' },
      })
      if (!existing) {
        await prisma.alertChannel.create({
          data: {
            alertId: alert.id,
            channel: 'SMS',
            recipient: officer.phone,
            language: 'HINDI',
            status: 'PENDING',
          },
        })
      }
    }
  }

  return NextResponse.json({
    escalated: {
      level1_resend: level1.length,
      level2_district: level2.length,
      level3_state: level3.length,
    },
    timestamp: new Date().toISOString(),
  })
}
