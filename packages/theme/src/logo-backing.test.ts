import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast.js'
import { logoBacking, toneOfPixels, type ImageTone, type ImageToneInfo } from './image-tone.js'

const here = dirname(fileURLToPath(import.meta.url))

function decodePng(buf: Uint8Array): { width: number; height: number; data: Uint8ClampedArray } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let pos = 8
  let width = 0
  let height = 0
  let channels = 4
  const idat: Uint8Array[] = []
  while (pos < buf.length) {
    const len = dv.getUint32(pos)
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8))
    const body = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = dv.getUint32(pos + 8)
      height = dv.getUint32(pos + 12)
      if (body[8] !== 8 || (body[9] !== 6 && body[9] !== 2) || body[12] !== 0) throw new Error('unsupported PNG')
      channels = body[9] === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(body)
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)] as number
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x] as number
      const a = x >= channels ? (out[y * stride + x - channels] as number) : 0
      const b = y > 0 ? (out[(y - 1) * stride + x] as number) : 0
      const c = x >= channels && y > 0 ? (out[(y - 1) * stride + x - channels] as number) : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      out[y * stride + x] = (v + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth)) & 255
    }
  }
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = out[i * channels] as number
    data[i * 4 + 1] = out[i * channels + 1] as number
    data[i * 4 + 2] = out[i * channels + 2] as number
    data[i * 4 + 3] = channels === 4 ? (out[i * 4 + 3] as number) : 255
  }
  return { width, height, data }
}

const bytes = (px: number[][]) => {
  const out: number[] = []
  for (const [r, g, b, a, n] of px) for (let i = 0; i < (n as number); i++) out.push(r!, g!, b!, a!)
  return Uint8ClampedArray.from(out)
}
const tone = (px: number[][]): ImageToneInfo => {
  const d = bytes(px)
  const t = toneOfPixels(d, d.length / 4, 1)
  if (t === 'unknown') throw new Error('unknown')
  return t
}
const NAVY_ORANGE = [[0, 26, 77, 255, 500], [255, 102, 0, 255, 450]]

type Vec = { name: string; pixels: number[][]; brand?: string; expect: Record<string, unknown> & { fill: string; ring?: string; dominant?: Array<{ color: string; weight: number }> } }
const vectors = JSON.parse(readFileSync(resolve(here, '../logo-backing-vectors.json'), 'utf8')) as { cases: Vec[] }

describe('logo-backing-vectors.json (spec shared with the Go mirror)', () => {
  it.each(vectors.cases)('$name', (v) => {
    const d = bytes(v.pixels)
    const t = toneOfPixels(d, d.length / 4, 1)
    if (t === 'unknown') {
      expect(v.expect.tone).toBe('unknown')
      expect(logoBacking(t, v.brand).fill).toBe(v.expect.fill)
      return
    }
    expect(t.lightShare).toBeCloseTo(v.expect.lightShare as number, 3)
    expect(t.darkShare).toBeCloseTo(v.expect.darkShare as number, 3)
    expect(t.midShare).toBeCloseTo(v.expect.midShare as number, 3)
    expect(t.dominant.map((x) => x.color)).toEqual(v.expect.dominant!.map((x) => x.color))
    t.dominant.forEach((x, i) => expect(x.weight).toBeCloseTo(v.expect.dominant![i]!.weight, 3))
    const r = logoBacking(t, v.brand)
    expect(r.fill).toBe(v.expect.fill)
    expect(r.ring).toBe(v.expect.ring)
  })
})

