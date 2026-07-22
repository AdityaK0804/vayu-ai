'use client'
import { motion } from 'framer-motion'
import { useTranslation } from '@/lib/i18n'

const steps = [
  {
    num: '01',
    emoji: '📡',
    title: 'howItWorks.step1.title',
    desc:  'howItWorks.step1.desc',
    tag:   'howItWorks.step1.tag',
    color: '#2A9D8F',
    glow:  'rgba(42,157,143,0.15)',
    border:'rgba(42,157,143,0.25)',
  },
  {
    num: '02',
    emoji: '🧠',
    title: 'howItWorks.step2.title',
    desc:  'howItWorks.step2.desc',
    tag:   'howItWorks.step2.tag',
    color: '#F4A261',
    glow:  'rgba(244,162,97,0.15)',
    border:'rgba(244,162,97,0.25)',
  },
  {
    num: '03',
    emoji: '🔔',
    title: 'howItWorks.step3.title',
    desc:  'howItWorks.step3.desc',
    tag:   'howItWorks.step3.tag',
    color: '#A8DADC',
    glow:  'rgba(168,218,220,0.12)',
    border:'rgba(168,218,220,0.22)',
  },
]

export function HowItWorks() {
  const { t } = useTranslation()
  return (
    <section id="how-it-works" className="bg-forest py-28 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <motion.p
            className="text-xs font-mono tracking-widest text-teal mb-4 uppercase"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            {t('howItWorks.sectionLabel')}
          </motion.p>
          <motion.h2
            className="text-4xl md:text-5xl font-sora font-bold text-white"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {t('howItWorks.heading')}{' '}
            <span className="text-teal">{t('howItWorks.headingHighlight')}</span>
          </motion.h2>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Desktop connector line */}
          <div className="hidden lg:block absolute top-1/2 -translate-y-px left-[calc(16.67%+32px)] right-[calc(16.67%+32px)] h-px">
            <div className="w-full h-full bg-gradient-to-r from-teal/0 via-teal/70 to-teal/0" />
          </div>

          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.18 } } }}
          >
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                variants={{
                  hidden:   { opacity: 0, y: 40 },
                  visible:  { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } },
                }}
                className="relative flex flex-col"
              >
                {/* Animated data-flow connector — desktop only */}
                {i < 2 && (
                  <div className="hidden lg:flex absolute left-full top-1/2 -translate-y-1/2 w-8 z-10 flex-row items-center">
                    {/* Line */}
                    <div className="relative flex-1 h-3 flex items-center">
                      <div
                        className="absolute inset-x-0 top-1/2 -translate-y-px h-px"
                        style={{ background: `linear-gradient(90deg, ${step.color}60, ${step.color})` }}
                      />
                    </div>
                    {/* Arrowhead at far end */}
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="none" className="shrink-0">
                      <path d="M1 1l6 5-6 5" stroke={step.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}

                {/* Card */}
                <motion.div
                  className="flex-1 rounded-2xl p-6 flex flex-col gap-5 relative overflow-hidden group transition-transform duration-300 hover:-translate-y-1"
                  style={{
                    background: `linear-gradient(135deg, ${step.glow} 0%, rgba(14,17,23,0.6) 100%)`,
                    border: `1px solid ${step.border}`,
                    backdropFilter: 'blur(12px)',
                  }}
                  animate={{
                    boxShadow: [
                      `0 0 0px ${step.color}00`,
                      `0 0 28px ${step.color}40`,
                      `0 0 0px ${step.color}00`,
                    ],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 1,
                  }}
                >
                  {/* Large faint background number */}
                  <span
                    className="absolute -top-4 -right-2 font-sora font-black leading-none select-none pointer-events-none"
                    style={{
                      fontSize: '120px',
                      color: step.color,
                      opacity: 0.10,
                    }}
                  >
                    {step.num}
                  </span>

                  {/* Top row: tag only */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold tracking-widest" style={{ color: step.color }}>
                      STEP {step.num}
                    </span>
                    <span className="text-xs text-sage/60 font-mono">{t(step.tag)}</span>
                  </div>

                  {/* Icon */}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                    style={{ background: step.glow, border: `1px solid ${step.border}` }}
                  >
                    {step.emoji}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col gap-2">
                    <h3 className="font-sora font-bold text-white text-lg">{t(step.title)}</h3>
                    <p className="text-sm text-sage/80 leading-relaxed">{t(step.desc)}</p>
                  </div>

                  {/* Bottom accent line */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }}
                  />
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Bottom stat strip */}
        <motion.div
          className="mt-16 grid grid-cols-3 gap-4 max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          {[
            { val: '<2min', label: t('howItWorks.stat1.label') },
            { val: '14 day', label: t('howItWorks.stat2.label') },
            { val: '3 languages', label: t('howItWorks.stat3.label') },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="font-mono font-bold text-teal text-lg">{s.val}</p>
              <p className="text-xs text-sage mt-1">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
