'use client'
import { motion } from 'framer-motion'
import { Monitor, TrendingUp, Bell, BarChart3 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

const features = [
  { icon: Monitor,    title: 'features.monitor.title',  desc: 'features.monitor.desc' },
  { icon: TrendingUp, title: 'features.forecast.title', desc: 'features.forecast.desc' },
  { icon: Bell,       title: 'features.act.title',      desc: 'features.act.desc' },
  { icon: BarChart3,  title: 'features.report.title',   desc: 'features.report.desc' },
]

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
}

export function FeaturesStrip() {
  const { t } = useTranslation()
  return (
    <section id="features" className="bg-dark py-24 px-6">
      <div className="max-w-7xl mx-auto text-center mb-16">
        <p className="text-label text-teal mb-3">{t('features.sectionLabel')}</p>
        <h2 className="text-heading font-sora font-bold text-white">
          {t('features.heading')}
        </h2>
      </div>

      <motion.div
        className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={cardVariants}
            className="glass-card-dark p-6 flex flex-col gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-teal/15 flex items-center justify-center">
              <f.icon className="w-5 h-5 text-teal" />
            </div>
            <h3 className="font-sora font-semibold text-white">{t(f.title)}</h3>
            <p className="text-sm text-sage leading-relaxed">{t(f.desc)}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}
