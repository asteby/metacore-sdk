/**
 * Pure number/string formatting helpers (no React, no DOM).
 */

export interface FormatNumberOptions extends Intl.NumberFormatOptions {
  locale?: string
}

/**
 * Format a number using Intl.NumberFormat.
 * @example formatNumber(1234.5) -> "1,234.5"
 * @example formatNumber(1234.5, { locale: 'es', maximumFractionDigits: 2 }) -> "1.234,5"
 */
export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  const { locale = 'en-US', ...rest } = options
  if (!Number.isFinite(value)) return ''
  try {
    return new Intl.NumberFormat(locale, rest).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Format a number as a percentage. Accepts either 0..1 values (default) or 0..100.
 * @example formatPercentage(0.1234) -> "12.34%"
 * @example formatPercentage(12.34, { scale: 100 }) -> "12.34%"
 */
export function formatPercentage(
  value: number,
  options: FormatNumberOptions & { scale?: 1 | 100 } = {},
): string {
  const { scale = 1, locale = 'en-US', minimumFractionDigits, maximumFractionDigits = 2, ...rest } = options
  if (!Number.isFinite(value)) return ''
  const normalized = scale === 100 ? value / 100 : value
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits,
      maximumFractionDigits,
      ...rest,
    }).format(normalized)
  } catch {
    return `${(normalized * 100).toFixed(2)}%`
  }
}

/**
 * Truncate a string to a maximum length, adding a suffix if truncated.
 * @example truncate('hello world', 5) -> "hello…"
 */
export function truncate(value: string, maxLength: number, suffix: string = '…'): string {
  if (typeof value !== 'string') return ''
  if (value.length <= maxLength) return value
  if (maxLength <= 0) return ''
  return value.slice(0, maxLength) + suffix
}
