/**
 * Muestras de variante (color, combinación o emoji), pura y sin DOM: sirve en servidor y cliente.
 *
 * El MOTOR es genérico; los DICCIONARIOS no. El SDK solo trae colores básicos (ropa, acabados). Los sabores, emojis y cualquier
 * vocabulario de un giro (suplementos, café, moda…) los inyecta la tienda con `createSwatchResolver`, o llegan del catálogo
 * como atributo (`parseSwatchAttribute`), que siempre manda sobre cualquier diccionario.
 */

/**
 * Lo que dibuja una muestra: colores planos, emoji, o AMBOS (una píldora pastel con la mezcla de colores y los emoji encima).
 * Al menos uno de los dos viene lleno.
 */
export type SwatchSpec = { colors?: string[]; emoji?: string }

/** [frase normalizada (minúsculas, sin acentos), un color hex o varios] */
export type ColorEntry = [phrase: string, color: string | string[]]
/** [frase normalizada, emoji o varios emoji] */
export type EmojiEntry = [phrase: string, emoji: string]

/** Qué dibujar primero cuando hay color y emoji para el mismo nombre. */
export type SwatchPrefer = 'auto' | 'color' | 'emoji' | 'both'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const HEX_IN_TEXT = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi
const MAX = 4

/** Minúsculas, sin acentos, sin puntuación suelta. "Piña" → "pina". */
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Colores básicos (es/en) para ropa y acabados. Sin vocabulario de ningún giro en particular. */
export const defaultColors: ColorEntry[] = [
  ['azul marino', '#14213d'], ['navy', '#14213d'], ['azul rey', '#2447d6'], ['azul cielo', '#6ec1f0'], ['celeste', '#8fd0f5'],
  ['verde militar', '#4b5320'], ['verde oliva', '#6b7a2a'], ['verde limon', '#b8e03a'], ['verde menta', '#8fe0b5'],
  ['rosa mexicano', '#e4007c'], ['gris oscuro', '#4a4f57'], ['gris claro', '#cfd3d8'],
  ['rojo', '#e0262d'], ['red', '#e0262d'], ['vino', '#6d1a36'], ['guinda', '#7a1f3d'], ['burgundy', '#6d1a36'],
  ['azul', '#2f5bea'], ['blue', '#2f5bea'], ['verde', '#2fa84f'], ['green', '#2fa84f'],
  ['amarillo', '#ffd21f'], ['yellow', '#ffd21f'], ['naranja', '#ff8a1f'], ['orange', '#ff8a1f'],
  ['morado', '#7b3fc4'], ['purpura', '#7b3fc4'], ['purple', '#7b3fc4'], ['violeta', '#8a4fd6'], ['lila', '#c4a5f0'],
  ['rosa', '#ff7eb6'], ['pink', '#ff7eb6'], ['fucsia', '#e4007c'], ['magenta', '#d4119e'],
  ['negro', '#111111'], ['black', '#111111'], ['blanco', '#ffffff'], ['white', '#ffffff'],
  ['gris', '#9aa0a8'], ['gray', '#9aa0a8'], ['grey', '#9aa0a8'], ['plata', '#c0c4cc'], ['plateado', '#c0c4cc'], ['silver', '#c0c4cc'],
  ['dorado', '#d4a72c'], ['oro', '#d4a72c'], ['gold', '#d4a72c'], ['cafe', '#7a4a2b'], ['marron', '#7a4a2b'], ['brown', '#7a4a2b'],
  ['beige', '#e6d3b3'], ['crema', '#f4ead2'], ['hueso', '#f1ecde'], ['arena', '#d9c39a'], ['khaki', '#b8a77a'], ['camel', '#b9824a'],
  ['turquesa', '#1fc8c8'], ['aqua', '#34d3d3'], ['coral', '#ff6f61'], ['salmon', '#ff8f7a'], ['mostaza', '#d9a521'], ['terracota', '#c4623f'],
  ['transparente', '#e8edf2'],
]

/**
 * Busca en el texto COMPLETO las frases del diccionario como palabras (plural con "s" opcional), la más larga primero, y las
 * devuelve en el orden en que se leen. Se tacha lo encontrado: "azul" no vuelve a salir dentro de "azul marino". Al no partir
 * el texto por "y"/"and", las frases con conectores ("cookies and cream") se resuelven como frase.
 */
