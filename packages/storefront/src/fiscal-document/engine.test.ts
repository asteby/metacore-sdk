import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { IdentityDocumentSpec } from '../types.js'
import { MOCK_FISCAL_ID_MX, MOCK_IDENTITY_DOCUMENT_MX_CSF as CSF } from '../mock/region.js'
import { IdentityRulesError, buildDocumentEvidence, extractIdentityDocument, registerIdentityExtractor } from './index.js'
import {
  CSF_FISICA,
  CSF_FISICA_ONE_LINE,
  CSF_MORAL,
  CURP_FISICA,
  ID_CIF_FISICA,
  ID_CIF_MORAL,
  QR_URL_FISICA,
  QR_URL_OTRO,
  RFC_FISICA,
  RFC_MORAL,
} from './__fixtures__/csf.js'

const catalogs = { regimes: MOCK_FISCAL_ID_MX.regimes }
const NOW = new Date('2026-10-23T12:00:00Z')

describe('rules@1: persona física con dos regímenes', () => {
  const x = extractIdentityDocument(CSF_FISICA, CSF, { catalogs, now: NOW })

  it('reads the fields the region declares', () => {
    expect(x.kind).toBe('MX:csf')
    expect(x.extractor).toBe('rules@1')
    expect(x.fields).toEqual({
      tax_id: RFC_FISICA,
      legal_name: 'JUAN PEREZ PEREZ',
      postal_code: '06600',
      regimes: ['612', '605'],
      document_id: ID_CIF_FISICA,
      issued_on: '2026-09-15',
    })
    expect(x.missing).toEqual([])
  })

  it('keeps the regimes in order of appearance and ignores the activities section', () => {
    expect(x.fields.regimes).not.toContain('606') // "arrendamiento" is an activity, not a regime
  })

  it('reads the same document when the PDF comes out as one line', () => {
    const one = extractIdentityDocument(CSF_FISICA_ONE_LINE, CSF, { catalogs, now: NOW })
    expect(one.fields).toEqual(x.fields)
  })

  it('NEVER returns the CURP, the street or the activities', () => {
    const dump = JSON.stringify(x)
    expect(dump).not.toContain(CURP_FISICA)
    expect(dump).not.toContain('REFORMA')
    expect(dump).not.toContain('arrendamiento')
    expect(Object.keys(x.fields)).not.toContain('curp')
    expect(x.discarded).toEqual(expect.arrayContaining(['curp', 'street', 'activities']))
  })

  it('tells when the document is stale by freshness_days', () => {
    expect(x.age_days).toBe(38)
    expect(x.stale).toBe(false)
    const later = extractIdentityDocument(CSF_FISICA, CSF, { catalogs, now: new Date('2027-01-15T00:00:00Z') })
    expect(later.stale).toBe(true)
  })
})

describe('rules@1: persona moral', () => {
  it('reads the legal name from the labelled denomination and the regime from its phrase', () => {
    const x = extractIdentityDocument(CSF_MORAL, CSF, { catalogs, now: NOW })
    expect(x.fields).toEqual({
      tax_id: RFC_MORAL,
      legal_name: 'EMPRESA DE PRUEBA SA DE CV',
      postal_code: '44100',
      regimes: ['601'],
      document_id: ID_CIF_MORAL,
      issued_on: '2026-10-03',
    })
  })
})

