'use client'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import Image from 'next/image'
import { useTranslation } from '@/lib/i18n'

const navLinks = [
  { href: '#features',     label: 'nav.features' },
  { href: '#how-it-works', label: 'nav.howItWorks' },
  { href: '#coverage',     label: 'nav.coverage' },
  { href: '#impact',       label: 'nav.impact' },
  { href: '/dashboard',    label: 'nav.dashboard' },
]

export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="bg-dark border-t border-white/10 py-16 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">

          {/* Col 1 — Brand */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-white shadow-sm flex-shrink-0">
                <Image src="/climate_saathi_logo.svg" alt="Climate Saathi" width={32} height={32} className="w-full h-full object-cover" />
              </div>
              <span className="font-sora font-bold text-white text-lg">Climate Saathi</span>
            </div>
            <p className="text-sm text-sage leading-relaxed">
              {t('footer.tagline')}
            </p>
            <p className="text-xs text-sage/60 leading-relaxed">
              {t('footer.description')}
            </p>
          </div>

          {/* Col 2 — Navigation */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1">
              {t('footer.platform')}
            </h4>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-sage hover:text-white transition-colors"
              >
                {t(link.label)}
              </Link>
            ))}
          </div>

          {/* Col 3 — Contact */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1">
              {t('footer.getInTouch')}
            </h4>
            <a
              href="mailto:hello@climatesaathi.in"
              className="flex items-center gap-2 text-sm text-sage hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4 flex-shrink-0" />
              hello@climatesaathi.in
            </a>
            <p className="text-xs text-sage/60 leading-relaxed mt-2">
              {t('footer.teamDesc')}
            </p>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-sage">
            {t('footer.bottomLeft')}
          </p>
          <p className="text-xs text-sage/50">
            {t('footer.bottomRight')}
          </p>
        </div>
      </div>
    </footer>
  )
}
