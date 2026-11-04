import { describe, expect, it } from 'vitest'
import { distinctProductTitles, normalizeName, normalizeTitleText, productPartNumber, productTitle } from './product-title.js'
import protek from './__fixtures__/protek-titles.json' with { type: 'json' }

type Row = { sku: string; title: string; vendor: string | null; attributes: Record<string, string | number | boolean>; expected: string; expected_identifiers: string }

const asProduct = (r: Pick<Row, 'sku' | 'title' | 'vendor' | 'attributes'>, id = r.sku) => ({ id, title: r.title, vendor: r.vendor, attributes: r.attributes, variants: [{ sku: r.sku }] as never })

// 66 real ProtekAuto products (read-only export of the catalog, 3-nov-2026): ERP name + attributes → title.
describe('productTitle on the real ProtekAuto catalog', () => {
  it.each((protek as Row[]).map((r) => [r.sku, r] as const))('%s', (_sku, r) => {
    expect(productTitle(asProduct(r))).toBe(r.expected)
    expect(productTitle(asProduct(r), { identifiers: true })).toBe(r.expected_identifiers)
  })

  it('never shouts, never repeats the year, never leaves a raw ERP abbreviation', () => {
    for (const r of protek as Row[]) {
      const t = productTitle(asProduct(r))
      expect(t).not.toMatch(/\b((?:19|20)\d{2}) \1\b/)
      expect(t).not.toMatch(/\b(IZQ|DER|DEL|TRAS|INF|SUP|DIRECCION|ROTULA|CERAMICA)\b/)
      const words = t.replace(/[^\p{L} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 3)
      expect(words.filter((w) => w === w.toUpperCase() && /[AEIOU]/.test(w)).length).toBeLessThanOrEqual(2)
    }
  })

  it('keeps every code of the ERP name (part numbers, chassis, sizes)', () => {
    for (const r of protek as Row[]) {
      const t = productTitle(asProduct(r)).toLowerCase().replace(/\s/g, '')
      for (const code of r.title.split(/\s+/).filter((w) => /\d/.test(w) && /[A-Z]/i.test(w) && !/^\d+(MM|CM|L|LT|LTS|ML|X\d+)\.?$/i.test(w) && !/^C\/\d+$/i.test(w))) {
        expect(t).toContain(code.toLowerCase().replace(/[.,()/:]+$/g, '').replace(/^[(]/, ''))
      }
    }
  })
})

describe('the audit cases (HyperDigital, 31-oct-2026)', () => {
  const byId = (sku: string) => (protek as Row[]).find((r) => r.sku === sku)!
  it('two different ball joints with the same ERP name read different with identifiers and in a list', () => {
    const a = asProduct(byId('UD2510003'))
    const b = asProduct(byId('UD2510001'))
    expect(a.title).toBe(b.title)
    expect(productTitle(a, { identifiers: true })).not.toBe(productTitle(b, { identifiers: true }))
    const list = distinctProductTitles([a, b])
    expect(list.get('UD2510003')).toBe('Rótula izquierda 4x2 para Toyota Tacoma 2.4 L4 1995–2004 · Unicar UD2510003')
    expect(list.get('UD2510001')).toBe('Rótula izquierda 4x2 para Toyota Tacoma 2.4 L4 1995–2004 · Unicar UD2510001')
  })

  it('«Tsuru 1.6 L4 1992 1992» collapses to one year', () => {
    expect(productTitle(asProduct(byId('GA6619')))).toBe('Filtro de aire para Nissan Tsuru 1.6 L4 1992')
  })

  it('a title alone in a list keeps its short form', () => {
    const list = distinctProductTitles([asProduct(byId('GA6619')), asProduct(byId('UD2510003'))])
    expect(list.get('GA6619')).toBe('Filtro de aire para Nissan Tsuru 1.6 L4 1992')
  })

  it('left and right tie rod ends (`R` / `L` detail) are told apart', () => {
    expect(productTitle(asProduct(byId('MR1202548')))).toBe('Terminal de dirección derecha para Ford Ecosport 2.0 L4 2004–2012')
    expect(productTitle(asProduct(byId('MR1202549')))).toBe('Terminal de dirección izquierda para Ford Ecosport 2.0 L4 2004–2012')
  })
})

describe('normalizeTitleText (any vertical)', () => {
  it.each([
    ['FILTRO AIRE NISSAN TSURU 1.6 L4 1992 1992', 'Filtro aire Nissan Tsuru 1.6 L4 1992'],
    ['ROTULA IZQ 4X2 TOYOTA TACOMA 2.4 L4 1995 2004', 'Rótula izq. 4x2 Toyota Tacoma 2.4 L4 1995 2004'],
    ['CAJA DIRECCION HIDRAULICA C/BIELETAS S/TERMINALES', 'Caja dirección hidráulica con bieletas sin terminales'],
    ['TORNILLO BRAZO ELEVADOR ELEVADOR', 'Tornillo brazo elevador'],
    ['PROTEINA WHEY ISOLATE 2 LB CHOCOLATE', 'Proteína Whey Isolate 2 lb Chocolate'],
    ['LLANTA 205/55 R16 91V', 'Llanta 205/55 R16 91V'],
    ['ACEITE 5W30 5 LTS', 'Aceite 5W30 5 l'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeTitleText(raw)).toBe(expected)
  })

  it('leaves mixed-case titles as the merchant wrote them (only spaces and trailing years)', () => {
    expect(normalizeTitleText('Proteína Whey  Gold Standard 2 lb')).toBe('Proteína Whey Gold Standard 2 lb')
    expect(normalizeTitleText('Producto de prueba (pago y envío)')).toBe('Producto de prueba (pago y envío)')
    expect(normalizeTitleText('Balata Fritec para Aveo 2018 2018')).toBe('Balata Fritec para Aveo 2018')
  })

  it('free text: only an equal trailing pair collapses; a model number is never read as a year', () => {
    expect(normalizeTitleText('PEUGEOT 2008 1.6 L4')).toBe('Peugeot 2008 1.6 L4')
    expect(normalizeTitleText('KIT 2020 2010')).toBe('Kit 2020 2010')
    expect(normalizeTitleText('FILTRO ACEITE PEUGEOT 2008 2020')).toBe('Filtro aceite Peugeot 2008 2020')
    expect(normalizeTitleText('PEUGEOT 2008 2013 2013')).toBe('Peugeot 2008 2013')
    expect(normalizeTitleText('RIN 15 15 PULG')).toBe('Rin 15 15 pulg.')
  })

  it('codes are not units: LT trims, 3M, 2L engines', () => {
    expect(normalizeTitleText('CHEVROLET SILVERADO 1500 LT 2019')).toBe('Chevrolet Silverado 1500 LT 2019')
    expect(normalizeTitleText('SILVERADO LT 2019 2021')).toBe('Silverado LT 2019 2021')
    expect(normalizeTitleText('CINTA 3M')).toBe('Cinta 3M')
    expect(normalizeTitleText('TOYOTA HILUX 2L')).toBe('Toyota Hilux 2L')
    expect(normalizeTitleText('CHEVROLET AVEO 1.6 LT 2012')).toBe('Chevrolet Aveo 1.6 LT 2012')
    expect(normalizeTitleText('SPARK 1.2 LT 2015 2015')).toBe('Spark 1.2 LT 2015')
    expect(normalizeTitleText('ACEITE 4.73L')).toBe('Aceite 4.73 l')
    expect(normalizeTitleText('ACEITE 946 ML')).toBe('Aceite 946 ml')
  })

  it('S/N is not «sin N»', () => {
    expect(normalizeTitleText('KIT S/N HONDA')).toBe('Kit S/N Honda')
  })

  it('empty input', () => {
    expect(normalizeTitleText('')).toBe('')
    expect(normalizeTitleText(null)).toBe('')
  })
})

describe('normalizeName', () => {
  it.each([
    ['MASTER RIDE', 'Master Ride'],
    ['TSURU III', 'Tsuru III'],
    ['GM', 'GM'],
    ['CRV', 'CRV'],
    ['RAM 1500', 'RAM 1500'],
    ['PT CRUISER', 'PT Cruiser'],
    ['F350', 'F350'],
    ['CORDOBA', 'Córdoba'],
    ['Mercedes-Benz', 'Mercedes-Benz'],
    ['1.5 TURBO L4', '1.5 Turbo L4'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected)
  })
})

describe('productTitle: review cases', () => {
  const part = (attributes: Record<string, string | number>) => ({ title: 'X', vendor: null, attributes: { vehiculo_marca: 'Nissan', vehiculo_modelo: 'TSURU', anio_desde: 2000, anio_hasta: 2005, ...attributes } })
  it('DEL followed by a word is the preposition, not «delantero»', () => {
    expect(productTitle(part({ pieza: 'SOPORTE MOTOR', detalle: 'LADO DEL CONDUCTOR' }))).toBe('Soporte motor lado del conductor para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'BUJE', detalle: 'DEL IZQ' }))).toBe('Buje delantero izquierdo para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'BRAZO', detalle: 'DEL Y TRAS' }))).toBe('Brazo delantero/trasero para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'BRAZO', detalle: 'DEL Y TRAS IZQ' }))).toBe('Brazo delantero/trasero izquierdo para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'BRAZO', detalle: 'CONTROL DEL / REFORZADO' }))).toBe('Brazo control, reforzado delantero para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'BRAZO', detalle: 'DEL, TRAS' }))).toBe('Brazo delantero/trasero para Nissan Tsuru 2000–2005')
  })
  it('masculine nouns in -ión / -sis', () => {
    expect(productTitle(part({ pieza: 'CHASIS', position: 'trasera' }))).toBe('Chasis trasero para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'SUSPENSION', position: 'trasera' }))).toBe('Suspensión trasera para Nissan Tsuru 2000–2005')
  })
  it('feminine nouns that do not end in -a; short words lowercased in the type', () => {
    expect(productTitle(part({ pieza: 'UNIDAD MOTRIZ', position: 'trasera' }))).toBe('Unidad motriz trasera para Nissan Tsuru 2000–2005')
    expect(productTitle(part({ pieza: 'MANO DE CHANGO', position: 'delantera' }))).toBe('Mano de chango delantera para Nissan Tsuru 2000–2005')
  })
})

