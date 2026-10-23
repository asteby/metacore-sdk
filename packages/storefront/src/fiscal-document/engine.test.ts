import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityDocumentSpec, IdentityRulesV1 } from '../types.js'
import { MOCK_FISCAL_ID_MX, MOCK_IDENTITY_DOCUMENT_MX_CSF as CSF } from '../mock/region.js'
import { IdentityRulesError, buildDocumentEvidence, catalogsFromRegion, extractIdentityDocument, registerIdentityExtractor, validateRules } from './index.js'
import { CSF_FISICA, CSF_MORAL, CURP_FISICA, ID_CIF_FISICA, ID_CIF_MORAL, QR_URL_FISICA, RFC_FISICA, RFC_MORAL } from './__fixtures__/csf.js'

const catalogs = catalogsFromRegion(MOCK_FISCAL_ID_MX)
const read = (text: string, qr?: string) => extractIdentityDocument(text, CSF, { catalogs, ...(qr !== undefined ? { qr } : {}), now: new Date('2024-04-01T12:00:00Z') })

// These cases port the region pack's tests of the seeded MX:csf rules (identity_mx_test.go): same texts, same readings.
describe('MX:csf seeded rules: persona física', () => {
  const x = read(CSF_FISICA, QR_URL_FISICA)

  it('reads the fields, regimes in order of mention', () => {
    expect(x.fields).toEqual({
      tax_id: RFC_FISICA,
      legal_name: 'JUAN CARLOS PEREZ PEREZ',
      postal_code: '06600',
      tax_regime: ['612', '605'],
      document_id: ID_CIF_FISICA,
      issued_on: '2024-03-15',
    })
    expect(x.missing).toEqual([])
    expect(x.qr.match).toBe(true)
  })

  it('NEVER returns the CURP, the street, the neighborhood or the activities', () => {
    const dump = JSON.stringify(x)
    for (const secret of [CURP_FISICA, 'REFORMA', 'JUAREZ', 'comercio']) expect(dump).not.toContain(secret)
    expect(x.discarded).toEqual(expect.arrayContaining(['curp', 'street', 'activities']))
  })

  it('freshness: 90 days from the emission date', () => {
    expect(x.age_days).toBe(17)
    expect(x.stale).toBe(false)
    expect(extractIdentityDocument(CSF_FISICA, CSF, { catalogs, now: new Date('2024-07-01T00:00:00Z') }).stale).toBe(true)
  })

  it('only the Regímenes section counts', () => {
    const text = CSF_FISICA.replace('Régimen de Actividades Empresariales y Profesionales 01/01/2020', '')
    expect(read(text).fields.tax_regime).toEqual(['605'])
  })
})

describe('MX:csf seeded rules: persona moral, one line, RFC outside its caption', () => {
  it('reads a moral document', () => {
    const x = read(CSF_MORAL)
    expect(x.fields).toMatchObject({ tax_id: RFC_MORAL, legal_name: 'EMPRESA DE PRUEBA SA DE CV', postal_code: '44100', document_id: ID_CIF_MORAL, tax_regime: ['601'] })
    expect(x.fields.issued_on).toBeUndefined()
    expect(x.missing).toEqual([])
  })

  it('reads the same when pdf.js gives no line breaks', () => {
    expect(read(CSF_MORAL.replaceAll('\n', ' ')).fields).toEqual(read(CSF_MORAL).fields)
  })

  it('finds the RFC outside its caption', () => {
    const x = read('Constancia\nABC010203AB1\nDenominación/Razón Social: X SA\nCódigo Postal: 44100\nRegímenes: Régimen General de Ley Personas Morales\nObligaciones:')
    expect(x.fields.tax_id).toBe(RFC_MORAL)
  })
})

