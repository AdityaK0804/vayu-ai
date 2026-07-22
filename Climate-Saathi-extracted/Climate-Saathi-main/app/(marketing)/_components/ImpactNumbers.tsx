'use client'
import React from 'react'
import { motion } from 'framer-motion'
import { useAnimCounter } from '@/app/(marketing)/_hooks/useAnimCounter'
import { useTranslation } from '@/lib/i18n'

const stats = [
  { target: 1247, suffix: '+', labelKey: 'impact.stat1Label' },
  { target: 28,   suffix: '',  labelKey: 'impact.stat2Label' },
  { target: 72,   suffix: '%', labelKey: 'impact.stat3Label' },
  { target: 14,   suffix: '',  labelKey: 'impact.stat4Label' },
]

function StatCounter({
  target,
  suffix,
  label,
}: {
  target: number
  suffix: string
  label: string
}) {
  const { count, ref } = useAnimCounter(target)
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
      }}
      className="text-center"
    >
      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className="font-sora font-bold text-white mb-2"
        style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', lineHeight: 1.1 }}
      >
        {count.toLocaleString()}
        {suffix}
      </div>
      <p className="text-sm text-sage leading-snug">{label}</p>
    </motion.div>
  )
}

export function ImpactNumbers() {
  const { t } = useTranslation()
  return (
    <section id="impact" className="bg-forest py-24 px-6">
      <div className="max-w-7xl mx-auto text-center mb-16">
        <p className="text-label text-teal mb-3">{t('impact.sectionLabel')}</p>
        <h2 className="text-heading font-sora font-bold text-white">
          {t('impact.heading')}
        </h2>
      </div>

      <motion.div
        className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.1 } },
        }}
      >
        {stats.map((stat) => (
          <StatCounter
            key={stat.labelKey}
            target={stat.target}
            suffix={stat.suffix}
            label={t(stat.labelKey)}
          />
        ))}
      </motion.div>
    </section>
  )
}
