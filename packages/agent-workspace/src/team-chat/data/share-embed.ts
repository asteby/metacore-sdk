import type { ChatAttachment } from './types'

const LABEL_KEYS = [
  'name',
  'title',
  'number',
  'code',
  'folio',
  'sku',
  'email',
  'label',
  'reference',
  'product_name',
  'warehouse_name',
  'variant_name',
] as const

const RELATION_KEYS = [
  'product_id',
  'product',
  'variant_id',
  'variant',
  'warehouse_id',
  'warehouse',
  'customer_id',
  'customer',
] as const

function scalarLabel(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim()
    return s
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const nested = o.label ?? o.name ?? o.title ?? o.value ?? o.display_name
    if (nested != null && nested !== value) return scalarLabel(nested)
  }
  return ''
}

export function recordLabel(row: Record<string, unknown>): string {
  for (const key of LABEL_KEYS) {
    const s = scalarLabel(row[key])
    if (s) return s
  }
  for (const key of RELATION_KEYS) {
    const s = scalarLabel(row[key])
    if (s) return s
  }
  const id = row.id
  if (id != null) return String(id).slice(0, 8)
  return 'Registro'
}

export function recordSubtitle(row: Record<string, unknown>, modelTitle: string): string {
  const bits: string[] = []
  const product = scalarLabel(row.product_id ?? row.product ?? row.product_name)
  const warehouse = scalarLabel(row.warehouse_id ?? row.warehouse ?? row.warehouse_name)
  const variant = scalarLabel(row.variant_id ?? row.variant ?? row.variant_name)
  const qty = scalarLabel(row.quantity ?? row.available ?? row.qty)
  if (variant && variant !== product) bits.push(variant)
  if (warehouse) bits.push(warehouse)
  if (qty !== '') bits.push(`Cant. ${qty}`)
  for (const key of ['status', 'state', 'stage', 'total', 'amount'] as const) {
    const s = scalarLabel(row[key])
    if (s) bits.push(s)
  }
  if (!bits.length) return modelTitle
  // Avoid "Existencias · Existencias" when only the model title would repeat.
  const joined = bits.join(' · ')
  if (joined === modelTitle) return modelTitle
  return `${modelTitle} · ${joined}`
}

export function humanizeModelKey(model: string): string {
  return model.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function filterSummaryFromSearch(search: string, _modelTitle: string): string {
  const raw = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(raw)
  const bits: string[] = []
  const q = params.get('search')?.trim()
  if (q) bits.push(`“${q}”`)
  for (const [key, value] of params.entries()) {
    if (!key.startsWith('f_') || !value) continue
    bits.push(`${key.slice(2)}: ${value}`)
    if (bits.length >= 4) break
  }
  if (!bits.length) return ''
  return bits.join(' · ')
}

const PICK_KEYS = [
  'id',
  ...LABEL_KEYS,
  ...RELATION_KEYS,
  'quantity',
  'available',
  'qty',
  'status',
  'state',
  'stage',
  'identifier',
] as const

/** Compact copy of a table row for share embeds (desktop + mobile both mount). */
export function pickShareRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of PICK_KEYS) {
    if (row[k] != null && row[k] !== '') out[k] = row[k]
  }
  return out
}

export function uniqueRowsById(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const row of rows) {
    if (row.id == null) continue
    const id = String(row.id)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}

export function attachmentsFromRows(
  model: string,
  modelTitle: string,
  rows: Record<string, unknown>[],
): ChatAttachment[] {
  return uniqueRowsById(rows)
    .slice(0, 20)
    .map((row) => {
      const title = recordLabel(row)
      const subtitle = recordSubtitle(row, modelTitle)
      return {
        type: 'record' as const,
        model,
        model_title: modelTitle,
        id: String(row.id),
        title,
        // Drop subtitle when it only restates the title or model name alone.
        subtitle:
          subtitle && subtitle !== title && subtitle !== modelTitle ? subtitle : modelTitle,
      }
    })
}

export function attachmentFromView(model: string, modelTitle: string): ChatAttachment {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const filters = filterSummaryFromSearch(search, modelTitle)
  return {
    type: 'view',
    model,
    model_title: modelTitle,
    title: modelTitle,
    filter_summary: filters || undefined,
    search,
  }
}