describe('MX:csf seeded rules: regime phrases, unreadable text, QR, issue date', () => {
  it.each([
    ['Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', ['625']],
    ['Régimen de Sueldos y Salarios', ['605']],
    ['RÉGIMEN DE INCORPORACIÓN FISCAL', ['621']],
    ['Régimen Simplificado de Confianza 01/07/2022', ['626']],
    ['Servicios de reparación', undefined],
  ])('%s', (section, want) => {
    expect(read(`RFC: PEPJ800101ABC Regímenes: ${section} Obligaciones:`).fields.tax_regime).toEqual(want)
  })

  it('lists the required fields it could not read', () => {
    expect(read('Constancia ilegible').missing).toEqual(['tax_id', 'legal_name', 'postal_code', 'tax_regime'])
  })

  it('a QR alone fills the RFC and the document id, flagged as coming from it', () => {
    const x = read('nada legible', QR_URL_FISICA)
    expect(x.fields).toMatchObject({ tax_id: RFC_FISICA, document_id: ID_CIF_FISICA })
    expect(x.sources.tax_id).toBe('qr')
    expect(x.qr.match).toBeNull()
  })

  it('reads the QR in either order, any case, even without the host', () => {
    expect(read('', 'https://x.test/v?D3=abc010203ab1_19010203040').fields).toMatchObject({ tax_id: RFC_MORAL, document_id: ID_CIF_MORAL })
    expect(read('', 'validadorqr.jsf?D1=10&D3=123456_ABC010203AB1').fields).toMatchObject({ tax_id: RFC_MORAL, document_id: '123456' })
  })

  it.each(['', 'https://x.test/?D3=nada', 'hola', 'https://x.test/?D3=1_2_3'])('the QR %j reads nothing', (junk) => {
    expect(read('', junk).fields).toEqual({})
  })

  it('a QR of another RFC is a mismatch, and the text wins', () => {
    const x = read(CSF_FISICA, 'https://siat.sat.gob.mx/v?D3=22032805709_ABC010203AB1')
    expect(x.qr.match).toBe(false)
    expect(x.fields.tax_id).toBe(RFC_FISICA)
  })

  it.each([
    ['Lugar y Fecha de Emisión CIUDAD DE MEXICO , CIUDAD DE MEXICO A 5 DE SEPTIEMBRE DE 2023', '2023-09-05'],
    ['Lugar y Fecha de Emisión: MÉRIDA , YUCATÁN A 28 DE FEBRERO DE 2024', '2024-02-28'],
    ['Lugar y Fecha de Emisión: X A 31 DE FEBRERO DE 2024', undefined],
    ['Fecha inicio de operaciones: 01 DE ENERO DE 2020', undefined],
  ])('%s', (text, want) => {
    expect(read(text).fields.issued_on).toBe(want)
  })
})

const doc = (rules: IdentityRulesV1 | string | null, extra: Partial<IdentityDocumentSpec> = {}): IdentityDocumentSpec => ({
  kind: 'ZZ:cert', label: 'Cert', accept: ['application/pdf'], max_bytes: 1000, engine: 'rules@1', rules, discard_fields: [], ...extra,
})

describe('rules@1 semantics', () => {
  it('first non-empty strategy wins; upper and capture post-process; required reports missing', () => {
    const rules: IdentityRulesV1 = {
      version: 1,
      fields: [
        { key: 'id', required: true, strategies: [{ strategy: 'regex', pattern: 'nope (\\d+)' }, { strategy: 'regex', pattern: 'id: ([a-z]+-\\d+)', flags: 'i', group: 1, upper: true, capture: { pattern: '^([A-Z]+)-' , group: 1 } }] },
        { key: 'must', required: true, strategies: [{ strategy: 'regex', pattern: 'zzz' }] },
        { key: 'may', strategies: [{ strategy: 'regex', pattern: 'zzz' }] },
      ],
    }
    const x = extractIdentityDocument('ID: abc-12', doc(rules))
    expect(x.fields).toEqual({ id: 'ABC' })
    expect(x.missing).toEqual(['must'])
  })

  it('labels: a value runs to the next caption; concat joins with the separator', () => {
    const rules: IdentityRulesV1 = {
      version: 1,
      normalize: ['nbsp', 'collapse_ws'],
      labels: ['First', 'Last', 'Other'],
      fields: [
        { key: 'a', strategies: [{ strategy: 'labeled_lines', label: 'first' }] },
        { key: 'b', strategies: [{ strategy: 'concat_labeled', labels: ['First', 'Last'], separator: '/' }] },
      ],
    }
    const x = extractIdentityDocument('First: Ana Maria\n\nLast: Lopez Other: x', doc(rules))
    expect(x.fields).toEqual({ a: 'Ana Maria', b: 'Ana Maria/Lopez' })
  })

  it('date: textual months need `months`; impossible dates are dropped; order is honored', () => {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const d = (text: string, s: object) => extractIdentityDocument(text, doc({ version: 1, fields: [{ key: 'd', strategies: [{ strategy: 'date', ...s } as never] }] })).fields.d
    expect(d('on 5 MAR 2026', { pattern: '(\\d+) (\\w+) (\\d{4})', order: 'dmy', months, flags: 'i' })).toBe('2026-03-05')
    expect(d('on 5 mar 2026', { pattern: '(\\d+) (\\w+) (\\d{4})', order: 'dmy' })).toBeUndefined()
    expect(d('2026/03/05', { pattern: '(\\d{4})/(\\d+)/(\\d+)', order: 'ymd' })).toBe('2026-03-05')
    expect(d('03/05/2026', { pattern: '(\\d+)/(\\d+)/(\\d{4})', order: 'mdy' })).toBe('2026-03-05')
    expect(d('31/02/2026', { pattern: '(\\d+)/(\\d+)/(\\d{4})', order: 'dmy' })).toBeUndefined()
  })

  it('catalog_phrases: section bounds, first mention order; no start means no section', () => {
    const rules: IdentityRulesV1 = { version: 1, fields: [{ key: 'k', multiple: true, strategies: [{ strategy: 'catalog_phrases', catalog: 'kinds', start: 'kinds:', end: 'end' }] }] }
    const kinds = [
      { code: 'A', label: 'Alpha thing', person_types: [] },
      { code: 'B', label: 'Beta', person_types: [], match_phrases: ['beta'] },
      { code: 'C', label: 'Gamma', person_types: [] },
    ]
    const run = (t: string) => extractIdentityDocument(t, doc(rules), { catalogs: { kinds } }).fields.k
    expect(run('gamma KINDS: Beta then ALPHA THING and gamma end alpha thing')).toEqual(['B', 'A', 'C'])
    expect(run('Beta alpha thing')).toBeUndefined() // no start found: no section
  })
})