describe('rules@1: robustness', () => {
  it('lists what it could not read instead of failing', () => {
    const x = extractIdentityDocument('Hola, esto no es una constancia. Nada que leer aquí.', CSF, { catalogs, now: NOW })
    expect(x.fields).toEqual({})
    expect(x.missing).toEqual(['tax_id', 'legal_name', 'postal_code', 'regimes', 'document_id', 'issued_on'])
    expect(x.stale).toBeNull()
  })

  it('accepts the rules as JSON text', () => {
    const x = extractIdentityDocument(CSF_MORAL, { ...CSF, rules: JSON.stringify(CSF.rules) }, { catalogs })
    expect(x.fields.tax_id).toBe(RFC_MORAL)
  })

  it('throws IdentityRulesError for a spec that cannot run', () => {
    expect(() => extractIdentityDocument('x', { ...CSF, rules: '{nope' })).toThrow(IdentityRulesError)
    expect(() => extractIdentityDocument('x', { ...CSF, rules: null })).toThrow(IdentityRulesError)
    expect(() => extractIdentityDocument('x', { ...CSF, engine: 'plugin:nobody' })).toThrow(IdentityRulesError)
  })

  it('treats an invalid or oversized pattern as a missing field', () => {
    const spec: IdentityDocumentSpec = {
      kind: 'ZZ:doc',
      label: 'Doc',
      engine: 'rules@1',
      rules: { fields: { a: { strategy: 'regex', pattern: '(' }, b: { strategy: 'regex', pattern: 'x'.repeat(5000) }, c: { strategy: 'regex', pattern: 'id (\\d+)' } } },
    }
    const x = extractIdentityDocument('id 42', spec)
    expect(x.fields).toEqual({ c: '42' })
    expect(x.missing).toEqual(['a', 'b'])
  })

  it('matches without accents on both sides and keeps the original characters in the value', () => {
    const spec: IdentityDocumentSpec = {
      kind: 'ZZ:doc',
      label: 'Doc',
      engine: 'rules@1',
      rules: {
        labels: ['razon social', 'direccion'],
        fields: { name: { strategy: 'labeled_lines', label: 'razón social' }, id: { strategy: 'regex', pattern: '\\b([A-ZÑ]{4}\\d{3})\\b', transform: ['upper'], accept: '^[A-ZÑ]{4}\\d{3}$' } },
      },
    }
    const x = extractIdentityDocument('RAZON SOCIAL: Peñas & Compañía Dirección: Calle 1 ÑAND123', spec)
    expect(x.fields).toEqual({ name: 'Peñas & Compañía', id: 'ÑAND123' })
  })

  it('dates: Spanish and English names, ISO and numeric, and rejects impossible dates', () => {
    const date = (text: string, order?: 'dmy' | 'mdy') =>
      extractIdentityDocument(text, { kind: 'ZZ:d', label: 'd', engine: 'rules@1', rules: { fields: { d: { strategy: 'date', ...(order ? { order } : {}) } } } }).fields.d
    expect(date('emitida el 3 de octubre de 2026')).toBe('2026-10-03')
    expect(date('issued March 5, 2026')).toBe('2026-03-05')
    expect(date('2026-03-05')).toBe('2026-03-05')
    expect(date('05/03/2026')).toBe('2026-03-05')
    expect(date('05/03/2026', 'mdy')).toBe('2026-05-03')
    expect(date('31 de febrero de 2026')).toBeUndefined()
  })

  it('catalog_phrases: longest phrase first, no overlaps, one hit per code', () => {
    const spec: IdentityDocumentSpec = {
      kind: 'ZZ:c',
      label: 'c',
      engine: 'rules@1',
      rules: { fields: { items: { strategy: 'catalog_phrases', catalog: 'k' } } },
    }
    const k = [
      { code: 'A', label: 'A', person_types: [], match_phrases: ['foo'] },
      { code: 'B', label: 'B', person_types: [], match_phrases: ['foo bar'] },
    ]
    expect(extractIdentityDocument('un FOO BAR y otro foo', spec, { catalogs: { k } }).fields.items).toEqual(['B', 'A'])
  })
})

describe('discard_fields', () => {
  it('removes a discarded value even when it leaked into another field', () => {
    const spec: IdentityDocumentSpec = {
      kind: 'ZZ:doc',
      label: 'Doc',
      engine: 'rules@1',
      discard_fields: ['national_id'],
      rules: {
        fields: {
          national_id: { strategy: 'regex', pattern: '\\b([A-Z]{4}\\d{6}[A-Z0-9]{8})\\b' },
          name: { strategy: 'regex', pattern: 'name: (.*)$' },
        },
      },
    }
    const x = extractIdentityDocument(`name: ANA ${CURP_FISICA} LOPEZ`, spec)
    expect(x.fields).toEqual({ name: 'ANA LOPEZ' })
    expect(JSON.stringify(x)).not.toContain(CURP_FISICA)
  })
})

