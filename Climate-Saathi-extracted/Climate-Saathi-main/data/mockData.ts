import type { Facility, Alert, District, RiskForecast, KpiMetrics } from '@/types'

export const districts: District[] = [
  { id: 'd1',  name: 'Raipur',         facilitiesCount: 245, schoolsCount: 180, healthCentresCount: 65,  averageRiskScore: 42, activeAlerts: 12 },
  { id: 'd2',  name: 'Bastar',         facilitiesCount: 156, schoolsCount: 110, healthCentresCount: 46,  averageRiskScore: 68, activeAlerts: 28 },
  { id: 'd3',  name: 'Durg',           facilitiesCount: 198, schoolsCount: 145, healthCentresCount: 53,  averageRiskScore: 38, activeAlerts: 8  },
  { id: 'd4',  name: 'Bilaspur',       facilitiesCount: 167, schoolsCount: 120, healthCentresCount: 47,  averageRiskScore: 45, activeAlerts: 15 },
  { id: 'd5',  name: 'Korba',          facilitiesCount: 134, schoolsCount: 95,  healthCentresCount: 39,  averageRiskScore: 52, activeAlerts: 18 },
  { id: 'd6',  name: 'Rajnandgaon',    facilitiesCount: 142, schoolsCount: 105, healthCentresCount: 37,  averageRiskScore: 41, activeAlerts: 9  },
  { id: 'd7',  name: 'Jashpur',        facilitiesCount: 89,  schoolsCount: 65,  healthCentresCount: 24,  averageRiskScore: 71, activeAlerts: 22 },
  { id: 'd8',  name: 'Surguja',        facilitiesCount: 112, schoolsCount: 82,  healthCentresCount: 30,  averageRiskScore: 48, activeAlerts: 11 },
  { id: 'd9',  name: 'Kondagaon',      facilitiesCount: 78,  schoolsCount: 55,  healthCentresCount: 23,  averageRiskScore: 62, activeAlerts: 19 },
  { id: 'd10', name: 'Kanker',         facilitiesCount: 95,  schoolsCount: 68,  healthCentresCount: 27,  averageRiskScore: 55, activeAlerts: 14 },
  { id: 'd11', name: 'Dhamtari',       facilitiesCount: 108, schoolsCount: 78,  healthCentresCount: 30,  averageRiskScore: 39, activeAlerts: 7  },
  { id: 'd12', name: 'Mahasamund',     facilitiesCount: 121, schoolsCount: 88,  healthCentresCount: 33,  averageRiskScore: 44, activeAlerts: 10 },
  { id: 'd13', name: 'Gariaband',      facilitiesCount: 72,  schoolsCount: 52,  healthCentresCount: 20,  averageRiskScore: 58, activeAlerts: 16 },
  { id: 'd14', name: 'Baloda Bazar',   facilitiesCount: 98,  schoolsCount: 72,  healthCentresCount: 26,  averageRiskScore: 43, activeAlerts: 8  },
  { id: 'd15', name: 'Janjgir-Champa', facilitiesCount: 135, schoolsCount: 98,  healthCentresCount: 37,  averageRiskScore: 46, activeAlerts: 12 },
  { id: 'd16', name: 'Raigarh',        facilitiesCount: 118, schoolsCount: 86,  healthCentresCount: 32,  averageRiskScore: 50, activeAlerts: 13 },
  { id: 'd17', name: 'Mungeli',        facilitiesCount: 65,  schoolsCount: 47,  healthCentresCount: 18,  averageRiskScore: 47, activeAlerts: 9  },
  { id: 'd18', name: 'Koriya',         facilitiesCount: 82,  schoolsCount: 60,  healthCentresCount: 22,  averageRiskScore: 53, activeAlerts: 15 },
  { id: 'd19', name: 'Surajpur',       facilitiesCount: 76,  schoolsCount: 55,  healthCentresCount: 21,  averageRiskScore: 56, activeAlerts: 17 },
  { id: 'd20', name: 'Balrampur',      facilitiesCount: 68,  schoolsCount: 49,  healthCentresCount: 19,  averageRiskScore: 61, activeAlerts: 20 },
  { id: 'd21', name: 'Bijapur',        facilitiesCount: 54,  schoolsCount: 39,  healthCentresCount: 15,  averageRiskScore: 72, activeAlerts: 25 },
  { id: 'd22', name: 'Sukma',          facilitiesCount: 48,  schoolsCount: 35,  healthCentresCount: 13,  averageRiskScore: 75, activeAlerts: 27 },
  { id: 'd23', name: 'Dantewada',      facilitiesCount: 62,  schoolsCount: 45,  healthCentresCount: 17,  averageRiskScore: 69, activeAlerts: 23 },
  { id: 'd24', name: 'Narayanpur',     facilitiesCount: 42,  schoolsCount: 30,  healthCentresCount: 12,  averageRiskScore: 66, activeAlerts: 21 },
  { id: 'd25', name: 'Balod',          facilitiesCount: 88,  schoolsCount: 64,  healthCentresCount: 24,  averageRiskScore: 40, activeAlerts: 6  },
  { id: 'd26', name: 'Bemetara',       facilitiesCount: 92,  schoolsCount: 67,  healthCentresCount: 25,  averageRiskScore: 37, activeAlerts: 5  },
  { id: 'd27', name: 'Kabirdham',      facilitiesCount: 85,  schoolsCount: 62,  healthCentresCount: 23,  averageRiskScore: 49, activeAlerts: 11 },
]

