/**
 * Seed script: generates synthetic SensorReadings, RiskScores, ShapValues,
 * Forecasts, and Alerts for a random sample of facilities already in Supabase.
 *
 * Usage:
 *   node scripts/seed-synthetic.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Load env ──
const envPath = path.join(ROOT, ".env.local");
const envLines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
const env = {};
for (const line of envLines) {
  const m = line.match(/^\s*([^#][^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──
const cuid = () => "syn_" + crypto.randomBytes(12).toString("hex");
const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// ── Config ──
const FACILITY_SAMPLE_SIZE = 200; // How many facilities get sensor data
const SENSOR_DAYS = 14; // 14 days of history
const READINGS_PER_DAY = 6; // every 4 hours
const FORECAST_HORIZON = 14;

const SENSOR_TYPES = [
  { type: "WATER_LEVEL", unit: "m", min: 0.5, max: 8.0 },
  { type: "SOLAR_OUTPUT", unit: "kW", min: 0, max: 5.5 },
  { type: "TEMPERATURE", unit: "°C", min: 22, max: 46 },
  { type: "CHLORINE", unit: "mg/L", min: 0, max: 4.0 },
  { type: "TURBIDITY", unit: "NTU", min: 0.1, max: 15 },
  { type: "HUMIDITY", unit: "%", min: 30, max: 95 },
  { type: "BATTERY", unit: "%", min: 10, max: 100 },
];

const FORECAST_TYPES = ["WATER_LEVEL", "SOLAR_OUTPUT", "DISEASE_RISK", "HEAT_INDEX"];

const ALERT_TYPES = ["WATER_SHORTAGE", "SOLAR_FAILURE", "HEAT_STRESS", "DISEASE_RISK", "TURBIDITY"];
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const QUALITY_FLAGS = ["GOOD", "GOOD", "GOOD", "GOOD", "SUSPECT", "BAD"]; // weighted toward GOOD

const SHAP_FEATURES = [
  "water_level_avg", "temperature_max", "humidity_avg",
  "solar_output_avg", "chlorine_min", "turbidity_max",
  "rainfall_7d", "battery_min",
];

// ── Batch insert helper ──
async function batchInsert(table, rows, batchSize = 500) {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`  Error inserting ${table} batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      // Retry with smaller batch
      if (batchSize > 50) {
        const sub = await batchInsertSmall(table, batch, 50);
        total += sub;
      }
    } else {
      total += batch.length;
    }
  }
  return total;
}

async function batchInsertSmall(table, rows, batchSize) {
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`    Sub-batch error (${table}):`, error.message);
    } else {
      total += batch.length;
    }
  }
  return total;
}

// ── Generate Sensor Readings ──
function generateSensorReadings(facilityId) {
  const rows = [];
  const now = Date.now();
  const intervalMs = (24 * 3600 * 1000) / READINGS_PER_DAY;

  for (const sensor of SENSOR_TYPES) {
    // Create a base value with slight random walk
    let value = rand(sensor.min + (sensor.max - sensor.min) * 0.3, sensor.min + (sensor.max - sensor.min) * 0.7);

    for (let day = SENSOR_DAYS; day >= 0; day--) {
      for (let reading = 0; reading < READINGS_PER_DAY; reading++) {
        const ts = new Date(now - day * 24 * 3600 * 1000 + reading * intervalMs);
        // Random walk
        value += rand(-0.5, 0.5) * (sensor.max - sensor.min) * 0.05;
        value = Math.max(sensor.min, Math.min(sensor.max, value));

        // Diurnal variation for solar & temperature
        const hour = ts.getHours();
        let adjustedValue = value;
        if (sensor.type === "SOLAR_OUTPUT") {
          const solarFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
          adjustedValue = value * solarFactor;
        }
        if (sensor.type === "TEMPERATURE") {
          adjustedValue += Math.sin(((hour - 6) / 12) * Math.PI) * 4;
        }

        rows.push({
          id: cuid(),
          facilityId,
          sensorType: sensor.type,
          value: Math.round(adjustedValue * 100) / 100,
          unit: sensor.unit,
          qualityFlag: pick(QUALITY_FLAGS),
          timestamp: ts.toISOString(),
        });
      }
    }
  }
  return rows;
}

// ── Generate Risk Score ──
function generateRiskScore(facilityId) {
  const waterRisk = rand(5, 85);
  const energyRisk = rand(5, 75);
  const sanitationRisk = rand(5, 80);
  const diseaseRisk = rand(5, 90);
  const overallRisk = (waterRisk * 0.3 + energyRisk * 0.2 + sanitationRisk * 0.25 + diseaseRisk * 0.25);

  const riskId = cuid();
  const score = {
    id: riskId,
    facilityId,
    waterRisk: Math.round(waterRisk * 10) / 10,
    energyRisk: Math.round(energyRisk * 10) / 10,
    sanitationRisk: Math.round(sanitationRisk * 10) / 10,
    diseaseRisk: Math.round(diseaseRisk * 10) / 10,
    overallRisk: Math.round(overallRisk * 10) / 10,
    scoredAt: new Date().toISOString(),
  };

  // SHAP values
  const shapValues = SHAP_FEATURES.map((feat, i) => ({
    id: cuid(),
    riskScoreId: riskId,
    featureName: feat,
    shapValue: Math.round(rand(-5, 5) * 1000) / 1000,
    rank: i + 1,
  }));

  return { score, shapValues };
}

// ── Generate Forecast ──
function generateForecast(facilityId, forecastType) {
  let base;
  let range;
  switch (forecastType) {
    case "WATER_LEVEL":
      base = rand(2, 6); range = 1.5; break;
    case "SOLAR_OUTPUT":
      base = rand(2, 4.5); range = 1; break;
    case "DISEASE_RISK":
      base = rand(15, 60); range = 15; break;
    case "HEAT_INDEX":
      base = rand(30, 44); range = 4; break;
    default:
      base = rand(20, 50); range = 10;
  }

  const values = [];
  const p10 = [];
  const p90 = [];
  let v = base;

  for (let d = 0; d < FORECAST_HORIZON; d++) {
    v += rand(-0.3, 0.3) * range;
    v = Math.max(0, v);
    const uncertainty = range * 0.3 * (1 + d * 0.05); // grows over horizon
    values.push(Math.round(v * 100) / 100);
    p10.push(Math.round((v - uncertainty) * 100) / 100);
    p90.push(Math.round((v + uncertainty) * 100) / 100);
  }

  return {
    id: cuid(),
    facilityId,
    forecastType,
    values: JSON.stringify(values),
    p10: JSON.stringify(p10),
    p90: JSON.stringify(p90),
    horizonDays: FORECAST_HORIZON,
    createdAt: new Date().toISOString(),
  };
}

// ── Generate Alerts ──
function generateAlerts(facilityId) {
  const alerts = [];
  const numAlerts = randInt(0, 3);
  const messages = {
    WATER_SHORTAGE: [
      "Water level dropped below critical threshold of 1.0m",
      "Tank level declining rapidly — estimated depletion in 48h",
      "Water supply disruption detected at facility",
    ],
    SOLAR_FAILURE: [
      "Solar panel output below 10% of rated capacity",
      "No solar generation detected for 6+ hours during daylight",
      "Inverter fault detected, backup power activated",
    ],
    HEAT_STRESS: [
      "Heat index exceeded 42°C — dangerous conditions",
      "Sustained high temperature above 40°C for 8+ hours",
      "Extreme heat warning — consider facility closure",
    ],
    DISEASE_RISK: [
      "Disease risk index elevated above 70 — increased surveillance recommended",
      "Vector-borne disease conditions detected — high humidity + temperature",
      "Waterborne disease risk high — chlorine levels sub-optimal",
    ],
    TURBIDITY: [
      "Water turbidity exceeded 10 NTU — potential contamination",
      "Turbidity spike detected — check water source",
      "Turbidity above safe drinking water limits",
    ],
  };

  for (let i = 0; i < numAlerts; i++) {
    const type = pick(ALERT_TYPES);
    const severity = pick(SEVERITIES);
    const hoursAgo = randInt(1, 48);
    alerts.push({
      id: cuid(),
      facilityId,
      type,
      severity,
      message: pick(messages[type]),
      status: pick(["ACTIVE", "ACTIVE", "ACTIVE", "ACKNOWLEDGED"]),
      confidence: Math.round(rand(55, 98) * 10) / 10,
      triggeredAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
    });
  }
  return alerts;
}

// ── Main ──
async function main() {
  console.log("=== Synthetic Data Seed ===\n");

  // 1. Fetch a random sample of facilities
  console.log(`Fetching ${FACILITY_SAMPLE_SIZE} random facilities...`);
  // Get distinct districts first, then sample from each
  const { data: allFacilities, error: fetchErr } = await supabase
    .from("Facility")
    .select("id, name, type, district")
    .order("id")
    .limit(FACILITY_SAMPLE_SIZE);

  if (fetchErr || !allFacilities?.length) {
    console.error("Failed to fetch facilities:", fetchErr?.message);
    process.exit(1);
  }

  const facilities = allFacilities;
  console.log(`  Got ${facilities.length} facilities across ${[...new Set(facilities.map(f => f.district))].length} districts\n`);

  // 2. Generate sensor readings
  console.log("Generating sensor readings (14 days × 6/day × 7 types)...");
  let allReadings = [];
  for (const f of facilities) {
    allReadings.push(...generateSensorReadings(f.id));
  }
  console.log(`  Total readings to insert: ${allReadings.length.toLocaleString()}`);
  const readingsInserted = await batchInsert("SensorReading", allReadings, 500);
  console.log(`  Inserted: ${readingsInserted.toLocaleString()}\n`);
  allReadings = null; // free memory

  // 3. Generate risk scores + SHAP values
  console.log("Generating risk scores + SHAP values...");
  const allScores = [];
  const allShap = [];
  for (const f of facilities) {
    const { score, shapValues } = generateRiskScore(f.id);
    allScores.push(score);
    allShap.push(...shapValues);
  }
  console.log(`  Risk scores: ${allScores.length}`);
  const scoresInserted = await batchInsert("RiskScore", allScores, 500);
  console.log(`  Inserted risk scores: ${scoresInserted}`);
  console.log(`  SHAP values: ${allShap.length}`);
  const shapInserted = await batchInsert("ShapValue", allShap, 500);
  console.log(`  Inserted SHAP values: ${shapInserted}\n`);

  // 4. Generate forecasts (each facility gets 1-2 forecast types)
  console.log("Generating 14-day forecasts...");
  const allForecasts = [];
  for (const f of facilities) {
    // Each facility gets 1-2 random forecast types
    const types = FORECAST_TYPES.sort(() => Math.random() - 0.5).slice(0, randInt(1, 2));
    for (const ft of types) {
      allForecasts.push(generateForecast(f.id, ft));
    }
  }
  console.log(`  Total forecasts: ${allForecasts.length}`);
  const forecastsInserted = await batchInsert("Forecast", allForecasts, 500);
  console.log(`  Inserted forecasts: ${forecastsInserted}\n`);

  // 5. Generate alerts
  console.log("Generating alerts...");
  const allAlerts = [];
  for (const f of facilities) {
    allAlerts.push(...generateAlerts(f.id));
  }
  console.log(`  Total alerts: ${allAlerts.length}`);
  const alertsInserted = await batchInsert("Alert", allAlerts, 500);
  console.log(`  Inserted alerts: ${alertsInserted}\n`);

  console.log("=== Done! ===");
  console.log(`Summary:`);
  console.log(`  Facilities with data: ${facilities.length}`);
  console.log(`  Sensor readings:      ${readingsInserted.toLocaleString()}`);
  console.log(`  Risk scores:          ${scoresInserted}`);
  console.log(`  SHAP values:          ${shapInserted}`);
  console.log(`  Forecasts:            ${forecastsInserted}`);
  console.log(`  Alerts:               ${alertsInserted}`);
}

main().catch(console.error);
