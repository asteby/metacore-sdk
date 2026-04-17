import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export type UseLocaleResult = {
  /** Current active language code (e.g. `"en"`, `"es"`). */
  locale: string
  /** Resolved languages, including fallbacks. */
  languages: readonly string[]
  /** Change the active language on the underlying i18next instance. */
  setLocale: (lang: string) => Promise<unknown>
}

/**
 * Lightweight wrapper around `useTranslation` that exposes only the
 * language-management bits — handy for building language switchers or
 * reading the active locale in components that don't need `t()`.
 */
export function useLocale(): UseLocaleResult {
  const { i18n } = useTranslation()

  const setLocale = useCallback(
    (lang: string) => i18n.changeLanguage(lang),
    [i18n],
  )

  return {
    locale: i18n.language,
    languages: i18n.languages ?? [i18n.language],
    setLocale,
  }
}

export type Direction = 'ltr' | 'rtl'

/**
 * List of language codes that default to right-to-left script.
 * Extend at the app level via the `DirectionProvider`'s `rtlLanguages` prop
 * if you ship additional RTL locales.
 */
export const DEFAULT_RTL_LANGUAGES: readonly string[] = [
  'ar',
  'fa',
  'he',
  'ur',
  'yi',
  'ps',
  'sd',
  'ckb',
]

/**
 * Compute the expected writing direction for a language code, honoring an
 * optional override list.
 */
export function directionFor(
  lang: string,
  rtlLanguages: readonly string[] = DEFAULT_RTL_LANGUAGES,
): Direction {
  const base = lang.split('-')[0]?.toLowerCase() ?? ''
  return rtlLanguages.includes(base) ? 'rtl' : 'ltr'
}
