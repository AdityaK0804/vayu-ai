'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { ArrowRight, Activity, Droplets, Thermometer, Sun, Wind, Zap } from 'lucide-react'
import { PulseDot } from '@/components/ui-custom/PulseDot'
import { MiniMap } from './MiniMap'
import { useTranslation } from '@/lib/i18n'

/* ── Typed headline effect ───────────────────────────────────── */
// headlines defined inside HeroSection component to support i18n

function useTypedText(strings: string[], typingSpeed = 60, deleteSpeed = 30, pauseMs = 2200) {
  const [text, setText] = useState('')
  const [stringIdx, setStringIdx] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const current = strings[stringIdx]
    let timeout: NodeJS.Timeout

    if (!isDeleting && text === current) {
      timeout = setTimeout(() => setIsDeleting(true), pauseMs)
    } else if (isDeleting && text === '') {
      setIsDeleting(false)
      setStringIdx((prev) => (prev + 1) % strings.length)
    } else {
      const delta = isDeleting ? deleteSpeed : typingSpeed
      timeout = setTimeout(() => {
        setText(isDeleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1))
      }, delta)
    }
    return () => clearTimeout(timeout)
  }, [text, isDeleting, stringIdx, strings, typingSpeed, deleteSpeed, pauseMs])

  return text
}

/* ── Floating orbs ───────────────────────────────────────────── */
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[
        { size: 300, x: '70%', y: '15%', color: 'rgba(42,157,143,0.07)', delay: 0, dur: 20 },
        { size: 200, x: '15%', y: '70%', color: 'rgba(244,162,97,0.06)', delay: 3, dur: 25 },
        { size: 150, x: '80%', y: '75%', color: 'rgba(42,157,143,0.05)', delay: 6, dur: 18 },
        { size: 100, x: '40%', y: '20%', color: 'rgba(168,218,220,0.04)', delay: 2, dur: 22 },
        { size: 250, x: '5%',  y: '30%', color: 'rgba(42,157,143,0.04)', delay: 8, dur: 30 },
      ].map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, 30, -20, 15, 0],
            y: [0, -25, 15, -10, 0],
            scale: [1, 1.1, 0.95, 1.05, 1],
          }}
          transition={{
            duration: orb.dur,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: orb.delay,
          }}
        />
      ))}
    </div>
  )
}

/* ── Simulated live sensor data ──────────────────────────────── */
interface SensorReading {
  icon: typeof Droplets
  label: string
  value: number
  unit: string
  status: 'OK' | 'WARN' | 'CRIT'
  color: string
}

const baseSensors: SensorReading[] = [
  { icon: Droplets,      label: 'Water',  value: 67, unit: '%',   status: 'OK',   color: '#2A9D8F' },
  { icon: Thermometer,   label: 'Temp',   value: 34, unit: '°C',  status: 'WARN', color: '#F4A261' },
  { icon: Sun,           label: 'Solar',  value: 89, unit: '%',   status: 'OK',   color: '#8DC63F' },
  { icon: Wind,          label: 'AQI',    value: 142,unit: '',    status: 'CRIT', color: '#E76F51' },
  { icon: Zap,           label: 'Power',  value: 98, unit: '%',   status: 'OK',   color: '#A8DADC' },
]

function useLiveSensors() {
  const [sensors, setSensors] = useState(baseSensors)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setSensors(prev => prev.map((s, i) => {
        const jitter = Math.floor(Math.random() * 7) - 3
        let newVal = Math.max(0, Math.min(s.label === 'AQI' ? 300 : 100, s.value + jitter))
        // keep values realistic
        if (s.label === 'Temp') newVal = Math.max(28, Math.min(45, s.value + (Math.random() * 2 - 1)))
        if (s.label === 'AQI') newVal = Math.max(50, Math.min(200, s.value + (Math.random() * 10 - 5)))
        const status: SensorReading['status'] =
          s.label === 'Water' ? (newVal < 30 ? 'CRIT' : newVal < 50 ? 'WARN' : 'OK') :
          s.label === 'Temp'  ? (newVal > 40 ? 'CRIT' : newVal > 35 ? 'WARN' : 'OK') :
          s.label === 'AQI'   ? (newVal > 150 ? 'CRIT' : newVal > 100 ? 'WARN' : 'OK') :
          s.label === 'Power' ? (newVal < 20 ? 'CRIT' : newVal < 50 ? 'WARN' : 'OK') :
          'OK'
        return { ...s, value: Math.round(newVal), status }
      }))
      setActiveIdx(prev => (prev + 1) % baseSensors.length)
    }, 1800)
    return () => clearInterval(interval)
  }, [])

  return { sensors, activeIdx }
}

