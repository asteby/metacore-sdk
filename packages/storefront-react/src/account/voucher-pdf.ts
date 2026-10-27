/**
 * The voucher as a real PDF 1.4, written by hand: no browser, no native module, no dependency, so the same code runs in
 * the store's Node/SSR route and in the buyer's browser. Standard Helvetica / Courier fonts (not embedded: every reader
 * has them), text in WinAnsi, the barcode as filled rectangles. Every external string reaches the file only through
 * `pdfString`, which writes it as ASCII octal escapes, so nothing a gateway sends can close a string or add an object.
 * Loaded on demand (the server route or the buyer's tap), never in the first load of the order screens.
 */
import { barcodeGeometry, type VoucherView } from './voucher.js'
import { docText, formatDate, formatMoney, methodName, voucherFields, voucherSteps } from './voucher-text.js'

export type VoucherPdfOptions = {
  shopName?: string
  number?: string | null
  locale?: string
  timeZone?: string
  /** `a4` (default) or `letter` (Mexico prints on both). */
  paper?: 'a4' | 'letter'
}

/** Hard ceiling of the file: a voucher is a few KB; anything near this is a bug, not a voucher. */
export const MAX_VOUCHER_PDF_BYTES = 256 * 1024
const MAX_PAGES = 3

// Advance widths (1/1000 em) of ASCII 32..126 for the standard Helvetica and Helvetica-Bold (Adobe AFM).
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const HELV_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

type Font = 'F1' | 'F2' | 'F3' | 'F4'
const FONT_NAMES: Record<Font, string> = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Courier-Bold', F4: 'Courier' }

// The few characters outside Latin-1 that WinAnsi (cp1252) has at 0x80..0x9F.
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97 }

/** One WinAnsi byte per character; anything it cannot show becomes `?` (and control characters a space). */
function toBytes(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 32 || c === 127) out.push(32)
    else if (c < 127 || (c >= 160 && c <= 255)) out.push(c)
    else out.push(CP1252[c] ?? 63)
  }
  return out
}

/** PDF literal string: printable ASCII as is (minus the three that delimit), the rest as `\ddd`. */
export function pdfString(s: string): string {
  let o = '('
  for (const b of toBytes(s)) o += b >= 32 && b < 127 && b !== 40 && b !== 41 && b !== 92 ? String.fromCharCode(b) : `\\${b.toString(8).padStart(3, '0')}`
  return o + ')'
}

function charWidth(font: Font, ch: string): number {
  if (font === 'F3' || font === 'F4') return 600
  const c = ch.codePointAt(0)!
  const table = font === 'F2' ? HELV_B : HELV
  if (c >= 32 && c < 127) return table[c - 32]!
  const base = ch.normalize('NFD')[0]!.codePointAt(0)!
  return base >= 32 && base < 127 ? table[base - 32]! : 556
}
const textWidth = (font: Font, size: number, s: string) => ([...s].reduce((w, ch) => w + charWidth(font, ch), 0) * size) / 1000

/** Greedy word wrap to `max` points; a word wider than the line is cut. Explicit newlines are honored. */
function wrap(font: Font, size: number, text: string, max: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word
      while (textWidth(font, size, w) > max) {
        let n = 1
        while (n < w.length && textWidth(font, size, w.slice(0, n + 1)) <= max) n++
        if (line) (lines.push(line), (line = ''))
        lines.push(w.slice(0, n))
        w = w.slice(n)
      }
      const next = line ? `${line} ${w}` : w
      if (line && textWidth(font, size, next) > max) (lines.push(line), (line = w))
      else line = next
    }
    lines.push(line)
  }
  return lines
}

const n = (x: number) => String(Math.round(x * 100) / 100)

