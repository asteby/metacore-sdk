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
  barcode: string | null
  clabe: string | null
  expires_at: string | null
  amount: Money | null
  instructions: string | null
}

const MAX = 256

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
  const v: VoucherView = {
    method: text(pay.method ?? pay.provider),
    reference: text(pay.reference),
    barcode: text(pay.barcode),
    clabe: text(pay.clabe),
    expires_at: text(pay.expires_at) ?? text(p?.expires_at),
    amount: moneyOf(pay.amount) ?? moneyOf(p?.total),
    instructions: text(pay.instructions),
  }
  return v.reference || v.barcode || v.clabe ? v : null
}

/** The value the barcode encodes: the gateway's `barcode`, else the reference of an OXXO voucher. */
export function barcodeValue(v: Pick<VoucherView, 'barcode' | 'method' | 'reference'>): string | null {
  return v.barcode ?? (v.method?.toLowerCase() === 'oxxo' ? v.reference : null)
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

export type BarcodeGeometry = { width: number; height: number; rects: { x: number; w: number }[] }

/** Bars of the barcode as rectangles (quiet zone of 10 modules each side included in `width`). `null` if not encodable. */
export function barcodeGeometry(value: string, opts: { module?: number; height?: number } = {}): BarcodeGeometry | null {
  const bits = code128Modules(value)
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
