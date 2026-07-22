'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { LanguageSelector } from '@/components/LanguageSelector'
import { useTranslation } from '@/lib/i18n'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-dark backdrop-blur-md border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white shadow-sm">
            <Image src="/climate_saathi_logo.svg" alt="Climate Saathi" width={32} height={32} className="w-full h-full object-cover" />
          </div>
          <span className="font-sora font-bold text-white">Climate Saathi</span>
        </div>

        {/* Center nav links */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-sage hover:text-white transition-colors">{t('nav.features')}</a>
          <a href="#how-it-works" className="text-sm text-sage hover:text-white transition-colors">{t('nav.howItWorks')}</a>
          <a href="#coverage" className="text-sm text-sage hover:text-white transition-colors">{t('nav.coverage')}</a>
          <a href="#impact" className="text-sm text-sage hover:text-white transition-colors">{t('nav.impact')}</a>
        </div>

        {/* Right: Language + CTA */}
        <div className="flex items-center gap-2">
          <LanguageSelector variant="default" />
          <Link href="/dashboard" className="btn-primary text-sm py-2 px-4">
            {t('nav.openDashboard')}
          </Link>
        </div>
      </div>
    </nav>
  )
}
