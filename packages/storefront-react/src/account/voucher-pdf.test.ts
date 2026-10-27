import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_VOUCHER_PDF_BYTES, pdfString, renderVoucherPdf } from './voucher-pdf.js'
import { voucherOf, type VoucherView } from './voucher.js'

const money = { amount: '1512.50', currency_code: 'MXN' }
const base = { id: 'c', number: null, status: 'pending_payment', created_at: '', total: money, expires_at: '2026-10-27T18:00:00Z' } as const
const view = (payment: Record<string, unknown>): VoucherView => voucherOf({ ...base, payment: { method: 'oxxo', reference: null, barcode: null, clabe: null, expires_at: base.expires_at, amount: money, ...payment } } as never)!
const oxxo = () => view({ reference: '9300123456789012', barcode: { format: 'code128', value: '93001234567890123456' } })
const spei = () => view({ method: 'spei', reference: 'PA-4412', clabe: '646010349362032012', beneficiary: 'ProtekAuto SA de CV', bank: 'STP' })

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('')

/** A strict-enough reader: header, every xref offset lands on its `N 0 obj`, trailer / startxref / EOF agree, every stream has its declared /Length. */
function checkStructure(bytes: Uint8Array) {
  const s = latin1(bytes)
  expect(s.startsWith('%PDF-1.4\n')).toBe(true)
  expect(s.endsWith('%%EOF\n')).toBe(true)
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)![1])
  expect(s.slice(start, start + 4)).toBe('xref')
  const m = /xref\n0 (\d+)\n/.exec(s.slice(start))!
  const size = Number(m[1])
  expect(new RegExp(`/Size ${size}\\b`).test(s.slice(start))).toBe(true)
  const entries = s.slice(start + m[0].length).split('\n').slice(0, size)
  expect(entries[0]).toBe('0000000000 65535 f ')
  for (let i = 1; i < size; i++) {
    expect(entries[i]).toMatch(/^\d{10} 00000 n $/)
    const off = Number(entries[i]!.slice(0, 10))
    expect(s.slice(off, off + `${i} 0 obj\n`.length)).toBe(`${i} 0 obj\n`)
  }
  for (const st of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const from = st.index! + st[0].length
    expect(s.slice(from + Number(st[1]), from + Number(st[1]) + 9)).toBe('endstream')
  }
  return { s, size }
}

