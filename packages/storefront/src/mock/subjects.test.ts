import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, MOCK_SUBJECT_KINDS, createMockStorefront } from './index.js'
import { buildProducts, MOCK_CURRENCY, MOCK_IMAGE_URL } from './seed.js'

const NP300 = { make: 'nissan', model: 'np300', year: 2012, engine: '2.5' }
const PLATE = 'ZXQ-9917'

function setup(subjectKinds = MOCK_SUBJECT_KINDS) {
  const mock = createMockStorefront({ subjectKinds })
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  return { mock, sf }
}

async function signIn(sf: ReturnType<typeof setup>['sf'], email = MOCK_CUSTOMER_EMAIL) {
  await sf.customer.requestOtp({ email })
  const session = await sf.customer.createSession({ email, code: '000000' })
  return sf.withCustomerToken(session.token)
}

describe('mock: a store that declares no kinds has no «My items»', () => {
  const { sf, mock } = setup([])
  beforeEach(() => mock.reset())
  it('capabilities carry no section, the kinds are empty and a save is refused', async () => {
    expect((await sf.customer.capabilities()).subjects).toBeUndefined()
    expect(await sf.content.subjectKinds()).toEqual([])
    const me = await signIn(sf)
    expect(await me.customer.subjects.list()).toEqual([])
    await expect(me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })).rejects.toMatchObject({ status: 422, field: 'kind' })
  })

  it('default mock (no option) behaves the same', async () => {
    const plain = createMockStorefront()
    const client = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: plain.fetch })
    expect((await client.customer.capabilities()).subjects).toBeUndefined()
    expect(await client.content.subjectKinds()).toEqual([])
  })
})

