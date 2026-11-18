import type { CatalogEvent, IngestTarget, JSONSchemaLite, MappingRow } from './types'

/** A leaf (or container) field of an event payload, addressed by dotted path. */
export interface SourceField {
  path: string
  type: string
  description?: string
  /** JSON Schema `format` (e.g. `date-time`), when declared. */
  format?: string
  required: boolean
}

const MAX_DEPTH = 6

function typeOf(s: JSONSchemaLite): string {
  const t = s.type
  if (Array.isArray(t)) return t.find((x) => x !== 'null') ?? 'string'
  return t ?? (s.properties ? 'object' : s.items ? 'array' : 'string')
}

/**
 * Flattens a payload schema into pickable source fields. Objects are walked
 * (`customer.email`); arrays of objects expose `lines[].sku` style paths only
 * as the array itself (mapping a whole array is allowed, indexing is not).
 */
export function flattenSchemaFields(schema: JSONSchemaLite | undefined): SourceField[] {
  const out: SourceField[] = []
  const walk = (s: JSONSchemaLite, prefix: string, depth: number) => {
    if (depth > MAX_DEPTH || !s.properties) return
    const req = new Set(s.required ?? [])
    for (const key of Object.keys(s.properties).sort()) {
      const child = s.properties[key]
      if (!child) continue
      const path = prefix ? `${prefix}.${key}` : key
      const type = typeOf(child)
      out.push({ path, type, description: child.description, ...(child.format ? { format: child.format } : {}), required: req.has(key) })
      if (type === 'object') walk(child, path, depth + 1)
    }
  }
  if (schema) walk(schema, '', 0)
  return out
}

function sampleValue(s: JSONSchemaLite, key: string, depth: number): unknown {
  if (s.example !== undefined) return s.example
  if (Array.isArray(s.examples) && s.examples.length > 0) return s.examples[0]
  if (s.default !== undefined) return s.default
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0]
  switch (typeOf(s)) {
    case 'object': {
      if (depth > MAX_DEPTH || !s.properties) return {}
      const o: Record<string, unknown> = {}
      for (const k of Object.keys(s.properties)) {
        const c = s.properties[k]
        if (c) o[k] = sampleValue(c, k, depth + 1)
      }
      return o
    }
    case 'array':
      return s.items ? [sampleValue(s.items, key, depth + 1)] : []
    case 'integer':
    case 'number':
      return 1
    case 'boolean':
      return true
    default:
      if (s.format === 'date-time') return '2026-01-15T10:30:00Z'
      if (s.format === 'email') return 'ejemplo@correo.com'
      if (s.format === 'uuid') return '00000000-0000-4000-8000-000000000001'
      return `${key}-ejemplo`
  }
}

/** Builds an example payload from a schema (honours example/default/enum). */
export function buildSamplePayload(schema: JSONSchemaLite | undefined): Record<string, unknown> {
  if (!schema) return {}
  const v = sampleValue({ ...schema, type: schema.type ?? 'object' }, 'value', 0)
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Reads `a.b.c` from an object; undefined when any step is missing. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (part === '' || cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean)
  let cur = obj
  parts.forEach((p, i) => {
    if (i === parts.length - 1) {
      cur[p] = value
      return
    }
    const next = cur[p]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) cur[p] = {}
    cur = cur[p] as Record<string, unknown>
  })
}

const TEMPLATE_RE = /\{\{\s*([\w.]+)\s*\}\}/g
const WHOLE_RE = /^\{\{\s*([\w.]+)\s*\}\}$/

/**
 * Resolves `{{payload.x}}` / `{{event.name}}` / `{{result.id}}` templates the
 * way the host does, for preview only. A template that is exactly one
 * placeholder keeps the value's type (number stays number); otherwise it is
 * string interpolation. Unknown paths resolve to null / empty.
 */
export function renderTemplate(tpl: string, scope: Record<string, unknown>): unknown {
  const whole = WHOLE_RE.exec(tpl)
  if (whole) {
    const v = getPath(scope, whole[1] as string)
    return v === undefined ? null : v
  }
  return tpl.replace(TEMPLATE_RE, (_, p: string) => {
    const v = getPath(scope, p)
    return v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  })
}

