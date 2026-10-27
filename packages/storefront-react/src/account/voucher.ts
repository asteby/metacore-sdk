/**
 * Pure pieces of the cash voucher (OXXO, SPEI, deposit): the normalized `VoucherView` of a `PendingPayment` and the
 * Code 128 barcode (the one cashiers' readers scan). No React, no DOM: the same code draws the barcode in the page
 * (`<Barcode>`) and in the printable document (`voucher-document.ts`, loaded only when the buyer prints).
 */
import type { Money, PendingPayment } from '@asteby/storefront'

export type VoucherView = {
  /** `oxxo`, `spei`, ... as the gateway publishes it. */
  method: string | null
  reference: string | null
  /** Value the barcode encodes, exactly as the server sent it. `null` when the server sent none (never inferred). */
  barcode: string | null
  /** Symbology of `barcode`; `null` when there is no barcode or its format is not one we can draw. */
  barcode_format: BarcodeFormat | null
  clabe: string | null
  /** SPEI / transfer: who receives the money and in which bank. */
  beneficiary: string | null
  bank: string | null
  /** What kind of document to print: cash at a store, bank transfer, or unknown (generic, no brand named). */
  kind: VoucherKind
  /** Server-chosen key of the instructions (`oxxo`, `spei`...); unknown keys fall back to the kind. */
  instructions_key: string | null
  expires_at: string | null
  amount: Money | null
  instructions: string | null
}

const MAX = 256

export type BarcodeFormat = 'code128' | 'code39'
export type VoucherKind = 'cash' | 'transfer' | 'generic'

const CASH_METHODS = new Set(['oxxo', 'cash', 'store', 'convenience_store', 'efectivo', 'bank_deposit', 'deposit', 'paynet', '7eleven', 'seven_eleven', 'farmacias_guadalajara', 'circle_k'])
const TRANSFER_METHODS = new Set(['spei', 'bank_transfer', 'transfer', 'wire', 'clabe'])

function formatOf(v: unknown): BarcodeFormat | null {
  const f = typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  if (f === 'code128' || f === 'c128' || f === 'code128b' || f === 'code128c') return 'code128'
  if (f === 'code39' || f === 'c39') return 'code39'
  return null
}

/** The barcode the server declared: `{ format, value }` (contract) or a bare string (older servers: Code 128). */
function barcodeOf(raw: unknown): { value: string; format: BarcodeFormat } | null {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const value = text(o.value)
    const format = formatOf(o.format ?? 'code128')
    return value && format ? { value, format } : null
  }
  const value = text(raw)
  return value ? { value, format: 'code128' } : null
}

function kindOf(kind: string | null, method: string | null, key: string | null): VoucherKind {
  for (const c of [kind, method, key]) {
    const k = c?.toLowerCase()
    if (!k) continue
    if (k === 'cash' || CASH_METHODS.has(k)) return 'cash'
    if (k === 'transfer' || TRANSFER_METHODS.has(k)) return 'transfer'
  }
  return 'generic'
}

const digits = (s: string | null) => (s ? s.replace(/\D/g, '') : '')

function text(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, MAX)
  return s || null
}

function moneyOf(v: unknown): Money | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  const amount = text(m.amount)
  const cur = text(m.currency_code)
  return amount && cur && Number.isFinite(Number(amount)) ? { amount, currency_code: cur.toUpperCase() } : null
}

/** The voucher of a pending payment; `null` when it has neither reference, barcode nor CLABE (nothing to pay with). */
export function voucherOf(p: Pick<PendingPayment, 'payment' | 'total' | 'expires_at'> | null | undefined): VoucherView | null {
  const pay = p?.payment
  if (!pay || typeof pay !== 'object') return null
  // Fields the contract adds later are read defensively: an older SDK type does not declare them yet.
  const ext = pay as Record<string, unknown>
  const method = text(pay.method ?? pay.provider)
  const key = text(ext.instructions_key)
  const bc = barcodeOf(pay.barcode)
  const clabe = text(pay.clabe)
  let reference = text(pay.reference)
  // Some gateways publish the CLABE as the "reference" too: printing both reads as two different numbers.
  if (clabe && reference && digits(reference) === digits(clabe)) reference = null
  const v: VoucherView = {
    method,
    reference,
    barcode: bc?.value ?? null,
    barcode_format: bc?.format ?? null,
    clabe,
    beneficiary: text(ext.beneficiary),
    bank: text(ext.bank),
    kind: kindOf(text(ext.kind), method, key),
    instructions_key: key,
    expires_at: text(pay.expires_at) ?? text(p?.expires_at),
    amount: moneyOf(pay.amount) ?? moneyOf(p?.total),
    instructions: text(pay.instructions),
  }
  return v.reference || v.barcode || v.clabe ? v : null
}

