'use client'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'

interface TechNode {
  label: string
  sub: string
  icon: string
  color: string
  glow: string
  row: number
  col: number
}

const nodes: TechNode[] = [
  // Row 0 — Data Sources
  { label: 'IoT Sensors', sub: 'Water · Solar · Temp', icon: '📡', color: '#2A9D8F', glow: 'rgba(42,157,143,0.12)', row: 0, col: 0 },
  { label: 'NASA POWER', sub: 'Satellite feeds', icon: '🛰️', color: '#A8DADC', glow: 'rgba(168,218,220,0.12)', row: 0, col: 1 },
  { label: 'IMD Weather', sub: 'Forecasts + alerts', icon: '🌦️', color: '#F4A261', glow: 'rgba(244,162,97,0.12)', row: 0, col: 2 },
  { label: 'CGWB Ground', sub: 'Water table data', icon: '💧', color: '#2A9D8F', glow: 'rgba(42,157,143,0.12)', row: 0, col: 3 },
  // Row 1 — Processing
  { label: 'Supabase', sub: 'Realtime DB + Auth', icon: '⚡', color: '#3ECF8E', glow: 'rgba(62,207,142,0.12)', row: 1, col: 0.5 },
  { label: 'tRPC API', sub: 'Type-safe endpoints', icon: '🔗', color: '#2596BE', glow: 'rgba(37,150,190,0.12)', row: 1, col: 1.5 },
  { label: 'LightGBM', sub: 'Risk scoring model', icon: '🧠', color: '#F4A261', glow: 'rgba(244,162,97,0.12)', row: 1, col: 2.5 },
  { label: 'LSTM Network', sub: '14-day forecasting', icon: '📈', color: '#E76F51', glow: 'rgba(231,111,81,0.12)', row: 1, col: 3.5 },
  // Row 2 — Frontend + Output
  { label: 'Next.js 14', sub: 'App Router + SSR', icon: '▲', color: '#ffffff', glow: 'rgba(255,255,255,0.08)', row: 2, col: 0 },
  { label: 'Mapbox GL', sub: 'Choropleth maps', icon: '🗺️', color: '#4264FB', glow: 'rgba(66,100,251,0.12)', row: 2, col: 1 },
  { label: 'SHAP', sub: 'Explainable AI', icon: '🔍', color: '#A8DADC', glow: 'rgba(168,218,220,0.12)', row: 2, col: 2 },
  { label: 'Multi-Channel', sub: 'SMS · WhatsApp · IVR', icon: '🔔', color: '#F4A261', glow: 'rgba(244,162,97,0.12)', row: 2, col: 3 },
]

const nodeSubKeys: Record<string, string> = {
  'IoT Sensors':    'tech.node.iot.sub',
  'NASA POWER':     'tech.node.nasa.sub',
  'IMD Weather':    'tech.node.imd.sub',
  'CGWB Ground':    'tech.node.cgwb.sub',
  'Supabase':       'tech.node.supabase.sub',
  'tRPC API':       'tech.node.trpc.sub',
  'LightGBM':       'tech.node.lightgbm.sub',
  'LSTM Network':   'tech.node.lstm.sub',
  'Next.js 14':     'tech.node.nextjs.sub',
  'Mapbox GL':      'tech.node.mapbox.sub',
  'SHAP':           'tech.node.shap.sub',
  'Multi-Channel':  'tech.node.multichannel.sub',
}

const connections = [
  // Data sources → Processing
  { from: [0, 0], to: [1, 0.5] },
  { from: [0, 1], to: [1, 0.5] },
  { from: [0, 1], to: [1, 1.5] },
  { from: [0, 2], to: [1, 2.5] },
  { from: [0, 3], to: [1, 2.5] },
  { from: [0, 2], to: [1, 1.5] },
  // Processing → Output
  { from: [1, 0.5], to: [2, 0] },
  { from: [1, 1.5], to: [2, 0] },
  { from: [1, 1.5], to: [2, 1] },
  { from: [1, 2.5], to: [2, 2] },
  { from: [1, 2.5], to: [2, 3] },
  { from: [1, 3.5], to: [2, 2] },
  { from: [1, 3.5], to: [2, 3] },
]

const rowLabelKeys = ['tech.row0', 'tech.row1', 'tech.row2']

export function TechArchitecture() {
  const { t } = useTranslation()
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
            {t('tech.sectionLabel')}
          </p>
          <h2 className="text-4xl md:text-5xl font-sora font-bold text-white">
            {t('tech.heading')}{' '}
            <span className="text-teal">{t('tech.headingHighlight')}</span>
          </h2>
          <p className="text-sage mt-4 max-w-2xl mx-auto">
            {t('tech.subtext')}
          </p>
        </motion.div>

        {/* Architecture diagram */}
        <motion.div
          className="relative"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          {[0, 1, 2].map((row) => {
            const rowNodes = nodes.filter((n) => n.row === row)
            return (
              <div key={row} className="mb-8 last:mb-0">
                {/* Row label */}
                <motion.div
                  className="flex items-center gap-3 mb-4"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: row * 0.15 }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-teal/60" />
                  <span className="text-xs font-mono text-sage/50 uppercase tracking-wider">
                    {t(rowLabelKeys[row])}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </motion.div>

                {/* Nodes */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {rowNodes.map((node, i) => (
                    <motion.div
                      key={node.label}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: row * 0.15 + i * 0.08, duration: 0.5 }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      className="group cursor-default"
                    >
                      <div
                        className="rounded-xl p-4 flex items-center gap-3 transition-all duration-200"
                        style={{
                          background: `linear-gradient(135deg, ${node.glow} 0%, rgba(14,17,23,0.6) 100%)`,
                          border: `1px solid ${node.color}20`,
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={{
                            background: node.glow,
                            border: `1px solid ${node.color}30`,
                          }}
                        >
                          {node.icon}
                        </div>

                        {/* Text */}
                        <div className="min-w-0">
                          <h4 className="font-sora font-semibold text-white text-sm truncate">
                            {node.label}
                          </h4>
                          <p className="text-[11px] text-sage/60 truncate">{t(nodeSubKeys[node.label] ?? node.label)}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Flow arrows between rows */}
                {row < 2 && (
                  <div className="hidden lg:flex items-center justify-center my-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-px bg-gradient-to-r from-transparent via-teal/30 to-transparent" />
                      <motion.svg
                        width="16" height="16" viewBox="0 0 16 16" fill="none"
                        animate={{ y: [0, 3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      >
                        <path d="M4 6l4 4 4-4" stroke="#2A9D8F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </motion.svg>
                      <div className="w-20 h-px bg-gradient-to-r from-transparent via-teal/30 to-transparent" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Tech badges strip */}
          <motion.div
            className="mt-12 flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6 }}
          >
            {[
              'Next.js 14', 'TypeScript', 'Tailwind CSS', 'tRPC', 'Prisma',
              'Supabase', 'LightGBM', 'LSTM', 'Mapbox GL', 'SHAP',
              'Framer Motion', 'Zustand', 'NextAuth', 'TimescaleDB',
            ].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1.5 rounded-full text-xs font-mono text-sage/70 border border-white/8 bg-white/3 hover:border-teal/30 hover:text-teal transition-colors"
              >
                {tech}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
