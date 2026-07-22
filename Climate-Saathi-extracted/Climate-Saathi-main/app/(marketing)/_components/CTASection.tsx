'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Shield, Users, Award } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function CTASection() {
  const { t } = useTranslation()
  return (
    <section className="relative bg-forest py-28 px-6 overflow-hidden">
      {/* Background glow effects */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(42,157,143,0.08) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(42,157,143,1) 1px, transparent 1px), linear-gradient(90deg, rgba(42,157,143,1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal/10 border border-teal/20 mb-8"
        >
          <Award className="w-4 h-4 text-teal" />
          <span className="text-xs font-mono text-teal uppercase tracking-wider">
            {t('cta.badge')}
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          className="text-4xl md:text-6xl font-sora font-bold text-white mb-6 leading-tight"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          {t('cta.heading1')}{' '}
          <br className="hidden sm:block" />
          <span className="text-teal">{t('cta.heading2')}</span>
        </motion.h2>

        {/* Sub-text */}
        <motion.p
          className="text-lg text-sage max-w-2xl mx-auto mb-10"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          {t('cta.subtext')}
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-4 mb-16"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <Link
            href="/dashboard"
            className="btn-primary inline-flex items-center gap-2 text-base px-7 py-3"
          >
            {t('cta.button1')}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="mailto:hello@climatesaathi.in"
            className="btn-secondary inline-flex items-center gap-2 text-base px-7 py-3"
          >
            Contact Team BioXtreme
          </a>
        </motion.div>

        {/* Trust indicators */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          {[
            { icon: Shield, text: t('cta.trust1') },
            { icon: Users,  text: t('cta.trust2') },
            { icon: Award,  text: t('cta.trust3') },
          ].map((item) => (
            <div key={item.text} className="flex items-center gap-2">
              <item.icon className="w-4 h-4 text-teal/60" />
              <span className="text-sm text-sage/60">{item.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Team strip */}
        <motion.div
          className="mt-16 pt-8 border-t border-white/8"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
        >
          <p className="text-xs text-sage/40 font-mono uppercase tracking-widest mb-4">
            Built by Team BioXtreme
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {['NIT Raipur', 'UNICEF India', 'Chhattisgarh State'].map((org) => (
              <span
                key={org}
                className="px-4 py-2 rounded-full border border-white/8 bg-white/3 text-xs text-sage/60"
              >
                {org}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
