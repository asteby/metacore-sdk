import en from './en.json'
import es from './es.json'

export { en, es }

/**
 * Base resource bundles for i18next.
 *
 * Each app can either pass these directly to `createI18n` or spread them
 * and override specific keys / add their own namespaces.
 */
export const baseResources = {
  en: { translation: en },
  es: { translation: es },
} as const

export type BaseLanguage = keyof typeof baseResources