/** Template the host stores for a mapping row. */
export function rowToTemplate(row: MappingRow): string {
  return row.kind === 'field' ? `{{payload.${row.value}}}` : row.value
}

/** Inverse of rowToTemplate; anything that is not a lone payload ref is literal. */
export function templateToRow(target: string, tpl: string): MappingRow {
  const m = /^\{\{\s*payload\.([\w.]+)\s*\}\}$/.exec(tpl)
  return m ? { target, kind: 'field', value: m[1] as string } : { target, kind: 'literal', value: tpl }
}

/** `{target: template}` map stored by the host. */
export function mappingToTemplates(rows: MappingRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) if (r.target.trim() !== '') out[r.target.trim()] = rowToTemplate(r)
  return out
}

export function templatesToMapping(map: Record<string, string> | undefined): MappingRow[] {
  return Object.entries(map ?? {}).map(([t, v]) => templateToRow(t, v))
}

/**
 * Body the destination would receive for `sample`. Empty mapping = the event
 * envelope's payload as is. Dotted targets build nested objects.
 */
export function previewBody(rows: MappingRow[], sample: Record<string, unknown>, eventName: string): unknown {
  const usable = rows.filter((r) => r.target.trim() !== '')
  if (usable.length === 0) return sample
  const scope = { payload: sample, event: { name: eventName } }
  const body: Record<string, unknown> = {}
  for (const r of usable) setPath(body, r.target.trim(), renderTemplate(rowToTemplate(r), scope))
  return body
}

export interface EventGroup {
  addon: string
  addonName: string
  events: CatalogEvent[]
}

/** Groups by addon (sorted), filtering by a case/accent-insensitive query. */
export function groupEvents(events: CatalogEvent[], query: string): EventGroup[] {
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const q = norm(query.trim())
  const groups = new Map<string, EventGroup>()
  for (const ev of events) {
    const hay = norm(`${ev.name} ${ev.addon} ${ev.addon_name ?? ''} ${ev.aggregate ?? ''}`)
    if (q && !hay.includes(q)) continue
    let g = groups.get(ev.addon)
    if (!g) {
      g = { addon: ev.addon, addonName: ev.addon_name || ev.addon, events: [] }
      groups.set(ev.addon, g)
    }
    g.events.push(ev)
  }
  const out = [...groups.values()].sort((a, b) => a.addonName.localeCompare(b.addonName))
  for (const g of out) g.events.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * Mapping rows to start an inbound `mapping` from a target: one row per
 * writable column, in declaration order (`target` = column name, empty
 * `value` to fill with a payload field). `requiredOnly` keeps just the
 * required columns.
 */
export function targetColumnsToMappingRows(target: IngestTarget, opts: { requiredOnly?: boolean } = {}): MappingRow[] {
  return target.columns
    .filter((c) => !opts.requiredOnly || c.required)
    .map((c) => ({ target: c.name, kind: 'field' as const, value: '' }))
}

/**
 * Infers a payload schema from a sample JSON (the inverse of
 * `buildSamplePayload`): objects recurse, arrays use the first item, strings
 * that look like a date-time / email / uuid get their `format`. Every
 * sample value becomes `example`. Pure and bounded by depth.
 */
export function inferSchema(sample: unknown, depth = 0): JSONSchemaLite {
  if (sample === null || sample === undefined) return { type: 'string' }
  if (Array.isArray(sample)) return sample.length > 0 && depth < MAX_DEPTH ? { type: 'array', items: inferSchema(sample[0], depth + 1) } : { type: 'array' }
  switch (typeof sample) {
    case 'boolean':
      return { type: 'boolean', example: sample }
    case 'number':
      return { type: Number.isInteger(sample) ? 'integer' : 'number', example: sample }
    case 'object': {
      if (depth >= MAX_DEPTH) return { type: 'object' }
      const properties: Record<string, JSONSchemaLite> = {}
      for (const [k, v] of Object.entries(sample as Record<string, unknown>)) properties[k] = inferSchema(v, depth + 1)
      return { type: 'object', properties }
    }
    default: {
      const s = String(sample)
      const out: JSONSchemaLite = { type: 'string', example: s }
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) out.format = 'date-time'
      else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) out.format = 'email'
      else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) out.format = 'uuid'
      return out
    }
  }
}
