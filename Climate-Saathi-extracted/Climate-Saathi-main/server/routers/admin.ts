import { z } from 'zod'
import { randomBytes } from 'crypto'
import { router, adminProcedure } from '@/server/trpc'

function cuid() { return 'c' + randomBytes(12).toString('hex').slice(0, 24) }

const facilityInput = z.object({
  name:     z.string().min(1),
  type:     z.enum(['SCHOOL', 'PHC', 'CHC', 'ANGANWADI']),
  district: z.string().min(1),
  block:    z.string().min(1),
  lat:      z.number(),
  lng:      z.number(),
  phone:    z.string().optional(),
})

// Helper: merge phone into metadata JSON (since we can't add columns via REST API)
function withPhone(input: { phone?: string; [k: string]: unknown }) {
  const { phone, ...rest } = input
  if (phone) {
    rest.metadata = { phone }
  }
  return rest
}

export const adminRouter = router({
  users: adminProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase.from('User').select('*').order('createdAt', { ascending: false })
    return data ?? []
  }),

  facilities: adminProcedure.query(async ({ ctx }) => {
    const { data } = await ctx.supabase.from('Facility').select('*').order('name', { ascending: true }).limit(1000)
    return data ?? []
  }),

  createFacility: adminProcedure
    .input(facilityInput)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.from('Facility').insert({ ...withPhone(input), updatedAt: new Date().toISOString() }).select().single()
      if (error) throw new Error(error.message)
      return data
    }),

  updateFacility: adminProcedure
    .input(z.object({ id: z.string() }).merge(facilityInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input
      // Merge phone into existing metadata
      let updateData: Record<string, unknown> = { ...rest, updatedAt: new Date().toISOString() }
      if ('phone' in rest) {
        const { data: existing } = await ctx.supabase.from('Facility').select('metadata').eq('id', id).single()
        const existingMeta = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
        updateData.metadata = { ...existingMeta, phone: rest.phone || null }
        delete updateData.phone
      }
      const { data, error } = await ctx.supabase.from('Facility').update(updateData).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    }),

  deleteFacility: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from('Facility').delete().eq('id', input.id)
      if (error) throw new Error(error.message)
      return { id: input.id }
    }),

  bulkCreateFacilities: adminProcedure
    .input(z.object({ facilities: z.array(facilityInput) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const rows = input.facilities.map(f => ({ ...withPhone(f), updatedAt: now }))
      const { data, error } = await ctx.supabase.from('Facility').insert(rows).select('id')
      if (error) throw new Error(error.message)
      return { count: data?.length ?? 0 }
    }),

  bulkCreateUsers: adminProcedure
    .input(z.object({
      users: z.array(z.object({
        name:     z.string().min(1),
        email:    z.string().email().optional(),
        phone:    z.string().optional(),
        role:     z.enum(['ADMIN','STATE_OFFICER','DISTRICT_OFFICER','BLOCK_ENGINEER','HEADMASTER','ANM','VIEWER']),
        district: z.string().optional(),
        block:    z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.from('User').insert(input.users).select('id')
      if (error) throw new Error(error.message)
      return { count: data?.length ?? 0 }
    }),

  bulkCreateSensorReadings: adminProcedure
    .input(z.object({
      readings: z.array(z.object({
        facilityId:  z.string(),
        sensorType:  z.enum(['WATER_LEVEL','SOLAR_OUTPUT','TEMPERATURE','CHLORINE','TURBIDITY','HUMIDITY','BATTERY']),
        value:       z.number(),
        unit:        z.string(),
        qualityFlag: z.enum(['GOOD','SUSPECT','BAD','MISSING']).default('GOOD'),
        timestamp:   z.string().datetime(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.from('SensorReading').insert(input.readings).select('id')
      if (error) throw new Error(error.message)
      return { count: data?.length ?? 0 }
    }),

  createUser: adminProcedure
    .input(z.object({
      name:     z.string().min(1),
      email:    z.string().email(),
      role:     z.enum(['ADMIN','STATE_OFFICER','DISTRICT_OFFICER','BLOCK_ENGINEER','HEADMASTER','ANM','VIEWER']),
      phone:    z.string().optional(),
      district: z.string().optional(),
      block:    z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('User')
        .insert({ id: cuid(), ...input, authProvider: 'google' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }),

  updateUserRole: adminProcedure
    .input(z.object({
      id:   z.string(),
      role: z.enum(['ADMIN','STATE_OFFICER','DISTRICT_OFFICER','BLOCK_ENGINEER','HEADMASTER','ANM','VIEWER']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('User')
        .update({ role: input.role })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    }),

  deleteUser: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.from('User').delete().eq('id', input.id)
      if (error) throw new Error(error.message)
      return { id: input.id }
    }),

  seedDemoData: adminProcedure.mutation(async ({ ctx }) => {
    const now = new Date().toISOString()
    const { data, error } = await ctx.supabase.from('Facility').insert([
      { name: 'Govt. Primary School Arang',       type: 'SCHOOL',    district: 'Raipur',      block: 'Arang',      lat: 21.1983, lng: 81.9712, updatedAt: now },
      { name: 'PHC Mandir Hasaud',                type: 'PHC',       district: 'Raipur',      block: 'Raipur',     lat: 21.2987, lng: 81.7231, updatedAt: now },
      { name: 'Govt. Primary School Bemetara',    type: 'SCHOOL',    district: 'Bemetara',    block: 'Bemetara',   lat: 21.7177, lng: 81.5323, updatedAt: now },
      { name: 'CHC Durg',                         type: 'CHC',       district: 'Durg',        block: 'Durg',       lat: 21.1904, lng: 81.2849, updatedAt: now },
      { name: 'Anganwadi Centre Bilaspur',        type: 'ANGANWADI', district: 'Bilaspur',    block: 'Bilaspur',   lat: 22.0797, lng: 82.1391, updatedAt: now },
      { name: 'Govt. Middle School Korba',        type: 'SCHOOL',    district: 'Korba',       block: 'Korba',      lat: 22.3595, lng: 82.7501, updatedAt: now },
      { name: 'PHC Rajnandgaon',                  type: 'PHC',       district: 'Rajnandgaon', block: 'Rajnandgaon',lat: 21.0973, lng: 81.0372, updatedAt: now },
      { name: 'CHC Jagdalpur',                    type: 'CHC',       district: 'Bastar',      block: 'Jagdalpur',  lat: 19.0748, lng: 82.0359, updatedAt: now },
    ]).select('id')
    if (error) throw new Error(error.message)
    return { facilities: data?.length ?? 0 }
  }),
})
