import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { IdentityDocumentSpec, RegionFiscalEntry } from '../types.js'
import { MOCK_IDENTITY_DOCUMENT_MX_CSF as CSF } from '../mock/region.js'
import { extractIdentityDocument } from './index.js'

// Parity fixtures shared with the Go reference interpreter of the region packs (region_mx
// regionspec/testdata/identity/*.json, run there by TestIdentityParityFixtures). Same files, same expectations.
type Fixture = {
  spec: { engine: string; rules: unknown; discard_fields: string[]; catalogs: Record<string, RegionFiscalEntry[]> }
  text: string
  qr_url: string
  expected: {
    values: Record<string, string>
    lists: Record<string, string[]>
    sources: Record<string, string>
    qr_match: boolean | null
    missing: string[]
    qr_canonical: string
  }
}

const dir = new URL('./__fixtures__/identity/', import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort()

describe('parity with the reference interpreter', () => {
  it('has the fixtures', () => expect(files.length).toBeGreaterThanOrEqual(11))

  it.each(files)('%s', (file) => {
    const fx = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as Fixture
    const spec = { kind: 'MX:csf', label: 'x', accept: ['application/pdf'], max_bytes: 1, engine: fx.spec.engine, rules: fx.spec.rules, discard_fields: fx.spec.discard_fields } as IdentityDocumentSpec
    const got = extractIdentityDocument(fx.text, spec, { catalogs: fx.spec.catalogs, qr: fx.qr_url })
    const w = fx.expected
    expect(got.fields).toEqual({ ...w.values, ...w.lists })
    expect(got.sources).toEqual(w.sources)
    expect(got.qr.match).toBe(w.qr_match)
    expect(got.qr.canonical).toBe(w.qr_canonical)
    expect(got.missing).toEqual(w.missing)
  })
})

// Lessons of the reader that already runs in production (garbled keyboard-scanner QRs, tax ids with Ñ and &).
describe('QR read by a keyboard-wedge scanner', () => {
  const qr = (url: string) => extractIdentityDocument('nada legible', CSF, { qr: url })
  const CANON = 'https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3='

  it.each([
    ['punctuation replaced', 'httpsÑ--siat.sat.gob.mx-app-qr-faces-pages-mobile-validadorqr.jsf_d1)10/d2)1/d3)22032805709_pepj800101abc'],
    ['no separators at all, lower case', 'httpsÑ--siat.sat.gob.mx-app-qr-faces-pages-mobile-validadorqr.jsf_d1)10/d2)1/d322032805709pepj800101abc'],
    ['only the tail', '22032805709_pepj800101abc'],
    ['trailing garbage', 'D322032805709Ñpepj800101abc\r\n'],
  ])('%s', (_n, url) => {
    const x = qr(url)
    expect(x.fields).toMatchObject({ tax_id: 'PEPJ800101ABC', document_id: '22032805709' })
    expect(x.qr.canonical).toBe(`${CANON}22032805709_PEPJ800101ABC`)
  })

  it('a moral (12 characters) tax id keeps all of them, and the canonical URL is always rebuilt upper case', () => {
    const x = qr('d319010203040abc010203ab1')
    expect(x.fields).toMatchObject({ tax_id: 'ABC010203AB1', document_id: '19010203040' })
    expect(x.qr.canonical).toBe(`${CANON}19010203040_ABC010203AB1`)
  })

  it('tax ids with Ñ and & survive the scan', () => {
    expect(qr('D3)19010203042/PEÑO800101ab1').fields.tax_id).toBe('PEÑO800101AB1')
    expect(qr('https://x.test/?D3=19010203041_%26ab010203ab1').fields.tax_id).toBe('&AB010203AB1')
    expect(qr('D3)19010203041/&ab010203ab1').fields.tax_id).toBe('&AB010203AB1')
  })

  it('rebuilds nothing when the QR lacks one of the fields', () => {
    expect(qr('pepj800101abc').qr.canonical).toBe('')
    expect(qr('').qr.canonical).toBe('')
  })

  it('compares with the text even when the scanner garbled the URL', () => {
    const text = 'RFC: PEPJ800101ABC Código Postal: 06600 idCIF: 22032805709'
    expect(extractIdentityDocument(text, CSF, { qr: 'd3)22032805709_pepj800101abc' }).qr.match).toBe(true)
    expect(extractIdentityDocument(text, CSF, { qr: 'd3)22032805709_abc010203ab1' }).qr.match).toBe(false)
  })
})

describe('labels as they come out of pdftotext -layout', () => {
  const read = (t: string) => extractIdentityDocument(t, CSF)
  it('tolerates spaces around "/" and ":" and wide gaps', () => {
    for (const label of ['Denominación / Razón Social:', 'Denominación/Razón Social :', 'DENOMINACION  /  RAZON SOCIAL:']) {
      const x = read(`RFC:   ABC010203AB1\n${label}    EMPRESA SA\nCódigo Postal :   44100\nRegímenes:\nRégimen   Fecha Inicio   Régimen General de Ley Personas Morales   Fecha Fin\nObligaciones:`)
      expect(x.fields).toMatchObject({ tax_id: 'ABC010203AB1', legal_name: 'EMPRESA SA', postal_code: '44100' })
    }
  })
  it('a natural person is first names + surnames', () => {
    expect(read('RFC: PEPJ800101ABC\nNombre (s): ANA MARIA\nPrimer Apellido: LOPEZ\nSegundo Apellido: DIAZ\nCódigo Postal: 06600').fields.legal_name).toBe('ANA MARIA LOPEZ DIAZ')
  })
})
