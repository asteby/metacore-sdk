import { describe, expect, it } from 'vitest'
import { createStorefrontClient, customerTypeOptions, isCustomerType } from './index.js'
import { createMockStorefront, MOCK_CUSTOMER_TYPES } from './mock/index.js'

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

describe('customer types of the organization (capabilities)', () => {
  it('no list: nothing to draw, on older servers and on stores that offer none', async () => {
    expect(customerTypeOptions(undefined)).toBeNull()
    expect(customerTypeOptions({})).toBeNull()
    expect(customerTypeOptions({ customer_types: { options: [] } })).toBeNull()
    const caps = await sf().customer.capabilities()
    expect(caps.customer_types).toBeUndefined()
    expect(customerTypeOptions(caps)).toBeNull()
  })

  it('preselects the default of the organization, not the first, and flags the ones reviewed', () => {
    const c = customerTypeOptions({ customer_types: MOCK_CUSTOMER_TYPES })!
    expect(c.options.map((o) => o.value)).toEqual(['final', 'refaccionario', 'taller', 'flotillas'])
    expect(c.defaultValue).toBe('final')
    expect(c.hasReview).toBe(true)
    const other = customerTypeOptions({ customer_types: { options: MOCK_CUSTOMER_TYPES.options, default: 'taller' } })!
    expect(other.defaultValue).toBe('taller')
    expect(customerTypeOptions({ customer_types: { options: MOCK_CUSTOMER_TYPES.options, default: 'no-existe' } })!.defaultValue).toBe('final')
  })

  it('cleans what the server sends: invalid codes, empty labels and repeated codes are dropped', () => {
    const c = customerTypeOptions({
      customer_types: {
        options: [
          { value: 'Taller', label: 'mayúscula no es un código' },
          { value: 'taller', label: '  Taller  ' },
          { value: 'taller', label: 'repetido' },
          { value: 'sin-texto', label: '   ' },
          { value: 'final', label: 'Cliente Final' },
        ],
      },
    })!
    expect(c.options).toEqual([{ value: 'taller', label: 'Taller' }, { value: 'final', label: 'Cliente Final' }])
    expect(c.hasReview).toBe(false)
  })

  it('the mock serves the list through capabilities when asked', async () => {
    const caps = await sf({ customerCapabilities: { customer_types: MOCK_CUSTOMER_TYPES } }).customer.capabilities()
    expect(caps.customer_types?.default).toBe('final')
  })

  it('with a list, a code outside it is ignored without an error (registration and cart buyer)', async () => {
    const client = sf({ customerCapabilities: { email_verification: false, customer_types: MOCK_CUSTOMER_TYPES } })
    const ok = await client.customer.register({ email: 'a@example.mx', password: 'una-frase-larga-1', customer_type: 'taller' })
    if (ok.status === 'created') expect(ok.session.customer.customer_type).toBe('taller')
    const unknown = await client.customer.register({ email: 'b@example.mx', password: 'una-frase-larga-1', customer_type: 'mayorista-vip' })
    expect(unknown.status).toBe('created')
    if (unknown.status === 'created') expect(unknown.session.customer.customer_type).toBeUndefined()
    const cart = await client.carts.create({})
    await expect(client.carts.setBuyer(cart.id, { email: 'c@b.mx', customer_type: 'no-esta-en-la-lista' })).resolves.toBeDefined()
  })
})
