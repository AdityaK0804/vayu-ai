'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import districtPaths from '@/data/chhattisgarh-paths.json'
import { useTranslation } from '@/lib/i18n'

interface DistrictData {
  name: string
  facilities: number
  riskScore: number
  alerts: number
}

const districtData: Record<string, DistrictData> = {
  'Raipur':                    { name: 'Raipur',                    facilities: 89,  riskScore: 62, alerts: 14 },
  'Bilaspur':                  { name: 'Bilaspur',                  facilities: 74,  riskScore: 45, alerts: 6  },
  'Durg':                      { name: 'Durg',                      facilities: 68,  riskScore: 38, alerts: 4  },
  'Rajnandgaon':               { name: 'Rajnandgaon',               facilities: 52,  riskScore: 41, alerts: 5  },
  'Surguja':                   { name: 'Surguja',                   facilities: 61,  riskScore: 55, alerts: 9  },
  'Jashpur':                   { name: 'Jashpur',                   facilities: 44,  riskScore: 33, alerts: 2  },
  'Korba':                     { name: 'Korba',                     facilities: 58,  riskScore: 71, alerts: 18 },
  'Koriya':                    { name: 'Koriya',                    facilities: 38,  riskScore: 29, alerts: 1  },
  'Raigarh':                   { name: 'Raigarh',                   facilities: 47,  riskScore: 48, alerts: 7  },
  'Janjgir-Champa':            { name: 'Janjgir-Champa',            facilities: 55,  riskScore: 44, alerts: 5  },
  'Mahasamund':                { name: 'Mahasamund',                facilities: 41,  riskScore: 39, alerts: 3  },
  'Dhamtari':                  { name: 'Dhamtari',                  facilities: 36,  riskScore: 42, alerts: 4  },
  'Uttar Bastar Kanker':       { name: 'Kanker',                    facilities: 39,  riskScore: 58, alerts: 8  },
  'Bastar':                    { name: 'Bastar',                    facilities: 72,  riskScore: 67, alerts: 15 },
  'Dakshin Bastar Dantewada':  { name: 'Dantewada',                 facilities: 28,  riskScore: 78, alerts: 21 },
  'Narayanpur':                { name: 'Narayanpur',                facilities: 19,  riskScore: 63, alerts: 11 },
  'Bijapur':                   { name: 'Bijapur',                   facilities: 22,  riskScore: 81, alerts: 24 },
  'Sukma':                     { name: 'Sukma',                     facilities: 24,  riskScore: 74, alerts: 19 },
  'Kondagaon':                 { name: 'Kondagaon',                 facilities: 31,  riskScore: 61, alerts: 10 },
  'Kabeerdham':                { name: 'Kabirdham',                 facilities: 33,  riskScore: 36, alerts: 2  },
  'Mungeli':                   { name: 'Mungeli',                   facilities: 27,  riskScore: 31, alerts: 1  },
  'Bemetra':                   { name: 'Bemetara',                  facilities: 29,  riskScore: 35, alerts: 2  },
  'Baloda Bazar':              { name: 'Baloda Bazar',              facilities: 34,  riskScore: 43, alerts: 4  },
  'Gariaband':                 { name: 'Gariaband',                 facilities: 26,  riskScore: 40, alerts: 3  },
  'Balod':                     { name: 'Balod',                     facilities: 25,  riskScore: 37, alerts: 2  },
  'Surajpur':                  { name: 'Surajpur',                  facilities: 35,  riskScore: 30, alerts: 1  },
  'Balrampur':                 { name: 'Balrampur',                 facilities: 32,  riskScore: 28, alerts: 1  },
}

function getRiskFill(score: number, isActive: boolean): string {
  if (isActive) return 'rgba(42,157,143,0.75)'
  if (score >= 75) return 'rgba(239,68,68,0.60)'
  if (score >= 60) return 'rgba(231,111,81,0.55)'
  if (score >= 45) return 'rgba(244,162,97,0.50)'
  return 'rgba(141,198,63,0.40)'
}

function getRiskStroke(score: number, isActive: boolean): string {
  if (isActive) return '#2A9D8F'
  if (score >= 75) return 'rgba(239,68,68,0.8)'
  if (score >= 60) return 'rgba(231,111,81,0.7)'
  if (score >= 45) return 'rgba(244,162,97,0.7)'
  return 'rgba(141,198,63,0.6)'
}

function getRiskLabel(score: number) {
  if (score >= 75) return { text: 'CRITICAL', cls: 'text-red-400 bg-red-400/10 border-red-400/30' }
  if (score >= 60) return { text: 'HIGH',     cls: 'text-orange-400 bg-orange-400/10 border-orange-400/30' }
  if (score >= 45) return { text: 'MEDIUM',   cls: 'text-amber-400 bg-amber-400/10 border-amber-400/30' }
  return                  { text: 'LOW',      cls: 'text-teal bg-teal/10 border-teal/30' }
}

const legend = [
  { label: 'LOW',      color: '#8DC63F' },
  { label: 'MEDIUM',   color: '#F4A261' },
  { label: 'HIGH',     color: '#E76F51' },
  { label: 'CRITICAL', color: '#ef4444' },
]

