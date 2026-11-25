// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { applyProfileTheme } from './theme'
import { profileTexts, resolveLocale, sanitizeProfile } from './profile'

// Mismo perfil que el fixture del contrato (support/contract/testdata/public_profile.json).
const fixture = {
  version: 3,
  brand_color: '#0E7490',
  appearance: 'auto',
  position: 'bottom-right',
  logo_url: 'https://tienda.ejemplo.mx/logo.png',
  default_locale: 'es-MX',
  texts: {
    'es-MX': { launcher: 'Te ayudamos?', greeting: 'Hola, en que podemos ayudarte?', offline: 'Estamos fuera de servicio.' },
    'en-US': { launcher: 'Need help?', greeting: 'Hi, how can we help?', offline: 'We are out of service.' },
  },
  fallback_contact: { email: 'soporte@ejemplo.mx', url: 'https://ejemplo.mx/ayuda' },
}

describe('sanitizeProfile', () => {
  it('conserva un perfil valido tal cual', () => {
    const p = sanitizeProfile(fixture)
    expect(p).toMatchObject({ brand_color: '#0E7490', appearance: 'auto', position: 'bottom-right', version: 3, default_locale: 'es-MX' })
    expect(p.texts['en-US']?.launcher).toBe('Need help?')
    expect(p.fallback_contact).toEqual({ email: 'soporte@ejemplo.mx', url: 'https://ejemplo.mx/ayuda' })
  })

  it('descarta solo los campos invalidos (color, https, textos largos, locales raros, enlaces)', () => {
    const p = sanitizeProfile({
      brand_color: 'red; background:url(//evil)',
      appearance: 'neon',
      position: 'top',
      logo_url: 'http://x.example/logo.png',
      default_locale: 'es_MX',
      texts: { 'es-MX': { launcher: 'x'.repeat(61), greeting: 'Hola' }, '<b>': { launcher: 'a' } },
      fallback_contact: { email: 'no-email', url: 'javascript:alert(1)' },
    } as never)
    expect(p.brand_color).toBeUndefined()
    expect(p.appearance).toBe('auto')
    expect(p.position).toBe('bottom-right')
    expect(p.logo_url).toBeUndefined()
    expect(p.default_locale).toBeUndefined()
    expect(p.texts).toEqual({ 'es-MX': { greeting: 'Hola' } })
    expect(p.fallback_contact).toBeUndefined()
    expect(sanitizeProfile(null).texts).toEqual({})
  })
})

describe('textos e idioma', () => {
  it('elige texto exacto, del mismo idioma o el de default_locale', () => {
    const p = sanitizeProfile(fixture)
    expect(profileTexts(p, 'en-US').launcher).toBe('Need help?')
    expect(profileTexts(p, 'en-GB').launcher).toBe('Need help?')
    expect(profileTexts(p, 'fr-FR').launcher).toBe('Te ayudamos?')
  })

  it('orden: data-locale, navegador, default del perfil, es-MX', () => {
    expect(resolveLocale({ requested: 'en-US', navigatorLanguage: 'es-MX' })).toEqual({ locale: 'en-US', ui: 'en' })
    expect(resolveLocale({ requested: null, navigatorLanguage: 'en' })).toEqual({ locale: 'en', ui: 'en' })
    expect(resolveLocale({ profileDefault: 'es-MX' }).ui).toBe('es')
    expect(resolveLocale({ requested: 'no valido!' })).toEqual({ locale: 'es-MX', ui: 'es' })
  })
})

describe('applyProfileTheme', () => {
  it('aplica la marca como token por CSSOM y el texto legible encima', () => {
    const root = document.createElement('div')
    const r = applyProfileTheme(sanitizeProfile(fixture), root, false)
    expect(root.style.getPropertyValue('--primary')).toBe('#0E7490')
    expect(root.style.getPropertyValue('--primary-foreground')).toMatch(/^#/)
    expect(r.brand?.color).toBe('#0E7490')
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('en oscuro (auto + preferencia o forzado) sube el contraste de la marca', () => {
    const root = document.createElement('div')
    const dark = applyProfileTheme(sanitizeProfile({ ...fixture, brand_color: '#102030' }), root, true)
    expect(dark.dark).toBe(true)
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.style.getPropertyValue('--primary').toLowerCase()).not.toBe('#102030')
    const forced = applyProfileTheme(sanitizeProfile({ ...fixture, appearance: 'light' }), root, true)
    expect(forced.dark).toBe(false)
  })

  it('sin color de marca retira los tokens', () => {
    const root = document.createElement('div')
    root.style.setProperty('--primary', 'red')
    applyProfileTheme(sanitizeProfile({ appearance: 'light' }), root, false)
    expect(root.style.getPropertyValue('--primary')).toBe('')
  })
})
