import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio, ensureContrast, onColor, parseColor, pickBacking, toHex } from './contrast.js'
import { clearImageToneCache, imageTone, toneOfPixels } from './image-tone.js'

const vectors = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../contrast-vectors.json'), 'utf8')) as {
  onColor: Array<{ bg: string; min: number; expect: string; ratio: number }>
  ensureContrast: Array<{ fg: string; bg: string; min: number; expect: string; ratio: number }>
  pickBacking: Array<{ fg: string; candidates: string[]; expect: string; ratio: number }>
}

/** A background flattened over white (the rule shared with the Go mirror). */
const opaque = (c: string) => {
  const p = parseColor(c)!
  return { r: p.r * p.a + (1 - p.a), g: p.g * p.a + (1 - p.a), b: p.b * p.a + (1 - p.a), a: 1 }
}

describe('conformance vectors (shared with the Go mirror colorx)', () => {
  it.each(vectors.onColor)('onColor($bg, min $min) = $expect', (v) => {
    const out = onColor(v.bg, { min: v.min })
    expect(out).toBe(v.expect)
    expect(Math.abs(contrastRatio(out, opaque(v.bg)) - v.ratio)).toBeLessThanOrEqual(0.01)
  })
  it.each(vectors.ensureContrast)('ensureContrast($fg on $bg, min $min)', (v) => {
    const out = ensureContrast(v.fg, v.bg, v.min)
    expect(out).toBe(v.expect)
    expect(Math.abs(contrastRatio(out, v.bg) - v.ratio)).toBeLessThanOrEqual(0.01)
  })
  it.each(vectors.pickBacking)('pickBacking($fg, $candidates) = $expect', (v) => {
    const out = pickBacking(v.fg, v.candidates)
    expect(out).toBe(v.expect)
    expect(Math.abs(contrastRatio(v.fg, out!) - v.ratio)).toBeLessThanOrEqual(0.01)
  })
})

