'use client'
import { motion } from 'framer-motion'
import { TrendingUp, Activity, Zap } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

const facilityPulseData = [
  { name: 'Govt. School Jagdalpur', sensorKey: 'ai.sensor.waterLevel', value: 22,  unit: '%',   risk: 'CRITICAL' as const },
  { name: 'PHC Bastar',             sensorKey: 'ai.sensor.temperature', value: 38,  unit: '°C',  risk: 'HIGH'     as const },
  { name: 'H.S. School Korba',      sensorKey: 'ai.sensor.aqi',         value: 125, unit: 'AQI', risk: 'MEDIUM'   as const },
  { name: 'CHC Bilaspur',           sensorKey: 'ai.sensor.power',       value: 0,   unit: 'OFF', risk: 'MEDIUM'   as const },
  { name: 'Govt. School Raipur',    sensorKey: 'ai.sensor.aqi',         value: 85,  unit: 'AQI', risk: 'LOW'      as const },
]

const featureImportanceData = [
  { nameKey: 'ai.feature.waterLevel',   weight: 0.82, direction: 'risk'       as const },
  { nameKey: 'ai.feature.heatIndex',    weight: 0.74, direction: 'risk'       as const },
  { nameKey: 'ai.feature.aqi',          weight: 0.61, direction: 'risk'       as const },
  { nameKey: 'ai.feature.solarOutput',  weight: 0.45, direction: 'protective' as const },
  { nameKey: 'ai.feature.tankCapacity', weight: 0.38, direction: 'protective' as const },
  { nameKey: 'ai.feature.lastRain',     weight: 0.29, direction: 'protective' as const },
]

const riskDistribution = [
  { label: 'LOW',      pct: 45, color: '#2A9D8F' },
  { label: 'MEDIUM',   pct: 30, color: '#F4A261' },
  { label: 'HIGH',     pct: 18, color: '#E76F51' },
  { label: 'CRITICAL', pct: 7,  color: '#ef4444' },
]

// SVG donut: r=55, circumference = 2 * π * 55 ≈ 345.4
// Segment dasharray = (pct/100) * 345.4
// Segment dashoffset = -sum(prev pct) * 345.4 / 100
const CIRC = 345.4

export function AIIntelligenceSection() {
  const { t } = useTranslation()
  const riskTextClass: Record<string, string> = {
    CRITICAL: 'text-red-400',
    HIGH:     'text-amber',
    MEDIUM:   'text-amber',
    LOW:      'text-leaf',
  }
  return (
    <section id="ai-intelligence" className="bg-dark py-24 px-6">
      {/* Heading */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <p className="text-label text-teal mb-3">{t('ai.sectionLabel')}</p>
        <h2 className="text-heading font-sora font-bold text-white">
          {t('ai.heading')}
        </h2>
        <p className="text-body text-sage mt-4 max-w-2xl mx-auto">
          {t('ai.subtext')}
        </p>
      </div>

      {/* 3-panel layout */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Panel 1: Live Facility Heartbeats */}
        <div className="glass-card-dark p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-teal" />
            <span className="text-sm font-sora font-semibold text-white">{t('ai.panel1.title')}</span>
          </div>

          <div className="flex flex-col divide-y divide-white/10">
            {facilityPulseData.map((facility, index) => (
              <div
                key={facility.name}
                className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
              >
                <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-3">
                  <span className="text-xs text-white/80 truncate">{facility.name}</span>
                  <span className="text-xs text-sage">{t(facility.sensorKey)}</span>
                </div>
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
                  className={`font-mono text-xs font-bold ${riskTextClass[facility.risk]}`}
                >
                  {facility.value} {facility.unit}
                </motion.span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: State Risk Distribution */}
        <div className="glass-card-dark p-6 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-4 h-4 text-amber" />
            <span className="text-sm font-sora font-semibold text-white">{t('ai.panel2.title')}</span>
          </div>

          {/* Donut chart */}
          <div className="relative flex items-center justify-center mb-6">
            <motion.svg
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
              viewBox="0 0 140 140"
              className="w-40 h-40"
            >
              {/* Background track */}
              <circle
                cx="70" cy="70" r="55"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="16"
              />
              {/* LOW — 45% */}
              <circle
                cx="70" cy="70" r="55"
                fill="none"
                stroke="#2A9D8F"
                strokeWidth="16"
                strokeDasharray={`${(45 / 100) * CIRC} ${CIRC - (45 / 100) * CIRC}`}
                strokeDashoffset="0"
                strokeLinecap="round"
              />
              {/* MEDIUM — 30%, offset by -45% */}
              <circle
                cx="70" cy="70" r="55"
                fill="none"
                stroke="#F4A261"
                strokeWidth="16"
                strokeDasharray={`${(30 / 100) * CIRC} ${CIRC - (30 / 100) * CIRC}`}
                strokeDashoffset={`${-(45 / 100) * CIRC}`}
                strokeLinecap="round"
              />
              {/* HIGH — 18%, offset by -(45+30)% */}
              <circle
                cx="70" cy="70" r="55"
                fill="none"
                stroke="#E76F51"
                strokeWidth="16"
                strokeDasharray={`${(18 / 100) * CIRC} ${CIRC - (18 / 100) * CIRC}`}
                strokeDashoffset={`${-(75 / 100) * CIRC}`}
                strokeLinecap="round"
              />
              {/* CRITICAL — 7%, offset by -(45+30+18)% */}
              <circle
                cx="70" cy="70" r="55"
                fill="none"
                stroke="#ef4444"
                strokeWidth="16"
                strokeDasharray={`${(7 / 100) * CIRC} ${CIRC - (7 / 100) * CIRC}`}
                strokeDashoffset={`${-(93 / 100) * CIRC}`}
                strokeLinecap="round"
              />
            </motion.svg>
            {/* Center label — static, not rotating */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-mono font-bold text-white text-xl">1,247</span>
              <span className="text-xs text-sage">{t('ai.panel2.facilities')}</span>
            </div>
          </div>

          {/* Legend */}
          <div className="w-full flex flex-col gap-2">
            {riskDistribution.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sage">{item.label}</span>
                </div>
                <span className="font-mono text-white/70">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 3: AI Feature Importance */}
        <div className="glass-card-dark p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-teal" />
            <span className="text-sm font-sora font-semibold text-white">{t('ai.panel3.title')}</span>
            <span className="text-xs text-sage ml-auto">{t('ai.panel3.shap')}</span>
          </div>

          <div className="flex flex-col gap-3">
            {featureImportanceData.map((feature, index) => (
              <div key={feature.nameKey} className="flex items-center">
                <span className="text-xs text-sage w-28 flex-shrink-0">{t(feature.nameKey)}</span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden mx-3">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: feature.direction === 'risk' ? '#F4A261' : '#2A9D8F',
                    }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${feature.weight * 100}%` }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.8,
                      delay: index * 0.1,
                      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-sage w-8 text-right">
                  {Math.round(feature.weight * 100)}%
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-sage/60 mt-4">
            {t('ai.panel3.note')}
          </p>
        </div>

      </div>
    </section>
  )
}