/** The voucher as the bytes of a PDF. Throws only if the result would exceed `MAX_VOUCHER_PDF_BYTES`. */
export function renderVoucherPdf(v: VoucherView, opts: VoucherPdfOptions = {}): Uint8Array {
  const locale = opts.locale ?? 'es-MX'
  const t = docText(locale)
  const [W, H] = opts.paper === 'letter' ? [612, 792] : [595.28, 841.89]
  const M = 54
  const right = W - M
  const inner = right - M

  const pages: string[] = []
  let ops = ''
  let y = H - M
  const newPage = () => {
    if (pages.length >= MAX_PAGES) return false
    if (ops) pages.push(ops)
    ops = ''
    y = H - M
    return true
  }
  const text = (font: Font, size: number, x: number, s: string, gray = 0) => {
    ops += `BT ${n(gray)} g /${font} ${size} Tf ${n(x)} ${n(y)} Td ${pdfString(s)} Tj ET\n`
  }
  const ensure = (h: number) => {
    if (y - h < M) newPage()
  }
  const paragraph = (font: Font, size: number, s: string, opt: { x?: number; width?: number; gray?: number; lead?: number } = {}) => {
    const lead = opt.lead ?? size * 1.4
    for (const line of wrap(font, size, s, opt.width ?? inner)) {
      ensure(lead)
      y -= lead
      if (line) text(font, size, opt.x ?? M, line, opt.gray ?? 0)
    }
  }

  // Header: title and subtitle on the left, amount on the right.
  const amount = formatMoney(v.amount, locale)
  const top = y
  y -= 20
  text('F2', 20, M, t.title)
  const subtitle = [opts.shopName, methodName(v, t), opts.number ? `${t.order} ${opts.number}` : ''].filter(Boolean).join(' · ')
  if (subtitle) {
    y -= 15
    paragraph('F1', 10, subtitle, { width: amount ? inner * 0.6 : inner, gray: 0.33, lead: 12 })
  }
  const afterTitle = y
  if (amount) {
    y = top - 10
    const label = t.total.toUpperCase()
    text('F1', 8, right - textWidth('F1', 8, label), label, 0.33)
    y -= 22
    text('F2', 22, right - textWidth('F2', 22, amount), amount)
  }
  y = Math.min(afterTitle, y) - 10
  ops += `0 g 2 w ${n(M)} ${n(y)} m ${n(right)} ${n(y)} l S\n`
  y -= 8

  // Fields of the method, each in a box.
  for (const f of voucherFields(v, t)) {
    const size = f.value.length > 36 ? 12 : 16
    const lines = wrap('F3', size, f.value, inner - 24)
    const h = 14 + 12 + lines.length * size * 1.3 + 8
    ensure(h + 12)
    y -= 12
    ops += `0 G 0.8 w ${n(M)} ${n(y - h)} ${n(inner)} ${n(h)} re S\n`
    const boxTop = y
    y -= 16
    text('F1', 8, M + 12, f.label.toUpperCase(), 0.33)
    y -= 4
    for (const line of lines) {
      y -= size * 1.3
      text('F3', size, M + 12, line)
    }
    y = boxTop - h
  }

  // Barcode: filled rectangles, the quiet zone included in the width.
  const g = v.barcode ? barcodeGeometry(v.barcode, { ...(v.barcode_format ? { format: v.barcode_format } : {}), height: 60 }) : null
  if (g && v.barcode) {
    const scale = Math.min(1, inner / g.width) * 0.75 // module = 1.5pt at most
    const bw = g.width * scale
    const bh = 60
    ensure(bh + 40)
    y -= 18
    ops += `0 g\n`
    const x0 = M + (inner - bw) / 2
    for (const r of g.rects) ops += `${n(x0 + r.x * scale)} ${n(y - bh)} ${n(r.w * scale)} ${n(bh)} re f\n`
    y -= bh + 12
    const cw = textWidth('F4', 10, v.barcode)
    text('F4', 10, M + (inner - Math.min(cw, inner)) / 2, v.barcode.slice(0, Math.floor(inner / 6)))
    y -= 4
  }

  const expires = formatDate(v.expires_at, locale, opts.timeZone)
  if (expires) {
    y -= 8
    paragraph('F2', 10, `${t.expires}: ${expires.replace(/\.$/, '')}.`)
    paragraph('F1', 10, t.expiresNote)
  }

  y -= 10
  ensure(40)
  paragraph('F2', 12, t.stepsTitle, { lead: 16 })
  voucherSteps(v, t).forEach((s, i) => {
    const lines = wrap('F1', 10, s, inner - 18)
    ensure(lines.length * 14 + 2)
    y -= 2
    lines.forEach((line, j) => {
      y -= 14
      if (j === 0) text('F1', 10, M, `${i + 1}.`)
      text('F1', 10, M + 18, line)
    })
  })
  if (v.instructions) {
    y -= 6
    paragraph('F1', 9, v.instructions, { gray: 0.33, lead: 12 })
  }
  y -= 8
  paragraph('F1', 8, t.footer, { gray: 0.33, lead: 11 })
  pages.push(ops)

  // Objects: 1 catalog, 2 pages, 3..6 fonts, 7 info, then (page, content) pairs.
  const objs: string[] = []
  const kids = pages.map((_, i) => `${8 + i * 2} 0 R`).join(' ')
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`
  ;(['F1', 'F2', 'F3', 'F4'] as Font[]).forEach((f, i) => (objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAMES[f]} /Encoding /WinAnsiEncoding >>`))
  objs[7] = `<< /Title ${pdfString(`${t.title}${opts.shopName ? ` - ${opts.shopName}` : ''}`)} /Producer ${pdfString('@asteby/storefront-react')} >>`
  pages.forEach((content, i) => {
    objs[8 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${9 + i * 2} 0 R >>`
    objs[9 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}endstream`
  })

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  if (out.length > MAX_VOUCHER_PDF_BYTES) throw new RangeError('voucher PDF too large')
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}
