/**
 * Enhanced Currency Utility focusing on correct symbols for Spanish-speaking countries
 */

import { formatCurrency as formatCurrencyExact } from '@asteby/metacore-lib/currency'

export interface CurrencyInfo {
    code: string
    name: string
    symbol: string
    label: string
}

/**
 * Manual mapping for symbols in Spanish-speaking countries
 * This ensures S/ for PEN, Bs. for VES, etc., which Intl often gets wrong.
 */
export const SPANISH_SYMBOLS: Record<string, string> = {
    'PEN': 'S/',
    'VES': 'Bs.',
    'BOB': 'Bs.',
    'GTQ': 'Q',
    'HNL': 'L',
    'NIO': 'C$',
    'CRC': '₡',
    'PAB': 'B/.',
    'PYG': '₲',
    'MXN': '$',
    'COP': '$',
    'ARS': '$',
    'CLP': '$',
    'UYU': '$',
    'DOP': '$',
    'CUP': '$',
    'EUR': '€',
    'USD': '$'
}

/** Envoltorio de `formatCurrency` de metacore-lib (módulo money): decimales por moneda. */
export function formatCurrency(amount: number, currencyCode: string = 'USD', locale: string = 'es'): string {
    return formatCurrencyExact(amount, currencyCode, locale)
}
export function getCurrencySymbol(code: string): string {
    return SPANISH_SYMBOLS[code] ||
        (typeof Intl !== 'undefined' ?
            new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: code,
                currencyDisplay: 'narrowSymbol'
            }).formatToParts(0).find(p => p.type === 'currency')?.value || code
            : '$')
}
