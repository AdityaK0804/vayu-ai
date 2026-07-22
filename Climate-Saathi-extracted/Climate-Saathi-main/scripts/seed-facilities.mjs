import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Supabase client (MUST use service_role key to bypass RLS) ──
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Minimal CSV parser (handles commas inside parentheses in school names) ──
function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h.trim()] = (vals[i] ?? "").trim()));
    return obj;
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Compute district centroids from GeoJSON ──
function loadDistrictCentroids() {
  const geoPath = path.join(ROOT, "public", "chhattisgarh-districts.geojson");
  const geo = JSON.parse(fs.readFileSync(geoPath, "utf-8"));
  const centroids = {};

  for (const feature of geo.features) {
    const name = feature.properties.Dist_Name?.toUpperCase();
    if (!name) continue;
    const coords = extractCoords(feature.geometry);
    if (coords.length === 0) continue;
    let sumLat = 0,
      sumLng = 0;
    for (const [lng, lat] of coords) {
      sumLat += lat;
      sumLng += lng;
    }
    centroids[name] = {
      lat: +(sumLat / coords.length).toFixed(6),
      lng: +(sumLng / coords.length).toFixed(6),
    };
  }
  return centroids;
}

function extractCoords(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon")
    return geometry.coordinates.flat(2);
  return [];
}

// ── District name normalization (CSV names → GeoJSON names) ──
const DISTRICT_ALIASES = {
  SURGUJA: "SURGUJA",
  BILASPUR: "BILASPUR",
  RAIGARH: "RAIGARH",
  RAJNANDGAON: "RAJNANDGAON",
  DURG: "DURG",
  RAIPUR: "RAIPUR",
  BASTAR: "BASTAR",
  KORIA: "KORIYA",
  KORIYA: "KORIYA",
  "JANJGIR-CHAMPA": "JANJGIR-CHAMPA",
  DHAMTARI: "DHAMTARI",
  KAWARDHA: "KABEERDHAM",
  KABIRDHAM: "KABEERDHAM",
  KABEERDHAM: "KABEERDHAM",
  KANKER: "UTTAR BASTAR KANKER",
  "UTTAR BASTAR KANKER": "UTTAR BASTAR KANKER",
  DANTEWADA: "DAKSHIN BASTAR DANTEWADA",
  "DAKSHIN BASTAR DANTEWADA": "DAKSHIN BASTAR DANTEWADA",
  JASHPUR: "JASHPUR",
  KORBA: "KORBA",
  MAHASAMUND: "MAHASAMUND",
  NARAYANPUR: "NARAYANPUR",
  BIJAPUR: "BIJAPUR",
  BALOD: "BALOD",
  BEMETARA: "BEMETRA",
  BEMETRA: "BEMETRA",
  BALRAMPUR: "BALRAMPUR",
  SURAJPUR: "SURAJPUR",
  KONDAGAON: "KONDAGAON",
  GARIABAND: "GARIABAND",
  MUNGELI: "MUNGELI",
  SUKMA: "SUKMA",
  "BALODA BAZAR": "BALODA BAZAR",
  "BALODABAZAR": "BALODA BAZAR",
  "G.P.M": "JASHPUR",
  "GAURELA-PENDRA-MARWAHI": "BILASPUR",
  "MANENDRAGARH": "KORIYA",
  "KHAIRAGARH": "RAJNANDGAON",
  "MOHLA-MANPUR": "RAJNANDGAON",
  "SARANGARH-BILAIGARH": "RAIGARH",
  "SAKTI": "JANJGIR-CHAMPA",
};

function resolveDistrict(raw) {
  if (!raw) return null;
  const key = raw.toUpperCase().replace(/[^A-Z\-\s]/g, "").trim();
  return DISTRICT_ALIASES[key] ?? key;
}

// ── Map health abbrType to FacilityType ──
function healthTypeToFacilityType(abbrType) {
  switch ((abbrType ?? "").toUpperCase()) {
    case "PHC":
    case "UPHC":
      return "PHC";
    case "CHC":
    case "UCHC":
    case "DHC":
      return "CHC";
    default:
      return "PHC"; // SHC, SSK, CD, etc. → PHC
  }
}