function scan<T>(text: string, entries: [string, T][]): T[] {
  const found: { index: number; value: T }[] = []
  let rest = text
  for (const [phrase, value] of [...entries].sort((a, b) => b[0].length - a[0].length)) {
    const m = new RegExp(`(^|[^a-z])${escapeRegExp(phrase)}s?(?![a-z])`).exec(rest)
    if (!m) continue
    const start = m.index + (m[1]?.length ?? 0)
    found.push({ index: start, value })
    rest = rest.slice(0, start) + ' '.repeat(phrase.length + 1) + rest.slice(start + phrase.length + 1)
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.value)
}

/** Las frases también pueden llegar de datos de la organización (catálogo de muestras): se escapan, nunca son una expresión. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((g) => g.segment)
}

export type SwatchResolverOptions = {
  /** Diccionario de colores. Default: `defaultColors`. Para sumar vocabulario: `[...defaultColors, ...tusColores]`. */
  colors?: ColorEntry[]
  /** Diccionario de emoji (sin default: es vocabulario del giro). */
  emojis?: EmojiEntry[]
  /** Qué dibujar si hay color y emoji: `auto`/`color` = color primero, `emoji` = emoji primero, `both` = píldora pastel con colores y emoji. */
  prefer?: SwatchPrefer
}

export type SwatchResolver = {
  /** Colores del nombre ("Rojo / Negro", "#ff8800"), en orden de lectura, o `null`. */
  colors(value: string): string[] | null
  /** Emoji(s) del nombre (hasta 3, sin repetir), o `null`. */
  emoji(value: string): string | null
  /** Muestra de una variante: primero el atributo del catálogo, luego el nombre según `prefer`. */
  resolve(value: string, attribute?: Map<string, SwatchSpec>): SwatchSpec | null
  /** ¿Todos los valores de una opción tienen muestra? */
  hasSwatches(values: string[], attribute?: Map<string, SwatchSpec>): boolean
}

export function createSwatchResolver({ colors: colorTable = defaultColors, emojis = [], prefer = 'auto' }: SwatchResolverOptions = {}): SwatchResolver {
  const colors = (value: string): string[] | null => {
    const text = normalize(value)
    if (!text) return null
    const hex = (text.match(HEX_IN_TEXT) ?? []).filter((h) => HEX.test(h))
    const found = [...hex, ...scan(text, colorTable).flat()]
    const unique = found.filter((c, i) => found.indexOf(c) === i).slice(0, MAX)
    return unique.length > 0 ? unique : null
  }
  const emoji = (value: string): string | null => {
    const parts = scan(normalize(value), emojis).flatMap(graphemes)
    const unique = parts.filter((e, i) => parts.indexOf(e) === i).slice(0, 3)
    return unique.length > 0 ? unique.join('') : null
  }
  const resolve = (value: string, attribute?: Map<string, SwatchSpec>): SwatchSpec | null => {
    const fromCatalog = attribute?.get(normalize(value))
    if (fromCatalog) return fromCatalog
    const c = colors(value)
    const e = emoji(value)
    if (prefer === 'both' && c && e) return { colors: c, emoji: e }
    if (prefer === 'emoji') return e ? { emoji: e } : c ? { colors: c } : null
    if (prefer === 'color') return c ? { colors: c } : e ? { emoji: e } : null
    return c ? { colors: c } : e ? { emoji: e } : null
  }
  return { colors, emoji, resolve, hasSwatches: (values, attribute) => values.length > 0 && values.every((v) => resolve(v, attribute) !== null) }
}

const basic = createSwatchResolver()

/** Colores básicos del nombre (sin vocabulario de giro). Para uno propio: `createSwatchResolver`. */
export const resolveSwatch = basic.colors
/** Muestra de una variante con solo colores básicos. Para uno propio: `createSwatchResolver`. */
export const resolveSwatchSpec = (value: string, attribute?: Map<string, SwatchSpec>): SwatchSpec | null => basic.resolve(value, attribute)
export const optionHasSwatches = basic.hasSwatches

