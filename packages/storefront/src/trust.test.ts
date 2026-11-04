import { describe, expect, it } from 'vitest'
import { createMockStorefront } from './mock/index.js'
import { createStorefrontClient } from './client.js'
import {
  SHOP_MERGE_FIELDS,
  businessIdentity,
  identityComplete,
  isInternalProduct,
  hasLegalDraftNotice,
  isLegalHandle,
  mergeShopPage,
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
    expect(shopWarrantyMonths({ policies: { ...base.policies, warranty_months: 0 } })).toBeNull()
    expect(shopFieldValues({ ...base, policies: { ...base.policies, returns_days: 0 } })['shop.returns_days']).toBeNull()
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
  it('substitutes fields with and without spaces', () => {
    expect(resolveShopText('{{shop.name}} · {{ shop.domain }}', values).text).toBe('Tienda & Co · tienda.example.com')
  })
  it('never shows an unknown or misspelled placeholder', () => {
    for (const t of ['&#123;&#123;shop.rfc&#125;&#125;', '&lbrace;&lbrace;x&rbrace;&rbrace;', '{{shop.name}', 'a {{ sin cierre', 'RFC {{shop.rfc}}', '{{Shop.Name}}', '{{order.id}}', 'Fecha {{completar : fecha}}', 'Fecha {{completar}}', '{{COMPLETAR: x}}', '{{__proto__}}', '{{constructor}}']) {
      expect(resolveShopText(t, values).text, t).toBeNull()
    }
    expect(resolveShopText('RFC {{shop.rfc}}', values).unknown).toEqual(['shop.rfc'])
    expect(() => resolveShopText('<p>{{constructor}}</p>', values, { html: true })).not.toThrow()
  })
  it('catches a marker that arrives inside a configured value', () => {
    const v = shopFieldValues({ ...complete, legal: { ...complete.legal!, name: '{{completar: razón social}}' } })
    expect(resolveShopText('{{shop.legal_name}}', v).text).toBeNull()
    expect(resolveShopText('{{shop.legal_name}}', shopFieldValues({ ...complete, legal: { ...complete.legal!, name: '[BORRADOR: REVISAR CON ABOGADO]' } })).text).toBeNull()
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
  it('detects the draft notice in any spelling', () => {
    for (const t of ['<p><strong>[BORRADOR:</strong> REVISAR CON ABOGADO]</p>', '<p>[BORRADOR:&nbsp;REVISAR CON ABOGADO]</p>', '[Borrador: revisar con abogado]', '&#91;BORRADOR: REVISAR CON ABOGADO&#93;', '[BORRA\u00adDOR: REVISAR CON ABOGADO]', 'BORRA&shy;DOR: REVISAR', 'BORRADOR: REVISAR CON ABOGADO', '<p>[BORRADOR:&#xA0;REVISAR]</p>', 'REVISAR CON ASESOR LEGAL', 'Revisa esto: revisar con un abogado']) {
      expect(hasLegalDraftNotice(t), t).toBe(true)
      expect(resolveShopText(t, values).text, t).toBeNull()
    }
    expect(hasLegalDraftNotice('Sin borrador aquí')).toBe(false)
    expect(hasLegalDraftNotice('Guarda el [borrador] de tu pedido')).toBe(false)
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
    expect(r.dropped).toEqual([{ section: 'faq', path: 'items.0', item: 0, missing: ['shop.warranty_months'], pending: false, draft: false, unknown: [] }])
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
  it('a draft notice inside a list makes the page unpublishable', () => {
    const blocks: Section = { id: 'aviso', type: 'legal_doc', props: { title: 'Aviso', blocks: [{ text: '[BORRADOR: REVISAR CON ABOGADO]' }, { text: 'Cláusula 1' }] } }
    expect(pagePublishable(mergeShopSections([blocks], complete))).toBe(false)
  })
  it('strict (legal) pages are not published with any hole', () => {
    const intro: Section = { id: 'a', type: 'rich_text', props: { content: '<p>Intro</p>' } }
    const officer: Section = { id: 'b', type: 'rich_text', props: { content: '<p>Responsable: {{shop.privacy_officer}}</p>' } }
    const r = mergeShopSections([intro, officer], base)
    expect(pagePublishable(r)).toBe(true)
    expect(pagePublishable(r, { strict: true })).toBe(false)
    expect(pagePublishable(mergeShopSections([intro, officer], complete), { strict: true })).toBe(true)
  })
  it('drops a section whose list lost every entry, and reports paths', () => {
    const only: Section = { id: 'faq', type: 'faq', props: { heading: 'Garantía', items: [{ question: 'x', answer: '{{shop.warranty_months}} meses' }] } }
    const r = mergeShopSections([only], base)
    expect(r.sections).toEqual([])
    expect(r.dropped[0]).toMatchObject({ section: 'faq', path: 'items.0', item: 0 })
    const grid: Section = { id: 's', type: 'grid', props: { rows: [['ok', '{{shop.tax_id}}'], ['b']] } }
    const g = mergeShopSections([grid], base)
    // A table row goes whole, never a label without its value.
    expect(g.sections[0]!.props.rows).toEqual([['b']])
    expect(g.dropped[0]).toMatchObject({ path: 'rows.0' })
  })
  it('a nested object with a missing field drops the whole section', () => {
    const s: Section = { id: 'n', type: 'x', props: { card: { title: 'RFC {{shop.tax_id}}' } } }
    expect(mergeShopSections([s], base).sections).toEqual([])
  })
  it('mergeShopPage resolves title and SEO and is strict for legal handles', () => {
    const page = { handle: 'aviso-de-privacidad', title: 'Aviso de {{shop.name}}', seo: { title: null, description: '{{shop.legal_name}}' }, sections: [
      { id: 'a', type: 'rich_text', props: { content: '<p>Hola</p>' } },
      { id: 'b', type: 'rich_text', props: { content: '<p>{{shop.privacy_officer}}</p>' } },
    ] }
    const r = mergeShopPage(page, base)
    expect(r.publishable).toBe(false)
    expect(r.page.title).toBe('Aviso de Tienda & Co')
    expect(r.page.seo.description).toBeNull()
    expect(mergeShopPage({ ...page, handle: 'preguntas-frecuentes' }, base).publishable).toBe(true)
    expect(mergeShopPage({ ...page, title: '[BORRADOR: REVISAR CON ABOGADO] Aviso' }, complete).publishable).toBe(false)
    expect(mergeShopPage(page, complete).publishable).toBe(true)
    expect(isLegalHandle('politica-de-garantia')).toBe(true)
    expect(isLegalHandle('términos')).toBe(true)
    expect(isLegalHandle('preguntas-frecuentes')).toBe(false)
    expect(isLegalHandle('returning-customers')).toBe(false)
    expect(isLegalHandle('derechos-arco')).toBe(true)
    expect(isLegalHandle('aviso-privacidad')).toBe(true)
    expect(isLegalHandle('nuestros-terminos')).toBe(true)
    expect(isLegalHandle('preguntas-garantizadas')).toBe(false)
  })
  it('does not mutate its input', () => {
    const copy = structuredClone(faq)
    mergeShopSections([faq], complete)
    expect(faq).toEqual(copy)
  })
  it('mergeShopText returns null for an unshowable title', () => {
    expect(mergeShopText('Aviso de {{shop.name}}', base)).toBe('Aviso de Tienda & Co')
    expect(mergeShopText('{{shop.legal_name}}', base)).toBeNull()
    expect(mergeShopText('', base)).toBeNull()
  })
})

describe('third review', () => {
  it('strict legal pages refuse old-template blanks', () => {
    const old = { handle: 'aviso-de-privacidad', title: 'Aviso', seo: { title: null, description: null }, sections: [
      { id: 'a', type: 'rich_text', props: { content: '<p>[RAZÓN SOCIAL O NOMBRE COMPLETO], con domicilio en [DOMICILIO COMPLETO]. Fecha: [FECHA].</p>' } },
    ] }
    expect(mergeShopPage(old, complete).publishable).toBe(false)
    // Outside legal pages a bracketed upper-case text is not a blank to block.
    expect(mergeShopPage({ ...old, handle: 'nosotros' }, complete).publishable).toBe(true)
    expect(mergeShopPage({ ...old, sections: [{ id: 'a', type: 'rich_text', props: { content: '<p>Texto [ver nota] final.</p>' } }] }, complete).publishable).toBe(true)
  })
  it('never lets a field value turn a link into javascript:', () => {
    const evil = shopFieldValues({ ...complete, legal: { ...complete.legal!, privacy_email: 'javascript:alert(1)' } })
    expect(resolveShopText('<a href="{{shop.privacy_email}}">x</a>', evil, { html: true })).toMatchObject({ text: null, unsafe: true })
    expect(resolveShopText('<a href="mailto:{{shop.privacy_email}}">x</a>', shopFieldValues(complete), { html: true }).text).toContain('mailto:hola@')
    const ent = shopFieldValues({ ...complete, legal: { ...complete.legal!, privacy_email: '&#106;avascript:alert(1)' } })
    expect(resolveShopText('<a href="{{shop.privacy_email}}">x</a>', ent, { html: true }).text).toBeNull()
  })
  it('a __proto__ prop does not change the prototype of the output', () => {
    const props = JSON.parse('{"__proto__": {"polluted": true}, "heading": "Hola"}')
    const r = mergeShopSections([{ id: 'p', type: 'x', props }], complete)
    const out = r.sections[0]!.props as Record<string, unknown>
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect((out as { polluted?: boolean }).polluted).toBeUndefined()
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })
  it('drops absurdly deep props instead of throwing', () => {
    let deep: Record<string, unknown> = { text: 'fin' }
    for (let i = 0; i < 5000; i++) deep = { n: deep }
    expect(() => mergeShopSections([{ id: 'd', type: 'x', props: deep }], complete)).not.toThrow()
    expect(mergeShopSections([{ id: 'd', type: 'x', props: deep }], complete).sections).toEqual([])
  })
  it('warranty_term is singular-aware', () => {
    expect(shopFieldValues({ ...complete, policies: { ...complete.policies, warranty_months: 1 } })['shop.warranty_term']).toBe('1 mes')
    expect(shopFieldValues(complete)['shop.warranty_term']).toBe('6 meses')
    expect(shopFieldValues(base)['shop.warranty_term']).toBeNull()
  })
})

describe('performance', () => {
  it('stays linear on hostile input', () => {
    const values = shopFieldValues(base)
    const t0 = Date.now()
    resolveShopText('{{'.repeat(50000), values)
    resolveShopText('<'.repeat(50000), values, { html: true })
    resolveShopText('&#'.repeat(50000) + '[BORRADOR', values)
    expect(Date.now() - t0).toBeLessThan(1500)
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
    expect(identityComplete({ ...complete, legal: { ...complete.legal!, tax_id: null } })).toBe(false)
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