describe('contrast ratios (WCAG 2.x)', () => {
  it.each([
    ['#ffffff', '#2f7fd6', 4.1],
    ['#ffffff', '#ec4899', 3.54],
    ['#ffffff', '#e8a317', 2.12],
    ['#000000', '#e8a317', 9.7],
    ['#000000', '#2f7fd6', 5.1],
    ['#ffffff', '#767676', 4.54],
    ['#ffffff', '#777777', 4.48],
    ['#000000', '#ffffff', 21],
  ])('%s on %s = %f', (fg, bg, ratio) => {
    expect(contrastRatio(fg, bg)).toBeCloseTo(ratio, 1)
  })
  it('the problem colours get a text with >= 4.5:1 (white on pink/amber would not)', () => {
    for (const bg of ['#ec4899', '#e8a317', '#2f7fd6', '#808080', '#777777', '#ff0000']) {
      expect(contrastRatio(onColor(bg), bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(onColor('#e8a317')).toBe('#000000')
    expect(onColor('#ec4899')).toBe('#000000')
  })
})

/** mulberry32: deterministic PRNG so a failure is reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('onColor guarantees', () => {
  it('reaches 4.5:1 on 1000 seeded random colours (hex, rgb and hsl)', () => {
    const r = rng(20260519)
    for (let i = 0; i < 1000; i++) {
      const [x, y, z] = [r(), r(), r()].map((v) => Math.floor(v * 256)) as [number, number, number]
      const bg = i % 3 === 0 ? `rgb(${x} ${y} ${z})` : i % 3 === 1 ? `hsl(${x * 1.4} ${(y / 255) * 100}% ${(z / 255) * 100}%)` : toHex({ r: x / 255, g: y / 255, b: z / 255, a: 1 })
      expect(contrastRatio(onColor(bg), bg), bg).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('custom candidates too close to the background are adjusted until min', () => {
    const out = onColor('#808080', { light: '#909090', dark: '#707070', min: 4.5 })
    expect(contrastRatio(out, '#808080')).toBeGreaterThanOrEqual(4.5)
  })
  it('an unparsable background yields the light candidate', () => {
    expect(onColor('not a colour')).toBe('#ffffff')
  })
  it('ensureContrast in hex format returns #rrggbb that meets min', () => {
    const out = ensureContrast('#ffcc00', '#ffffff', 4.5, { format: 'hex' })
    expect(out).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(out, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('pickBacking for logos', () => {
  const brand = '#2f7fd6'
  const dark = '#1f2937'
  const light = '#ffffff'
  it('white logo: brand blue wins with preference order + min 3', () => {
    expect(pickBacking('#ffffff', [brand, dark, light], 3)).toBe(brand)
  })
  it('black logo: brand still shows it (5.1:1)', () => {
    expect(pickBacking('#000000', [brand, dark, light], 3)).toBe(brand)
  })
  it('logo the colour of the brand: falls to the neutral that shows it', () => {
    expect(pickBacking(brand, [brand, dark, light], 3)).toBe(dark)
  })
  it('mid grey logo: a neutral that reaches 3:1', () => {
    const out = pickBacking('#808080', ['#777777', dark, light], 3)!
    expect(contrastRatio('#808080', out)).toBeGreaterThanOrEqual(3)
  })
  it('without min: highest contrast, ties first, unparsable skipped', () => {
    expect(pickBacking('#ffffff', ['nope', '#000000', '#111111'])).toBe('#000000')
    expect(pickBacking('#ffffff', ['nope'])).toBeUndefined()
  })
})

describe('imageTone', () => {
  const rgba = (px: number[][]) => Uint8ClampedArray.from(px.flat())
  it('white logo on transparency: light, coverage ignores transparent pixels', () => {
    const t = toneOfPixels(rgba([[255, 255, 255, 255], [0, 0, 0, 0], [255, 255, 255, 200], [9, 9, 9, 40]]), 4, 1)
    expect(t).toMatchObject({ color: '#ffffff', tone: 'light', coverage: 0.5, aspect: 4 })
  })
  it('black logo: dark; mid grey: mid; fully transparent: unknown', () => {
    expect(toneOfPixels(rgba([[0, 0, 0, 255]]), 1, 1)).toMatchObject({ tone: 'dark' })
    expect(toneOfPixels(rgba([[128, 128, 128, 255]]), 1, 1)).toMatchObject({ tone: 'mid' })
    expect(toneOfPixels(rgba([[5, 5, 5, 0]]), 1, 1)).toBe('unknown')
  })
  const fakeCanvas = (bytes: Uint8ClampedArray, taint = false) => () => ({
    getContext: () => ({
      drawImage: () => undefined,
      getImageData: () => {
        if (taint) throw new DOMException('tainted', 'SecurityError')
        return { data: bytes }
      },
    }),
  })
  it('simulated ImageBitmap (300x64 white): light, aspect of the source', async () => {
    const bmp = { width: 300, height: 64 } as ImageBitmap
    const t = await imageTone(bmp, { createCanvas: fakeCanvas(rgba([[255, 255, 255, 255], [255, 255, 255, 255]])) })
    expect(t).toMatchObject({ tone: 'light', color: '#ffffff' })
    expect((t as { aspect: number }).aspect).toBeCloseTo(4.6875, 3)
  })
  it('CORS failure (tainted canvas or image that does not load) is unknown, never a throw', async () => {
    expect(await imageTone({ width: 10, height: 10 } as ImageBitmap, { createCanvas: fakeCanvas(rgba([[1, 1, 1, 255]]), true) })).toBe('unknown')
    clearImageToneCache()
    expect(await imageTone('https://cdn.example/x.png', { loadImage: () => Promise.reject(new Error('cors')) })).toBe('unknown')
  })
  it('caches per URL', async () => {
    clearImageToneCache()
    let calls = 0
    const loadImage = async () => {
      calls++
      return { width: 2, height: 2 }
    }
    const o = { loadImage, createCanvas: fakeCanvas(rgba([[0, 0, 0, 255]])) }
    await imageTone('https://cdn.example/a.png', o)
    await imageTone('https://cdn.example/a.png', o)
    expect(calls).toBe(1)
  })
})
