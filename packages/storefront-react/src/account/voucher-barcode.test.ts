import { describe, expect, it } from 'vitest'
import { barcodeGeometry, barcodeModules, code128Modules, code39Modules, CODE39_PATTERNS, voucherOf } from './voucher.js'

// Written independently of the implementation (ISO/IEC 15417 and 16388 tables, Wikipedia's worked examples).
const START_B = '11010010000'
const START_C = '11010011100'
const STOP = '1100011101011'

describe('Code 128', () => {
  it('PJJ123C (the textbook example) is start B, 7 symbols, checksum 55, stop', () => {
    const m = code128Modules('PJJ123C')!
    expect(m).toHaveLength(11 * 9 + 13)
    expect(m.startsWith(START_B)).toBe(true)
    expect(m.slice(-13)).toBe(STOP)
    // (104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7) mod 103 = 879 mod 103 = 55 -> symbol 55 = 11101000110
    expect(m.slice(-24, -13)).toBe('11101000110')
  })
  it('all-digit even strings use start C and pair the digits (18-digit OXXO-like reference)', () => {
    const m = code128Modules('646010349362032012')!
    expect(m.startsWith(START_C)).toBe(true)
    expect(m).toHaveLength(11 * (1 + 9 + 1) + 13)
  })
  it('known value of the SDK before this change', () => {
    expect(code128Modules('12345678')).toBe('1101001110010110011100100010110001110001011011000010100100011101101100011101011')
  })
  it('geometry merges adjacent bars and puts a quiet zone on both sides', () => {
    const g = barcodeGeometry('PJJ123C', { module: 1 })!
    expect(g.width).toBe(112 + 20)
    expect(g.rects[0]!.x).toBe(10)
    const last = g.rects[g.rects.length - 1]!
    expect(last.x + last.w).toBe(10 + 112)
    for (let i = 1; i < g.rects.length; i++) expect(g.rects[i]!.x).toBeGreaterThan(g.rects[i - 1]!.x + g.rects[i - 1]!.w)
  })
})

describe('Code 39', () => {
  it('every character has 9 elements, 3 of them wide, and the table has the 43 characters plus the star', () => {
    expect(Object.keys(CODE39_PATTERNS)).toHaveLength(44)
    for (const [ch, p] of Object.entries(CODE39_PATTERNS)) {
      expect(p, ch).toHaveLength(9)
      expect(p.split('').filter((e) => e === 'w'), ch).toHaveLength(3)
    }
  })
  it('matches published patterns (A, 1, 0, *, -)', () => {
    expect(CODE39_PATTERNS.A).toBe('wnnnnwnnw')
    expect(CODE39_PATTERNS['1']).toBe('wnnwnnnnw')
    expect(CODE39_PATTERNS['0']).toBe('nnnwwnwnn')
    expect(CODE39_PATTERNS['*']).toBe('nwnnwnwnn')
    expect(CODE39_PATTERNS['-']).toBe('nwnnnnwnw')
  })
  it('"A" is *A* with narrow gaps: 3 * 15 modules + 2', () => {
    const m = code39Modules('A')!
    expect(m).toHaveLength(47)
    expect(m.slice(0, 15)).toBe('1' + '000' + '1' + '0' + '111' + '0' + '111' + '0' + '1')
  })
  it('refuses lower case, the star and anything outside the set, without altering the data', () => {
    expect(code39Modules('abc')).toBeNull()
    expect(code39Modules('A*B')).toBeNull()
    expect(code39Modules('ñ')).toBeNull()
    expect(code39Modules('')).toBeNull()
    expect(barcodeModules('ABC-123', 'code39')).not.toBeNull()
    expect(barcodeGeometry('abc', { format: 'code39' })).toBeNull()
  })
})

describe('the barcode the server declares', () => {
  const base = { id: 'c', number: null, status: 'pending_payment', created_at: '', total: { amount: '1', currency_code: 'MXN' }, expires_at: null } as const
  const of = (payment: Record<string, unknown>) => voucherOf({ ...base, payment: { reference: '123', clabe: null, barcode: null, expires_at: null, amount: base.total, ...payment } } as never)!
  it('reads { format, value } and the legacy bare string (Code 128)', () => {
    expect(of({ method: 'oxxo', barcode: { format: 'code128', value: '0123456789' } })).toMatchObject({ barcode: '0123456789', barcode_format: 'code128' })
    expect(of({ method: 'oxxo', barcode: { format: 'CODE-39', value: 'ABC123' } })).toMatchObject({ barcode: 'ABC123', barcode_format: 'code39' })
    expect(of({ method: 'oxxo', barcode: '0123456789' })).toMatchObject({ barcode: '0123456789', barcode_format: 'code128' })
  })
  it('never invents bars: an OXXO reference without barcode, or a format we cannot draw, has none', () => {
    expect(of({ method: 'oxxo' })).toMatchObject({ barcode: null, barcode_format: null })
    expect(of({ method: 'oxxo', barcode: { format: 'qr', value: 'x' } })).toMatchObject({ barcode: null, barcode_format: null })
    expect(of({ method: 'oxxo', barcode: { format: 'code128' } })).toMatchObject({ barcode: null })
  })
})