// ── Generate cuid-like IDs ──
let counter = 0;
function makeId(prefix) {
  counter++;
  const ts = Date.now().toString(36);
  const c = counter.toString(36).padStart(6, "0");
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}${c}${r}`;
}

// ── Build facility rows ──
function buildHealthFacilities(centroids) {
  const rows = parseCSV(path.join(ROOT, "dataset", "health data.csv"));
  console.log(`  Parsed ${rows.length} health rows`);

  const now = new Date().toISOString();
  return rows.map((r) => {
    const distKey = resolveDistrict(r.District_name || r["District_name"]);
    const coords = centroids[distKey] ?? { lat: 21.25, lng: 81.63 }; // CG center fallback
    return {
      id: makeId("hf"),
      name: (r.NAME_ENG || r.NAME_HIN || "Unknown").trim(),
      nameHi: (r.NAME_HIN || "").trim() || null,
      type: healthTypeToFacilityType(r.abbrType),
      district: (r.District_name || "").toUpperCase().trim(),
      block: (r.Block_Name_En || r.Block_Name || "").toUpperCase().trim(),
      lat: coords.lat + (Math.random() - 0.5) * 0.05, // small jitter within district
      lng: coords.lng + (Math.random() - 0.5) * 0.05,
      metadata: {
        source: "health_data_csv",
        hc_id: r.HC_ID,
        abbrType: r.abbrType,
        hospitalType: r.HospitalTypeEN,
        hospitalTypeHi: r.HospitalTypeHN,
        division: r.division_name_en,
        divisionHi: r.division_name_hi,
        districtHi: r.district_name_hi,
        detailsEng: r.DETAILS_ENG,
        detailsHi: r.DETAILS_HI,
      },
      updatedAt: now,
    };
  });
}

function buildSchoolFacilities(centroids) {
  const rows = parseCSV(path.join(ROOT, "dataset", "schools_ml_ready.csv"));
  console.log(`  Parsed ${rows.length} school rows`);

  // Only keep OPEN schools
  const open = rows.filter((r) => (r.Status || "").toUpperCase() === "OPEN");
  console.log(`  ${open.length} OPEN schools`);

  const now = new Date().toISOString();
  return open.map((r) => {
    const distKey = resolveDistrict(r.District);
    const coords = centroids[distKey] ?? { lat: 21.25, lng: 81.63 };
    // Extract clean school name (remove disecode in parens)
    const rawName = (r.School || "").replace(/\(\d+\)$/, "").trim();
    return {
      id: makeId("sc"),
      name: rawName || "Unknown School",
      nameHi: null,
      type: "SCHOOL",
      district: (r.District || "").toUpperCase().trim(),
      block: (r.Block || "").toUpperCase().trim(),
      lat: coords.lat + (Math.random() - 0.5) * 0.08,
      lng: coords.lng + (Math.random() - 0.5) * 0.08,
      metadata: {
        source: "schools_ml_ready_csv",
        disecode: r["School Disecode"],
        cluster: r.Cluster || null,
        srNo: r.SrNo,
      },
      updatedAt: now,
    };
  });
}

// ── Batch upsert into Supabase ──
async function insertBatch(table, rows, batchSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(
        `  Error at batch ${Math.floor(i / batchSize) + 1}:`,
        error.message
      );
      // Try smaller batches on error
      if (batchSize > 50) {
        console.log("  Retrying with smaller batch size...");
        await insertBatch(table, batch, 50);
      } else {
        console.error("  Skipping batch.");
      }
    } else {
      inserted += batch.length;
      if ((i / batchSize) % 20 === 0 || i + batchSize >= rows.length) {
        console.log(
          `  Progress: ${inserted}/${rows.length} (${((inserted / rows.length) * 100).toFixed(1)}%)`
        );
      }
    }
  }
  return inserted;
}

// ── Main ──
async function main() {
  // Step 0: Add nameHi column if it doesn't exist (via Supabase SQL)
  console.log("Ensuring 'nameHi' column exists in Facility table...");
  const { error: sqlErr } = await supabase.rpc("exec_sql", {
    query: `ALTER TABLE "Facility" ADD COLUMN IF NOT EXISTS "nameHi" TEXT;`,
  });
  if (sqlErr) {
    // If the RPC doesn't exist, try direct SQL via the REST API
    console.warn(
      "  RPC exec_sql not available. Please add the 'nameHi' column manually in Supabase SQL Editor:"
    );
    console.warn(
      '  ALTER TABLE "Facility" ADD COLUMN IF NOT EXISTS "nameHi" TEXT;'
    );
    console.log("  Continuing with insert anyway...\n");
  } else {
    console.log("  Column ensured.\n");
  }

  console.log("Loading district centroids from GeoJSON...");
  const centroids = loadDistrictCentroids();
  console.log(`  Found ${Object.keys(centroids).length} districts\n`);

  console.log("Building health facilities...");
  const health = buildHealthFacilities(centroids);

  console.log("\nBuilding school facilities...");
  const schools = buildSchoolFacilities(centroids);

  const total = health.length + schools.length;
  console.log(`\nTotal facilities to insert: ${total}`);
  console.log(`  Health: ${health.length}`);
  console.log(`  Schools: ${schools.length}\n`);

  // Prisma default maps model "Facility" → table "Facility"
  const TABLE = "Facility";

  console.log("Inserting health facilities...");
  const hInserted = await insertBatch(TABLE, health);
  console.log(`  Done: ${hInserted} health facilities inserted.\n`);

  console.log("Inserting school facilities...");
  const sInserted = await insertBatch(TABLE, schools);
  console.log(`  Done: ${sInserted} school facilities inserted.\n`);

  console.log(`=== COMPLETE: ${hInserted + sInserted} facilities seeded ===`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
