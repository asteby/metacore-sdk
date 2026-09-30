// Formateador único de moneda, número y fecha (benchmark PIT-023 / PIT-025).
//
// Toda la UI de negocio (toasts, tickets, PDFs, pickers) formatea por aquí para
// no mezclar locale y moneda (el «MX$1,06.00» del toast de cobro) ni desfasar
// fechas por zona horaria. La moneda y la zona son config de la org — nunca se
// hardcodean: salen de <CurrencyContext>/<TimeZoneContext> o de `opts`.
import { useMemo } from 'react'
import { useCurrency, useTimeZone } from '../org-runtime-context'

/** Locale por defecto del producto. */
export const DEFAULT_LOCALE = 'es-MX'
/** Moneda cuando ni la org ni el llamador dan una (mismo fallback que las celdas). */
export const FALLBACK_CURRENCY = 'USD'

export interface FormatOptions {
    /** BCP-47. Default `es-MX`. */
    locale?: string
    /** ISO-4217 de la org. Default: contexto → `USD`. */
    currency?: string
    /** IANA de la org. Default: contexto → zona del navegador. */
    timeZone?: string
}

/** Redondea a centavos evitando el error binario (1.005 → 1.01). */
export function roundMoney(n: number, decimals = 2): number {
    if (!Number.isFinite(n)) return 0
    const f = 10 ** decimals
    return Math.round((n + Number.EPSILON) * f) / f
}

/** Número (string con símbolo/separadores, o number) → number; NaN → 0. */
export function toAmount(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v !== 'string') return 0
    const s = v.replace(/[^0-9.,-]/g, '')
    if (!s) return 0
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    const normalized =
        lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
    const n = Number(normalized)
    return Number.isFinite(n) ? n : 0
}

/**
 * Monto con símbolo de la moneda de la org: `formatMoney(1060, {currency:'MXN'})`
 * → `$1,060.00`. Un valor no numérico devuelve `''` (nunca «NaN»).
 */
export function formatMoney(amount: unknown, opts: FormatOptions = {}): string {
    const n = typeof amount === 'number' ? amount : toAmount(amount)
    if (!Number.isFinite(n)) return ''
    const currency = opts.currency || FALLBACK_CURRENCY
    try {
        return new Intl.NumberFormat(opts.locale || DEFAULT_LOCALE, {
            style: 'currency',
            currency,
            currencyDisplay: 'narrowSymbol',
        }).format(n)
    } catch {
        return `${currency} ${n.toFixed(2)}`
    }
}

/** Número plano localizado (`1,234.5`). */
export function formatQuantity(n: unknown, opts: { locale?: string; maximumFractionDigits?: number } = {}): string {
    const v = typeof n === 'number' ? n : toAmount(n)
    if (!Number.isFinite(v)) return ''
    return new Intl.NumberFormat(opts.locale || DEFAULT_LOCALE, {
        maximumFractionDigits: opts.maximumFractionDigits ?? 3,
    }).format(v)
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function toDate(input: unknown): { date: Date; dateOnly: boolean } | null {
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
 * Fecha (`29 sep 2026`). Un `YYYY-MM-DD` es fecha de calendario: se formatea en
 * UTC para que no retroceda un día en zonas con offset negativo.
 */
export function formatDate(input: unknown, opts: FormatOptions & { style?: Intl.DateTimeFormatOptions['dateStyle'] } = {}): string {
    const parsed = toDate(input)
    if (!parsed) return ''
    return new Intl.DateTimeFormat(opts.locale || DEFAULT_LOCALE, {
        dateStyle: opts.style ?? 'medium',
        timeZone: parsed.dateOnly ? 'UTC' : opts.timeZone || undefined,
    }).format(parsed.date)
}

/** Fecha y hora en la zona de la org (`29 sep 2026, 14:05`). */
export function formatDateTime(input: unknown, opts: FormatOptions = {}): string {
    const parsed = toDate(input)
    if (!parsed) return ''
    if (parsed.dateOnly) return formatDate(input, opts)
    return new Intl.DateTimeFormat(opts.locale || DEFAULT_LOCALE, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: opts.timeZone || undefined,
    }).format(parsed.date)
}

export interface Formatter {
    locale: string
    currency: string
    timeZone: string | undefined
    money: (amount: unknown, currency?: string) => string
    quantity: (n: unknown) => string
    date: (input: unknown) => string
    dateTime: (input: unknown) => string
}

/** Formateador ligado a un locale/moneda/zona fijos (para tickets y PDFs fuera de React). */
export function createFormatter(opts: FormatOptions = {}): Formatter {
    const locale = opts.locale || DEFAULT_LOCALE
    const currency = opts.currency || FALLBACK_CURRENCY
    const timeZone = opts.timeZone || undefined
    return {
        locale,
        currency,
        timeZone,
        money: (amount, c) => formatMoney(amount, { locale, currency: c || currency }),
        quantity: (n) => formatQuantity(n, { locale }),
        date: (input) => formatDate(input, { locale, timeZone }),
        dateTime: (input) => formatDateTime(input, { locale, timeZone }),
    }
}

/** Formateador con la moneda y zona de la org tomadas del runtime provider. */
export function useFormatter(overrides: FormatOptions = {}): Formatter {
    const orgCurrency = useCurrency()
    const orgZone = useTimeZone()
    const { locale, currency, timeZone } = overrides
    return useMemo(
        () =>
            createFormatter({
                locale,
                currency: currency ?? orgCurrency,
                timeZone: timeZone ?? orgZone,
            }),
        [locale, currency, timeZone, orgCurrency, orgZone],
    )
}
