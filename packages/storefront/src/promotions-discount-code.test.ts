import { describe, expect, it } from 'vitest'
import { discountCodeFeedback, discountCodeMessage, normalizeDiscountCode, promotionMessages } from './promotions.js'

describe('discount codes', () => {
  it('normaliza y valida el formato como el servidor', () => {
    expect(normalizeDiscountCode('  protek10 ')).toBe('PROTEK10')
    expect(normalizeDiscountCode('')).toBeNull()
    expect(normalizeDiscountCode('a')).toBe(false)
    expect(normalizeDiscountCode('10% OFF')).toBe(false)
  })

  it('traduce el estado de OPS: aplicado, pendiente de envío y rechazado con motivo', () => {
    const f = discountCodeFeedback([
      { code: 'PROTEK10', applicable: true },
      { code: 'ENVIO', applicable: true, reason: 'no_shipping_selected' },
      { code: 'VIEJO', applicable: false, reason: 'expired' },
      { code: 'RARO', applicable: false, reason: 'algo_nuevo' },
    ])
    expect(f.map((x) => x.status)).toEqual(['applied', 'pending', 'rejected', 'rejected'])
    const es = promotionMessages('es-MX')
    expect(discountCodeMessage(f[0]!, es)).toBe('Cupón PROTEK10 aplicado.')
    expect(discountCodeMessage(f[1]!, es)).toContain('envío a domicilio')
    expect(discountCodeMessage(f[2]!, es)).toBe('El cupón VIEJO ya venció.')
    expect(discountCodeMessage(f[3]!, es)).toBe('El cupón RARO no aplica a este carrito.')
    expect(discountCodeMessage(f[2]!, promotionMessages('en'))).toBe('Code VIEJO has expired.')
    expect(discountCodeFeedback(undefined)).toEqual([])
  })
})
