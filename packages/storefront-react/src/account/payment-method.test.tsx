// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PaymentInfo } from '@asteby/storefront'
import { PaymentSummary } from './index.js'
import { paymentLabel } from './payment-method.js'
import { accountMessages } from './orders-messages.js'

afterEach(cleanup)
const es = accountMessages('es-MX')
const en = accountMessages('en')
const pay = (o: Partial<PaymentInfo>): PaymentInfo => ({ method_label: 'x', status: 'paid', amount: { amount: '10.00', currency_code: 'MXN' }, ...o })

describe('paymentLabel', () => {
  it('a raw provider word becomes a readable text in the buyer language', () => {
    expect(paymentLabel(pay({ method_label: 'Card' }), es)).toBe('Tarjeta')
    expect(paymentLabel(pay({ method_label: 'Card' }), en)).toBe('Card')
    expect(paymentLabel(pay({ method_label: 'credit_card' }), es)).toBe('Tarjeta de crédito')
    expect(paymentLabel(pay({ method_label: 'debit' }), es)).toBe('Tarjeta de débito')
    expect(paymentLabel(pay({ method_label: 'oxxo' }), es)).toBe('Efectivo en OXXO')
    expect(paymentLabel(pay({ method_label: 'spei' }), es)).toBe('Transferencia SPEI')
    expect(paymentLabel(pay({ method_label: 'Mercado Pago' }), es)).toBe('Billetera digital')
  })
  it('the family wins over an opaque label', () => {
    expect(paymentLabel(pay({ method_label: 'pm_123', family: 'cash_voucher' }), es)).toContain('OXXO')
    expect(paymentLabel(pay({ method_label: 'Card', family: 'card', brand: 'visa', last4: '1234' }), es)).toBe('Tarjeta Visa •••• 1234')
    expect(paymentLabel(pay({ method_label: 'x', family: 'card', brand: 'amex', last4: '0005' }), en)).toBe('Card American Express •••• 0005')
  })
  it('a sentence from the server keeps its own detail; a raw unknown never shows as it came', () => {
    expect(paymentLabel(pay({ method_label: 'Tarjeta Visa terminada en 4242' }), es)).toBe('Tarjeta Visa terminada en 4242')
    expect(paymentLabel(pay({ method_label: 'zxq_provider_9' }), es)).toBe('Medio de pago')
    expect(paymentLabel(pay({ method_label: '' }), en)).toBe('Payment method')
  })
  it('the store can extend it', () => {
    expect(paymentLabel(pay({ method_label: 'Card' }), es, { override: (p) => (p.method_label === 'Card' ? 'Pago con tarjeta' : null) })).toBe('Pago con tarjeta')
  })
  it('PaymentSummary renders it', () => {
    const { container } = render(<PaymentSummary payments={[pay({ method_label: 'Card' })]} />)
    expect(container.querySelector('[data-sf-payment-method]')!.textContent).toBe('Tarjeta')
  })
})
