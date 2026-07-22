'use client'
import { create } from 'zustand'
import type { Locale } from './translations'

interface LanguageStore {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  locale: (typeof window !== 'undefined'
    ? (localStorage.getItem('locale') as Locale) ?? 'en'
    : 'en') as Locale,
  setLocale: (locale) => {
    if (typeof window !== 'undefined') localStorage.setItem('locale', locale)
    set({ locale })
  },
}))
