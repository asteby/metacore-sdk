/**
 * Tone of a raster image (a logo): the mean colour of its opaque pixels, so a consumer can choose a backing that makes it
 * visible (`pickBacking`) instead of assuming a white or dark page. Runs in the browser (canvas); every failure mode is a
 * value, never an exception: `'unknown'` means "could not measure" and the consumer paints a neutral backing with a border.
 *
 * Failure modes that map to `'unknown'`: no DOM / canvas (SSR, tests), the image host sends no CORS headers (the canvas is
 * tainted and `getImageData` throws, or the CORS request itself fails), the URL does not load, or the image has no
 * opaque pixel at all.
 */
import { contrastRatio, parseColor, relativeLuminance, toHex, type Rgba } from './contrast.js'

export interface DominantColor {
  /** Bucket centre `#rrggbb` (each 4-bit channel value q maps to q * 17). */
  color: string
  /** Fraction (0..1) of the opaque pixels in the bucket. */
  weight: number
}

export interface ImageToneInfo {
  /** Mean colour of the opaque pixels, `#rrggbb`. */
  color: string
  /** WCAG relative luminance of `color` (0..1). */
  luminance: number
  /** `light` (luminance >= 0.6), `dark` (<= 0.2), else `mid`: same classes as the Go mirror. */
  tone: 'light' | 'dark' | 'mid'
  /** Fraction (0..1) of pixels that are opaque (alpha > 40): a thin white wordmark on transparency is ~0.1. */
  coverage: number
  /** Share (0..1) of opaque pixels with relative luminance >= 0.6 (light marks). */
  lightShare: number
  /** Share of opaque pixels with luminance <= 0.2. */
  darkShare: number
  /** Share of the rest (0.2 < luminance < 0.6). `lightShare + darkShare + midShare = 1`. */
  midShare: number
  /** Up to 3 dominant colours (4-bit-per-channel buckets, weight >= 0.05), heaviest first. The mean `color` is a blend: decide with these. */
  dominant: DominantColor[]
  /** Width / height of the source (a 300x64 banner logo is 4.69). */
  aspect: number
}

/** `'unknown'` when the image could not be measured. */
export type ImageTone = ImageToneInfo | 'unknown'

/** Longest side of the sampling grid (same bound as the Go mirror). */
export const IMAGE_TONE_SAMPLE = 256
/** Alpha (0..255) above which a pixel counts as part of the mark; pixels at or below are ignored. */
export const OPAQUE_ALPHA = 40
export const TONE_LIGHT = 0.6
export const TONE_DARK = 0.2
/** A dominant colour is kept when its bucket holds at least this share of the opaque pixels. */
export const DOMINANT_MIN_WEIGHT = 0.05
export const DOMINANT_MAX = 3
const CACHE_MAX = 300

