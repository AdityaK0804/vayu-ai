'use client'
import { useLanguageStore } from './store'
import { translations } from './translations'

export function useTranslation() {
  const locale = useLanguageStore((s) => s.locale)
  const dict = translations[locale]

  function t(key: string): string {
    return dict[key] ?? translations.en[key] ?? key
  }

  return { t, locale }
}
