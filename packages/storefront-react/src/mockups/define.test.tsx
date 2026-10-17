import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import {
  GenericMockup,
  MockupFrame,
  MockupProvider,
  MockupText,
  ProductImage,
  SupplementMockup,
  createMockupRegistry,
  createStoreMockups,
  defaultMockupRegistry,
  defineMockup,
  mockupWordMax,
  supplementMockupData,
  tone,
  wrapMockupText,
  type MockupComponentProps,
  type ProductImageProduct,
} from './index.js'

const html = (el: React.ReactElement) => renderToString(el)
const textOf = (s: string) => s.replace(/<title>.*?<\/title>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const termo: ProductImageProduct = { title: 'Termo', product_type: 'Termo', featured_image: null }
const shaker: ProductImageProduct = { title: 'Shaker 600 ml', product_type: 'Shaker', category: { id: 'c', handle: 'accesorios', title: 'Accesorios' }, featured_image: null }
const tire: ProductImageProduct = { title: 'Llanta', attributes: { size_key: '205/55R16' }, featured_image: null }

type Helmet = { title: string; shell: string | null }
function HelmetMockup({ data, label, labels: _l, ...svg }: MockupComponentProps<Helmet>) {
  return (
    <MockupFrame kind="helmet" label={label} {...svg}>
      <path d="M90 230a110 110 0 0 1 220 0v40H90z" style={tone('surface')} />
      <MockupText lines={wrapMockupText(data.title, 24, 2)} x={200} y={330} size={22} />
      {data.shell ? <MockupText lines={[data.shell]} x={200} y={372} size={14} tone="muted" /> : null}
    </MockupFrame>
  )
}

describe('defineMockup', () => {
  it('returns a frozen, checked definition', () => {
    const d = defineMockup({ kind: 'helmet', render: HelmetMockup })
    expect(Object.isFrozen(d)).toBe(true)
    expect(() => defineMockup({ kind: 'Bad Kind', render: HelmetMockup })).toThrow(TypeError)
    expect(() => defineMockup({ kind: 'ok', render: undefined as never })).toThrow(/render is required/)
    expect(() => defineMockup({ kind: 'ok', render: HelmetMockup, match: 'x' as never })).toThrow(/match/)
  })
})

describe('createStoreMockups', () => {
  // God's Nutrition style: everything is a supplement except accessories, which use the base generic box.
  const supplement = defineMockup({ kind: 'supplement', match: (p) => p.category?.handle !== 'accesorios', render: SupplementMockup })
  const accessory = defineMockup({ kind: 'accessory', match: (p) => p.category?.handle === 'accesorios', render: GenericMockup })
  const store = createStoreMockups([accessory, supplement], { labels: { illustration: 'Imagen ilustrativa' } })

  it('gives MockupProvider a registry, a resolveKind and labels', () => {
    expect(store.kinds).toEqual(['accessory', 'supplement'])
    expect(store.registry.kinds()).toEqual(['tire', 'part', 'supplement', 'generic', 'accessory'])
    const out = html(
      <MockupProvider {...store}>
        <ProductImage product={termo} />
        <ProductImage product={shaker} />
      </MockupProvider>,
    )
    expect(out).toContain('data-mockup="supplement"')
    expect(out).toContain('aria-label="Imagen ilustrativa: Termo"')
    expect(out).toContain('data-mockup="generic"') // accessory drawn with the base box
    expect(out).toContain('aria-label="Imagen ilustrativa: Shaker 600 ml"')
  })

  it('without a match, the SDK guess and mockup_kind still decide', () => {
    const s = createStoreMockups([defineMockup({ kind: 'helmet', render: HelmetMockup, data: (p) => ({ title: p.title, shell: null }) })])
    expect(html(<MockupProvider {...s}><ProductImage product={tire} /></MockupProvider>)).toContain('data-mockup="tire"')
    expect(html(<MockupProvider {...s}><ProductImage product={{ title: 'Casco', attributes: { mockup_kind: 'helmet' } }} /></MockupProvider>)).toContain('data-mockup="helmet"')
    expect(html(<MockupProvider {...s}><ProductImage product={termo} /></MockupProvider>)).toContain('data-mockup="generic"')
  })

  it('a store kind with data and describe; reusing a base kind replaces it', () => {
    const helmet = defineMockup<Helmet>({
      kind: 'tire', // replaces the base tire for this store only
      match: (p) => p.product_type === 'Casco',
      data: (p) => ({ title: p.title, shell: typeof p.attributes?.shell === 'string' ? p.attributes.shell : null }),
      describe: (d, labels) => `${labels.illustration}: casco ${d.title}`,
      render: HelmetMockup,
    })
    const s = createStoreMockups([helmet])
    const out = html(<MockupProvider {...s}><ProductImage product={{ title: 'X', product_type: 'Casco', attributes: { shell: 'Fibra' } }} /></MockupProvider>)
    expect(out).toContain('data-mockup="helmet"')
    expect(out).toContain('aria-label="Ilustración de referencia: casco X"')
    expect(out).toContain('Fibra')
    expect(defaultMockupRegistry.get('tire')!.component).not.toBe(HelmetMockup) // the global registry is untouched
  })

  it('base: none / a registry; duplicates are rejected', () => {
    const none = createStoreMockups([defineMockup({ kind: 'generic', render: HelmetMockup, data: (p) => ({ title: p.title, shell: null }) })], { base: 'none' })
    expect(none.registry.kinds()).toEqual(['generic'])
    expect(html(<MockupProvider {...none}><ProductImage product={tire} /></MockupProvider>)).toContain('data-mockup="helmet"')
    const extended = createStoreMockups([], { base: createMockupRegistry({ generic: GenericMockup }) })
    expect(extended.registry.kinds()).toEqual(['generic'])
    expect(() => createStoreMockups([supplement, supplement])).toThrow(/defined twice/)
  })
})

describe('supplement: long words shrink the font instead of being cut', () => {
  it('CREATINA MONOHIDRATADA keeps the whole word', () => {
    const p: ProductImageProduct = { title: 'CREATINA MONOHIDRATADA', vendor: 'GN', product_type: 'Creatina', featured_image: null }
    const out = html(<ProductImage product={p} />)
    expect(textOf(out)).toContain('MONOHIDRATADA')
    expect(out).not.toContain('MONOHIDRATA…')
    const size = Number(/font-size="(\d+)" font-weight="900"/.exec(out)?.[1])
    expect(size).toBeGreaterThanOrEqual(12)
    expect(size).toBeLessThan(26)
  })

  it('short names keep their size; words past the minimum font are still cut', () => {
    const short = html(<ProductImage product={{ title: 'Whey', product_type: 'Proteína' }} />)
    expect(short).toContain('font-size="26" font-weight="900"')
    const long = textOf(html(<ProductImage product={{ title: 'Superproteínaconnombreextremadamentelargo', product_type: 'Proteína' }} />))
    expect(long).toContain('…')
    expect(supplementMockupData({ title: 'x' }).shape).toBe('tub')
  })

  it('wrapMockupText with wordMax', () => {
    expect(wrapMockupText('CREATINA MONOHIDRATADA', 12, 3)).toEqual(['CREATINA', 'MONOHIDRATA…'])
    expect(wrapMockupText('CREATINA MONOHIDRATADA', 12, 3, 15)).toEqual(['CREATINA', 'MONOHIDRATADA'])
    expect(wrapMockupText('SUPERCALIFRAGILISTICO', 12, 3, 15)).toEqual(['SUPERCALIFRAGI…'])
    expect(wrapMockupText('uno dos tres cuatro', 8, 2, 8)).toEqual(['uno dos', 'tres…'])
    expect(mockupWordMax(118, 12, 0.64)).toBe(15)
  })
})