/** Pure part: tone of RGBA bytes (`width` x `height`). Averages in gamma-encoded sRGB, weighting each opaque pixel equally. */
export function toneOfPixels(data: ArrayLike<number>, width: number, height: number): ImageTone {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  let light = 0
  let dark = 0
  const buckets = new Map<number, number>()
  const total = Math.floor(data.length / 4)
  for (let i = 0; i < total; i++) {
    if ((data[i * 4 + 3] as number) <= OPAQUE_ALPHA) continue
    r += data[i * 4] as number
    g += data[i * 4 + 1] as number
    b += data[i * 4 + 2] as number
    n++
    const lum = relativeLuminance({ r: (data[i * 4] as number) / 255, g: (data[i * 4 + 1] as number) / 255, b: (data[i * 4 + 2] as number) / 255, a: 1 })
    if (lum >= TONE_LIGHT) light++
    else if (lum <= TONE_DARK) dark++
    const key = (((data[i * 4] as number) >> 4) << 8) | (((data[i * 4 + 1] as number) >> 4) << 4) | ((data[i * 4 + 2] as number) >> 4)
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  if (n === 0 || !(width > 0) || !(height > 0)) return 'unknown'
  const rgba: Rgba = { r: r / n / 255, g: g / n / 255, b: b / n / 255, a: 1 }
  const luminance = relativeLuminance(rgba)
  const h = (v: number) => (v * 17).toString(16).padStart(2, '0')
  const dominant = [...buckets]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .filter(([, c]) => c / n >= DOMINANT_MIN_WEIGHT)
    .slice(0, DOMINANT_MAX)
    .map(([k, c]) => ({ color: `#${h(k >> 8)}${h((k >> 4) & 15)}${h(k & 15)}`, weight: c / n }))
  return { color: toHex(rgba), luminance, lightShare: light / n, darkShare: dark / n, midShare: (n - light - dark) / n, dominant, tone: luminance >= TONE_LIGHT ? 'light' : luminance <= TONE_DARK ? 'dark' : 'mid', coverage: n / total, aspect: width / height }
}

/** Anything `drawImage` accepts that has a known size. */
export type ToneSource = string | ImageBitmap | HTMLImageElement | HTMLCanvasElement

export interface ImageToneOptions {
  /** Canvas factory (tests, workers). Default: `OffscreenCanvas`, else a `<canvas>` element. */
  createCanvas?: (w: number, h: number) => { getContext: (type: '2d', opts?: unknown) => unknown }
  /** Image loader for URL sources (tests). Default: `new Image()` with `crossOrigin='anonymous'`, no referrer. */
  loadImage?: (url: string) => Promise<ToneSourceImage>
}

type ToneSourceImage = { width: number; height: number } & object

const cache = new Map<string, Promise<ImageTone>>()

function defaultCanvas(w: number, h: number) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof document === 'undefined') throw new Error('no canvas')
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function defaultLoad(url: string): Promise<ToneSourceImage> {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') return reject(new Error('no Image'))
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed'))
    img.src = url
  })
}

function measure(src: ToneSourceImage, o: ImageToneOptions): ImageTone {
  try {
    const sw = (src as { naturalWidth?: number }).naturalWidth || src.width
    const sh = (src as { naturalHeight?: number }).naturalHeight || src.height
    if (!(sw > 0) || !(sh > 0)) return 'unknown'
    const k = Math.min(1, IMAGE_TONE_SAMPLE / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * k))
    const h = Math.max(1, Math.round(sh * k))
    const canvas = (o.createCanvas ?? defaultCanvas)(w, h)
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | { drawImage: (...a: unknown[]) => void; getImageData: (x: number, y: number, w: number, h: number) => { data: ArrayLike<number> } }
      | null
    if (!ctx) return 'unknown'
    ctx.drawImage(src, 0, 0, w, h)
    const tone = toneOfPixels(ctx.getImageData(0, 0, w, h).data, w, h)
    // The aspect ratio is the source's, not the thumbnail's (rounding).
    return tone === 'unknown' ? tone : { ...tone, aspect: sw / sh }
  } catch {
    return 'unknown' // tainted canvas (SecurityError) or any canvas failure
  }
}

/**
 * Tone of a logo given as a URL or an already decoded image. URLs are cached (one measurement per URL, bounded; failures
 * are cached too, so a host without CORS is asked once). Never rejects.
 */
export function imageTone(source: ToneSource, options: ImageToneOptions = {}): Promise<ImageTone> {
  if (typeof source !== 'string') return Promise.resolve(measure(source as ToneSourceImage, options))
  const hit = cache.get(source)
  if (hit) return hit
  const p = (options.loadImage ?? defaultLoad)(source).then((img) => measure(img, options), () => 'unknown' as const)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(source, p)
  return p
}

/** Test helper: forget every cached measurement. */
export function clearImageToneCache(): void {
  cache.clear()
}