export const facilities: Facility[] = [
  {
    id: 'f1', name: 'Govt. H.S. School Raipur', type: 'SCHOOL', district: 'Raipur',
    block: 'Raipur Urban', latitude: 21.2514, longitude: 81.6296,
    riskScore: 35, riskLevel: 'LOW', sensorStatus: 'ONLINE', lastReading: '2026-03-08T10:30:00Z',
    sensors: [
      { id: 's1', type: 'AIR_QUALITY',  name: 'AQI',         value: 85, unit: 'AQI', status: 'NORMAL', lastUpdated: '2026-03-08T10:30:00Z' },
      { id: 's2', type: 'TEMPERATURE',  name: 'Temperature', value: 32, unit: '°C',  status: 'NORMAL', lastUpdated: '2026-03-08T10:30:00Z' },
      { id: 's3', type: 'HUMIDITY',     name: 'Humidity',    value: 65, unit: '%',   status: 'NORMAL', lastUpdated: '2026-03-08T10:30:00Z' },
    ],
  },
  {
    id: 'f2', name: 'Primary Health Centre Bastar', type: 'HEALTH_CENTRE', district: 'Bastar',
    block: 'Jagdalpur', latitude: 19.1075, longitude: 82.0234,
    riskScore: 78, riskLevel: 'HIGH', sensorStatus: 'ONLINE', lastReading: '2026-03-08T09:45:00Z',
    sensors: [
      { id: 's4', type: 'AIR_QUALITY',  name: 'AQI',        value: 142, unit: 'AQI', status: 'WARNING',  lastUpdated: '2026-03-08T09:45:00Z' },
      { id: 's5', type: 'TEMPERATURE',  name: 'Temperature',value: 38,  unit: '°C',  status: 'CRITICAL', lastUpdated: '2026-03-08T09:45:00Z' },
      { id: 's6', type: 'WATER_LEVEL',  name: 'Water Tank', value: 35,  unit: '%',   status: 'WARNING',  lastUpdated: '2026-03-08T09:45:00Z' },
      { id: 's7', type: 'POWER',        name: 'Power',      value: 1,   unit: 'ON',  status: 'NORMAL',   lastUpdated: '2026-03-08T09:45:00Z' },
    ],
  },
  {
    id: 'f3', name: 'Middle School Durg', type: 'SCHOOL', district: 'Durg',
    block: 'Durg Urban', latitude: 21.1904, longitude: 81.2849,
    riskScore: 28, riskLevel: 'LOW', sensorStatus: 'ONLINE', lastReading: '2026-03-08T10:15:00Z',
    sensors: [
      { id: 's8', type: 'AIR_QUALITY', name: 'AQI',         value: 72, unit: 'AQI', status: 'NORMAL', lastUpdated: '2026-03-08T10:15:00Z' },
      { id: 's9', type: 'TEMPERATURE', name: 'Temperature', value: 30, unit: '°C',  status: 'NORMAL', lastUpdated: '2026-03-08T10:15:00Z' },
    ],
  },
  {
    id: 'f4', name: 'Community Health Centre Bilaspur', type: 'HEALTH_CENTRE', district: 'Bilaspur',
    block: 'Bilaspur Urban', latitude: 22.0797, longitude: 82.1409,
    riskScore: 55, riskLevel: 'MEDIUM', sensorStatus: 'DEGRADED', lastReading: '2026-03-08T08:30:00Z',
    sensors: [
      { id: 's10', type: 'AIR_QUALITY', name: 'AQI',         value: 110, unit: 'AQI', status: 'WARNING',  lastUpdated: '2026-03-08T08:30:00Z' },
      { id: 's11', type: 'TEMPERATURE', name: 'Temperature', value: 34,  unit: '°C',  status: 'WARNING',  lastUpdated: '2026-03-08T08:30:00Z' },
      { id: 's12', type: 'POWER',       name: 'Power',       value: 0,   unit: 'OFF', status: 'CRITICAL', lastUpdated: '2026-03-08T08:30:00Z' },
    ],
  },
  {
    id: 'f5', name: 'H.S. School Korba', type: 'SCHOOL', district: 'Korba',
    block: 'Korba Urban', latitude: 22.3595, longitude: 82.7501,
    riskScore: 62, riskLevel: 'MEDIUM', sensorStatus: 'ONLINE', lastReading: '2026-03-08T10:00:00Z',
    sensors: [
      { id: 's13', type: 'AIR_QUALITY', name: 'AQI',         value: 125, unit: 'AQI', status: 'WARNING', lastUpdated: '2026-03-08T10:00:00Z' },
      { id: 's14', type: 'TEMPERATURE', name: 'Temperature', value: 36,  unit: '°C',  status: 'WARNING', lastUpdated: '2026-03-08T10:00:00Z' },
      { id: 's15', type: 'HUMIDITY',    name: 'Humidity',    value: 45,  unit: '%',   status: 'NORMAL',  lastUpdated: '2026-03-08T10:00:00Z' },
    ],
  },
  {
    id: 'f6', name: 'Primary Health Centre Rajnandgaon', type: 'HEALTH_CENTRE', district: 'Rajnandgaon',
    block: 'Rajnandgaon Urban', latitude: 21.0976, longitude: 81.0338,
    riskScore: 41, riskLevel: 'LOW', sensorStatus: 'ONLINE', lastReading: '2026-03-08T09:30:00Z',
    sensors: [
      { id: 's16', type: 'AIR_QUALITY', name: 'AQI',         value: 78, unit: 'AQI', status: 'NORMAL', lastUpdated: '2026-03-08T09:30:00Z' },
      { id: 's17', type: 'TEMPERATURE', name: 'Temperature', value: 31, unit: '°C',  status: 'NORMAL', lastUpdated: '2026-03-08T09:30:00Z' },
      { id: 's18', type: 'WATER_LEVEL', name: 'Water Tank',  value: 72, unit: '%',   status: 'NORMAL', lastUpdated: '2026-03-08T09:30:00Z' },
    ],
  },
  {
    id: 'f7', name: 'Govt. School Jagdalpur', type: 'SCHOOL', district: 'Jagdalpur',
    block: 'Jagdalpur Urban', latitude: 19.0812, longitude: 82.0234,
    riskScore: 85, riskLevel: 'CRITICAL', sensorStatus: 'ONLINE', lastReading: '2026-03-08T09:15:00Z',
    sensors: [
      { id: 's19', type: 'AIR_QUALITY', name: 'AQI',         value: 168, unit: 'AQI', status: 'CRITICAL', lastUpdated: '2026-03-08T09:15:00Z' },
      { id: 's20', type: 'TEMPERATURE', name: 'Temperature', value: 41,  unit: '°C',  status: 'CRITICAL', lastUpdated: '2026-03-08T09:15:00Z' },
      { id: 's21', type: 'HUMIDITY',    name: 'Humidity',    value: 38,  unit: '%',   status: 'WARNING',  lastUpdated: '2026-03-08T09:15:00Z' },
      { id: 's22', type: 'WATER_LEVEL', name: 'Water Tank',  value: 22,  unit: '%',   status: 'CRITICAL', lastUpdated: '2026-03-08T09:15:00Z' },
    ],
  },
  {
    id: 'f8', name: 'Health Centre Ambikapur', type: 'HEALTH_CENTRE', district: 'Ambikapur',
    block: 'Ambikapur Urban', latitude: 23.1220, longitude: 83.1950,
    riskScore: 48, riskLevel: 'MEDIUM', sensorStatus: 'ONLINE', lastReading: '2026-03-08T10:45:00Z',
    sensors: [
      { id: 's23', type: 'AIR_QUALITY', name: 'AQI',         value: 95, unit: 'AQI', status: 'NORMAL', lastUpdated: '2026-03-08T10:45:00Z' },
      { id: 's24', type: 'TEMPERATURE', name: 'Temperature', value: 33, unit: '°C',  status: 'NORMAL', lastUpdated: '2026-03-08T10:45:00Z' },
      { id: 's25', type: 'POWER',       name: 'Power',       value: 1,  unit: 'ON',  status: 'NORMAL', lastUpdated: '2026-03-08T10:45:00Z' },
    ],
  },
]

