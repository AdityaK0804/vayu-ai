'use client'
import { motion } from 'framer-motion'
import { X, Check, ArrowRight, Clock, Zap, Shield, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

const beforeItemData = [
  { icon: Clock,         textKey: 'beforeafter.before.item1' },
  { icon: AlertTriangle, textKey: 'beforeafter.before.item2' },
  { icon: X,             textKey: 'beforeafter.before.item3' },
  { icon: X,             textKey: 'beforeafter.before.item4' },
  { icon: X,             textKey: 'beforeafter.before.item5' },
  { icon: X,             textKey: 'beforeafter.before.item6' },
]

const afterItemData = [
  { icon: Zap,    textKey: 'beforeafter.after.item1', highlight: true },
  { icon: Shield, textKey: 'beforeafter.after.item2', highlight: true },
  { icon: Check,  textKey: 'beforeafter.after.item3' },
  { icon: Check,  textKey: 'beforeafter.after.item4' },
  { icon: Check,  textKey: 'beforeafter.after.item5' },
  { icon: Check,  textKey: 'beforeafter.after.item6' },
]

const impactStatsData = [
  { labelKey: 'beforeafter.stat1.label', value: '60x', descKey: 'beforeafter.stat1.desc' },
  { labelKey: 'beforeafter.stat2.label', value: '92%', descKey: 'beforeafter.stat2.desc' },
  { labelKey: 'beforeafter.stat3.label', value: '28x', descKey: 'beforeafter.stat3.desc' },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4 } },
}

export function BeforeAfter() {
  const { t } = useTranslation()
  return (
    <section className="bg-dark py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xs font-mono tracking-widest text-teal mb-3 uppercase">
            {t('beforeafter.sectionLabel')}
          </p>
          <h2 className="text-4xl md:text-5xl font-sora font-bold text-white">
            {t('beforeafter.heading')}{' '}
            <span className="text-teal">{t('beforeafter.headingHighlight')}</span>
          </h2>
          <p className="text-sage mt-4 max-w-2xl mx-auto">
            {t('beforeafter.subtext')}
          </p>
        </motion.div>

        {/* Before / After columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16">
          {/* BEFORE */}
          <motion.div
            className="rounded-2xl p-6 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(14,17,23,0.8) 100%)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Corner badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <X className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h3 className="font-sora font-bold text-white">{t('beforeafter.before.title')}</h3>
                <p className="text-xs text-sage/60">{t('beforeafter.before.subtitle')}</p>
              </div>
            </div>

            <motion.div
              className="flex flex-col gap-3"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {beforeItemData.map((item) => (
                <motion.div
                  key={item.textKey}
                  variants={itemVariants}
                  className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="w-3 h-3 text-red-400/70" />
                  </div>
                  <p className="text-sm text-sage/80">{t(item.textKey)}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Muted overlay to indicate "old" */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
              <svg viewBox="0 0 100 100" fill="none">
                <line x1="0" y1="0" x2="100" y2="100" stroke="#ef4444" strokeWidth="2" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#ef4444" strokeWidth="2" />
              </svg>
            </div>
          </motion.div>

          {/* AFTER */}
          <motion.div
            className="rounded-2xl p-6 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(42,157,143,0.08) 0%, rgba(14,17,23,0.8) 100%)',
              border: '1px solid rgba(42,157,143,0.2)',
            }}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Corner badge */}
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-teal" />
              </div>
              <div>
                <h3 className="font-sora font-bold text-white">{t('beforeafter.after.title')}</h3>
                <p className="text-xs text-sage/60">{t('beforeafter.after.subtitle')}</p>
              </div>
            </div>

            <motion.div
              className="flex flex-col gap-3"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {afterItemData.map((item) => (
                <motion.div
                  key={item.textKey}
                  variants={itemVariants}
                  className={`flex items-start gap-3 py-2 border-b border-white/5 last:border-0 ${
                    item.highlight ? 'bg-teal/5 -mx-2 px-2 rounded-lg' : ''
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-teal/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <item.icon className="w-3 h-3 text-teal" />
                  </div>
                  <p className="text-sm text-white/90">{t(item.textKey)}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Glow corner */}
            <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-teal/5 blur-2xl" />
          </motion.div>
        </div>

        {/* Impact stats */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          {impactStatsData.map((stat) => (
            <div
              key={stat.labelKey}
              className="rounded-xl border border-teal/15 bg-teal/5 p-5 text-center"
            >
              <p className="font-mono font-bold text-3xl text-teal">{stat.value}</p>
              <p className="text-sm font-semibold text-white mt-2">{t(stat.labelKey)}</p>
              <p className="text-xs text-sage/60 mt-1">{t(stat.descKey)}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
