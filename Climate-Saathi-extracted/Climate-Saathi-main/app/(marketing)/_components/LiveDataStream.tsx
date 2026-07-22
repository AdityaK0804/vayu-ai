'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'

interface Particle {
  id: number
  x: number
  y: number
  stage: number // 0=sensor, 1=ingestion, 2=ai, 3=alert
  type: string
  color: string
}

const sensorTypes = [
  { type: 'Water Level', color: '#2A9D8F', emoji: '💧' },
  { type: 'Temperature', color: '#F4A261', emoji: '🌡️' },
  { type: 'Solar Output', color: '#A8DADC', emoji: '☀️' },
  { type: 'Air Quality', color: '#E76F51', emoji: '💨' },
  { type: 'Humidity', color: '#8DC63F', emoji: '🌿' },
]

const stageIcons = ['📡', '⚙️', '🧠', '🔔']
const stageXs = [8, 33, 58, 83]

function DataPulse({ delay, color }: { delay: number; color: string }) {
  return (
    <motion.div
      className="absolute w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: color }}
      initial={{ x: '0%', opacity: 0, scale: 0 }}
      animate={{
        x: ['0%', '100%'],
        opacity: [0, 1, 1, 1, 0],
        scale: [0, 1, 1, 1, 0.5],
      }}
      transition={{
        duration: 3,
        delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  )
}

export function LiveDataStream() {
  const { t } = useTranslation()
  const stages = [
    { label: t('live.stage1.label'), sub: t('live.stage1.sub'), icon: stageIcons[0], x: stageXs[0] },
    { label: t('live.stage2.label'), sub: t('live.stage2.sub'), icon: stageIcons[1], x: stageXs[1] },
    { label: t('live.stage3.label'), sub: t('live.stage3.sub'), icon: stageIcons[2], x: stageXs[2] },
    { label: t('live.stage4.label'), sub: t('live.stage4.sub'), icon: stageIcons[3], x: stageXs[3] },
  ]
  const [activeReading, setActiveReading] = useState(0)
  const [processedCount, setProcessedCount] = useState(8423)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveReading((prev) => (prev + 1) % sensorTypes.length)
      setProcessedCount((prev) => prev + Math.floor(Math.random() * 3) + 1)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="bg-forest py-24 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xs font-mono tracking-widest text-teal mb-3 uppercase">
            {t('live.sectionLabel')}
          </p>
          <h2 className="text-4xl md:text-5xl font-sora font-bold text-white">
            {t('live.heading')}{' '}
            <span className="text-teal">{t('live.headingHighlight')}</span>
          </h2>
          <p className="text-sage mt-4 max-w-2xl mx-auto">
            {t('live.subtext')}
          </p>
        </motion.div>

        {/* Pipeline visualization */}
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          {/* Connection line — desktop, centered on node circles */}
          <div className="hidden lg:block absolute top-[36px] left-[calc(12.5%+36px)] right-[calc(12.5%+36px)] h-px">
            <div className="w-full h-full bg-gradient-to-r from-teal/0 via-teal/60 to-teal/0" />
          </div>

          {/* Stage nodes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stages.map((stage, i) => (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                className="relative flex flex-col items-center"
              >
                {/* Node circle */}
                <div className="relative mb-5">
                  <motion.div
                    className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-2xl relative z-10"
                    style={{
                      background: 'linear-gradient(135deg, rgba(42,157,143,0.15) 0%, rgba(14,17,23,0.8) 100%)',
                      border: '1px solid rgba(42,157,143,0.3)',
                    }}
                    whileHover={{ scale: 1.08, borderColor: 'rgba(42,157,143,0.6)' }}
                  >
                    {stage.icon}
                    {/* Pulse ring */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl border border-teal/30"
                      animate={{ scale: [1, 1.3, 1.3], opacity: [0.6, 0, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                    />
                  </motion.div>
                </div>

                {/* Card body */}
                <div
                  className="w-full rounded-xl p-5 text-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(42,157,143,0.06) 0%, rgba(14,17,23,0.6) 100%)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <h3 className="font-sora font-semibold text-white text-sm mb-1">{stage.label}</h3>
                  <p className="text-xs text-sage/70">{stage.sub}</p>
                </div>

                {/* Arrow between stages — desktop */}
                {i < 3 && (
                  <div className="hidden lg:flex absolute left-full top-[36px] -translate-y-1/2 w-6 z-20 items-center justify-end">
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none">
                      <path d="M1 1l6 5-6 5" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Live reading ticker */}
          <motion.div
            className="mt-12 rounded-xl border border-teal/20 bg-dark/60 backdrop-blur-sm p-4 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-teal opacity-40" />
                  <span className="relative h-2 w-2 rounded-full bg-teal" />
                </span>
                <span className="text-xs font-mono text-teal uppercase">{t('live.liveFeed')}</span>
              </div>
              <span className="text-xs font-mono text-sage">
                {processedCount.toLocaleString()} {t('live.readingsProcessed')}
              </span>
            </div>

            {/* Animated reading cards */}
            <div className="grid grid-cols-5 gap-2">
              {sensorTypes.map((sensor, i) => (
                <motion.div
                  key={sensor.type}
                  className="rounded-lg p-2 text-center transition-all duration-300"
                  style={{
                    background: i === activeReading
                      ? `linear-gradient(135deg, ${sensor.color}15 0%, ${sensor.color}05 100%)`
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${i === activeReading ? sensor.color + '40' : 'rgba(255,255,255,0.05)'}`,
                  }}
                  animate={i === activeReading ? { scale: [1, 1.02, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <span className="text-lg">{sensor.emoji}</span>
                  <p className="text-[9px] text-sage mt-1 truncate">{sensor.type}</p>
                  <motion.p
                    className="text-[10px] font-mono font-bold mt-0.5"
                    style={{ color: sensor.color }}
                    animate={i === activeReading ? { opacity: [0.5, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {i === activeReading ? '●' : '○'}
                  </motion.p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
