/**
 * Presentation formatting built on `Intl` — the single source for money
 * display, localized dates, relative time, byte sizes and semver comparison.
 * Pure: no React, no DOM.
 *
 * Doctrine: NO regional defaults. Locale and currency always come from the
 * caller (usually the org config via `useFormatMoney()`); when the locale is
 * missing the runtime's own locale is used (`Intl` default), and when the
 * currency is missing no symbol is invented.
 *
 * These helpers only PRESENT values. Arithmetic, rounding and tax math belong
 * to the exact-money module (`MoneyValue`) and, authoritatively, to the
 * backend's moneykit — never round with these.
 */

export type MoneyDisplay = 'symbol' | 'narrowSymbol' | 'code' | 'name'

export interface FormatAmountOptions {
  /** ISO 4217 code (org config). Missing/empty → plain number, no symbol. */
  currency?: string | null
  /** BCP 47 locale (org config). Missing → the runtime's default locale. */
  locale?: string | null
  /** Intl `currencyDisplay` (default 'symbol'). */
  display?: MoneyDisplay
  /** Force the fraction digits. Default: the currency's own (JPY 0, USD 2, KWD 3). */
  fractionDigits?: number
}

/** Amount of unknown shape (number, numeric string, or "1,234.50") → number | null. */
function toNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

const PLAIN_DIGITS = 2

/**
 * Formats an amount for display.
 *
 * - With a currency: `Intl` currency style; fraction digits follow the
 *   currency (JPY 0, KWD 3) unless `fractionDigits` is given.
 * - Without a currency (org not configured): a plain localized number with
 *   2 fraction digits and NO symbol. Conservative on purpose: never guess a
 *   currency.
 * - Unknown currency code: `"<amount> <CODE>"`.
 * - Non-numeric amount: `''` (never "NaN").
 */
export function formatAmount(
  amount: number | string | null | undefined,
  options: FormatAmountOptions = {},
): string {
  const n = toNumber(amount)
  if (n === null) return ''
  const locale = options.locale || undefined
  const code = options.currency?.trim().toUpperCase()
  const digits =
    options.fractionDigits !== undefined
      ? { minimumFractionDigits: options.fractionDigits, maximumFractionDigits: options.fractionDigits }
      : {}
  try {
    if (!code) {
      const d = options.fractionDigits ?? PLAIN_DIGITS
      return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: options.display ?? 'symbol',
      ...digits,
    }).format(n)
  } catch {
    return code ? `${n} ${code}` : String(n)
  }
}

// ------------------------------------------------------------------ dates

export interface FormatLocalizedDateOptions {
  locale?: string | null
  /** IANA zone (org config). Default: the viewer's zone. */
  timeZone?: string | null
  /** Intl `dateStyle` (default 'medium'). */
  dateStyle?: Intl.DateTimeFormatOptions['dateStyle']
  /** Include the time (Intl `timeStyle: 'short'`). */
  time?: boolean
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function parseInstant(input: unknown): { date: Date; dateOnly: boolean } | null {
  if (input == null || input === '') return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : { date: input, dateOnly: false }
  if (typeof input === 'string' || typeof input === 'number') {
    const dateOnly = typeof input === 'string' && DATE_ONLY.test(input)
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : { date: d, dateOnly }
  }
  return null
}

/**
 * Locale/zone-aware date (and optional time) via `Intl.DateTimeFormat`.
 * A bare `YYYY-MM-DD` is a calendar date: formatted in UTC so it never slips a
 * day in negative-offset zones (and the time is omitted). Invalid → `''`.
 *
 * (`formatDate` from `./date` is the date-fns token formatter and keeps its
 * own contract; this is the Intl counterpart.)
 */
export function formatLocalizedDate(input: unknown, options: FormatLocalizedDateOptions = {}): string {
  const p = parseInstant(input)
  if (!p) return ''
  const locale = options.locale || undefined
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: options.dateStyle ?? 'medium',
      ...(options.time && !p.dateOnly ? { timeStyle: 'short' as const } : {}),
      timeZone: p.dateOnly ? 'UTC' : options.timeZone || undefined,
    }).format(p.date)
  } catch {
    return p.date.toISOString()
  }
}

// ---------------------------------------------------------- relative time

const RELATIVE_UNITS: ReadonlyArray<readonly [number, Intl.RelativeTimeFormatUnit]> = [
  [365 * 86_400_000, 'year'],
  [30 * 86_400_000, 'month'],
  [7 * 86_400_000, 'week'],
  [86_400_000, 'day'],
  [3_600_000, 'hour'],
  [60_000, 'minute'],
  [1000, 'second'],
]

export interface RelativeTimeOptions {
  locale?: string | null
  /** Reference instant (default `new Date()`). */
  now?: Date | number
  /** Intl `numeric` (default 'auto': "yesterday"). */
  numeric?: 'always' | 'auto'
}

/**
 * "3 hours ago" / "in 2 days", localized with `Intl.RelativeTimeFormat`,
 * picking the largest unit that fits. Invalid input → `''`.
 */
export function relativeTime(input: unknown, options: RelativeTimeOptions = {}): string {
  const p = parseInstant(input)
  if (!p) return ''
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now()
  const diff = p.date.getTime() - now
  const [ms, unit] = RELATIVE_UNITS.find(([size]) => Math.abs(diff) >= size) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1]!
  try {
    return new Intl.RelativeTimeFormat(options.locale || undefined, { numeric: options.numeric ?? 'auto' }).format(
      Math.trunc(diff / ms),
      unit,
    )
  } catch {
    return ''
  }
}

// ------------------------------------------------------------------ bytes

export interface FormatBytesOptions {
  /** Placeholder for negative / non-finite input (default '—'). */
  invalid?: string
}

/**
 * Human byte size, base 1024: `512 B`, `1.5 KB`, `5.0 MB`; one decimal below
 * 100 of a unit, none from 100 up. Units are not localized (B/KB/MB/GB/TB).
 */
export function formatBytes(bytes: number | null | undefined, options: FormatBytesOptions = {}): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return options.invalid ?? '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

// ----------------------------------------------------------------- semver

interface Semver {
  core: [number, number, number]
  pre: string[]
}

function parseSemver(v: string): Semver | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim())
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)], pre: m[4] ? m[4].split('.') : [] }
}

/**
 * Semver precedence: -1 | 0 | 1. Accepts a leading `v` and missing minor/patch;
 * build metadata is ignored; a pre-release sorts below its release
 * (`1.0.0-rc.1 < 1.0.0`). Unparseable input sorts below any valid version
 * (two unparseable → 0).
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const x = parseSemver(a)
  const y = parseSemver(b)
  if (!x || !y) return x ? 1 : y ? -1 : 0
  for (let i = 0; i < 3; i++) {
    if (x.core[i]! !== y.core[i]!) return x.core[i]! > y.core[i]! ? 1 : -1
  }
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) > Number(q) ? 1 : -1
    if (pn !== qn) return pn ? -1 : 1
    return p > q ? 1 : -1
  }
  return 0
}