describe('validation of the rules (same checks as the region pack)', () => {
  const ok: IdentityRulesV1 = { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'x' }] }] }
  const bad = (rules: unknown, discard: string[] = []) => () => validateRules(rules as IdentityRulesV1, discard)

  it('accepts a well formed document', () => expect(bad(ok)).not.toThrow())

  it.each([
    ['version', { ...ok, version: 2 }],
    ['no fields', { version: 1, fields: [] }],
    ['repeated key', { version: 1, fields: [ok.fields[0], ok.fields[0]] }],
    ['unknown strategy', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'magic' }] }] }],
    ['unknown member', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'x', patern: 'y' }] }] }],
    ['lookahead', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'a(?=b)' }] }] }],
    ['\\p class', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: '\\p{L}' }] }] }],
    ['group that does not exist', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'x', group: 2 }] }] }],
    ['bad flag', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'x', flags: 'g' }] }] }],
    ['labeled without labels', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'labeled_lines', label: 'x' }] }] }],
    ['date order', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'date', pattern: '(a)(b)(c)', order: 'ddy' }] }] }],
    ['date groups', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'date', pattern: '(a)(b)', order: 'dmy' }] }] }],
    ['qr without param', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'qr_param', match: 'x' }] }] }],
    ['too long', { version: 1, fields: [{ key: 'a', strategies: [{ strategy: 'regex', pattern: 'x'.repeat(2000) }] }] }],
  ])('rejects %s', (_n, rules) => expect(bad(rules)).toThrow(IdentityRulesError))

  it('rejects a rule that produces a discarded field', () => expect(bad(ok, ['A'])).toThrow(/discard_fields/))

  it('extractIdentityDocument throws IdentityRulesError for specs that cannot run', () => {
    expect(() => extractIdentityDocument('x', doc('{nope'))).toThrow(IdentityRulesError)
    expect(() => extractIdentityDocument('x', doc(null))).toThrow(IdentityRulesError)
    expect(() => extractIdentityDocument('x', doc(ok, { engine: 'plugin:nobody' }))).toThrow(IdentityRulesError)
  })

  it('accepts the rules as JSON text', () => {
    expect(extractIdentityDocument('x', doc(JSON.stringify(ok))).fields).toEqual({ a: 'x' })
  })

  it('reads at most MAX_TEXT_LENGTH characters', () => {
    const x = extractIdentityDocument('y'.repeat(500_000) + ' x', doc(ok))
    expect(x.fields).toEqual({})
  })
})

describe('plugins', () => {
  const off: Array<() => void> = []
  afterEach(() => off.splice(0).forEach((f) => f()))

  it('runs the registered extractor and still applies discard_fields', () => {
    off.push(registerIdentityExtractor('colab', (text) => ({ fields: { tax_id: text.trim(), national_id: '123456789' }, qr_match: true })))
    const x = extractIdentityDocument('900123456-7', doc(null, { kind: 'XX:rut', engine: 'plugin:colab', discard_fields: ['national_id'] }))
    expect(x.extractor).toBe('plugin:colab')
    expect(x.fields).toEqual({ tax_id: '900123456-7' })
    expect(x.qr.match).toBe(true)
  })

  it('can be registered by document kind, and unregisters', () => {
    const off1 = registerIdentityExtractor('XX:rut', () => ({ fields: { tax_id: 'K1' } }))
    expect(extractIdentityDocument('', doc(null, { kind: 'XX:rut', engine: 'plugin:other' })).fields).toEqual({ tax_id: 'K1' })
    off1()
    expect(() => extractIdentityDocument('', doc(null, { kind: 'XX:rut', engine: 'plugin:other' }))).toThrow(IdentityRulesError)
  })
})

describe('buildDocumentEvidence', () => {
  it('keeps where the data came from and nothing of the document', () => {
    const ev = buildDocumentEvidence(read(CSF_FISICA, QR_URL_FISICA), { sha256: 'ab'.repeat(32), source: 'pdf_client' })
    expect(ev).toEqual({ kind: 'MX:csf', document_id: ID_CIF_FISICA, issued_on: '2024-03-15', sha256: 'ab'.repeat(32), extractor: 'rules@1', source: 'pdf_client', qr_match: true })
    expect(JSON.stringify(ev)).not.toContain(CURP_FISICA)
  })
})

describe('the engine knows no country', () => {
  it('has no country-specific word in its sources', () => {
    const dir = new URL('.', import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/\b(RFC|CURP|CFDI|SAT|csf|idCIF)\b|M[eé]xico/i)
  })
})
