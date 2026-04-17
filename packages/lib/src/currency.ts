/**
 * Currency utilities focused on correct symbols for Spanish-speaking countries.
 * Pure: no React, no DOM.
 */

export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  label: string
}

/**
 * Manual mapping for symbols in Spanish-speaking countries.
 * Intl often gets these wrong (e.g. PEN, VES).
 */
export const SPANISH_SYMBOLS: Record<string, string> = {
  PEN: 'S/',
  VES: 'Bs.',
  BOB: 'Bs.',
  GTQ: 'Q',
  HNL: 'L',
  NIO: 'C$',
  CRC: '₡',
  PAB: 'B/.',
  PYG: '₲',
  MXN: '$',
  COP: '$',
  ARS: '$',
  CLP: '$',
  UYU: '$',
  DOP: '$',
  CUP: '$',
  EUR: '€',
  USD: '$',
}

/**
 * Format a numeric amount as a currency string.
 * @example formatCurrency(1234.56, 'USD', 'en') -> "$1,234.56"
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = 'USD',
  locale: string = 'es',
): string {
  if (!Number.isFinite(amount)) return ''
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount)
  } catch {
    return `${currencyCode} ${amount}`
  }
}

/**
 * Returns the best-known symbol for a currency code.
 */
export function getCurrencySymbol(code: string): string {
  const fromMap = SPANISH_SYMBOLS[code]
  if (fromMap) return fromMap
  if (typeof Intl === 'undefined') return '$'
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value || code
  } catch {
    return code
  }
}

/**
 * Parse a currency-formatted string back into a number.
 * Strips currency symbols, thousand separators, and normalizes the decimal mark.
 * Accepts both "1,234.56" and "1.234,56" conventions.
 * Returns NaN if the input cannot be parsed.
 * @example parseCurrency("$1,234.56") -> 1234.56
 * @example parseCurrency("S/ 1.234,56") -> 1234.56
 */
export function parseCurrency(value: string | number | null | undefined): number {
  if (value == null) return NaN
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return NaN

  // Strip everything that is not a digit, separator, or sign.
  const cleaned = value.replace(/[^0-9,.\-]/g, '').trim()
  if (!cleaned) return NaN

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')

  let normalized: string
  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned
  } else if (lastComma > lastDot) {
    // comma is the decimal separator
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // dot is the decimal separator
    normalized = cleaned.replace(/,/g, '')
  }

  const n = Number(normalized)
  return Number.isFinite(n) ? n : NaN
}
