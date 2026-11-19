/**
 * WCAG 2.x contrast helpers for theme tokens.
 *
 * Pure functions, no DOM: they parse the color syntaxes the token files use
 * (`oklch()`, `#hex`, `rgb()`, `white`/`black`/`transparent`), composite
 * translucent colors over their backdrop (the glass pack paints text on
 * `oklch(... / 0.45)` surfaces, so the contrast that matters is against the
 * composited result, not the token) and compute the WCAG contrast ratio.
 *
 * Used by the token contrast test (fails CI below AA) and available to apps
 * that derive colors at runtime (brand accents, chart series):
 *
 *   import { contrastRatio, ensureContrast } from '@asteby/metacore-theme/contrast'
 *   contrastRatio('oklch(0.8 0.08 255)', 'oklch(0.2 0.03 255)') // ≈ 9.7
 */

/** sRGB color, channels 0..1 (gamma-encoded), alpha 0..1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** WCAG 2.x minimums. */
export const WCAG = {
  /** 1.4.3 AA, normal text (< 18.66px bold / < 24px regular). */
  text: 4.5,
  /** 1.4.3 AA, large text. */
  largeText: 3,
  /** 1.4.11 non-text: control boundaries, focus indicators, chart marks. */
  nonText: 3,
  /** 1.4.6 AAA, normal text. */
  textAAA: 7,
} as const

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

function parseNumber(token: string, percentScale = 1): number {
  const t = token.trim()
  if (t.endsWith('%')) return (parseFloat(t) / 100) * percentScale
  return parseFloat(t)
}

/** OKLCH → gamma-encoded sRGB, out-of-gamut channels clipped (as browsers paint). */
export function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
  return lin.map((v) => {
    const x = clamp01(v)
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }) as [number, number, number]
}