const statusColors = { OK: '#2A9D8F', WARN: '#F4A261', CRIT: '#ef4444' }

/* ── Animated alert feed ─────────────────────────────────────── */
const liveAlerts = [
  { type: 'Heat Stress',    loc: 'Jagdalpur',  severity: 'CRITICAL', color: '#ef4444' },
  { type: 'Water Shortage', loc: 'Bijapur',    severity: 'HIGH',     color: '#E76F51' },
  { type: 'Air Quality',    loc: 'Korba',      severity: 'HIGH',     color: '#F4A261' },
  { type: 'Solar Failure',  loc: 'Sukma',      severity: 'MEDIUM',   color: '#F4A261' },
  { type: 'Power Outage',   loc: 'Dantewada',  severity: 'CRITICAL', color: '#ef4444' },
  { type: 'Turbidity',      loc: 'Narayanpur', severity: 'HIGH',     color: '#E76F51' },
]

/* ── Radar sweep on map ──────────────────────────────────────── */
function RadarSweep() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(42,157,143,0)" />
          <stop offset="100%" stopColor="rgba(42,157,143,0.25)" />
        </linearGradient>
      </defs>
      <motion.g
        style={{ transformOrigin: '50% 50%' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
      >
        <path
          d="M50,50 L50,5 A45,45 0 0,1 85,27 Z"
          fill="url(#sweepGrad)"
        />
      </motion.g>
      {/* Center dot */}
      <circle cx="50" cy="50" r="1.5" fill="#2A9D8F" />
      {/* Rings */}
      {[15, 30, 45].map(r => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(42,157,143,0.08)" strokeWidth="0.3" />
      ))}
    </svg>
  )
}

/* ── Stat counter with spring ────────────────────────────────── */
function AnimStat({ target, suffix, label, delay }: { target: number; suffix: string; label: string; delay: number }) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  useEffect(() => {
    if (!started) return
    let frame: number
    let start = 0
    const step = target / 40
    const animate = () => {
      start = Math.min(start + step, target)
      setCount(Math.floor(start))
      if (start < target) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [started, target])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.5 }}
    >
      <p className="font-mono font-bold text-2xl text-white">
        {count.toLocaleString()}{suffix}
      </p>
      <p className="text-xs text-sage">{label}</p>
    </motion.div>
  )
}