describe('renderVoucherPdf', () => {
  it('is a valid PDF 1.4: header, objects at their xref offsets, trailer, startxref, %%EOF', () => {
    const { s, size } = checkStructure(renderVoucherPdf(oxxo(), { shopName: 'ProtekAuto', locale: 'es-MX', timeZone: 'America/Mexico_City' }))
    expect(size).toBe(10) // 7 fixed + 1 page + its content + object 0
    expect(s).toContain('/Type /Catalog')
    expect(s).toContain('/BaseFont /Helvetica')
    expect(s).toContain('/MediaBox [0 0 595.28 841.89]')
  })
  it('letter paper on request', () => {
    expect(latin1(renderVoucherPdf(oxxo(), { paper: 'letter' }))).toContain('/MediaBox [0 0 612 792]')
  })
  it('draws the OXXO barcode as filled rectangles; SPEI and a barcode-less cash voucher draw none', () => {
    const rects = (b: Uint8Array) => (latin1(b).match(/ re f\n/g) ?? []).length
    expect(rects(renderVoucherPdf(oxxo()))).toBeGreaterThan(30)
    expect(rects(renderVoucherPdf(spei()))).toBe(0)
    expect(rects(renderVoucherPdf(view({ reference: '9300123456789012' })))).toBe(0)
  })
  it('stays small and deterministic', () => {
    const a = renderVoucherPdf(oxxo(), { timeZone: 'UTC' })
    expect(a.byteLength).toBeLessThan(16 * 1024)
    expect(renderVoucherPdf(oxxo(), { timeZone: 'UTC' })).toEqual(a)
  })
  it('hostile strings cannot leave their literal: every external character is escaped', () => {
    const evil = ') Tj ET /JS (app.alert(1)) /OpenAction << /S /JavaScript >> \\ ( \n 1 0 obj <<'
    const v = view({ method: evil, reference: evil, clabe: evil, beneficiary: evil, bank: evil, instructions: evil, barcode: { format: 'code128', value: 'ABC123' } })
    const { s } = checkStructure(renderVoucherPdf(v, { shopName: evil, locale: 'es-MX' }))
    // The words survive only as text inside escaped strings: outside of strings the file has no such names, and no object was added.
    const outside = s.replace(/\((?:[^()\\]|\\.)*\)/g, '()')
    for (const bad of ['/JS', '/OpenAction', '/JavaScript', 'app.alert']) expect(outside).not.toContain(bad)
    expect(s.match(/^\d+ 0 obj$/gm)).toHaveLength(9)
    // outside of strings there are only the operators we write
    const content = /stream\n([\s\S]*?)endstream/.exec(s)![1]!
    const noStrings = content.replace(/\((?:[^()\\]|\\.)*\)/g, '()')
    expect(noStrings).toMatch(/^(?:(?:BT [\d. ]+ g \/F\d \d+ Tf [\d. -]+ Td \(\) Tj ET|[\d. -]+ (?:g|G|w|m|l|S|re f|re S|w [\d. -]+ re S|g [\d. -]+ w [\d. -]+ m [\d. -]+ l S)|[\d. G g w]+ [\d. -]+ re S|0 g)\n)+$/)
  })
  it('pdfString writes only ASCII and escapes delimiters, controls and non-WinAnsi characters', () => {
    expect(pdfString('a(b)c\\')).toBe('(a\\050b\\051c\\134)')
    expect(pdfString('año ¿ok?')).toBe('(a\\361o \\277ok?)')
    expect(pdfString('€ “x” \u0000\n日')).toBe('(\\200 \\223x\\224   ?)')
    expect(/^[\x20-\x7e]*$/.test(pdfString('ñ\u0001\u{1F600}(\\)'))).toBe(true)
  })
  it('a long instruction wraps instead of running off the page, and a huge word is cut', () => {
    const v = view({ reference: '1', instructions: ('palabra '.repeat(40) + 'x'.repeat(300)).slice(0, 256) })
    const s = latin1(renderVoucherPdf(v))
    checkStructure(renderVoucherPdf(v))
    expect((s.match(/ Tj ET/g) ?? []).length).toBeGreaterThan(10)
  })
  it('the hard ceiling exists', () => {
    expect(MAX_VOUCHER_PDF_BYTES).toBe(256 * 1024)
  })

  const pdftotext = spawnSync('pdftotext', ['-v'])
  it.skipIf(pdftotext.error != null)('an independent reader (pdftotext) extracts the method-specific text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-pdf-'))
    try {
      const read = (bytes: Uint8Array) => {
        const f = join(dir, 'f.pdf')
        writeFileSync(f, bytes)
        const r = spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        return r.stdout
      }
      const cash = read(renderVoucherPdf(oxxo(), { shopName: 'ProtekAuto', timeZone: 'UTC' }))
      expect(cash).toContain('Ficha de pago')
      expect(cash).toContain('$1,512.50')
      expect(cash).toContain('9300123456789012')
      expect(cash).toContain('93001234567890123456')
      expect(cash).toContain('OXXO')
      const bank = read(renderVoucherPdf(spei(), { shopName: 'ProtekAuto', timeZone: 'UTC' }))
      expect(bank).toContain('Transferencia SPEI')
      expect(bank).toContain('646010349362032012')
      expect(bank).toContain('ProtekAuto SA de CV')
      expect(bank).toContain('STP')
      expect(bank).toContain('PA-4412')
      expect(bank).toMatch(/transferencia SPEI a la CLABE/)
      expect(bank).not.toMatch(/OXXO|tienda|caja/i)
      expect(read(renderVoucherPdf(spei(), { locale: 'en-US' }))).toContain('Make a SPEI transfer')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
