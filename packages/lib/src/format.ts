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

export interface FormatDurationOptions {
  /** BCP-47 locale for the unit labels. Default 'es-MX'. */
  locale?: string
  /** Text for invalid or negative input. Default '—'. */
  invalid?: string
}

function unitPart(value: number, unit: 'second' | 'minute' | 'hour' | 'day', locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 0 }).format(value)
  } catch {
    const fallback = { second: 's', minute: 'min', hour: 'h', day: 'd' }[unit]
    return `${value} ${fallback}`
  }
}

/**
 * Human duration from seconds, at most two units, locale-aware via
 * Intl unit formatting: "45 s", "12 min", "3 h 20 min", "2 días 5 h".
 * @example formatDuration(12000) -> "3 h 20 min" (es-MX)
 * @example formatDuration(12000, { locale: 'en-US' }) -> "3 hr 20 min"
 */
export function formatDuration(seconds: number, options: FormatDurationOptions = {}): string {
  const { locale = 'es-MX', invalid = '—' } = options
  if (!Number.isFinite(seconds) || seconds < 0) return invalid
  const s = Math.round(seconds)
  if (s < 60) return unitPart(s, 'second', locale)
  const min = Math.round(s / 60)
  if (min < 60) return unitPart(min, 'minute', locale)
  const h = Math.floor(min / 60)
  const restMin = min % 60
  if (h < 24) return restMin ? `${unitPart(h, 'hour', locale)} ${unitPart(restMin, 'minute', locale)}` : unitPart(h, 'hour', locale)
  const d = Math.floor(h / 24)
  const restH = h % 24
  return restH ? `${unitPart(d, 'day', locale)} ${unitPart(restH, 'hour', locale)}` : unitPart(d, 'day', locale)
}
