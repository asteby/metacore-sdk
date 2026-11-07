import { describe, expect, it } from 'vitest'
import { acceptedPaymentMarks } from './accepted-payments.js'

describe('acceptedPaymentMarks', () => {
  it('names only what the configuration says, deduplicated', () => {
    const marks = acceptedPaymentMarks([
      { key: 'manual', kind: 'builtin', options: [] },
      {
        key: 'mercadopago',
        kind: 'provider',
        options: [
          { key: 'card', family: 'card' },
          { key: 'cash', family: 'cash', points: ['STP (transferencia SPEI)', 'OXXO', '7 Eleven', 'OXXO', 'Tiendita'] },
          { key: 'wallet', family: 'wallet' },
          { key: 'credits' },
        ],
      },
      { key: 'mock', kind: 'builtin', options: [] },
    ])
    expect(marks.map((m) => [m.label, m.brand])).toEqual([
      ['Pago con tarjeta', null],
      ['STP (transferencia SPEI)', 'spei'],
      ['OXXO', 'oxxo'],
      ['7 Eleven', '7eleven'],
      ['Tiendita', null],
      ['Mercado Pago', 'mercadopago'],
    ])
  })
  it('lists manual only when asked and a provider without options by its brand', () => {
    expect(acceptedPaymentMarks([{ key: 'manual', kind: 'builtin', options: [] }])).toEqual([])
    expect(acceptedPaymentMarks([{ key: 'manual', kind: 'builtin', options: [] }], { includeManual: true })[0]!.label).toBe('Transferencia o depósito')
    expect(acceptedPaymentMarks([{ key: 'paypal', kind: 'provider', options: [] }])).toEqual([{ key: 'paypal', label: 'PayPal', brand: 'paypal' }])
    expect(acceptedPaymentMarks([{ key: 'stripe', kind: 'provider', options: [] }])[0]).toMatchObject({ brand: null })
    expect(acceptedPaymentMarks(null)).toEqual([])
    expect(acceptedPaymentMarks([{ key: 'x', kind: 'provider', options: [{ key: 'bt', family: 'bank_transfer' }] }])[0]!.label).toBe('Transferencia bancaria')
    expect(acceptedPaymentMarks([{ key: 'x', kind: 'provider', options: [{ key: 'oxxo', label: 'OXXO' }] }])[0]).toMatchObject({ brand: 'oxxo' })
    expect(acceptedPaymentMarks([{ key: 'x', kind: 'provider', options: [{ key: 'card', label: 'Tarjeta de débito' }] }])[0]!.label).toBe('Tarjeta de débito')
  })
})
