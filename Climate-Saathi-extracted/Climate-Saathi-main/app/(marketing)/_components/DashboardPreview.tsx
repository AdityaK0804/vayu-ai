'use client'
import { useRef } from 'react'
import { useTranslation } from '@/lib/i18n'
import { motion, useScroll, useTransform } from 'framer-motion'
import { MiniMap } from './MiniMap'

export function DashboardPreview() {
  const { t } = useTranslation()
  const sectionRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.92, 1, 1, 0.96])
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0.3])

  return (
    <section
      ref={sectionRef}
      id="dashboard-preview"
      className="relative h-screen bg-forest"
    >
      <div className="sticky top-0 h-screen flex flex-col items-center justify-center px-6">
        {/* Section label + heading */}
        <div className="text-center mb-12 z-10 relative">
          <p className="text-label text-teal mb-3">{t('dashboardPreview.livePlatform')}</p>
          <h2 className="text-heading font-sora font-bold text-white">
  {t('dashboardPreview.title')}
</h2>
        </div>

        {/* Scroll-linked mock dashboard */}
        <motion.div
          style={{ scale, opacity }}
          className="w-full max-w-5xl rounded-2xl border border-teal/20 bg-forest-light/80 backdrop-blur-sm overflow-hidden shadow-glass-lg"
        >
          {/* KPI bar */}
          <div className="h-12 flex border-b border-white/10 bg-dark/50">
            <div className="flex flex-1 items-center justify-center border-r border-white/10 last:border-r-0">
              <span className="text-xs font-mono text-sage">
  {t('dashboardPreview.facilities')}
</span>
              <span className="ml-2 text-xs font-bold text-white">1,243</span>
            </div>
            <div className="flex flex-1 items-center justify-center border-r border-white/10">
              <span className="text-xs font-mono text-sage">
  {t('dashboardPreview.activeAlerts')}
</span>
              <span className="ml-2 text-xs font-bold text-coral">47</span>
            </div>
            <div className="flex flex-1 items-center justify-center border-r border-white/10">
              <span className="text-xs font-mono text-sage">
  {t('dashboardPreview.avgRisk')}
</span>
              <span className="ml-2 text-xs font-bold text-amber">51</span>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <span className="text-xs font-mono text-sage">
  {t('dashboardPreview.resolved')}
</span>
              <span className="ml-2 text-xs font-bold text-leaf">3,820</span>
            </div>
          </div>

          {/* Body */}
          <div className="flex h-72 lg:h-80">
            {/* District sidebar */}
            <div className="w-48 hidden sm:block border-r border-white/10 p-3">
              <p className="text-[10px] text-sage uppercase tracking-wider mb-3">Districts</p>
              <div className="space-y-2">
                {[
                  { name: 'Raipur', risk: 'LOW', color: 'text-leaf' },
                  { name: 'Bastar', risk: 'HIGH', color: 'text-coral' },
                  { name: 'Durg', risk: 'LOW', color: 'text-leaf' },
                  { name: 'Bilaspur', risk: 'MED', color: 'text-amber' },
                  { name: 'Korba', risk: 'MED', color: 'text-amber' },
                  { name: 'Jagdalpur', risk: 'HIGH', color: 'text-coral' },
                ].map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="text-white/70">{d.name}</span>
                    <span className={`font-mono text-[10px] ${d.color}`}>{d.risk}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map center */}
            <div className="flex-1 bg-dark/30 relative overflow-hidden">
              <MiniMap className="absolute inset-0 p-2" />
              {/* Tooltip hint */}
              <div className="absolute top-2 right-2 bg-dark/90 border border-teal/30 rounded-lg px-2 py-1 text-xs text-white z-10">
                <span className="text-teal font-mono">● </span>1,243 facilities
              </div>
            </div>

            {/* Alert panel */}
            <div className="w-64 hidden md:block border-l border-white/10 p-3">
              <p className="text-[10px] text-sage uppercase tracking-wider mb-3">Live Alerts</p>
              <div className="space-y-3">
                <div className="flex flex-col gap-0.5 border-l-2 border-coral pl-2">
                  <p className="text-xs text-white/80">Heat Stress</p>
                  <p className="text-[10px] text-sage">Jagdalpur · CRITICAL</p>
                </div>
                <div className="flex flex-col gap-0.5 border-l-2 border-amber pl-2">
                  <p className="text-xs text-white/80">Air Quality Warning</p>
                  <p className="text-[10px] text-sage">Bastar · HIGH</p>
                </div>
                <div className="flex flex-col gap-0.5 border-l-2 border-amber pl-2">
                  <p className="text-xs text-white/80">Water Stress</p>
                  <p className="text-[10px] text-sage">Bastar · HIGH</p>
                </div>
                <div className="flex flex-col gap-0.5 border-l-2 border-leaf pl-2">
                  <p className="text-xs text-white/80">Power Outage Resolved</p>
                  <p className="text-[10px] text-sage">Korba · RESOLVED</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
