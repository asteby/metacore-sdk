import type { Money } from './types.js'

export type FormatMoneyOptions = {
  /** Drop `.00` when the amount is a whole number. */
  withoutTrailingZeros?: boolean
  /** Format as a plain number, without the currency symbol. */
  withoutCurrency?: boolean
  /** `symbol` (default), `narrowSymbol`, `code` or `name`. */
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name'
}

/** Parses a contract `Money` amount into a JS number (`"1899.00"` → `1899`). */
export function parseMoney(money: Money | string | null | undefined): number {
  if (money == null) return 0
  const raw = typeof money === 'string' ? money : money.amount
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

/**
 * Formats `Money` with `Intl.NumberFormat`. Works in every runtime (no DOM).
 * Falls back to `"<amount> <code>"` when the runtime lacks the currency.
 */
export function formatMoney(money: Money, locale?: string, options: FormatMoneyOptions = {}): string {
  const value = parseMoney(money)
  const whole = Number.isInteger(value)
  const digits = options.withoutTrailingZeros && whole ? 0 : undefined
  try {
    const fmt = new Intl.NumberFormat(locale, {
      ...(options.withoutCurrency
        ? { style: 'decimal', minimumFractionDigits: digits ?? 2, maximumFractionDigits: digits ?? 2 }
        : {
            style: 'currency',
            currency: money.currency_code,
            currencyDisplay: options.currencyDisplay ?? 'symbol',
            ...(digits === 0 ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
          }),
    })
    return fmt.format(value)
  } catch {
    const amount = digits === 0 ? String(value) : value.toFixed(2)
    return options.withoutCurrency ? amount : `${amount} ${money.currency_code}`
  }
}

/** Builds a `Money` from a number, rounding to cents. */
export function toMoney(value: number, currencyCode: string): Money {
  return { amount: (Math.round(value * 100) / 100).toFixed(2), currency_code: currencyCode }
}

/**
 * True for public (`pk_`) tokens, the only ones that may reach a browser.
 * Private (`sk_`) tokens must stay on the server.
 */
export function isTokenPublishable(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith('pk_')
}
