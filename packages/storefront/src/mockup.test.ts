import { describe, expect, it } from 'vitest'
import {
  cleanMockupText,
  genericMockupData,
  mockupDataFromProduct,
  mockupMonogram,
  partMockupData,
  resolveMockupKind,
  supplementMockupData,
  tireMockupData,
  type MockupProduct,
} from './mockup.js'
import { createMockStorefront } from './mock/index.js'
import { createStorefrontClient } from './client.js'

const base = (p: Partial<MockupProduct>): MockupProduct => ({ title: 'Producto', tags: [], attributes: {}, ...p })

describe('cleanMockupText', () => {
  it('collapses whitespace, strips control and bidi characters', () => {
    expect(cleanMockupText('  a\n\tb\u0000c\u202Ed  ')).toBe('a b c d')
  })
  it('caps by code points with an ellipsis', () => {
    expect(cleanMockupText('abcdef', 4)).toBe('abc…')
    expect(cleanMockupText('💪💪💪💪💪', 3)).toBe('💪💪…')
    expect(Array.from(cleanMockupText('x'.repeat(500))!).length).toBe(80)
  })
  it('returns null for empty, boolean and non-finite values', () => {
    expect(cleanMockupText('   ')).toBeNull()
    expect(cleanMockupText(null)).toBeNull()
    expect(cleanMockupText(true)).toBeNull()
    expect(cleanMockupText(Number.NaN)).toBeNull()
    expect(cleanMockupText(0)).toBe('0')
  })
  it('keeps markup as plain text (escaping is the renderer job)', () => {
    expect(cleanMockupText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })
})

describe('mockupMonogram', () => {
  it('takes initials or the first two letters', () => {
    expect(mockupMonogram('Casa Textil')).toBe('CT')
    expect(mockupMonogram('paraguas')).toBe('PA')
    expect(mockupMonogram('  ñandú  azul')).toBe('ÑA')
    expect(mockupMonogram('')).toBeNull()
    expect(mockupMonogram('!!!')).toBeNull()
  })
})

describe('resolveMockupKind', () => {
  it('uses the explicit mockup_kind attribute first', () => {
    expect(resolveMockupKind(base({ attributes: { mockup_kind: 'Supplement', size_key: '205/55R16' } }))).toBe('supplement')
    expect(resolveMockupKind(base({ attributes: { mockup_kind: 'helmet' } }))).toBe('helmet')
    expect(resolveMockupKind(base({ attributes: { mockup_kind: 'helmet' } }), { kinds: ['tire'] })).toBe('generic')
    expect(resolveMockupKind(base({ attributes: { mockup_kind: '<bad kind>' } }))).toBe('generic')
  })
  it('detects tires and parts by attributes', () => {
    expect(resolveMockupKind(base({ attributes: { size_key: '205/55R16' } }))).toBe('tire')
    expect(resolveMockupKind(base({ attributes: { section_width_mm: 205 } }))).toBe('tire')
    expect(resolveMockupKind(base({ attributes: { oem_number: '04465-02220' } }))).toBe('part')
    expect(resolveMockupKind(base({ attributes: { part_number: '' } }))).toBe('generic')
  })
  it('detects kinds by product type, category and tags', () => {
    expect(resolveMockupKind(base({ product_type: 'Neumático' }))).toBe('tire')
    expect(resolveMockupKind(base({ category: { id: 'c', handle: 'refacciones-frenos', title: 'Frenos' } }))).toBe('part')
    expect(resolveMockupKind(base({ tags: ['proteína', 'nuevo'] }))).toBe('supplement')
    expect(resolveMockupKind(base({ product_type: 'Pre-entreno' }))).toBe('supplement')
    expect(resolveMockupKind(base({ product_type: 'Playera', tags: ['algodón'] }))).toBe('generic')
  })
  it('does not read the title (avoids "funda para llanta" style false positives)', () => {
    expect(resolveMockupKind(base({ title: 'Funda para llanta de refacción' }))).toBe('generic')
  })
  it('accepts custom rules and fallback', () => {
    const rules = [{ kind: 'helmet', text: /casco/i }]
    expect(resolveMockupKind(base({ product_type: 'Casco' }), { rules })).toBe('helmet')
    expect(resolveMockupKind(base({ product_type: 'Llanta' }), { rules, fallback: 'box' })).toBe('box')
  })
  it('classifies the mock catalog', async () => {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const { nodes } = await sf.products.list({ first: 50 })
    const kinds = new Map(nodes.map((p) => [p.handle, resolveMockupKind(p)]))
    expect(kinds.get('llanta-205-55-r16-touring')).toBe('tire')
    expect(kinds.get('playera-basica')).toBe('generic')
  })
})

describe('tireMockupData', () => {
  it('reads the OPS tire pack attributes', () => {
    const d = tireMockupData(
      base({
        title: 'Llanta X',
        vendor: 'Marca Norte',
        attributes: { size_key: '205/55R16', section_width_mm: 205, aspect_ratio: 55, rim_diameter_in: 16, load_index: 91, speed_rating: 'V', model: 'Touring' },
      }),
    )
    expect(d).toMatchObject({ kind: 'tire', size: '205/55R16', width: '205', aspect: '55', rim: '16', service: '91V', model: 'Touring', brand: 'Marca Norte', lightTruck: false })
  })
  it('builds the size only when width, aspect and rim are all known', () => {
    expect(tireMockupData(base({ attributes: { width: 195, aspect: 65, rim: 15 } })).size).toBe('195/65R15')
    const partial = tireMockupData(base({ attributes: { width: 195, rim: 15 } }))
    expect(partial.size).toBeNull()
    expect(partial.width).toBeNull()
  })
  it('never invents: empty attributes give empty fields', () => {
    const d = tireMockupData(base({ title: 'Llanta' }))
    expect(d).toMatchObject({ size: null, service: null, model: null, brand: null, lightTruck: false, runFlat: false })
  })
  it('handles dual load indexes, LT and run flat', () => {
    const d = tireMockupData(base({ attributes: { load_service: '121/118', speed_rating: 'S', light_truck: true, runflat: 'sí' } }))
    expect(d).toMatchObject({ service: '121/118S', lightTruck: true, runFlat: true })
    expect(tireMockupData(base({ attributes: { load_service: '91V', speed_rating: 'V' } })).service).toBe('91V')
  })
})

describe('partMockupData', () => {
  it('reads part number, OEM, fitment and position', () => {
    const d = partMockupData(
      base({
        title: 'Balatas delanteras',
        vendor: 'Marca',
        category: { id: 'c', handle: 'frenos', title: 'Frenos' },
        attributes: { part_number: 'BD-1234', oem_number: '04465-02220', fitment: 'Versa 2012–2019', position: 'delantera' },
      }),
    )
    expect(d).toMatchObject({ partNumber: 'BD-1234', oemNumber: '04465-02220', fitment: 'Versa 2012–2019', position: 'delantera', category: 'Frenos' })
  })
  it('does not use the SKU as a part number', () => {
    expect(partMockupData(base({ attributes: { sku: 'X1' } })).partNumber).toBeNull()
  })
})

describe('supplementMockupData', () => {
  const product = base({
    title: 'Whey Protein',
    options: [
      { name: 'Sabor', values: ['Chocolate', 'Vainilla'] },
      { name: 'Presentación', values: ['5 lb'] },
    ],
    attributes: { servings: 70, form: 'polvo' },
  })
  it('shows the flavor only when one is selected or the option has one value', () => {
    expect(supplementMockupData(product).flavor).toBeNull()
    expect(supplementMockupData(product, { selected_options: [{ name: 'Sabor', value: 'Chocolate' }] }).flavor).toBe('Chocolate')
    expect(supplementMockupData(product).presentation).toBe('5 lb')
    expect(supplementMockupData(product).servings).toBe(70)
    expect(supplementMockupData(product).shape).toBe('tub')
  })
  it('picks the container shape from the form attribute', () => {
    expect(supplementMockupData(base({ attributes: { form: 'Cápsulas' } })).shape).toBe('bottle')
    expect(supplementMockupData(base({ attributes: { envase: 'bolsa' } })).shape).toBe('bag')
  })
})

describe('genericMockupData / mockupDataFromProduct', () => {
  it('falls back to generic for unknown kinds', () => {
    const p = base({ title: 'Paraguas compacto', product_type: 'Paraguas' })
    expect(genericMockupData(p)).toMatchObject({ monogram: 'PC', category: 'Paraguas' })
    expect(mockupDataFromProduct('helmet', p).kind).toBe('generic')
    expect(mockupDataFromProduct('tire', p).kind).toBe('tire')
  })
  it('never carries prices', () => {
    const p = { ...base({ title: 'X' }), price_range: { min: { amount: '1.00', currency_code: 'MXN' } } } as MockupProduct
    for (const k of ['tire', 'part', 'supplement', 'generic'] as const) {
      expect(JSON.stringify(mockupDataFromProduct(k, p))).not.toMatch(/amount|MXN|price/)
    }
  })
})