describe('QR cross-check', () => {
  it('matches when the QR carries the same tax id and document id', () => {
    const x = extractIdentityDocument(CSF_FISICA, CSF, { catalogs, qr: QR_URL_FISICA })
    expect(x.qr).toEqual({ fields: { tax_id: RFC_FISICA, document_id: ID_CIF_FISICA }, match: true, mismatched: [] })
  })

  it('reports a mismatch (and which field) when the QR belongs to another document', () => {
    const x = extractIdentityDocument(CSF_FISICA, CSF, { catalogs, qr: QR_URL_OTRO })
    expect(x.qr.match).toBe(false)
    expect(x.qr.mismatched).toEqual(['tax_id'])
  })

  it('is null without a QR, or with one that has nothing to compare', () => {
    expect(extractIdentityDocument(CSF_FISICA, CSF, { catalogs }).qr.match).toBeNull()
    expect(extractIdentityDocument(CSF_FISICA, CSF, { catalogs, qr: 'https://example.com/?x=1' }).qr.match).toBeNull()
    expect(extractIdentityDocument(CSF_FISICA, CSF, { catalogs, qr: 'not a url' }).qr.match).toBeNull()
  })

  it('never exposes a discarded field through the QR', () => {
    const rules = { ...(CSF.rules as object), qr: { fields: { curp: { strategy: 'qr_param', param: 'c', accept: '.+' } } } }
    const x = extractIdentityDocument(CSF_FISICA, { ...CSF, rules: rules as never }, { catalogs, qr: `https://x.test/?c=${CURP_FISICA}` })
    expect(JSON.stringify(x)).not.toContain(CURP_FISICA)
  })
})

describe('plugins', () => {
  const off: Array<() => void> = []
  afterEach(() => off.splice(0).forEach((f) => f()))

  it('runs the registered extractor and still applies discard_fields', () => {
    off.push(registerIdentityExtractor('colab', (text) => ({ fields: { tax_id: text.trim(), national_id: '123456789' }, qr: { tax_id: text.trim() } })))
    const spec: IdentityDocumentSpec = { kind: 'XX:rut', label: 'RUT', engine: 'plugin:colab', discard_fields: ['national_id'] }
    const x = extractIdentityDocument('900123456-7', spec)
    expect(x.extractor).toBe('plugin:colab')
    expect(x.fields).toEqual({ tax_id: '900123456-7' })
    expect(x.qr.match).toBe(true)
  })

  it('can be registered by document kind', () => {
    off.push(registerIdentityExtractor('XX:rut', () => ({ fields: { tax_id: 'K1' } })))
    expect(extractIdentityDocument('', { kind: 'XX:rut', label: 'RUT', engine: 'plugin:other' }).fields).toEqual({ tax_id: 'K1' })
  })

  it('unregisters', () => {
    const off1 = registerIdentityExtractor('tmp', () => ({ fields: {} }))
    off1()
    expect(() => extractIdentityDocument('', { kind: 'XX:y', label: 'y', engine: 'plugin:tmp' })).toThrow(IdentityRulesError)
  })
})

describe('buildDocumentEvidence', () => {
  it('keeps where the data came from and nothing of the document', () => {
    const x = extractIdentityDocument(CSF_FISICA, CSF, { catalogs, qr: QR_URL_FISICA })
    const ev = buildDocumentEvidence(x, { sha256: 'ab'.repeat(32), source: 'pdf_client' })
    expect(ev).toEqual({
      kind: 'MX:csf',
      document_id: ID_CIF_FISICA,
      issued_on: '2026-09-15',
      sha256: 'ab'.repeat(32),
      extractor: 'rules@1',
      source: 'pdf_client',
      qr_match: true,
    })
    expect(JSON.stringify(ev)).not.toContain(CURP_FISICA)
  })
})

describe('the engine knows no country', () => {
  it('has no country-specific word in its sources', () => {
    const dir = new URL('.', import.meta.url)
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(files.length).toBeGreaterThan(5)
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8')
      expect(src, f).not.toMatch(/\b(RFC|CURP|CFDI|SAT|csf|idCIF)\b|M[eé]xico/i)
    }
  })
})
