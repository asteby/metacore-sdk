import i18next, { type i18n as I18nInstance, type InitOptions, type Resource } from 'i18next'
import LanguageDetector, {
  type DetectorOptions,
} from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export type CreateI18nOptions = {
  /**
   * Resource bundles keyed by language code (e.g. `{ en: { translation: {...} } }`).
   * Use `baseResources` from `@asteby/metacore-i18n/locales` as a starting point and
   * deep-merge any app-specific namespaces on top.
   */
  resources: Resource
  /**
   * Language to fall back to when a key is missing. Defaults to `'en'`.
   */
  fallback?: string
  /**
   * Default language to initialize with. When omitted, i18next will rely on
   * the language detector (if `detection` is enabled).
   */
  lng?: string
  /**
   * Namespaces available on the instance. Defaults to i18next's single
   * `translation` namespace.
   */
  namespaces?: string[]
  /**
   * Default namespace used when no explicit `ns` is supplied. Defaults to
   * `'translation'`.
   */
  defaultNS?: string
  /**
   * If provided, enables `i18next-browser-languagedetector` with the given
   * configuration. Pass `false` (default) to disable automatic detection
   * entirely — useful for SSR or Node environments.
   */
  detection?: DetectorOptions | false
  /**
   * Enable debug logging. Defaults to `false`.
   */
  debug?: boolean
  /**
   * When `true` (default in browser), syncs `<html lang>` with the active
   * language on every change. Set to `false` for non-browser environments.
   */
  syncHtmlLang?: boolean
  /**
   * Escape hatch for any extra i18next init option not covered above. Merged
   * last so it can override the generated config if absolutely necessary.
   */
  extra?: Partial<InitOptions>
}

const DEFAULT_DETECTION: DetectorOptions = {
  order: ['localStorage', 'navigator', 'htmlTag'],
  caches: ['localStorage'],
}

/**
 * Factory that builds and initializes a brand-new i18next instance.
 *
 * This is intentionally NOT a singleton — each call returns a fresh instance
 * so multiple apps / tests can coexist without stepping on each other.
 */
export function createI18n(options: CreateI18nOptions): I18nInstance {
  const {
    resources,
    fallback = 'en',
    lng,
    namespaces,
    defaultNS = 'translation',
    detection,
    debug = false,
    syncHtmlLang = typeof document !== 'undefined',
    extra,
  } = options

  const instance = i18next.createInstance()

  const useDetection = detection !== false
  if (useDetection) {
    instance.use(LanguageDetector)
  }
  instance.use(initReactI18next)

  const initOptions: InitOptions = {
    resources,
    fallbackLng: fallback,
    debug,
    interpolation: {
      escapeValue: false,
    },
    ...(lng ? { lng } : {}),
    ...(namespaces ? { ns: namespaces } : {}),
    defaultNS,
    ...(useDetection
      ? { detection: { ...DEFAULT_DETECTION, ...(detection ?? {}) } }
      : {}),
    ...extra,
  }

  // Kick off init. Callers can `await instance.init(...)` themselves if they
  // need the promise; we follow a fire-and-forget pattern so `useTranslation`
  // just works.
  void instance.init(initOptions)

  if (syncHtmlLang && typeof document !== 'undefined') {
    instance.on('languageChanged', (lang) => {
      document.documentElement.lang = lang
    })
  }

  return instance
}
