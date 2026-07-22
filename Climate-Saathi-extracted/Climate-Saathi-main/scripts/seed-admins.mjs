/**
 * Seed admin users and add phone column to Facility table.
 * Usage: node scripts/seed-admins.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomBytes } from 'crypto'

function cuid() {
  return 'c' + randomBytes(12).toString('hex').slice(0, 24)
}

// Parse .env.local manually
const envText = readFileSync('.env.local', 'utf-8')
for (const line of envText.split('\n')) {
  const match = line.match(/^\s*([^#][^=]+)=(.*)$/)
  if (match) {
    const key = match[1].trim()
    const val = match[2].trim().replace(/^"|"$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ADMIN_EMAILS = [
  { name: 'Vaibhav Sahu',   email: 'vaibhavsahu1705@gmail.com' },
  { name: 'Sudheesh Singh',  email: 'sudheesh.singh02@gmail.com' },
  { name: 'AK Gamer',        email: 'akgamer0804@gmail.com' },
  { name: 'Work Account',    email: 'work23102006@gmail.com' },
]

async function addPhoneColumn() {
  // Try adding phone column via rpc if a helper exists, otherwise skip
  // The column must be added via Supabase SQL Editor:
  // ALTER TABLE "Facility" ADD COLUMN IF NOT EXISTS "phone" TEXT;
  const { error } = await supabase.rpc('exec_sql', {
    query: 'ALTER TABLE "Facility" ADD COLUMN IF NOT EXISTS "phone" TEXT;'
  })
  if (error) {
    console.log('⚠️  Could not add phone column automatically.')
    console.log('   Please run this SQL in Supabase SQL Editor:')
    console.log('   ALTER TABLE "Facility" ADD COLUMN IF NOT EXISTS "phone" TEXT;')
    console.log('')
  } else {
    console.log('✅ phone column added to Facility table')
  }
}

async function seedAdmins() {
  let created = 0
  let skipped = 0

  for (const admin of ADMIN_EMAILS) {
    // Check if user already exists
    const { data: existing } = await supabase
      .from('User')
      .select('id, role')
      .eq('email', admin.email)
      .maybeSingle()

    if (existing) {
      if (existing.role !== 'ADMIN') {
        // Promote to admin
        await supabase.from('User').update({ role: 'ADMIN' }).eq('id', existing.id)
        console.log(`✅ ${admin.email} → promoted to ADMIN`)
        created++
      } else {
        console.log(`⏭️  ${admin.email} → already ADMIN`)
        skipped++
      }
      continue
    }

    const { error } = await supabase.from('User').insert({
      id: cuid(),
      name: admin.name,
      email: admin.email,
      role: 'ADMIN',
      authProvider: 'google',
    })

    if (error) {
      console.error(`❌ ${admin.email}: ${error.message}`)
    } else {
      console.log(`✅ ${admin.email} → created as ADMIN`)
      created++
    }
  }

  console.log(`\nDone: ${created} created/promoted, ${skipped} already admin`)
}

async function main() {
  console.log('--- Adding phone column to Facility ---')
  await addPhoneColumn()
  console.log('\n--- Seeding admin users ---')
  await seedAdmins()
}

main().catch(console.error)
