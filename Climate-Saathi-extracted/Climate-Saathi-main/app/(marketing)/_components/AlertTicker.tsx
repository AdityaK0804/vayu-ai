'use client'
import { useTranslation } from '@/lib/i18n'

export function AlertTicker() {
  const { t } = useTranslation()
  const tickerItems = [
    t('ticker.alert1'),
    t('ticker.alert2'),
    t('ticker.alert3'),
    t('ticker.alert4'),
    t('ticker.alert5'),
    t('ticker.alert6'),
  ]
  const items = [...tickerItems, ...tickerItems]

  return (
    <div className="relative z-40 overflow-hidden bg-dark/90 border-y border-teal/20 py-2.5">
      {/* Left fade mask */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-dark/90 to-transparent z-10 pointer-events-none" />
      {/* Right fade mask */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-dark/90 to-transparent z-10 pointer-events-none" />

      <div className="animate-ticker whitespace-nowrap flex gap-12 w-max">
        {items.map((alert, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm text-white/80 shrink-0">
            {alert}
            <span className="text-teal/40 mx-2">|</span>
          </span>
        ))}
      </div>
    </div>
  )
}
