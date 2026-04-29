export { createI18n, type CreateI18nOptions } from './config'
export {
  baseResources,
  en,
  es,
  type BaseLanguage,
} from './locales/index'
export {
  LanguageSwitcher,
  type LanguageOption,
  type LanguageSwitcherProps,
} from './language-switcher'
export {
  DirectionProvider,
  useDirection,
  type Direction,
  type DirectionContextValue,
  type DirectionProviderProps,
} from './direction-provider'
export {
  useLocale,
  directionFor,
  DEFAULT_RTL_LANGUAGES,
  type UseLocaleResult,
} from './hooks'
export {
  useAddonI18n,
  useAddonNames,
  type UseAddonI18nOptions,
  type UseAddonI18nResult,
} from './addon-i18n'