/* ══════════════════════════════════════════════════════════════ */
/*  HERO SECTION                                                 */
/* ══════════════════════════════════════════════════════════════ */
export function HeroSection() {
  const { t } = useTranslation()
  const headlines = [
    t('hero.headline1'),
    t('hero.headline2'),
    t('hero.headline3'),
    t('hero.headline4'),
  ]
  const cardRef = useRef<HTMLDivElement>(null)
  const typedText = useTypedText(headlines)
  const { sensors, activeIdx } = useLiveSensors()
  const [alertIdx, setAlertIdx] = useState(0)

  // 3D tilt on mouse
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [8, -8]), { stiffness: 150, damping: 20 })
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-8, 8]), { stiffness: 150, damping: 20 })

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    mouseX.set(e.clientX - rect.left - rect.width / 2)
    mouseY.set(e.clientY - rect.top - rect.height / 2)
  }, [mouseX, mouseY])

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0)
    mouseY.set(0)
  }, [mouseX, mouseY])

  // Cycle alerts
  useEffect(() => {
    const timer = setInterval(() => setAlertIdx(p => (p + 1) % liveAlerts.length), 3000)
    return () => clearInterval(timer)
  }, [])

  const visibleAlerts = [
    liveAlerts[alertIdx % liveAlerts.length],
    liveAlerts[(alertIdx + 1) % liveAlerts.length],
    liveAlerts[(alertIdx + 2) % liveAlerts.length],
  ]

  return (
    <section
      id="hero"
      className="relative min-h-screen overflow-hidden bg-forest pt-16"
    >
      {/* ── Background layers ──────────────────────────────────── */}
      <div className="absolute inset-0 bg-forest -z-10" />

      {/* Gradient glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 70% 20%, rgba(42,157,143,0.14) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 10% 80%, rgba(244,162,97,0.08) 0%, transparent 50%)',
        }}
      />

      {/* Animated grid */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.04 }}
        transition={{ duration: 2 }}
        style={{
          backgroundImage:
            'linear-gradient(rgba(42,157,143,1) 1px, transparent 1px), linear-gradient(90deg, rgba(42,157,143,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Floating orbs */}
      <FloatingOrbs />

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center min-h-[calc(100vh-4rem)]">

        {/* ── LEFT: Copy ─────────────────────────────────────── */}
        <div>
          {/* Live badge */}
          <motion.div
            className="flex items-center gap-2 mb-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <PulseDot color="teal" size="sm" />
            <span className="text-teal uppercase tracking-widest text-xs font-mono font-semibold">
              {t('hero.liveBadge')}
            </span>
          </motion.div>

          {/* Headline with typed effect */}
          <motion.h1
            className="text-display font-sora font-bold text-white mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7 }}
          >
            {t('hero.headlinePrefix')}{' '}
            <br className="hidden md:block" />
            <span className="text-teal">
              {typedText}
              <motion.span
                className="inline-block w-[3px] h-[1em] bg-teal ml-0.5 align-middle"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
            </span>
          </motion.h1>

          {/* Sub-text */}
          <motion.p
            className="text-body text-sage mb-8 max-w-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            {t('hero.subtext')}
          </motion.p>

          {/* CTA row */}
          <motion.div
            className="flex flex-wrap gap-4 mb-10"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <Link href="/dashboard" className="btn-primary inline-flex items-center gap-2 group">
              {t('hero.cta1')}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a href="#how-it-works" className="btn-secondary inline-flex items-center gap-2">
              {t('hero.cta2')}
            </a>
          </motion.div>

          {/* Animated stats */}
          <motion.div
            className="flex flex-wrap gap-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <AnimStat target={1247} suffix="+" label={t('hero.stat1Label')} delay={1200} />
            <AnimStat target={28} suffix="" label={t('hero.stat2Label')} delay={1400} />
            <AnimStat target={14} suffix="-day" label={t('hero.stat3Label')} delay={1600} />
            <AnimStat target={92} suffix="%" label={t('hero.stat4Label')} delay={1800} />
          </motion.div>
        </div>

        {/* ── RIGHT: 3D Dashboard card ───────────────────────── */}
        <div className="hidden lg:block" style={{ perspective: '1200px' }}>
          <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-teal/25 bg-dark/80 backdrop-blur-xl overflow-hidden shadow-glass-lg"
          >
            {/* ── Top bar ──────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-forest/60">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-teal opacity-60" />
                  <span className="relative h-2 w-2 rounded-full bg-teal" />
                </span>
                <span className="text-[11px] font-mono text-teal tracking-wider">CLIMATE SAATHI · LIVE</span>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-coral/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-leaf/60" />
              </div>
            </div>

            {/* ── Sensor strip ─────────────────────────────── */}
            <div className="flex border-b border-white/8 bg-dark/40">
              {sensors.map((s, i) => (
                <motion.div
                  key={s.label}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 border-r border-white/5 last:border-r-0"
                  animate={i === activeIdx ? {
                    backgroundColor: ['rgba(42,157,143,0)', 'rgba(42,157,143,0.08)', 'rgba(42,157,143,0)'],
                  } : {}}
                  transition={{ duration: 1 }}
                >
                  <s.icon className="w-3 h-3" style={{ color: statusColors[s.status] }} />
                  <span className="text-[10px] font-mono text-sage/70">{s.label}</span>
                  <motion.span
                    key={s.value}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] font-mono font-bold"
                    style={{ color: statusColors[s.status] }}
                  >
                    {s.value}{s.unit}
                  </motion.span>
                </motion.div>
              ))}
            </div>

            {/* ── Body: 3 panels ───────────────────────────── */}
            <div className="flex h-[280px]">
              {/* District list + risk scores */}
              <div className="w-[30%] border-r border-white/8 p-3 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] text-sage uppercase tracking-wider">Districts</p>
                  <Activity className="w-3 h-3 text-teal/50" />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  {[
                    { name: 'Raipur',    score: 38, level: 'LOW' },
                    { name: 'Bastar',    score: 67, level: 'HIGH' },
                    { name: 'Bijapur',   score: 81, level: 'CRIT' },
                    { name: 'Durg',      score: 35, level: 'LOW' },
                    { name: 'Korba',     score: 71, level: 'HIGH' },
                    { name: 'Bilaspur',  score: 45, level: 'MED' },
                    { name: 'Sukma',     score: 74, level: 'HIGH' },
                  ].map((d) => {
                    const c = d.score >= 75 ? '#ef4444' : d.score >= 60 ? '#E76F51' : d.score >= 45 ? '#F4A261' : '#2A9D8F'
                    return (
                      <div key={d.name} className="flex items-center gap-2 group/d">
                        <span className="text-[10px] text-white/60 flex-1 truncate group-hover/d:text-white/90 transition-colors">
                          {d.name}
                        </span>
                        {/* Mini risk bar */}
                        <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${d.score}%`, backgroundColor: c }} />
                        </div>
                        <span className="text-[8px] font-mono font-bold w-7 text-right" style={{ color: c }}>
                          {d.level}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Map with radar sweep */}
              <div className="flex-1 bg-dark/20 relative overflow-hidden">
                <MiniMap className="absolute inset-0 p-1" />
                <RadarSweep />

                {/* Blinking facility dots */}
                {[
                  { x: '45%', y: '35%', color: '#ef4444' },
                  { x: '55%', y: '55%', color: '#F4A261' },
                  { x: '38%', y: '60%', color: '#2A9D8F' },
                  { x: '60%', y: '30%', color: '#E76F51' },
                ].map((dot, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full"
                    style={{ left: dot.x, top: dot.y, backgroundColor: dot.color }}
                    animate={{
                      scale: [1, 1.8, 1],
                      opacity: [0.8, 0.3, 0.8],
                    }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                  />
                ))}

                {/* Hover tooltip */}
                <motion.div
                  className="absolute top-2 right-2 bg-dark/95 border border-teal/30 rounded-lg px-2.5 py-1.5 z-10 backdrop-blur-sm"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <span className="text-[10px] font-mono text-teal">● </span>
                  <span className="text-[10px] text-white">1,247 facilities live</span>
                </motion.div>
              </div>

              {/* Alert feed with cycling */}
              <div className="w-[30%] border-l border-white/8 p-3 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] text-sage uppercase tracking-wider">Live Alerts</p>
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-coral"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  <AnimatePresence mode="popLayout">
                    {visibleAlerts.map((alert, i) => (
                      <motion.div
                        key={`${alert.type}-${alert.loc}-${alertIdx + i}`}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.3, delay: i * 0.08 }}
                        className="flex flex-col gap-0.5 border-l-2 pl-2 py-1"
                        style={{ borderColor: alert.color }}
                      >
                        <p className="text-[10px] text-white/80 leading-tight">{alert.type}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[9px] text-sage">{alert.loc}</p>
                          <span
                            className="text-[8px] font-mono font-bold px-1 rounded"
                            style={{ color: alert.color, backgroundColor: `${alert.color}15` }}
                          >
                            {alert.severity}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Mini risk donut */}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                  <svg viewBox="0 0 36 36" className="w-8 h-8">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                    <motion.circle
                      cx="18" cy="18" r="14" fill="none" stroke="#2A9D8F" strokeWidth="4"
                      strokeDasharray="88"
                      initial={{ strokeDashoffset: 88 }}
                      animate={{ strokeDashoffset: 88 * 0.25 }}
                      transition={{ delay: 1.5, duration: 1.2 }}
                      strokeLinecap="round"
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <div>
                    <p className="text-[10px] font-mono font-bold text-white">75%</p>
                    <p className="text-[8px] text-sage">resolved</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bottom status bar ────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-white/8 bg-forest/40">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal" />
                  <span className="text-[9px] text-sage font-mono">SENSORS: 8,431</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                  <span className="text-[9px] text-sage font-mono">ALERTS: 47</span>
                </div>
              </div>
              <motion.span
                className="text-[9px] text-sage/50 font-mono"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                UPDATED 2s AGO
              </motion.span>
            </div>
          </motion.div>

          {/* Reflection/glow under card */}
          <div className="h-16 w-[80%] mx-auto -mt-1 rounded-b-full bg-teal/5 blur-2xl" />
        </div>
      </div>

      {/* ── Bottom fade ────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-forest to-transparent pointer-events-none" />
    </section>
  )
}
