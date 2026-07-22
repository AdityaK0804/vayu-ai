export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type FacilityType = 'SCHOOL' | 'HEALTH_CENTRE'
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
export type AlertChannel = 'SMS' | 'WHATSAPP' | 'EMAIL'

export interface Facility {
  id: string
  name: string
  type: FacilityType
  district: string
  block: string
  latitude: number
  longitude: number
  riskScore: number
  riskLevel: RiskLevel
  sensorStatus: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  lastReading: string
  sensors: Sensor[]
}

export interface Sensor {
  id: string
  type: 'AIR_QUALITY' | 'TEMPERATURE' | 'HUMIDITY' | 'WATER_LEVEL' | 'POWER'
  name: string
  value: number
  unit: string
  status: 'NORMAL' | 'WARNING' | 'CRITICAL'
  lastUpdated: string
}

export interface Alert {
  id: string
  facilityId: string
  facilityName: string
  district: string
  type: string
  severity: RiskLevel
  message: string
  status: AlertStatus
  channels: AlertChannel[]
  createdAt: string
  acknowledgedAt?: string
  resolvedAt?: string
}

export interface RiskForecast {
  date: string
  riskScore: number
  confidenceLow: number
  confidenceHigh: number
}

export interface District {
  id: string
  name: string
  facilitiesCount: number
  schoolsCount: number
  healthCentresCount: number
  averageRiskScore: number
  activeAlerts: number
}

export interface ShapValue {
  feature: string
  value: number
  contribution: number
}

export interface KpiMetrics {
  totalFacilities: number
  activeAlerts: number
  resolvedAlerts: number
  averageRiskScore: number
  facilitiesChange: number
  alertsChange: number
  resolvedChange: number
  riskChange: number
}

export interface Testimonial {
  id: string
  quote: string
  author: string
  role: string
  avatar?: string
}

export interface Partner {
  id: string
  name: string
  logo?: string
}

export interface ClimateDistrictSummary {
  district: string
  division: string
  lat: number
  lon: number
  temperature: number
  rainfall: number
  humidity: number
  ghi: number
}

export interface ClimateMonthly {
  month: string
  temperature: number
  rainfall: number
  humidity: number
  ghi: number
}

export interface ClimateYearly {
  year: number
  temperature: number
  rainfall: number
  humidity: number
  ghi: number
}