describe('productTitle without part attributes', () => {
  it('falls back to the normalized title and adds brand + part number only with identifiers', () => {
    const p = { title: 'GOMA AMORTIGUADOR UNIVERSAL', vendor: 'DAI', attributes: { part_number: 'SD31' } }
    expect(productTitle(p)).toBe('Goma amortiguador universal')
    expect(productTitle(p, { identifiers: true })).toBe('Goma amortiguador universal DAI SD31')
  })

  it('does not repeat a brand or a code already in the title', () => {
    expect(productTitle({ title: 'Proteína Gold Standard ON-123', vendor: 'Gold Standard', attributes: { part_number: 'ON-123' } }, { identifiers: true })).toBe('Proteína Gold Standard ON-123')
  })

  it('uses custom attribute keys', () => {
    const p = { title: 'X', vendor: null, attributes: { tipo: 'FILTRO ACEITE', marca: 'NISSAN', modelo: 'MARCH', desde: 2012, hasta: 2020 } }
    expect(productTitle(p, { keys: { type: 'tipo', make: 'marca', model: 'modelo', yearFrom: 'desde', yearTo: 'hasta' } })).toBe('Filtro de aceite para Nissan March 2012–2020')
  })

  it('English connector', () => {
    const p = { title: 'X', vendor: null, attributes: { pieza: 'ROTULA', position: 'inferior/izquierda', vehiculo_marca: 'Toyota', vehiculo_modelo: 'TACOMA', anio_desde: 1995, anio_hasta: 2004 } }
    expect(productTitle(p, { locale: 'en' })).toBe('Rotula lower left for Toyota Tacoma 1995–2004')
  })
})

describe('productPartNumber', () => {
  it('attribute first, then the SKU of a single-variant product', () => {
    expect(productPartNumber({ title: 'x', attributes: { part_number: 'GA-2372' }, variants: [{ sku: 'GA2372' }] as never })).toBe('GA-2372')
    expect(productPartNumber({ title: 'x', attributes: {}, variants: [{ sku: 'GA2372' }] as never })).toBe('GA2372')
    expect(productPartNumber({ title: 'x', attributes: {}, variants: [{ sku: 'A' }, { sku: 'B' }] as never })).toBeNull()
  })
})