export const alerts: Alert[] = [
  {
    id: 'a1', facilityId: 'f7', facilityName: 'Govt. School Jagdalpur', district: 'Jagdalpur',
    type: 'Heat Stress', severity: 'CRITICAL', status: 'ACTIVE',
    message: 'Temperature exceeds 40°C. Immediate action required: suspend outdoor activities, ensure hydration stations are active.',
    channels: ['SMS', 'WHATSAPP', 'EMAIL'], createdAt: '2026-03-08T09:15:00Z',
  },
  {
    id: 'a2', facilityId: 'f2', facilityName: 'Primary Health Centre Bastar', district: 'Bastar',
    type: 'Air Quality Warning', severity: 'HIGH', status: 'ACTIVE',
    message: 'AQI at 142 (Unhealthy for Sensitive Groups). Recommend limiting outdoor exposure for children and elderly.',
    channels: ['SMS', 'EMAIL'], createdAt: '2026-03-08T08:30:00Z',
  },
  {
    id: 'a3', facilityId: 'f2', facilityName: 'Primary Health Centre Bastar', district: 'Bastar',
    type: 'Water Stress', severity: 'HIGH', status: 'ACKNOWLEDGED',
    message: 'Water tank level at 35%. Schedule water delivery within 48 hours.',
    channels: ['SMS', 'WHATSAPP'], createdAt: '2026-03-07T16:00:00Z', acknowledgedAt: '2026-03-07T18:30:00Z',
  },
  {
    id: 'a4', facilityId: 'f4', facilityName: 'Community Health Centre Bilaspur', district: 'Bilaspur',
    type: 'Power Outage', severity: 'MEDIUM', status: 'RESOLVED',
    message: 'Power backup system activated. Main power has been offline for 2 hours.',
    channels: ['SMS', 'EMAIL'], createdAt: '2026-03-07T10:00:00Z',
    acknowledgedAt: '2026-03-07T10:30:00Z', resolvedAt: '2026-03-07T14:00:00Z',
  },
  {
    id: 'a5', facilityId: 'f5', facilityName: 'H.S. School Korba', district: 'Korba',
    type: 'Air Quality Alert', severity: 'MEDIUM', status: 'ACTIVE',
    message: 'AQI at 125 (Unhealthy for Sensitive Groups). Consider indoor activities for students with respiratory conditions.',
    channels: ['EMAIL'], createdAt: '2026-03-08T07:00:00Z',
  },
  {
    id: 'a6', facilityId: 'f7', facilityName: 'Govt. School Jagdalpur', district: 'Jagdalpur',
    type: 'Critical Water Level', severity: 'CRITICAL', status: 'ACTIVE',
    message: 'Water tank at 22%. Emergency water delivery required within 24 hours.',
    channels: ['SMS', 'WHATSAPP', 'EMAIL'], createdAt: '2026-03-08T06:00:00Z',
  },
]

