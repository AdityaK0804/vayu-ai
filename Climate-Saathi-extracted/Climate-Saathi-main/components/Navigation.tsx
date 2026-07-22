'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Menu, X } from 'lucide-react'
import Image from 'next/image'
import { ThemeToggle } from './ThemeToggle'
import { LanguageSelector } from './LanguageSelector'
import { useTranslation } from '@/lib/i18n'

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const isLanding = pathname === '/'
  const { t } = useTranslation()

  const navLinks = [
    { label: t('nav.dashboard'),  href: '/dashboard'  },
    { label: t('nav.facilities'), href: '/facilities' },
    { label: t('nav.alerts'),     href: '/alerts'     },
    { label: t('nav.analytics'),  href: '/analytics'  },
  ]

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      isScrolled || !isLanding
        ? 'bg-white/85 dark:bg-forest/95 backdrop-blur-md border-b border-sage/10 dark:border-white/10'
        : 'bg-transparent'
    )}>
      <div className="px-[7vw] h-[72px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-white shadow-sm">
            <Image src="/climate_saathi_logo.svg" alt="Climate Saathi" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <span className={cn('font-sora font-semibold text-lg',
            isScrolled || !isLanding ? 'text-dark dark:text-white' : 'text-white')}>
            Climate Saathi
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map(link => (
            <Link key={link.href} href={link.href} className={cn(
              'text-sm font-medium transition-colors',
              isScrolled || !isLanding
                ? 'text-sage dark:text-white/70 hover:text-dark dark:hover:text-white'
                : 'text-white/80 hover:text-white'
            )}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <LanguageSelector variant={isScrolled || !isLanding ? 'ghost' : 'default'} />
          <ThemeToggle variant={isScrolled || !isLanding ? 'ghost' : 'default'} />
          {isLanding && (
            <Link href="/dashboard" className={cn(
              'px-5 py-2.5 rounded-xl font-sora font-semibold text-sm transition-all',
              isScrolled
                ? 'bg-amber text-dark hover:-translate-y-0.5 hover:shadow-lg'
                : 'bg-white/20 text-white backdrop-blur-sm border border-white/30 hover:bg-white/30'
            )}>
              {t('nav.explore')}
            </Link>
          )}
        </div>

        <div className="md:hidden flex items-center gap-2">
          <LanguageSelector variant="ghost" className={cn(isScrolled || !isLanding ? 'text-dark dark:text-white' : 'text-white')} />
          <ThemeToggle variant="ghost" className={cn(isScrolled || !isLanding ? 'text-dark dark:text-white' : 'text-white')} />
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={cn('p-2 rounded-lg', isScrolled || !isLanding ? 'text-dark dark:text-white' : 'text-white')}>
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-white/95 dark:bg-forest/95 backdrop-blur-md border-t border-sage/10 dark:border-white/10">
          <div className="px-[7vw] py-4 space-y-3">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 text-dark dark:text-white font-medium">
                {link.label}
              </Link>
            ))}
            {isLanding && (
              <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}
                className="block w-full text-center py-3 bg-amber text-dark font-sora font-semibold rounded-xl mt-4">
                {t('nav.explore')}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
