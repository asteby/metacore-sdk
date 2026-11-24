// useBundledTranslation — textos de un componente que viaja con su propio
// diccionario (addon federado, widget del SDK) pero debe hablar el idioma que el
// HOST eligió (preferencia del usuario o idioma de la organización), nunca el del
// navegador.
//
//   const { t, language } = useBundledTranslation({ es: { hola: 'Hola {name}' }, en: { hola: 'Hi {name}' } })
//   t('hola', { name: 'Ana' })
//
// Reglas:
//   - Idioma: el del i18next del host (`i18n.language`, que Ops fija con la
//     preferencia del usuario o el idioma de la organización). Sin host usable,
//     `<html lang>` y, al final, el primer idioma del diccionario. `navigator.language`
//     NO cuenta: un Chrome en inglés no debe voltear una instancia en español.
//   - Texto: si el host tiene la clave (sobrescritura del tenant) gana el host; si
//     no, el diccionario empaquetado en el idioma activo; si tampoco, el de
//     respaldo (`fallback`, por omisión el primer idioma). Nunca sale la clave cruda
//     cuando el diccionario la trae.
//   - Interpolación `{var}` y `{{var}}` (los dos estilos que ya usan los addons).
//
// Lo usaban copiado devoluciones (returns), licencia, auditoría y procedencia;
// este es el primitivo común.
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

/** Diccionarios por idioma base (`es`, `en`…) → clave → texto. */
export type TranslationBundles = Record<string, Record<string, string>>

export type BundledT = (key: string, vars?: Record<string, unknown>) => string

export interface UseBundledTranslationOptions {
    /** Idioma del diccionario cuando el activo no está (por omisión, el primero declarado). */
    fallback?: string
    /** Forzar idioma (pruebas, vista previa de otro mercado). Vacío = el del host. */
    language?: string
}

export interface UseBundledTranslationResult {
    t: BundledT
    /** Idioma BCP-47 activo tal como lo reporta el host (`es`, `es-MX`, `en`). */
    language: string
    /** Idioma del diccionario elegido (`es` | `en` | …). */
    bundleLanguage: string
}

/** Idioma base (`es-MX` → `es`). */
export function baseLanguage(tag: string | undefined | null): string {
    return String(tag ?? '').trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/** El idioma del diccionario para `language`: el exacto, si no el base, si no el de respaldo. */
export function pickBundleLanguage(bundles: TranslationBundles, language: string | undefined, fallback?: string): string {
    const keys = Object.keys(bundles)
    const exact = String(language ?? '').trim()
    if (exact && bundles[exact]) return exact
    const base = baseLanguage(exact)
    if (base && bundles[base]) return base
    if (fallback && bundles[fallback]) return fallback
    return keys[0] ?? ''
}

/** `{var}` y `{{var}}`; un parámetro desconocido queda como está escrito. */
export function interpolateText(text: string, vars?: Record<string, unknown>): string {
    if (!vars || (!text.includes('{'))) return text
    return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}|\{([A-Za-z0-9_.]+)\}/g, (whole, a: string, b: string) => {
        const v = vars[a ?? b]
        return v === undefined || v === null ? whole : String(v)
    })
}

/** Traductor puro sobre los diccionarios (sin host). */
export function bundledTranslator(bundles: TranslationBundles, language: string, fallback?: string): BundledT {
    const lang = pickBundleLanguage(bundles, language, fallback)
    const fb = fallback && bundles[fallback] ? fallback : Object.keys(bundles)[0]
    return (key, vars) => {
        const text = bundles[lang]?.[key] ?? (fb ? bundles[fb]?.[key] : undefined) ?? key
        return interpolateText(text, vars)
    }
}

interface HostI18nLike {
    language?: string
    isInitialized?: boolean
    exists?: (key: string, opts?: Record<string, unknown>) => boolean
    t?: (key: string, opts?: Record<string, unknown>) => unknown
}

function htmlLang(): string {
    return typeof document !== 'undefined' ? document.documentElement?.lang ?? '' : ''
}

/**
 * Traductor con el host como fuente de verdad (idioma y sobrescrituras) y el
 * diccionario empaquetado como respaldo. `t` es estable mientras no cambie el
 * idioma (se puede poner en dependencias de efectos sin bucles).
 */
export function useBundledTranslation(
    bundles: TranslationBundles,
    options: UseBundledTranslationOptions = {},
): UseBundledTranslationResult {
    const { i18n } = useTranslation()
    const host = i18n as unknown as HostI18nLike | undefined
    const usable = !!host && typeof host.t === 'function' && host.isInitialized !== false
    const language = options.language || (usable && host?.language) || htmlLang() || pickBundleLanguage(bundles, '', options.fallback)
    const hostRef = useRef(host)
    hostRef.current = host
    const bundlesRef = useRef(bundles)
    bundlesRef.current = bundles

    const t = useMemo<BundledT>(() => {
        const own = bundledTranslator(bundlesRef.current, language, options.fallback)
        return (key, vars) => {
            const h = hostRef.current
            if (usable && h && typeof h.t === 'function' && typeof h.exists === 'function' && h.exists(key, { lng: language })) {
                const out = h.t(key, { lng: language, ...vars })
                if (typeof out === 'string' && out !== '' && out !== key) return interpolateText(out, vars)
            }
            return own(key, vars)
        }
    }, [language, usable, options.fallback])

    return { t, language, bundleLanguage: pickBundleLanguage(bundles, language, options.fallback) }
}