describe('mock: «My items» (contract 1.9)', () => {
  const { sf, mock } = setup()
  beforeEach(() => mock.reset())

  it('publishes the kinds and advertises them', async () => {
    expect((await sf.customer.capabilities()).subjects).toEqual({ kinds: ['vehicle', 'size'], share_with_workshop: false })
    const kinds = await sf.content.subjectKinds()
    expect(kinds.map((k) => k.key)).toEqual(['vehicle', 'size'])
    expect(kinds[0]!.label_plural).toBe('Mi garage')
  })

  it('saves with the server-built label and key; the first of a kind is the active one', async () => {
    const me = await signIn(sf)
    const a = await me.customer.subjects.create({ kind: 'vehicle', attributes: NP300, nickname: '  El de   diario ' })
    expect(a).toMatchObject({ kind: 'vehicle', label: 'Nissan NP300 Frontier 2012 2.5 L', fit_key: 'nissan/np300/2012/2.5', nickname: 'El de diario', is_default: true })
    const b = await me.customer.subjects.create({ kind: 'vehicle', attributes: { make: 'nissan', model: 'versa', year: 2018, engine: '1.6' } })
    expect(b.is_default).toBe(false)
    const s = await me.customer.subjects.create({ kind: 'size', attributes: { garment: 'Camisa', value: 'M' } })
    expect(s).toMatchObject({ is_default: true, fit_key: 'camisa/m' })
    await me.customer.subjects.update(b.id, { is_default: true })
    expect((await me.customer.subjects.list({ kind: 'vehicle' })).map((x) => [x.id, x.is_default])).toEqual([[b.id, true], [a.id, false]])
    expect(await me.customer.subjects.list()).toHaveLength(3)
  })

  it('a private value comes back masked everywhere and never reaches the label, the key or a list', async () => {
    const me = await signIn(sf)
    const a = await me.customer.subjects.create({ kind: 'vehicle', attributes: { ...NP300, plate: PLATE } })
    expect(a.attributes.plate).toBe('••17')
    for (const x of [a, ...(await me.customer.subjects.list())]) expect(JSON.stringify(x)).not.toContain(PLATE)
    expect(JSON.stringify([a.label, a.fit_key])).not.toContain('ZXQ')
    // The mask sent back keeps the stored value; a new value replaces it; null clears it.
    const kept = await me.customer.subjects.update(a.id, { attributes: { plate: '••17', year: 2013 } })
    expect(kept).toMatchObject({ fit_key: 'nissan/np300/2013/2.5', attributes: { plate: '••17' } })
    expect((await me.customer.subjects.update(a.id, { attributes: { plate: 'NEW-0001' } })).attributes.plate).toBe('••01')
    expect((await me.customer.subjects.update(a.id, { attributes: { plate: null } })).attributes).not.toHaveProperty('plate')
  })

  it('refuses by field without echoing the value, and by the limits of the kind', async () => {
    const me = await signIn(sf)
    for (const [attrs, field] of [
      [{ ...NP300, make: 'SECRET-123' }, 'attributes.make'],
      [{ ...NP300, year: 2007 }, 'attributes.year'],
      [{ ...NP300, year: 2018 }, 'attributes.year'],
      [{ make: 'nissan' }, 'attributes.model'],
      [{ ...NP300, color: 'red' }, 'attributes.color'],
    ] as const) {
      const err = await me.customer.subjects.create({ kind: 'vehicle', attributes: attrs }).catch((e) => e)
      expect(err).toMatchObject({ status: 422, field })
      expect(String(err.message)).not.toContain('SECRET')
    }
    await me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })
    await expect(me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })).rejects.toMatchObject({ status: 409 })
    await me.customer.subjects.create({ kind: 'vehicle', attributes: { ...NP300, year: 2013 } })
    await me.customer.subjects.create({ kind: 'vehicle', attributes: { ...NP300, year: 2014 } })
    await expect(me.customer.subjects.create({ kind: 'vehicle', attributes: { ...NP300, year: 2015 } })).rejects.toMatchObject({ status: 409, field: 'kind' })
  })

  it('items belong to their buyer: another one gets 404 and an empty list', async () => {
    const me = await signIn(sf)
    const a = await me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })
    const other = await signIn(sf, 'otra@example.mx')
    expect(await other.customer.subjects.list()).toEqual([])
    await expect(other.customer.subjects.update(a.id, { nickname: 'mío' })).rejects.toMatchObject({ status: 404 })
    await expect(other.customer.subjects.delete(a.id)).rejects.toMatchObject({ status: 404 })
    await expect(sf.customer.subjects.list()).rejects.toMatchObject({ status: 401 })
  })

  it('delete is physical: the active one passes to another of its kind and the key can be saved again', async () => {
    const me = await signIn(sf)
    const a = await me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })
    const b = await me.customer.subjects.create({ kind: 'vehicle', attributes: { ...NP300, year: 2013 } })
    await me.customer.subjects.delete(a.id)
    expect(await me.customer.subjects.list()).toMatchObject([{ id: b.id, is_default: true }])
    await expect(me.customer.subjects.delete(a.id)).rejects.toMatchObject({ status: 404 })
    expect(await me.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })).toMatchObject({ fit_key: a.fit_key })
    await expect(me.customer.subjects.update(b.id, { is_default: false })).rejects.toMatchObject({ status: 422 })
  })
})

describe('mock: products_list tags_any (contract 1.9)', () => {
  it('keeps the products with at least one of the tags (OR, case-insensitive) and narrows the facets with them', async () => {
    const products = buildProducts(MOCK_CURRENCY, MOCK_IMAGE_URL).slice(0, 4).map((p, i) => ({
      ...p,
      tags: [['fit:nissan/np300/2012/2.5'], ['FIT:universal'], ['fit:ford/f150/2015/5.0'], []][i]!,
    }))
    const mock = createMockStorefront({ products, memberships: Object.fromEntries(products.map((p) => [p.handle, []])) })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const mine = await sf.products.list({ tags_any: ['fit:nissan/np300/2012/2.5', 'fit:universal'] })
    expect(mine.nodes.map((p) => p.id)).toEqual([products[0]!.id, products[1]!.id])
    expect(mine.total_count).toBe(2)
    expect((await sf.products.list({ tags_any: ['nope'] })).nodes).toEqual([])
    expect((await sf.products.list()).nodes).toHaveLength(4)
    expect(() => sf.products.list({ tags_any: ['a', 'b', 'c', 'd', 'e', 'f'] })).toThrow(RangeError)
  })
})
