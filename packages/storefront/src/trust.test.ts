import { describe, expect, it } from 'vitest'
import { createMockStorefront } from './mock/index.js'
import { createStorefrontClient } from './client.js'
import {
  SHOP_MERGE_FIELDS,
  businessIdentity,
  identityComplete,
  isInternalProduct,
  mergeShopSections,
  mergeShopText,
  pagePublishable,
  resolveShopText,
  shopFieldValues,
  shopLegal,
  shopWarrantyMonths,
} from './trust.js'
import type { Section, Shop } from './types.js'

const base: Shop = {
  name: 'Tienda & Co',
  description: null,
  domain: 'tienda.example.com',
  currency_code: 'MXN',
  locale: 'es-MX',
  locales: ['es-MX'],
  country_code: 'MX',
  logo: null,
  contact: { email: 'hola@tienda.example.com', phone: '5555551234', whatsapp: null },
  branches: [],
  policies: { free_shipping_min: { amount: '999.00', currency_code: 'MXN' }, returns_days: 15 },
}

const complete: Shop = {
  ...base,
  policies: { ...base.policies, warranty_months: 6 },
  legal: { name: 'Ejemplo SA de CV', tax_id: 'XAXX010101000', fiscal_address: 'Calle 1, CP 00000', service_address: null, privacy_officer: 'Datos personales', privacy_email: null },
}

describe('shopFieldValues', () => {
  it('covers every field and leaves what is not configured as null', () => {
    const v = shopFieldValues(base)
    expect(Object.keys(v).sort()).toEqual([...SHOP_MERGE_FIELDS].sort())
    expect(v['shop.returns_days']).toBe('15')
    expect(v['shop.whatsapp']).toBeNull()
    // Older server (no legal, no warranty): nothing is assumed.
    expect(v['shop.legal_name']).toBeNull()
    expect(v['shop.warranty_months']).toBeNull()
    expect(v['shop.privacy_email']).toBe('hola@tienda.example.com')
  })
  it('reads legal and warranty from the shop only', () => {
    const v = shopFieldValues(complete)
    expect(v['shop.legal_name']).toBe('Ejemplo SA de CV')
    expect(v['shop.warranty_months']).toBe('6')
    expect(shopWarrantyMonths({ policies: { ...base.policies, warranty_months: 0 } })).toBe(0)
    expect(shopFieldValues({ ...base, policies: { ...base.policies, warranty_months: 0 } })['shop.warranty_months']).toBeNull()
    expect(shopWarrantyMonths({ policies: { ...base.policies, warranty_months: -2 } })).toBeNull()
  })
  it('does not crash on a bare shop', () => {
    const v = shopFieldValues({ ...base, contact: {}, policies: {} } as unknown as Shop)
    expect(v['shop.email']).toBeNull()
    expect(v['shop.free_shipping_min']).toBeNull()
  })
})

describe('resolveShopText', () => {
  const values = shopFieldValues(base)
  it('substitutes fields with and without spaces and leaves foreign ones', () => {
    expect(resolveShopText('{{shop.name}} · {{ shop.domain }} · {{order.id}}', values).text).toBe('Tienda & Co · tienda.example.com · {{order.id}}')
  })
  it('never shows a text that cites a missing field (no placeholder to the buyer)', () => {
    const r = resolveShopText('Garantía de {{shop.warranty_months}} meses', values)
    expect(r.text).toBeNull()
    expect(r.missing).toEqual(['shop.warranty_months'])
  })
  it('refuses pending markers and legal drafts', () => {
    expect(resolveShopText('Actualizado: {{completar: fecha}}', values)).toMatchObject({ text: null, pending: true })
    expect(resolveShopText('<p><strong>[BORRADOR: REVISAR CON ABOGADO]</strong></p>', values)).toMatchObject({ text: null, draft: true })
    expect(resolveShopText('<p>[REVISAR CON ASESOR LEGAL] viejo</p>', values)).toMatchObject({ text: null, draft: true })
  })
  it('escapes values inserted in HTML', () => {
    const evil = shopFieldValues({ ...base, name: '<img src=x onerror="a()">' })
    expect(resolveShopText('<p>{{shop.name}}</p>', evil, { html: true }).text).toBe('<p>&lt;img src=x onerror=&quot;a()&quot;&gt;</p>')
  })
})