/**
 * The value the barcode encodes: only what the server sent. A reference is NOT a barcode (an OXXO reference and its
 * scannable code differ), so without `barcode` nothing is drawn and the reference is shown as text.
 */
export function barcodeValue(v: Pick<VoucherView, 'barcode'>): string | null {
  return v.barcode
}

// 11-module patterns of symbols 0..105 and the 13-module stop (ISO/IEC 15417).
const BARS = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000', '11010011100',
]
const STOP = '1100011101011'

/**
 * Modules (`1` bar, `0` space) of the Code 128 of `value`: set C (digit pairs) when it is all digits of even length,
 * set B (printable ASCII) otherwise. `null` when it cannot be encoded.
 */
export function code128Modules(value: string): string | null {
  if (!value || value.length > 80) return null
  let codes: number[]
  if (/^\d+$/.test(value) && value.length % 2 === 0) {
    codes = [105]
    for (let i = 0; i < value.length; i += 2) codes.push(Number(value.slice(i, i + 2)))
  } else {
    codes = [104]
    for (const ch of value) {
      const c = ch.charCodeAt(0)
      if (c < 32 || c > 126) return null
      codes.push(c - 32)
    }
  }
  let sum = codes[0]!
  for (let i = 1; i < codes.length; i++) sum += codes[i]! * i
  codes.push(sum % 103)
  return codes.map((c) => BARS[c]).join('') + STOP
}

// Code 39: 9 elements per character (bar, space, bar...), 3 of them wide (3 modules, the rest 1). Per character, in
// order of `C39_CHARS`, the indices (0..8) of its wide elements. One narrow gap separates characters.
const C39_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. */+%$'
const C39_WIDE = '346038238023348034234368036236058258025458045245568056256456078278027478047247678067267467018128012148014124168016126146137157357135'
/** Code 39 patterns as `n`/`w` strings per character (exported for the tests). */
export const CODE39_PATTERNS: Record<string, string> = Object.fromEntries(
  [...C39_CHARS].map((ch, i) => [ch, [...Array(9).keys()].map((e) => (C39_WIDE.slice(i * 3, i * 3 + 3).includes(String(e)) ? 'w' : 'n')).join('')]),
)

/** Modules of the Code 39 of `value` (`*` start/stop added). `null` for lower case, `*` or anything outside its set. */
export function code39Modules(value: string): string | null {
  if (!value || value.length > 40) return null
  let out = ''
  for (const ch of `*${value}*`) {
    const p = Object.prototype.hasOwnProperty.call(CODE39_PATTERNS, ch) ? CODE39_PATTERNS[ch] : undefined
    if (!p || (ch === '*' && value.includes('*'))) return null
    for (let i = 0; i < 9; i++) out += (i % 2 === 0 ? '1' : '0').repeat(p[i] === 'w' ? 3 : 1)
    out += '0'
  }
  return out.slice(0, -1)
}

/** Modules of `value` in the given symbology. */
export function barcodeModules(value: string, format: BarcodeFormat = 'code128'): string | null {
  return format === 'code39' ? code39Modules(value) : code128Modules(value)
}

export type BarcodeGeometry = { width: number; height: number; rects: { x: number; w: number }[] }

/** Bars of the barcode as rectangles (quiet zone of 10 modules each side included in `width`). `null` if not encodable. */
export function barcodeGeometry(value: string, opts: { module?: number; height?: number; format?: BarcodeFormat } = {}): BarcodeGeometry | null {
  const bits = barcodeModules(value, opts.format)
  if (!bits) return null
  const mod = opts.module ?? 2
  const quiet = 10
  const rects: { x: number; w: number }[] = []
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === '0') {
      i++
      continue
    }
    let j = i
    while (j < bits.length && bits[j] === '1') j++
    rects.push({ x: (quiet + i) * mod, w: (j - i) * mod })
    i = j
  }
  return { width: (bits.length + quiet * 2) * mod, height: opts.height ?? 70, rects }
}