describe('logoBacking rule', () => {
  it('white logo: brand or dark fill, never a white plate', () => {
    expect(logoBacking(tone([[255, 255, 255, 255, 100]]), '#2f7fd6')).toEqual({ fill: '#2f7fd6' })
    expect(logoBacking(tone([[255, 255, 255, 255, 100]]), '#ffee00').fill).toBe('#1f2937')
  })
  it('black logo: light plate ringed in the brand colour (not the brand fill)', () => {
    expect(logoBacking(tone([[0, 0, 0, 255, 100]]), '#2f7fd6')).toEqual({ fill: '#ffffff', ring: '#2f7fd6' })
  })
  it('navy + orange with an orange brand: light plate, orange ring, NEVER an orange fill', () => {
    const t = tone(NAVY_ORANGE)
    expect(t.lightShare).toBeLessThan(0.6)
    expect(logoBacking(t, '#ff6600')).toEqual({ fill: '#ffffff', ring: '#ff6600' })
  })
  it('the mean is not the decision: the dominant colours are navy and orange, not their blend', () => {
    expect(tone(NAVY_ORANGE).dominant.map((d) => d.color)).toEqual(['#001144', '#ff6600'])
  })
  it('whatever the fill, every dominant colour is separated by >= 3:1 when some candidate can', () => {
    for (const px of [[[200, 16, 46, 255, 500], [0, 0, 0, 255, 450]], [[255, 255, 255, 255, 10]]]) {
      const t = tone(px)
      const { fill } = logoBacking(t, '#2f7fd6')
      for (const d of t.dominant) expect(contrastRatio(d.color, fill)).toBeGreaterThanOrEqual(3)
    }
  })
  it('unknown tone: neutral grey', () => {
    expect(logoBacking('unknown' as ImageTone, '#ff6600')).toEqual({ fill: '#767676' })
  })
})

describe('real logo: ProtekAuto (256 px sample of the production PNG)', () => {
  const png = decodePng(readFileSync(resolve(here, '__fixtures__/protekauto-256.png')))
  const t = toneOfPixels(png.data, png.width, png.height) as ImageToneInfo
  it('is two-coloured: navy and orange dominate', () => {
    const colors = t.dominant.map((d) => d.color)
    expect(colors.some((c) => contrastRatio(c, '#001a4d') < 1.5)).toBe(true)
    expect(colors.some((c) => contrastRatio(c, '#ff6600') < 1.5)).toBe(true)
  })
  it('with the orange brand it gets a light plate ringed in orange, not an orange fill', () => {
    expect(logoBacking(t, '#ff6600')).toEqual({ fill: '#ffffff', ring: '#ff6600' })
  })
})

describe('real logos (rasterised fixtures, brand colours of production)', () => {
  const load = (f: string) => {
    const png = decodePng(readFileSync(resolve(here, '__fixtures__', f)))
    return toneOfPixels(png.data, png.width, png.height) as ImageToneInfo
  }
  it('7 Leguas (red + near-black): light plate ringed in the brand red, black outline stays visible', () => {
    const r = logoBacking(load('7leguas-256.png'), '#d00d14')
    expect(r).toEqual({ fill: '#ffffff', ring: '#d00d14' })
  })
  it('Hub (pink gradient, brand #ec4899): light plate, pink ring; the pinks read on white (>= 3:1)', () => {
    const t = load('hub-256.png')
    const r = logoBacking(t, '#ec4899')
    expect(r).toEqual({ fill: '#ffffff', ring: '#ec4899' })
    for (const d of t.dominant) expect(contrastRatio(d.color, '#ffffff')).toBeGreaterThanOrEqual(3)
  })
  it('ProtekAuto: light plate, orange ring', () => {
    expect(logoBacking(load('protekauto-256.png'), '#ff6600')).toEqual({ fill: '#ffffff', ring: '#ff6600' })
  })
  it("God's Nutrition (white wordmark, brand blue): brand fill", () => {
    expect(logoBacking(load('gods-300.png'), '#2f7fd6')).toEqual({ fill: '#2f7fd6' })
  })
})

describe('paper and fallback tie-break', () => {
  it('white fill of a non-light logo is paper: red + black + white stays on the plate', () => {
    expect(logoBacking(tone([[200, 16, 46, 255, 400], [255, 255, 255, 255, 300], [0, 0, 0, 255, 300]]), '#c8102e')).toEqual({ fill: '#ffffff', ring: '#c8102e' })
  })
  it('a light logo does not treat white as paper (white wordmark needs a dark or brand ground)', () => {
    expect(logoBacking(tone([[255, 255, 255, 255, 100]])).fill).toBe('#1f2937')
  })
  it('dark neutral only wins the fallback by >= 0.5 of minimum contrast', () => {
    expect(logoBacking(tone([[0, 0, 0, 255, 500], [224, 224, 224, 255, 450]])).fill).toBe('#ffffff')
    expect(logoBacking(tone([[204, 204, 204, 255, 500]]), '#ff6600').fill).toBe('#1f2937')
  })
})