/**
 * Atributo del producto con el color o emoji de cada variante, como lo siembra el catálogo (OPS):
 * `"Mora Azul:#3d4fd6|Fresa Kiwi:#ff4d6d+#8bc34a 🍓🥝|Natural:🥛"`. Cada valor es un hex, varios hex con "+" (combinación), emoji, o colores y emoji juntos.
 * Es la fuente de verdad: manda sobre cualquier diccionario.
 */
export function parseSwatchAttribute(raw: unknown): Map<string, SwatchSpec> {
  const map = new Map<string, SwatchSpec>()
  if (typeof raw !== 'string') return map
  for (const part of raw.split('|')) {
    const i = part.lastIndexOf(':')
    if (i <= 0) continue
    const name = normalize(part.slice(0, i))
    const value = part.slice(i + 1).trim()
    const colors = (value.match(HEX_IN_TEXT) ?? []).filter((c) => HEX.test(c)).slice(0, MAX)
    const emoji = value.replace(HEX_IN_TEXT, '').replace(/[+\s]/g, '')
    const hasEmoji = emoji.length > 0 && /\p{Extended_Pictographic}/u.test(emoji)
    if (colors.length > 0 || hasEmoji) map.set(name, { ...(colors.length > 0 ? { colors } : {}), ...(hasEmoji ? { emoji } : {}) })
  }
  return map
}

/**
 * Una muestra del catálogo de la organización, tal como la sirve la Storefront API en `shop.swatches` (contrato 1.36.0).
 * `name` y `aliases` son frases del mismo valor (otros idiomas o escrituras); `colors` son hex (uno, o varios para una mezcla).
 */
export type SwatchCatalogEntry = { name: string; aliases?: readonly string[] | null; colors?: readonly string[] | null; emoji?: string | null }

/**
 * Convierte el catálogo de muestras de OPS en los diccionarios del motor (`createSwatchResolver({ colors, emojis })`): una
 * entrada por cada nombre y alias, normalizados (minúsculas, sin acentos). Los hex inválidos se descartan y una muestra sin color ni
 * emoji no aporta nada. El resolver conserva su regla: la frase más larga gana y el atributo `colores` del producto manda.
 */
export function swatchCatalogDictionaries(catalog: readonly SwatchCatalogEntry[] | null | undefined): { colors: ColorEntry[]; emojis: EmojiEntry[] } {
  const colors: ColorEntry[] = []
  const emojis: EmojiEntry[] = []
  for (const entry of catalog ?? []) {
    const phrases = [entry.name, ...(entry.aliases ?? [])].map(normalize).filter((p, i, all) => p.length > 0 && all.indexOf(p) === i)
    const hex = (entry.colors ?? []).map((c) => c.trim()).filter((c) => HEX.test(c)).map((c) => c.toLowerCase()).slice(0, MAX)
    const emoji = (entry.emoji ?? '').trim()
    for (const phrase of phrases) {
      if (hex.length > 0) colors.push([phrase, hex.length === 1 ? hex[0]! : hex])
      if (emoji.length > 0) emojis.push([phrase, emoji])
    }
  }
  return { colors, emojis }
}

/** Fondo CSS plano: un color liso, dos mitades, o sectores iguales (hasta 4). */
export function swatchBackground(colors: string[]): string {
  const [first = 'transparent', second] = colors
  if (second === undefined) return first
  if (colors.length === 2) return `linear-gradient(90deg, ${first} 50%, ${second} 50%)`
  const step = 360 / colors.length
  return `conic-gradient(${colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`
}

/** Luminancia relativa (0 negro – 1 blanco) de un color hex, para decidir si hace falta un aro. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const channel = (i: number): number => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/**
 * Fondo pastel de una píldora: cada color mezclado con blanco (queda claro y suave en claro y oscuro), un degradado suave entre
 * ellos si son varios. Con ese fondo el emoji siempre contrasta.
 */
export function pastelBackground(colors: string[]): string {
  const soft = colors.map((c) => `color-mix(in srgb, ${c} 26%, white)`)
  const [first = 'transparent', second] = soft
  if (second === undefined) return first
  return `linear-gradient(100deg, ${soft.join(', ')})`
}
