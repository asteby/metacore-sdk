import { formatMoney, moneyFromNumber, MoneyValue } from '@asteby/metacore-lib/money'
import type { DocumentFieldDef } from './types'

export interface FieldFormatOptions {
    locale?: string
    currency?: string
    timeZone?: string
}

/** Formatea un valor de campo; vacío → «—». Moneda y zona horaria son config de la org, no se hardcodean. */
export function formatFieldValue(
    value: unknown,
    format: DocumentFieldDef['format'] = 'text',
    opts: FieldFormatOptions = {},
): string {
    if (value === null || value === undefined || value === '') return '—'
    const locale = opts.locale || 'es-MX'
    // Relación resuelta por el kernel: `{value,label}` o un objeto con `name`.
    if (typeof value === 'object' && !(value instanceof Date)) {
        const o = value as Record<string, unknown>
        const text = o.label ?? o.name ?? o.title
        return text == null || text === '' ? '—' : String(text)
    }
    switch (format) {
        case 'money': {
            const n = typeof value === 'number' ? value : parseFloat(String(value))
            if (!Number.isFinite(n)) return '—'
            const currency = opts.currency || 'USD'
            try {
                // Una cadena decimal exacta entra sin pasar por number; los
                // decimales salen de la moneda (JPY 0, KWD 3).
                let m: MoneyValue
                try {
                    m = MoneyValue.parseRound(String(value).trim(), currency)
                } catch {
                    m = moneyFromNumber(n, currency)
                }
                return formatMoney(m, { locale })
            } catch {
                return n.toFixed(2)
            }
        }
        case 'percent': {
            const n = typeof value === 'number' ? value : parseFloat(String(value))
            return Number.isFinite(n) ? `${n}%` : '—'
        }
        case 'date':
        case 'datetime': {
            const d = new Date(String(value))
            if (Number.isNaN(d.getTime())) return String(value)
            try {
                return new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    ...(format === 'datetime' ? { timeStyle: 'short' } : {}),
                    timeZone: opts.timeZone || undefined,
                }).format(d)
            } catch {
                return d.toISOString()
            }
        }
        case 'boolean':
            return value ? 'Sí' : 'No'
        default:
            return String(value)
    }
}