/** Gamma-encoded sRGB → OKLCH (`[l, c, h]`). */
export function rgbToOklch(r: number, g: number, b: number): [number, number, number] {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const lr = lin(r)
  const lg = lin(g)
  const lb = lin(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.sqrt(A * A + B * B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  return [L, C, H]
}

/**
 * Parses a CSS color as used in token files. Returns null for anything it
 * does not understand (`var()`, `color-mix()`, gradients).
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (s === 'white') return { r: 1, g: 1, b: 1, a: 1 }
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (s.startsWith('#')) {
    let hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('')
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return null
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 }
  }
  const fn = /^(oklch|rgba?|hsla?)\((.*)\)$/.exec(s)
  if (!fn) return null
  const [body, alphaPart] = fn[2]!.split('/')
  const parts = body!.replace(/,/g, ' ').trim().split(/\s+/)
  if (parts.length < 3) return null
  let alpha = 1
  if (alphaPart !== undefined) alpha = parseNumber(alphaPart)
  else if (fn[1] !== 'oklch' && parts.length === 4) alpha = parseNumber(parts[3]!)
  if (fn[1] === 'hsl' || fn[1] === 'hsla') {
    const hue = ((parseFloat(parts[0]!) % 360) + 360) % 360
    const sat = clamp01(parseNumber(parts[1]!))
    const lig = clamp01(parseNumber(parts[2]!))
    const a = sat * Math.min(lig, 1 - lig)
    const f = (n: number) => {
      const k = (n + hue / 30) % 12
      return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return { r: clamp01(f(0)), g: clamp01(f(8)), b: clamp01(f(4)), a: clamp01(alpha) }
  }
  if (fn[1] === 'oklch') {
    const [r, g, b] = oklchToRgb(parseNumber(parts[0]!), parseNumber(parts[1]!, 0.4), parseFloat(parts[2]!))
    return { r, g, b, a: clamp01(alpha) }
  }
  const ch = (t: string) => clamp01(t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / 255)
  return { r: ch(parts[0]!), g: ch(parts[1]!), b: ch(parts[2]!), a: clamp01(alpha) }
}

function toRgba(c: string | Rgba): Rgba {
  if (typeof c !== 'string') return c
  const parsed = parseColor(c)
  if (!parsed) throw new Error(`Unsupported color: ${c}`)
  return parsed
}

/** Paints `top` over `bottom` (source-over, in gamma sRGB like browsers). */
export function composite(top: string | Rgba, bottom: string | Rgba): Rgba {
  const t = toRgba(top)
  const b = toRgba(bottom)
  const a = t.a + b.a * (1 - t.a)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (x: number, y: number) => (x * t.a + y * b.a * (1 - t.a)) / a
  return { r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a }
}

/** Composites a stack of layers, first = bottom-most (must end opaque). */
export function flatten(...layers: (string | Rgba)[]): Rgba {
  return layers.reduce<Rgba>((acc, layer) => composite(layer, acc), { r: 0, g: 0, b: 0, a: 0 })
}

/** WCAG relative luminance of an opaque color. */
export function relativeLuminance(color: string | Rgba): number {
  const c = toRgba(color)
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/**
 * WCAG contrast ratio (1..21). A translucent foreground is composited over
 * the background first; the background must be opaque (flatten it first).
 */
export function contrastRatio(foreground: string | Rgba, background: string | Rgba): number {
  const bg = toRgba(background)
  if (bg.a < 1) throw new Error('contrastRatio: background must be opaque; flatten() it over its backdrop first')
  const fg = composite(foreground, bg)
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** `#rrggbb` of an opaque color, for reports. */
export function toHex(color: string | Rgba): string {
  const c = toRgba(color)
  const h = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

/**
 * Moves the OKLCH lightness of `color` (keeping hue and chroma) away from the
 * background until it reaches `min` contrast against it. Returns the color as
 * an `oklch()` string; when the target is unreachable it returns the closest
 * extreme (L 0 or 1). Use it to derive readable brand accents / chart series.
 */
export interface EnsureContrastOptions {
  /** `oklch` (default, the historical output) or `hex` (`#rrggbb`: what canvas, MapLibre paint and the Go mirror consume). */
  format?: 'oklch' | 'hex'
}

export function ensureContrast(color: string, background: string, min: number = WCAG.text, options: EnsureContrastOptions = {}): string {
  const c = toRgba(color)
  const bg = toRgba(background)
  const [l0, ch, hue] = rgbToOklch(c.r, c.g, c.b)
  const hex = options.format === 'hex'
  const fmt = (l: number) => (hex ? toHex({ ...rgbOf(oklchToRgb(l, ch, hue)), a: 1 }) : `oklch(${l.toFixed(4)} ${ch.toFixed(4)} ${hue.toFixed(2)})`)
  // In hex mode the original colour is returned as is when it already passes (no OKLCH round trip noise).
  const first = hex ? toHex(c) : fmt(l0)
  if (contrastRatio(first, bg) >= min) return first
  const lighten = relativeLuminance(bg) < 0.18
  for (let i = 1; i <= 100; i++) {
    const l = lighten ? Math.min(1, l0 + i * 0.01) : Math.max(0, l0 - i * 0.01)
    const out = fmt(l)
    if (contrastRatio(out, bg) >= min || l === 0 || l === 1) return out
  }
  return fmt(lighten ? 1 : 0)
}

const rgbOf = ([r, g, b]: [number, number, number]) => ({ r, g, b })

/** Default candidates of `onColor`: pure white and pure black (the Go mirror `colorx` uses the same). */
export const ON_LIGHT = '#ffffff'
export const ON_DARK = '#000000'

export interface OnColorOptions {
  /** Text colour for dark backgrounds (default `#ffffff`). */
  light?: string
  /** Text colour for light backgrounds (default `#000000`). */
  dark?: string
  /** Minimum WCAG contrast (default 4.5, AA normal text; pass 3 for large text / icons). */
  min?: number
}

/**
 * The text colour (`light` or `dark`) with the higher contrast on `bg`, as `#rrggbb`. When neither reaches `min` (custom
 * candidates that are too close to `bg`) the better one goes through `ensureContrast` (OKLCH lightness in steps of 0.01,
 * returned as `oklch()`). With the default candidates the result is always ≥ 4.5 (in fact ≥ 4.58).
 * A translucent `bg` is flattened over white first; an unparsable one yields `light`. Ties go to `light`. The single decision point of
 * "which text goes on this colour": every component that paints colour over data colour calls it.
 */
export function onColor(bg: string | Rgba, options: OnColorOptions = {}): string {
  const { light = ON_LIGHT, dark = ON_DARK, min = WCAG.text } = options
  const parsed = typeof bg === 'string' ? parseColor(bg) : bg
  const l = parseColor(light)
  const d = parseColor(dark)
  if (!parsed || !l || !d) return light
  const base = composite(parsed, { r: 1, g: 1, b: 1, a: 1 })
  const rl = contrastRatio(l, base)
  const rd = contrastRatio(d, base)
  const bestRgba = rl >= rd ? l : d
  if (Math.max(rl, rd) >= min) return toHex(bestRgba)
  return ensureContrast(toHex(bestRgba), toHex(base), min)
}

/**
 * Backing for a mark (logo, glyph) of colour `fg`: the candidate with the highest contrast against it (ties and
 * unparsable candidates: the first / skipped), returned as given; `undefined` when none parses. With `min` the list is
 * a preference order instead: the first candidate that reaches `min` (e.g. 3, WCAG 1.4.11 non-text) wins, so a brand
 * colour that already shows the logo beats a neutral that shows it better; below `min` everywhere the best one wins.
 */
export function pickBacking(fg: string | Rgba, candidates: ReadonlyArray<string>, min?: number): string | undefined {
  let best: string | undefined
  let bestRatio = -1
  for (const c of candidates) {
    const p = parseColor(c)
    if (!p) continue
    const r = contrastRatio(fg, composite(p, { r: 1, g: 1, b: 1, a: 1 }))
    if (min !== undefined && r >= min) return c
    if (r > bestRatio) {
      best = c
      bestRatio = r
    }
  }
  return best
}

/** Picks whichever of `candidates` contrasts most with `background`. */
export function mostReadable(background: string | Rgba, candidates: string[]): string {
  let best = candidates[0]!
  let bestRatio = -1
  for (const c of candidates) {
    const r = contrastRatio(c, background)
    if (r > bestRatio) {
      best = c
      bestRatio = r
    }
  }
  return best
}
