import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '@/server/trpc'
import { sendWhatsAppMessage, formatAlertMessage } from '@/server/services/whatsapp'

export const alertsRouter = router({
  list: publicProcedure
    .input(z.object({
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      type: z.string().optional(),
      district: z.string().optional(),
      status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('Alert')
        .select('*, Facility!inner(id, name, nameHi, district, block, type, lat, lng, metadata), AlertChannel(*)')
        .order('triggeredAt', { ascending: false })
        .range(input?.offset ?? 0, (input?.offset ?? 0) + (input?.limit ?? 50) - 1)

      if (input?.severity) query = query.eq('severity', input.severity)
      if (input?.type) query = query.eq('type', input.type)
      if (input?.status) query = query.eq('status', input.status)
      if (input?.district) query = query.eq('Facility.district', input.district)

      const { data, error } = await query
      if (error) throw new Error(error.message)

      return (data ?? []).map((a: any) => {
        const meta = a.Facility?.metadata && typeof a.Facility.metadata === 'object' ? a.Facility.metadata : {}
        return {
          ...a,
          facility: a.Facility ? { id: a.Facility.id, name: a.Facility.name, nameHi: a.Facility.nameHi, type: a.Facility.type, district: a.Facility.district, block: a.Facility.block, lat: a.Facility.lat, lng: a.Facility.lng, phone: (meta as any).phone ?? null } : null,
          channels: a.AlertChannel ?? [],
        }
      })
    }),

  acknowledge: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('Alert')
        .update({ status: 'ACKNOWLEDGED' })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('Alert')
        .update({ status: 'RESOLVED', resolvedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }),

  resolveWithIntervention: protectedProcedure
    .input(z.object({
      id: z.string(),
      actionTaken: z.string().min(1),
      outcome: z.string().optional(),
      cost: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: alert, error } = await ctx.supabase
        .from('Alert')
        .update({ status: 'RESOLVED', resolvedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw new Error(error.message)

      const userId = (ctx.session?.user as any)?.id ?? 'system'
      await ctx.supabase.from('Intervention').insert({
        facilityId: alert.facilityId,
        alertId: alert.id,
        actionTaken: input.actionTaken,
        takenById: userId,
        outcome: input.outcome ?? null,
        cost: input.cost ?? null,
      })

      return alert
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('Alert')
        .update({ status: 'DISMISSED' })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }),

  sendWhatsApp: protectedProcedure
    .input(z.object({
      alertId: z.string(),
      phone: z.string().min(10).max(15),
      language: z.enum(['ENGLISH', 'HINDI']).default('ENGLISH'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch the alert with facility details
      const { data: alert, error: alertErr } = await ctx.supabase
        .from('Alert')
        .select('*, Facility(name, nameHi, district)')
        .eq('id', input.alertId)
        .single()

      if (alertErr || !alert) throw new Error(alertErr?.message ?? 'Alert not found')

      const facilityName = input.language === 'HINDI' && alert.Facility?.nameHi
        ? alert.Facility.nameHi
        : alert.Facility?.name ?? 'Unknown'

      const body = formatAlertMessage({
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        facilityName,
        district: alert.Facility?.district ?? '',
        triggeredAt: alert.triggeredAt,
      }, input.language)

      // Normalize phone to E.164
      let phone = input.phone.replace(/\s+/g, '')
      if (!phone.startsWith('+')) phone = `+91${phone}`

      const result = await sendWhatsAppMessage(phone, body)

      // Record the channel in DB
      await ctx.supabase.from('AlertChannel').insert({
        alertId: input.alertId,
        channel: 'WHATSAPP',
        recipient: phone,
        language: input.language === 'HINDI' ? 'HINDI' : 'ENGLISH',
        status: result.success ? 'SENT' : 'FAILED',
        sentAt: result.success ? new Date().toISOString() : null,
      })

      if (!result.success) {
        throw new Error(`WhatsApp send failed: ${result.error}`)
      }

      return { success: true, sid: result.sid }
    }),
})