export function CoverageMap() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered]   = useState<string | null>(null)

  const activeKey = hovered ?? selected
  const activeData = activeKey ? districtData[activeKey] : null

  return (
    <section id="coverage" className="bg-dark py-24 px-6">
      <div className="max-w-7xl mx-auto text-center mb-12">
        <p className="text-xs font-mono tracking-widest text-teal mb-3 uppercase">{t('coverage.sectionLabel')}</p>
        <h2 className="text-4xl md:text-5xl font-sora font-bold text-white">
          {t('coverage.heading')}
        </h2>
      </div>

      <motion.div
        className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8 items-start"
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        {/* Map */}
        <div className="lg:col-span-3 relative">
          <svg
            viewBox="0 0 560 640"
            className="w-full h-auto drop-shadow-2xl"
            style={{ overflow: 'visible' }}
          >
            {/* Subtle glow background */}
            <defs>
              <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2A9D8F" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#2A9D8F" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="280" cy="320" rx="260" ry="300" fill="url(#mapGlow)" />

            {(districtPaths as { name: string; d: string; cx: number; cy: number }[]).map((dp) => {
              const data  = districtData[dp.name]
              const score = data?.riskScore ?? 35
              const isActive = dp.name === activeKey
              const fontSize = dp.cx > 400 || dp.name.length > 10 ? 7.5 : 8.5

              return (
                <g
                  key={dp.name}
                  onClick={() => setSelected(selected === dp.name ? null : dp.name)}
                  onMouseEnter={() => setHovered(dp.name)}
                  onMouseLeave={() => setHovered(null)}
                  className="cursor-pointer"
                  style={{ transition: 'all 0.15s ease' }}
                >
                  <path
                    d={dp.d}
                    fill={getRiskFill(score, isActive)}
                    stroke={getRiskStroke(score, isActive)}
                    strokeWidth={isActive ? 1.5 : 0.7}
                    strokeLinejoin="round"
                  />
                  <text
                    x={dp.cx}
                    y={dp.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize}
                    fontFamily="var(--font-sora), sans-serif"
                    fontWeight={isActive ? '600' : '400'}
                    fill={isActive ? '#ffffff' : 'rgba(255,255,255,0.72)'}
                    className="pointer-events-none select-none"
                  >
                    {data?.name ?? dp.name}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Detail card */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 min-h-[200px] flex flex-col justify-center">
            {activeData ? (() => {
              const risk = getRiskLabel(activeData.riskScore)
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-sora font-bold text-white text-lg leading-tight">
                        {activeData.name}
                      </h3>
                      <p className="text-xs text-sage mt-1">{t('coverage.state')}</p>
                    </div>
                    <span className={cn('text-xs font-mono font-bold px-2 py-1 rounded border shrink-0', risk.cls)}>
                      {risk.text}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                    <div className="text-center">
                      <p className="font-mono font-bold text-white text-xl">{activeData.facilities}</p>
                      <p className="text-xs text-sage mt-0.5">{t('coverage.facilities')}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-mono font-bold text-white text-xl">{activeData.riskScore}</p>
                      <p className="text-xs text-sage mt-0.5">{t('coverage.riskScore')}</p>
                    </div>
                    <div className="text-center">
                      <p className={cn('font-mono font-bold text-xl', activeData.alerts > 10 ? 'text-red-400' : activeData.alerts > 5 ? 'text-amber' : 'text-teal')}>
                        {activeData.alerts}
                      </p>
                      <p className="text-xs text-sage mt-0.5">{t('coverage.alerts')}</p>
                    </div>
                  </div>

                  {/* Risk bar */}
                  <div className="mt-1">
                    <div className="flex justify-between text-xs text-sage mb-1.5">
                      <span>{t('coverage.riskLevel')}</span><span>{activeData.riskScore}/100</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${activeData.riskScore}%`,
                          background: activeData.riskScore >= 75 ? '#ef4444'
                            : activeData.riskScore >= 60 ? '#E76F51'
                            : activeData.riskScore >= 45 ? '#F4A261'
                            : '#2A9D8F'
                        }}
                      />
                    </div>
                  </div>

                  {selected && (
                    <button
                      onClick={() => setSelected(null)}
                      className="text-xs text-sage/50 hover:text-sage transition-colors text-left"
                    >
                      {t('coverage.clear')}
                    </button>
                  )}
                </div>
              )
            })() : (
              <div className="text-center py-4">
                <div className="w-10 h-10 rounded-full border border-teal/30 bg-teal/10 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <p className="text-white/70 text-sm font-medium">{t('coverage.selectDistrict')}</p>
                <p className="text-sage/60 text-xs mt-1">{t('coverage.hoverHint')}</p>
              </div>
            )}
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 gap-3">
            {[
                          { label: t('coverage.stat1Label'), value: '1,247', sub: t('coverage.stat1Sub') },
              { label: t('coverage.stat2Label'), value: '27',    sub: t('coverage.stat2Sub') },
              { label: t('coverage.stat3Label'), value: '187',   sub: t('coverage.stat3Sub') },
              { label: t('coverage.stat4Label'), value: '48',    sub: t('coverage.stat4Sub') },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/8 bg-white/4 p-3 text-center">
                <p className="font-mono font-bold text-white text-lg">{s.value}</p>
                <p className="text-xs text-sage">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {legend.map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.color, opacity: 0.85 }} />
                <span className="text-xs text-sage">{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  )
}