/** Backings a logo can sit on besides the brand colour. */
export const BACKING_DARK = '#1f2937'
/** Light plate: brand logos are designed for a light ground. */
export const BACKING_PLATE = '#ffffff'
/** Mid grey that shows both a white and a black mark at >= 4.5:1: used when the logo could not be measured. */
export const BACKING_UNKNOWN = '#767676'
/** Minimum contrast between EVERY dominant colour of a logo and its backing (WCAG 1.4.11, non-text). */
export const LOGO_MIN_CONTRAST = 3
/** A logo is "light" (wordmark in white) when at least this share of its opaque pixels has luminance >= 0.6. */
export const LIGHT_LOGO_SHARE = 0.6
/** In a logo that is not light, a dominant colour with luminance >= this is the logo's own paper (white fill), not a mark to separate. */
export const PAPER_LUMINANCE = 0.9
/** When nothing separates every mark, the dark neutral must beat the light plate by at least this contrast ratio to be chosen. */
export const DARK_FALLBACK_MARGIN = 0.5

export interface LogoBackingOptions {
  /** Dark neutral candidate (default `#1f2937`). */
  dark?: string
  /** Light plate (default `#ffffff`). */
  plate?: string
  /** Minimum contrast against every dominant colour (default 3). */
  min?: number
}

/** Fill of the logo's disc/pill and an optional thin ring (the brand colour) when the fill is a neutral plate. */
export interface LogoBackingResult {
  fill: string
  ring?: string
}

/**
 * The single rule that decides what a logo sits on. The backing must separate ALL the dominant colours of the logo
 * (>= `min`), never just their mean (navy + orange averages to a mid tone that matches nothing).
 *
 * 1. Tone not measurable (`'unknown'`): grey `#767676` (white and black marks both >= 4.5:1), no ring.
 * 2. Light logo (`lightShare` >= 0.6, e.g. a white wordmark): candidates [brand, dark]; the first that separates every
 *    dominant colour wins, else the one with the highest minimum contrast. No ring.
 * 3. Anything else (dark, coloured, multicolour): the marks to separate are the dominant colours WITHOUT the logo's own
 *    paper (luminance >= 0.9: the white fill of a brand logo drawn for a light ground). The light plate, ringed in the
 *    brand colour, if it separates every mark. Otherwise the brand colour as fill if it separates them all, otherwise
 *    the plate unless the dark neutral has a minimum contrast at least 0.5 higher (tie or small difference: plate).
 * A brand colour that does not parse is ignored. The ring is omitted when it equals the fill.
 */
export function logoBacking(tone: ImageTone, brand?: string, options: LogoBackingOptions = {}): LogoBackingResult {
  const { dark = BACKING_DARK, plate = BACKING_PLATE, min = LOGO_MIN_CONTRAST } = options
  if (tone === 'unknown') return { fill: BACKING_UNKNOWN }
  const all = tone.dominant.length ? tone.dominant.map((d) => d.color) : [tone.color]
  const light = tone.lightShare >= LIGHT_LOGO_SHARE
  const ink = all.filter((c) => relativeLuminance(c) < PAPER_LUMINANCE)
  const marks = light || !ink.length ? all : ink
  const b = brand && parseColor(brand) ? brand : undefined
  const worst = (bg: string) => Math.min(...marks.map((m) => contrastRatio(m, bg)))
  const separates = (bg: string) => worst(bg) >= min
  const best = (cands: string[]) => cands.reduce((a, c) => (worst(c) > worst(a) ? c : a))
  if (light) {
    const cands = b ? [b, dark] : [dark]
    return { fill: cands.find(separates) ?? best(cands) }
  }
  const ring = (fill: string) => (b && b.toLowerCase() !== fill.toLowerCase() ? { ring: b } : {})
  if (separates(plate)) return { fill: plate, ...ring(plate) }
  if (b && separates(b)) return { fill: b }
  const fill = worst(dark) >= worst(plate) + DARK_FALLBACK_MARGIN ? dark : plate
  return { fill, ...ring(fill) }
}
