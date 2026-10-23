/** Test helper: a minimal valid PDF with a text layer (Helvetica), one string per line, one array per page. */
export function makeTextPdf(pages: string[][]): Uint8Array {
  // Latin-1 accents go out as octal escapes (WinAnsiEncoding); anything else becomes "?".
  const esc = (s: string) =>
    s
      .replace(/[\\()]/g, (c) => '\\' + c)
      .replace(/[^\x20-\x7e]/g, (c) => (c.charCodeAt(0) >= 0xa0 && c.charCodeAt(0) <= 0xff ? '\\' + c.charCodeAt(0).toString(8) : '?'))
  const objects: string[] = []
  const pageIds: number[] = []
  // 1 = catalog, 2 = pages, 3 = font, then page/content pairs.
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  let next = 4
  for (const lines of pages) {
    const pageId = next++
    const contentId = next++
    pageIds.push(pageId)
    const ops = ['BT', '/F1 11 Tf', '14 TL', '40 800 Td']
    for (const line of lines) ops.push(`(${esc(line)}) Tj T*`)
    ops.push('ET')
    const stream = ops.join('\n')
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
