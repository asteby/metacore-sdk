/**
 * Tone of a raster image (a logo): the mean colour of its opaque pixels, so a consumer can choose a backing that makes it
 * visible (`pickBacking`) instead of assuming a white or dark page. Runs in the browser (canvas); every failure mode is a
 * value, never an exception: `'unknown'` means "could not measure" and the consumer paints a neutral backing with a border.
 *
 * Failure modes that map to `'unknown'`: no DOM / canvas (SSR, tests), the image host sends no CORS headers (the canvas is
 * tainted and `getImageData` throws, or the CORS request itself fails), the URL does not load, or the image has no
 * opaque pixel at all.
 */
import { toHex, relativeLuminance, type Rgba } from './contrast.js'

export interface ImageToneInfo {
  /** Mean colour of the opaque pixels, `#rrggbb`. */
  color: string
  /** WCAG relative luminance of `color` (0..1). */
  luminance: number
  /** `light` (luminance >= 0.6), `dark` (<= 0.2), else `mid`: same classes as the Go mirror. */
  tone: 'light' | 'dark' | 'mid'
  /** Fraction (0..1) of pixels that are opaque (alpha > 40): a thin white wordmark on transparency is ~0.1. */
  coverage: number
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
const CACHE_MAX = 300

/** Pure part: tone of RGBA bytes (`width` x `height`). Averages in gamma-encoded sRGB, weighting each opaque pixel equally. */
export function toneOfPixels(data: ArrayLike<number>, width: number, height: number): ImageTone {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const total = Math.floor(data.length / 4)
  for (let i = 0; i < total; i++) {
    if ((data[i * 4 + 3] as number) <= OPAQUE_ALPHA) continue
    r += data[i * 4] as number
    g += data[i * 4 + 1] as number
    b += data[i * 4 + 2] as number
    n++
  }
  if (n === 0 || !(width > 0) || !(height > 0)) return 'unknown'
  const rgba: Rgba = { r: r / n / 255, g: g / n / 255, b: b / n / 255, a: 1 }
  const luminance = relativeLuminance(rgba)
  return { color: toHex(rgba), luminance, tone: luminance >= TONE_LIGHT ? 'light' : luminance <= TONE_DARK ? 'dark' : 'mid', coverage: n / total, aspect: width / height }
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
