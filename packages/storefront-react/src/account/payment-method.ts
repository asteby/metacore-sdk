/**
 * The friendly name of how an order was paid. The server sends `family` (a short enum) and `method_label` (its own
 * text, which an older or English-locale server may fill with the provider's raw word: `Card`, `credit_card`, `oxxo`).
 * The buyer never reads a raw provider key: the label is built from the SDK's texts (es/en), extended by the store.
 */
import type { PaymentInfo } from '@asteby/storefront'
import type { AccountMessages } from './orders-messages.js'

export type PaymentMethodKey = 'card' | 'credit_card' | 'debit_card' | 'cash_voucher' | 'oxxo' | 'spei' | 'transfer' | 'bank_deposit' | 'wallet' | 'cash' | 'other'

const FAMILY: Record<string, PaymentMethodKey> = {
  card: 'card',
  credit_card: 'credit_card',
  debit_card: 'debit_card',
  cash_voucher: 'cash_voucher',
  oxxo: 'oxxo',
  spei: 'spei',
  transfer: 'transfer',
  bank_transfer: 'transfer',
  bank_deposit: 'bank_deposit',
  wallet: 'wallet',
  cash: 'cash',
  other: 'other',
}

/** Words of a provider's label, in order of specificity (debit before card, oxxo before voucher). */
const KEYWORDS: [RegExp, PaymentMethodKey][] = [
  [/oxxo/, 'oxxo'],
  [/spei/, 'spei'],
  [/d[eé]bit/, 'debit_card'],
  [/cr[eé]dit/, 'credit_card'],
  [/card|tarjeta/, 'card'],
  [/deposit|dep[oó]sito/, 'bank_deposit'],
  [/transfer/, 'transfer'],
  [/wallet|billetera|paypal|mercado ?pago|apple ?pay|google ?pay/, 'wallet'],
  [/voucher|ficha|convenience|conveniencia|store|tienda/, 'cash_voucher'],
  [/cash|efectivo/, 'cash'],
]

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', master: 'Mastercard', amex: 'American Express', american_express: 'American Express', carnet: 'Carnet', discover: 'Discover' }

/** A label that is a provider key or a bare English word, not a sentence a person wrote ("Tarjeta Visa terminada en 4242"). */
const RAW = /^[A-Za-z0-9_.:-]+(?: [A-Za-z0-9_.:-]+)?$/

function keyOf(p: PaymentInfo): PaymentMethodKey | null {
  const fam = typeof p.family === 'string' ? p.family.toLowerCase() : ''
  const byLabel = (): PaymentMethodKey | null => {
    const label = typeof p.method_label === 'string' ? p.method_label.toLowerCase().replace(/[_-]+/g, ' ') : ''
    for (const [re, key] of KEYWORDS) if (re.test(label)) return key
    return null
  }
  if (fam && fam !== 'other' && FAMILY[fam]) {
    // `card` family + a label that says credit/debit is more precise.
    const l = byLabel()
    return fam === 'card' && (l === 'credit_card' || l === 'debit_card') ? l : FAMILY[fam]!
  }
  return byLabel() ?? (fam === 'other' ? 'other' : null)
}

export type PaymentLabelOptions = {
  /** The store's own words for a payment (by organization, provider...). Return a string to use it; `null`/`undefined` falls through to the SDK's. */
  override?: (payment: PaymentInfo) => string | null | undefined
}

/**
 * `Tarjeta Visa •••• 1234`, `Efectivo con ficha (OXXO…)`, `Transferencia SPEI`… in the buyer's language. A label the
 * server already wrote as a sentence (it carries its own detail) is kept; a raw key becomes a readable text and never
 * shows as it came; with nothing to go on, a neutral "Medio de pago".
 */
export function paymentLabel(p: PaymentInfo, m: AccountMessages, options: PaymentLabelOptions = {}): string {
  const custom = options.override?.(p)
  if (typeof custom === 'string' && custom.trim()) return custom.trim()
  const raw = typeof p.method_label === 'string' ? p.method_label.trim() : ''
  const key = keyOf(p)
  const human = raw && !RAW.test(raw)
  // A server sentence with its own detail wins (and the structured brand/last4 are not repeated on top of it).
  if (human && /\d{4}/.test(raw)) return raw
  if (key) {
    const base = m[`payment.method.${key}` as const]
    if (key !== 'card' && key !== 'credit_card' && key !== 'debit_card') return human && key === 'other' ? raw : base
    const brandRaw = typeof p.brand === 'string' ? p.brand.trim() : ''
    const brand = brandRaw ? (BRANDS[brandRaw.toLowerCase().replace(/[ -]/g, '_')] ?? brandRaw) : ''
    const last4 = typeof p.last4 === 'string' && /^\d{2,4}$/.test(p.last4.trim()) ? p.last4.trim() : ''
    return `${base}${brand ? ` ${brand}` : ''}${last4 ? ` •••• ${last4}` : ''}`
  }
  return human ? raw : m['payment.method.unknown']
}
