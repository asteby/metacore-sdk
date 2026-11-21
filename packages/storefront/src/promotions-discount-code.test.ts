import { describe, expect, it } from 'vitest'
import { StorefrontError } from './errors.js'
import { applyDiscountCodeIntent, discountCodeFeedback, discountCodeMessage, normalizeDiscountCode, promotionMessages } from './promotions.js'

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

describe('applyDiscountCodeIntent (mitad servidor del campo de cupón: carrito y pago)', () => {
  const fake = (impl: (id: string, codes: string[]) => Promise<unknown>) => ({ carts: { setDiscountCodes: impl as never } });

  it('guarda el código normalizado y devuelve el carrito de OPS', async () => {
    const calls: [string, string[]][] = []
    const out = await applyDiscountCodeIntent(fake(async (id, codes) => (calls.push([id, codes]), { id, discount_codes: [] })), 'c1', ' verano10 ')
    expect(calls).toEqual([['c1', ['VERANO10']]])
    expect(out).toEqual({ ok: true, cart: { id: 'c1', discount_codes: [] } })
  })

  it('vacío quita el cupón', async () => {
    const calls: string[][] = []
    await applyDiscountCodeIntent(fake(async (_id, codes) => (calls.push(codes), {})), 'c1', '')
    await applyDiscountCodeIntent(fake(async (_id, codes) => (calls.push(codes), {})), 'c1', undefined)
    expect(calls).toEqual([[], []])
  })

  it('formato inválido: 400 con el texto del idioma y sin llamar a OPS', async () => {
    let called = false
    const sf = fake(async () => ((called = true), {}))
    expect(await applyDiscountCodeIntent(sf, 'c1', '10% OFF')).toEqual({ ok: false, status: 400, error: 'Escribe un cupón válido: letras, números, guion o guion bajo.' })
    expect(await applyDiscountCodeIntent(sf, 'c1', '10% OFF', { locale: 'en-US' })).toMatchObject({ ok: false, error: 'Enter a valid code: letters, numbers, hyphen or underscore.' })
    expect(called).toBe(false)
  })

  it('un rechazo de OPS a la petición vuelve como texto del campo; lo que no es StorefrontError se relanza', async () => {
    const rejected = fake(async () => { throw new StorefrontError({ status: 422, code: 'invalid_input', message: 'Cupón desconocido' } as never) })
    expect(await applyDiscountCodeIntent(rejected, 'c1', 'ABC')).toEqual({ ok: false, status: 422, error: 'Cupón desconocido' })
    const boom = fake(async () => { throw new Error('red caída') })
    await expect(applyDiscountCodeIntent(boom, 'c1', 'ABC')).rejects.toThrow('red caída')
  })
})
