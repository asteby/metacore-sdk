/** Invoices and credit notes of an order, and the bytes of a downloaded file. Pure; no URL of the PAC ever passes here. */
import type { InvoiceDoc, InvoiceFile } from './types.js'

export type InvoiceGroup = { invoice: InvoiceDoc; creditNotes: InvoiceDoc[] }

/**
 * Groups credit notes under the invoice they correct (`related_to`), keeping the server's order. A credit note whose
 * invoice is not in the list (or has no `related_to`) is returned in `orphans`, never dropped.
 */
export function groupInvoiceDocs(docs: readonly InvoiceDoc[] | null | undefined): { groups: InvoiceGroup[]; orphans: InvoiceDoc[] } {
  const list = Array.isArray(docs) ? docs.filter((d): d is InvoiceDoc => !!d && typeof d === 'object') : []
  const groups: InvoiceGroup[] = list.filter((d) => d.kind !== 'credit_note').map((invoice) => ({ invoice, creditNotes: [] }))
  const orphans: InvoiceDoc[] = []
  for (const d of list) {
    if (d.kind !== 'credit_note') continue
    const group = d.related_to ? groups.find((g) => g.invoice.id === d.related_to) : undefined
    if (group) group.creditNotes.push(d)
    else orphans.push(d)
  }
  return { groups, orphans }
}

/** Decodes `content_base64` of a downloaded invoice file. Throws `TypeError` when it is not valid base64. */
export function invoiceFileBytes(file: Pick<InvoiceFile, 'content_base64'>): Uint8Array {
  const raw = typeof file.content_base64 === 'string' ? file.content_base64.replace(/\s+/g, '') : ''
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) throw new TypeError('invoice file is not valid base64')
  const bin = atob(raw)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A download filename that is safe in a `Content-Disposition` header: no path, quotes, control characters or spaces. */
export function safeInvoiceFilename(name: unknown, fallback = 'factura'): string {
  const base = typeof name === 'string' ? (name.split(/[\\/]/).pop() ?? '') : ''
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 80)
  return clean || fallback
}
