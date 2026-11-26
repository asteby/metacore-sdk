// Contenido traducible del mock: replica la regla del servidor (`?locale=` → `X-Storefront-Locale` → `Accept-Language` → idioma por
// omisión) y el FALLBACK POR CAMPO (un campo sin traducir sale en el idioma de origen), para que una tienda ensaye /es sin un OPS real.
import { normalizeLocale, type Locale } from '../client.js'
import type { Collection, Product } from '../types.js'

/** Campos traducibles de un producto o una colección; los que falten salen en el idioma de origen. */
export type MockTranslatedFields = {
  title?: string
  description?: string
  /** Solo productos. */
  description_html?: string
  seo_title?: string
  seo_description?: string
}

/** `{ <handle>: { <idioma>: campos } }`, con el idioma en minúsculas (`es`). */
export type MockTranslationTable = Record<string, Record<Locale, MockTranslatedFields>>

export type MockTranslations = {
  products?: MockTranslationTable
  collections?: MockTranslationTable
}

/** Idioma de un tag BCP 47 (`es-MX` → `es`). */
export const langOf = (tag: string | null | undefined): Locale | undefined => normalizeLocale(tag)

/** Idiomas con al menos una traducción en la tabla. */
export function translationLanguages(t: MockTranslations | undefined): Locale[] {
  const out = new Set<Locale>()
  for (const table of [t?.products, t?.collections]) {
    for (const byLang of Object.values(table ?? {})) for (const l of Object.keys(byLang)) { const n = normalizeLocale(l); if (n) out.add(n) }
  }
  return [...out]
}

/** `Shop.locales` con los idiomas traducidos añadidos (sin repetir un idioma que ya está con otra región). */
export function localesWithTranslations(locales: string[], translated: Locale[]): string[] {
  const have = new Set(locales.map((l) => langOf(l)).filter(Boolean))
  return [...locales, ...translated.filter((l) => !have.has(l))]
}

/** `Accept-Language` ordenado por peso (`es;q=0.8,en`), solo idiomas válidos y sin repetir. */
export function acceptLanguages(header: string | null | undefined): Locale[] {
  const entries = (header ?? '')
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = Number(params.map((p) => p.trim()).find((p) => p.startsWith('q='))?.slice(2) ?? '1')
      return { lang: normalizeLocale(tag), q: Number.isFinite(q) ? q : 0, i }
    })
    .filter((e): e is { lang: Locale; q: number; i: number } => !!e.lang && e.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
  return [...new Set(entries.map((e) => e.lang))]
}

/**
 * Idioma que se sirve: el primero pedido (`?locale=`, `X-Storefront-Locale`, `Accept-Language`) que la tienda ofrece; un idioma
 * desconocido se ignora y cae al siguiente (nunca un 400); sin ninguno, el de omisión.
 */
export function resolveContentLocale(input: { search: URLSearchParams; headers: Headers; available: Locale[]; fallback: Locale }): Locale {
  const asked = [normalizeLocale(input.search.get('locale')), normalizeLocale(input.headers.get('x-storefront-locale')), ...acceptLanguages(input.headers.get('accept-language'))]
  return asked.find((l): l is Locale => !!l && input.available.includes(l)) ?? input.fallback
}

const pick = <T,>(translated: T | undefined, origin: T): T => (translated !== undefined && translated !== '' ? translated : origin)

export function localizeProduct(p: Product, lang: Locale, defaultLang: Locale, table: MockTranslationTable | undefined): Product {
  const t = lang === defaultLang ? undefined : table?.[p.handle]?.[lang]
  if (!t) return p
  return {
    ...p,
    title: pick(t.title, p.title),
    description: pick(t.description, p.description),
    description_html: pick(t.description_html, p.description_html),
    seo: { title: pick(t.seo_title, p.seo.title), description: pick(t.seo_description, p.seo.description) },
  }
}

export function localizeCollection(c: Collection, lang: Locale, defaultLang: Locale, table: MockTranslationTable | undefined): Collection {
  const t = lang === defaultLang ? undefined : table?.[c.handle]?.[lang]
  if (!t) return c
  return {
    ...c,
    title: pick(t.title, c.title),
    description: pick(t.description, c.description),
    seo: { title: pick(t.seo_title, c.seo.title), description: pick(t.seo_description, c.seo.description) },
  }
}
