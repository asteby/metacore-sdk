import { describe, expect, it } from 'vitest'
import { createStorefrontClient, isCustomerType } from './index.js'
import { createMockStorefront } from './mock/index.js'

function sf(options: Parameters<typeof createMockStorefront>[0] = {}) {
  const mock = createMockStorefront(options)
  return createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
}

describe('customer type', () => {
  it('accepts any short slug of the store, not a fixed list', () => {
    for (const ok of ['final', 'taller', 'mayorista', 'vip-1', 'a_b']) expect(isCustomerType(ok)).toBe(true)
    for (const bad of ['', 'Taller', 'con espacio', '-x', 'x'.repeat(33), undefined, 3]) expect(isCustomerType(bad)).toBe(false)
  })

  it('register keeps the declared type on the new customer', async () => {
    const client = sf({ customerCapabilities: { email_verification: false } })
    const res = await client.customer.register({ email: 'taller@example.mx', password: 'una-frase-larga-1', customer_type: 'taller' })
    expect(res.status).toBe('created')
    if (res.status === 'created') expect(res.session.customer.customer_type).toBe('taller')
  })

  it('register without a type leaves it unset', async () => {
    const client = sf({ customerCapabilities: { email_verification: false } })
    const res = await client.customer.register({ email: 'ana@example.mx', password: 'una-frase-larga-1' })
    expect(res.status).toBe('created')
    if (res.status === 'created') expect(res.session.customer.customer_type).toBeUndefined()
  })

  it('rejects a type outside the list with a 400 on customer_type', async () => {
    const client = sf({ customerCapabilities: { email_verification: false } })
    await expect(
      client.customer.register({ email: 'x@example.mx', password: 'una-frase-larga-1', customer_type: 'no válido' as never }),
    ).rejects.toMatchObject({ status: 400, field: 'customer_type' })
  })

  it('the cart buyer accepts a type and refuses an unknown one', async () => {
    const client = sf()
    const cart = await client.carts.create({})
    await expect(client.carts.setBuyer(cart.id, { email: 'a@b.mx', customer_type: 'flotillas' })).resolves.toBeDefined()
    await expect(client.carts.setBuyer(cart.id, { email: 'a@b.mx', customer_type: 'No válido' as never })).rejects.toMatchObject({ status: 400, field: 'customer_type' })
  })
})
