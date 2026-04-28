// i18n bootstrap for the starter. Uses `createI18n` from
// `@asteby/metacore-i18n` so language detection, fallback, and HTML <html lang>
// sync are wired the same way every metacore app gets them.
//
// `baseResources` ships the strings owned by SDK packages (auth, runtime-react,
// etc.); we deep-merge starter-specific keys on top.
import { createI18n, baseResources } from '@asteby/metacore-i18n'
import esStarter from '@/i18n/es.json'
import enStarter from '@/i18n/en.json'

const merge = (
  lang: 'es' | 'en',
  starter: Record<string, unknown>,
) => ({
  translation: {
    ...((baseResources as Record<string, { translation?: Record<string, unknown> }>)[lang]
      ?.translation ?? {}),
    ...starter,
  },
})

const i18n = createI18n({
  fallback: 'es',
  resources: {
    es: merge('es', esStarter),
    en: merge('en', enStarter),
  },
  detection: {
    order: ['localStorage', 'navigator', 'htmlTag'],
    caches: ['localStorage'],
    lookupLocalStorage: 'metacore-lang',
  },
})

export default i18n