describe('mergeShopSections', () => {
  const faq: Section = {
    id: 'faq',
    type: 'faq',
    props: {
      heading: 'Preguntas',
      items: [
        { question: '¿Tienen garantía?', answer: 'Sí, de {{shop.warranty_months}} meses.' },
        { question: '¿Devoluciones?', answer: 'Tienes {{shop.returns_days}} días.' },
      ],
    },
  }
  const legal: Section = { id: 'legal', type: 'rich_text', props: { content: '<p>{{shop.legal_name}}, RFC {{shop.tax_id}}</p>' } }

  it('drops only the list entry that cannot be shown', () => {
    const r = mergeShopSections([faq], base)
    const items = r.sections[0]!.props.items as { answer: string }[]
    expect(items).toEqual([{ question: '¿Devoluciones?', answer: 'Tienes 15 días.' }])
    expect(r.dropped).toEqual([{ section: 'faq', item: 0, missing: ['shop.warranty_months'], pending: false, draft: false }])
  })
  it('drops a whole section whose own text cannot be shown, so the page 404s', () => {
    const r = mergeShopSections([legal], base)
    expect(r.sections).toEqual([])
    expect(pagePublishable(r)).toBe(false)
    const ok = mergeShopSections([legal], complete)
    expect(ok.sections[0]!.props.content).toBe('<p>Ejemplo SA de CV, RFC XAXX010101000</p>')
    expect(pagePublishable(ok)).toBe(true)
  })
  it('never publishes a page with a draft section, even if other sections are fine', () => {
    const draft: Section = { id: 'd', type: 'rich_text', props: { content: '<p>[BORRADOR: REVISAR CON ABOGADO]</p>' } }
    const r = mergeShopSections([faq, draft], complete)
    expect(r.sections.map((s) => s.id)).toEqual(['faq'])
    expect(pagePublishable(r)).toBe(false)
  })
  it('does not mutate its input', () => {
    const copy = structuredClone(faq)
    mergeShopSections([faq], complete)
    expect(faq).toEqual(copy)
  })
  it('mergeShopText returns null for an unshowable title', () => {
    expect(mergeShopText('Aviso de {{shop.name}}', base)).toBe('Aviso de Tienda & Co')
    expect(mergeShopText('{{shop.legal_name}}', base)).toBeNull()
  })
})

describe('business identity', () => {
  it('lists only what exists and needs legal name + address + a contact', () => {
    expect(businessIdentity(base).map((r) => r.key)).toEqual(['phone', 'email'])
    expect(identityComplete(base)).toBe(false)
    expect(businessIdentity(complete).map((r) => r.key)).toEqual(['legal_name', 'tax_id', 'fiscal_address', 'phone', 'email'])
    expect(identityComplete(complete)).toBe(true)
    expect(shopLegal(complete).privacy_email).toBe('hola@tienda.example.com')
    expect(shopLegal({ contact: base.contact, legal: { ...complete.legal!, name: '   ' } }).name).toBeNull()
  })
})

describe('isInternalProduct', () => {
  it('flags qa/interno tags and all-TEST- SKUs only', () => {
    expect(isInternalProduct({ tags: ['QA'], variants: [{ sku: 'X' }] })).toBe(true)
    expect(isInternalProduct({ tags: [], variants: [{ sku: 'TEST-PAY-5' }] })).toBe(true)
    expect(isInternalProduct({ tags: [], variants: [{ sku: 'TEST-1' }, { sku: 'REAL-2' }] })).toBe(false)
    expect(isInternalProduct({ tags: [], variants: [] })).toBe(false)
    expect(isInternalProduct(null)).toBe(false)
  })
})

describe('shop.paymentMethods (mock)', () => {
  it('serves the checkout list with the public options only', async () => {
    const mock = createMockStorefront({
      paymentMethods: [
        { key: 'manual', kind: 'builtin', default: true },
        {
          key: 'mercadopago',
          kind: 'provider',
          default: false,
          options: [{ key: 'card', family: 'card', redirect: false }, { key: 'cash', points: [{ id: 'oxxo', label: 'OXXO' }] }],
          client: { public_key: 'TEST-pub' },
        },
      ],
    })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'pk_mock', fetch: mock.fetch })
    const res = await sf.shop.paymentMethods()
    expect(res).toEqual({
      methods: [
        { key: 'manual', kind: 'builtin', options: [] },
        { key: 'mercadopago', kind: 'provider', options: [{ key: 'card', family: 'card' }, { key: 'cash', points: ['OXXO'] }] },
      ],
      market: null,
    })
    expect(JSON.stringify(res)).not.toContain('TEST-pub')
  })
})
