/**
 * Pre-compute climate JSON data from local CSV files.
 *
 * Reads the 4 NASA POWER CSV files in dataset/ and produces small JSON files
 * in data/climate/ that the Next.js app can import at build-time, eliminating
 * the dependency on local CSV files in production.
 *
 * Run:  node scripts/precompute-climate.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATASET = path.join(ROOT, 'dataset')
const OUT_DIR = path.join(ROOT, 'data', 'climate')

// ── CSV files to read ───────────────────────────────────────────────────────
const CSV_FILES = [
  { file: 'cg_TEMPERATURE_1984_2024.csv', param: 'TEMPERATURE' },
  { file: 'cg_RAINFALL_1984_2024.csv', param: 'RAINFALL' },
  { file: 'cg_HUMIDITY_1984_2024.csv', param: 'HUMIDITY' },
  { file: 'cg_GHI_1984_2024.csv', param: 'GHI' },
]

// ── Parse one CSV ───────────────────────────────────────────────────────────
function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter((l) => l.trim())
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length < 9) continue
    records.push({
      district: parts[0].trim(),
      division: parts[1].trim(),
      lat: parseFloat(parts[2]),
      lon: parseFloat(parts[3]),
      date: parts[4].trim(), // YYYY-MM-DD
      value: parseFloat(parts[8]),
    })
  }
  return records
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const avg = (arr) =>
  arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100 : 0

// ── Main ────────────────────────────────────────────────────────────────────
console.log('Reading CSV files...')

// Merge all 4 CSVs into a single Map<"district|date", record>
// record = { district, division, lat, lon, date, temperature?, rainfall?, humidity?, ghi? }
const merged = new Map()
const districtMeta = new Map()

for (const { file, param } of CSV_FILES) {
  const filePath = path.join(DATASET, file)
  console.log(`  → ${file}`)
  const records = parseCsv(filePath)
  for (const r of records) {
    const key = `${r.district}|${r.date}`
    if (!merged.has(key)) {
      merged.set(key, { district: r.district, date: r.date })
    }
    merged.get(key)[param.toLowerCase()] = r.value
    if (!districtMeta.has(r.district)) {
      districtMeta.set(r.district, { division: r.division, lat: r.lat, lon: r.lon })
    }
  }
}

console.log(`Merged ${merged.size} district-date records`)

// ── 1. District summaries (2024 averages) ───────────────────────────────────
console.log('Computing district summaries (2024 averages)...')
const districtAccum = new Map() // district -> { temp[], rain[], humid[], ghi[] }

for (const [, rec] of merged) {
  if (!rec.date.startsWith('2024')) continue
  if (!districtAccum.has(rec.district)) {
    districtAccum.set(rec.district, { temperature: [], rainfall: [], humidity: [], ghi: [] })
  }
  const a = districtAccum.get(rec.district)
  if (rec.temperature != null) a.temperature.push(rec.temperature)
  if (rec.rainfall != null) a.rainfall.push(rec.rainfall)
  if (rec.humidity != null) a.humidity.push(rec.humidity)
  if (rec.ghi != null) a.ghi.push(rec.ghi)
}

const districtSummaries = []
for (const [district, meta] of districtMeta) {
  const a = districtAccum.get(district) || { temperature: [], rainfall: [], humidity: [], ghi: [] }
  districtSummaries.push({
    district,
    division: meta.division,
    lat: meta.lat,
    lon: meta.lon,
    temperature: avg(a.temperature),
    rainfall: avg(a.rainfall),
    humidity: avg(a.humidity),
    ghi: avg(a.ghi),
  })
}
districtSummaries.sort((a, b) => a.district.localeCompare(b.district))

// ── 2. Yearly averages ─────────────────────────────────────────────────────
console.log('Computing yearly averages...')
const yearlyAccum = new Map() // "district|year" -> { temp[], rain[], humid[], ghi[] }

for (const [, rec] of merged) {
  const year = rec.date.substring(0, 4)
  const key = `${rec.district}|${year}`
  if (!yearlyAccum.has(key)) {
    yearlyAccum.set(key, { district: rec.district, year: parseInt(year), temperature: [], rainfall: [], humidity: [], ghi: [] })
  }
  const a = yearlyAccum.get(key)
  if (rec.temperature != null) a.temperature.push(rec.temperature)
  if (rec.rainfall != null) a.rainfall.push(rec.rainfall)
  if (rec.humidity != null) a.humidity.push(rec.humidity)
  if (rec.ghi != null) a.ghi.push(rec.ghi)
}

const yearlyAverages = []
for (const [, a] of yearlyAccum) {
  yearlyAverages.push({
    district: a.district,
    year: a.year,
    temperature: avg(a.temperature),
    rainfall: avg(a.rainfall),
    humidity: avg(a.humidity),
    ghi: avg(a.ghi),
  })
}
yearlyAverages.sort((a, b) => a.district.localeCompare(b.district) || a.year - b.year)

// ── 3. Monthly averages ────────────────────────────────────────────────────
console.log('Computing monthly averages...')
const monthlyAccum = new Map() // "district|YYYY-MM" -> { temp[], rain[], humid[], ghi[] }

for (const [, rec] of merged) {
  const month = rec.date.substring(0, 7)
  const key = `${rec.district}|${month}`
  if (!monthlyAccum.has(key)) {
    monthlyAccum.set(key, { district: rec.district, month, temperature: [], rainfall: [], humidity: [], ghi: [] })
  }
  const a = monthlyAccum.get(key)
  if (rec.temperature != null) a.temperature.push(rec.temperature)
  if (rec.rainfall != null) a.rainfall.push(rec.rainfall)
  if (rec.humidity != null) a.humidity.push(rec.humidity)
  if (rec.ghi != null) a.ghi.push(rec.ghi)
}

const monthlyAverages = []
for (const [, a] of monthlyAccum) {
  monthlyAverages.push({
    district: a.district,
    month: a.month,
    temperature: avg(a.temperature),
    rainfall: avg(a.rainfall),
    humidity: avg(a.humidity),
    ghi: avg(a.ghi),
  })
}
monthlyAverages.sort((a, b) => a.district.localeCompare(b.district) || a.month.localeCompare(b.month))

// ── 4. Recent daily data (last 120 days per district) ───────────────────────
console.log('Computing recent daily data...')
const dailyByDistrict = new Map() // district -> [{date, temp, rain, humid, ghi}]

for (const [, rec] of merged) {
  if (!dailyByDistrict.has(rec.district)) dailyByDistrict.set(rec.district, [])
  dailyByDistrict.get(rec.district).push({
    date: rec.date,
    temperature: rec.temperature ?? null,
    rainfall: rec.rainfall ?? null,
    humidity: rec.humidity ?? null,
    ghi: rec.ghi ?? null,
  })
}

const dailyRecent = []
for (const [district, days] of dailyByDistrict) {
  days.sort((a, b) => b.date.localeCompare(a.date)) // newest first
  const recent = days.slice(0, 120) // last 120 days
  for (const d of recent) {
    dailyRecent.push({ district, ...d })
  }
}
dailyRecent.sort((a, b) => a.district.localeCompare(b.district) || a.date.localeCompare(b.date))

// ── Write output ────────────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true })

const write = (name, data) => {
  const filePath = path.join(OUT_DIR, name)
  fs.writeFileSync(filePath, JSON.stringify(data))
  const sizeMB = (Buffer.byteLength(JSON.stringify(data)) / 1024 / 1024).toFixed(2)
  console.log(`  ✓ ${name} — ${data.length} entries (${sizeMB} MB)`)
}

write('district-summaries.json', districtSummaries)
write('yearly-averages.json', yearlyAverages)
write('monthly-averages.json', monthlyAverages)
write('daily-recent.json', dailyRecent)

console.log('\nDone! JSON files written to data/climate/')
