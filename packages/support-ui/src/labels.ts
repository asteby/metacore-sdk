import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { en, es } from '@asteby/metacore-i18n'

type Bundle = Record<string, unknown>
const BUNDLES: Record<'es' | 'en', Bundle> = { es: es.supportThread, en: en.supportThread }

const lookup = (bundle: Bundle, key: string): string => {
  let cur: unknown = bundle
  for (const part of key.split('.')) cur = (cur as Bundle | undefined)?.[part]
  return typeof cur === 'string' ? cur : key
}

const interpolate = (s: string, vars?: Record<string, string>) =>
  vars ? s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m) : s

export type SupportT = (key: string, vars?: Record<string, string>) => string
export type SupportLocale = 'es' | 'en'

/**
 * Translator for the `supportThread.*` keys of `@asteby/metacore-i18n`. The default text comes
 * from the same es/en bundles, so the component reads correctly even when the host never
 * registered those keys in its i18next instance (the host can still override them).
 */
export function useSupportT(): { t: SupportT; locale: SupportLocale } {
  const { t, i18n } = useTranslation()
  const locale: SupportLocale = (i18n?.language ?? 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
  const tt = useCallback<SupportT>(
    (key, vars) =>
      t(`supportThread.${key}`, { ...vars, defaultValue: interpolate(lookup(BUNDLES[locale], key), vars) }) as string,
    [t, locale],
  )
  return { t: tt, locale }
}
