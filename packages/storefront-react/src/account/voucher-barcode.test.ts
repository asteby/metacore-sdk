import { describe, expect, it } from 'vitest'
import { barcodeGeometry, barcodeModules, code128Modules, code39Modules, CODE39_PATTERNS, ean13Modules, itfModules, voucherOf } from './voucher.js'

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

describe('ITF (Interleaved 2 of 5)', () => {
  it('"12" is start 1010, 1 in the bars interleaved with 2 in the spaces, stop 11101 (worked by hand)', () => {
    // 1 = wnnnw (bars), 2 = nwnnw (spaces): 111 0 1 000 1 0 1 0 111 000
    expect(itfModules('12')).toBe('1010' + '111010001010111000' + '11101')
  })
  it('has 4 + 18 per pair + 5 modules, and odd or non-digit values cannot be encoded', () => {
    expect(itfModules('1234567890')).toHaveLength(4 + 5 * 18 + 5)
    expect(itfModules('123')).toBeNull()
    expect(itfModules('12a4')).toBeNull()
    expect(itfModules('')).toBeNull()
  })
})

describe('EAN-13', () => {
  it('4006381333931 (the Wikipedia example) matches the L/G/R tables', () => {
    expect(ean13Modules('4006381333931')).toBe(
      '101' + ['0001101', '0100111', '0101111', '0111101', '0001001', '0110011'].join('') + '01010' + ['1000010', '1000010', '1000010', '1110100', '1000010', '1100110'].join('') + '101',
    )
    expect(ean13Modules('4006381333931')).toHaveLength(95)
  })
  it('refuses a wrong check digit, a wrong length or letters', () => {
    expect(ean13Modules('4006381333932')).toBeNull()
    expect(ean13Modules('400638133393')).toBeNull()
    expect(ean13Modules('40063813339a1')).toBeNull()
  })
})

describe('voucherOf: barcode_data is authoritative when present', () => {
  const money = { amount: '10.00', currency_code: 'MXN' }
  const of = (payment: Record<string, unknown>) =>
    voucherOf({ expires_at: null, total: money, payment: { method: 'oxxo', reference: 'REF1', barcode: null, clabe: null, expires_at: null, amount: money, ...payment } as never })!
  it('draws what barcode_data names, ITF and EAN-13 included', () => {
    expect(of({ barcode_data: { format: 'itf', value: '1234' } })).toMatchObject({ barcode: '1234', barcode_format: 'itf', barcode_text: null })
    expect(of({ barcode_data: { format: 'ean13', value: '4006381333931' } })).toMatchObject({ barcode_format: 'ean13' })
  })
  it('null barcode_data: no bars, the legacy string is shown as text', () => {
    expect(of({ barcode: '9988', barcode_data: null })).toMatchObject({ barcode: null, barcode_format: null, barcode_text: '9988' })
  })
  it('a format we cannot draw or a value that does not fit: no bars, value as text', () => {
    expect(of({ barcode: '9988', barcode_data: { format: 'qr', value: '9988' } })).toMatchObject({ barcode: null, barcode_text: '9988' })
    expect(of({ barcode_data: { format: 'ean13', value: '4006381333932' } })).toMatchObject({ barcode: null, barcode_text: '4006381333932' })
  })
  it('without the key (old server) a string barcode is Code 128 and there is no text', () => {
    expect(of({ barcode: '9988' })).toMatchObject({ barcode: '9988', barcode_format: 'code128', barcode_text: null })
  })
  it('text equal to the reference is not repeated', () => {
    expect(of({ barcode: 'REF1', barcode_data: null }).barcode_text).toBeNull()
  })
  it('instructions_key loses its prefix and other becomes generic', () => {
    expect(of({ instructions_key: 'payment.voucher.instructions.oxxo' }).instructions_key).toBe('oxxo')
    expect(of({ instructions_key: 'payment.voucher.instructions.other' }).instructions_key).toBe('generic')
    expect(of({ instructions_key: 'spei' }).instructions_key).toBe('spei')
  })
  it('kind: oxxo cash, spei transfer, other generic; paycash and bancomer are cash', () => {
    expect(of({ kind: 'oxxo', method: 'x' }).kind).toBe('cash')
    expect(of({ kind: 'spei', method: 'x' }).kind).toBe('transfer')
    expect(of({ kind: 'other', method: 'zzz' }).kind).toBe('generic')
    expect(of({ method: 'paycash' }).kind).toBe('cash')
    expect(of({ method: 'bancomer' }).kind).toBe('cash')
  })
  it('ticket_url wins over voucher_url; only https', () => {
    expect(of({ ticket_url: 'https://a.mx/t', voucher_url: 'https://b.mx/v' }).ticket_url).toBe('https://a.mx/t')
    expect(of({ ticket_url: null, voucher_url: 'https://b.mx/v' }).ticket_url).toBe('https://b.mx/v')
    expect(of({ ticket_url: 'javascript:alert(1)', voucher_url: 'http://b.mx/v' }).ticket_url).toBeNull()
  })
})
