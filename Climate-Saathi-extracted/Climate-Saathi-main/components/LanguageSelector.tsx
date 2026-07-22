'use client'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { useLanguageStore, localeLabels, localeFlags, type Locale } from '@/lib/i18n'

const locales: Locale[] = ['en', 'hi', 'cg']

interface LanguageSelectorProps {
  variant?: 'default' | 'ghost'
  className?: string
}

export function LanguageSelector({ variant = 'default', className }: LanguageSelectorProps) {
  const { locale, setLocale } = useLanguageStore()
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<Locale | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeLocale = hovered ?? locale

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Select language"
        className={cn(
          'flex items-center gap-1.5 h-10 px-2.5 rounded-xl transition-all duration-200',
          variant === 'default' && 'bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 hover:scale-105',
          variant === 'ghost' && 'hover:bg-mint-dark dark:hover:bg-forest-light text-sage dark:text-white/70 hover:text-dark dark:hover:text-white',
          className,
        )}
      >
        <Globe className="w-4 h-4 text-white" />
        <ChevronDown className={cn('w-3 h-3 transition-transform text-white', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 py-1.5 rounded-xl bg-dark/90 border border-white/15 shadow-glass-lg backdrop-blur-xl z-[60] overflow-hidden">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l)
                setOpen(false)
              }}
              onMouseEnter={() => setHovered(l)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                locale === l
                  ? 'bg-teal/10 text-teal font-medium'
                  : 'text-white/80 hover:bg-white/10 hover:text-white',
              )}
            >
              <span className="w-6 flex items-center justify-center text-base">{localeFlags[l]}</span>
              <span className="flex-1 text-left">{localeLabels[l]}</span>
              <span className="w-6 flex items-center justify-center">
                {locale === l ? <Check className="w-4 h-4 text-teal" /> : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
