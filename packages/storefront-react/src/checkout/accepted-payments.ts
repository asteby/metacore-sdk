import type { AcceptedPaymentMethod } from '@asteby/storefront'
import { brandKey, brandName, findBrand } from './brands.js'

/** One mark to paint for the shop's accepted payments: a catalog brand (`BrandMark`) or, without one, a text chip. */
export type AcceptedPaymentMark = { key: string; label: string; brand: string | null }

export type AcceptedPaymentMessages = {
  card: string
  cash: string
  transfer: string
  wallet: string
  manual: string
}

export const acceptedPaymentMessages: AcceptedPaymentMessages = {
  card: 'Pago con tarjeta',
  cash: 'Pago en efectivo',
  transfer: 'Transferencia bancaria',
  wallet: 'Monedero digital',
  manual: 'Transferencia o depósito',
}

export type AcceptedPaymentMarksOptions = {
  /**
   * Include the built-in `manual` method (staff confirms the payment by hand). Off by default: what it means
   * (transfer, cash on pickup…) is the merchant's instructions, so a footer should not name it generically.
   */
  includeManual?: boolean
  messages?: Partial<AcceptedPaymentMessages>
}

/** A cash point label to a catalog brand: «STP (transferencia SPEI)» is SPEI, «7 Eleven» is 7-Eleven. */
function pointBrand(label: string): string | null {
  if (/\bspei\b/i.test(label)) return 'spei'
  const b = findBrand(label)
  return b ? b.key : null
}

/**
 * The marks of `GET /storefront/payment-methods` (`sf.shop.paymentMethods()`), deduplicated, in the order the checkout
 * offers them. It only names what the configuration says: a card option is its provider label or «Pago con tarjeta» (the
 * networks and credit/debit are not in the data, so no Visa/Mastercard logo is assumed); cash points become their brands
 * (OXXO, 7-Eleven, SPEI…); a Mercado Pago wallet is the Mercado Pago mark. The `mock` test provider is never listed.
 */
export function acceptedPaymentMarks(methods: readonly AcceptedPaymentMethod[] | null | undefined, options: AcceptedPaymentMarksOptions = {}): AcceptedPaymentMark[] {
  const msg = { ...acceptedPaymentMessages, ...options.messages }
  const out: AcceptedPaymentMark[] = []
  const seen = new Set<string>()
  const add = (m: AcceptedPaymentMark) => {
    const id = m.brand ?? `text:${m.label.toLowerCase()}`
    if (seen.has(id)) return
    seen.add(id)
    out.push(m)
  }
  for (const method of methods ?? []) {
    if (method.key === 'mock') continue
    if (method.kind === 'builtin') {
      if (method.key === 'manual' && options.includeManual) add({ key: 'manual', label: msg.manual, brand: null })
      continue
    }
    const opts = method.options ?? []
    if (opts.length === 0) {
      const brand = findBrand(method.key)
      add({ key: method.key, label: brand?.name ?? brandName(method.key) ?? method.key, brand: brand?.key ?? null })
      continue
    }
    for (const o of opts) {
      const family = o.family ?? o.key
      if (family === 'card') {
        add({ key: o.key, label: o.label || msg.card, brand: null })
      } else if (family === 'cash' || family === 'ticket' || family === 'bank_transfer') {
        const points = o.points ?? []
        if (points.length === 0) add({ key: o.key, label: o.label || (family === 'bank_transfer' ? msg.transfer : msg.cash), brand: null })
        for (const p of points) add({ key: `${o.key}:${brandKey(p)}`, label: p, brand: pointBrand(p) })
      } else if (family === 'wallet') {
        const brand = findBrand(method.key)
        add({ key: o.key, label: brand?.kind === 'wallet' ? brand.name : o.label || msg.wallet, brand: brand?.kind === 'wallet' ? brand.key : null })
      } else {
        // An option without a known family: its own brand when the catalog has it (`oxxo`), else its label; never guessed.
        const brand = pointBrand(o.label || o.key)
        if (brand) add({ key: o.key, label: o.label || findBrand(brand)?.name || o.key, brand })
        else if (o.label) add({ key: o.key, label: o.label, brand: null })
      }
    }
  }
  return out
}