export const riskForecast: RiskForecast[] = Array.from({ length: 14 }, (_, i) => {
  const date = new Date('2026-03-08')
  date.setDate(date.getDate() + i)
  const base = 45 + Math.sin(i * 0.5) * 15
  const riskScore = Math.max(0, Math.min(100, Math.round(base + (i % 3 - 1) * 5)))
  const conf = 8 + (i % 4)
  return {
    date: date.toISOString().split('T')[0],
    riskScore,
    confidenceLow:  Math.max(0,   Math.round(riskScore - conf)),
    confidenceHigh: Math.min(100, Math.round(riskScore + conf)),
  }
})

export const kpiMetrics: KpiMetrics = {
  totalFacilities: 2629,
  activeAlerts: 47,
  resolvedAlerts: 3820,
  averageRiskScore: 52,
  facilitiesChange: 3.2,
  alertsChange: -8.5,
  resolvedChange: 12.4,
  riskChange: -4.1,
}

export const tickerAlerts: string[] = [
  '🔴 Bastar: Heat stress - 3 schools advised to suspend outdoor activities',
  '🟡 Raipur: Air quality moderate - ventilation recommended for classrooms',
  '🟠 Durg: Water stress watch - tank levels monitored across 12 facilities',
  '✅ Korba: Power outage resolved - backup systems deactivated',
  '🔴 Jagdalpur: Critical water level - emergency delivery dispatched',
  '🟡 Bilaspur: Air quality improving - alert level reduced to medium',
]
