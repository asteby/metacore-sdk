import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../currency'
import { moneyFromNumber, numberToDecimal } from '../money'

const nbsp = (s: string) => s.replace(/ /g, ' ')

describe('numberToDecimal', () => {
  it('keeps shortest round-trip digits and never emits exponents', () => {
    expect(numberToDecimal(1.005)).toBe('1.005')
    expect(numberToDecimal(1e-7)).toBe('0.0000001')
    expect(numberToDecimal(-1.5e-7)).toBe('-0.00000015')
    expect(numberToDecimal(1.2e21)).toBe('1200000000000000000000')
    expect(() => numberToDecimal(NaN)).toThrow()
  })
})

describe('formatCurrency (wrapper del módulo money)', () => {
  it('usa los decimales de la moneda, no 2 fijos', () => {
    expect(nbsp(formatCurrency(1234.5, 'JPY', 'en'))).toBe('¥1,235')
    expect(nbsp(formatCurrency(1.5, 'KWD', 'en'))).toBe('KWD 1.500')
    expect(nbsp(formatCurrency(1234.56, 'USD', 'en'))).toBe('$1,234.56')
  })
  it('redondea half-away-from-zero sobre los dígitos decimales', () => {
    expect(moneyFromNumber(1.005, 'USD').toString()).toBe('1.01')
  })
  it('no finito → cadena vacía; moneda inválida → respaldo', () => {
    expect(formatCurrency(NaN, 'USD')).toBe('')
    expect(formatCurrency(5, 'zz')).toBe('zz 5')
  })
})
