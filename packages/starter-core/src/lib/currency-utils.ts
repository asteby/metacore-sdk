/**
 * Enhanced Currency Utility focusing on correct symbols for Spanish-speaking countries
 */

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

export function formatCurrency(amount: number, currencyCode: string = 'USD', locale: string = 'es'): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode,
        }).format(amount)
    } catch (e) {
        return `${currencyCode} ${amount}`
    }
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
