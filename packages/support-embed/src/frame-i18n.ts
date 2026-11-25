import { createInstance, type i18n } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { baseResources } from '@asteby/metacore-i18n'

/** Instancia propia de i18n (es/en) para el widget: no depende ni pisa la del sitio anfitrion. */
export function createFrameI18n(ui: 'es' | 'en'): i18n {
  const instance = createInstance()
  void instance.use(initReactI18next).init({ lng: ui, fallbackLng: 'es', resources: baseResources, interpolation: { escapeValue: false }, initAsync: false })
  return instance
}
