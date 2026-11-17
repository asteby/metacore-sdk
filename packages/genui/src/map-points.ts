import type { GenUIBlock, GenUIRow } from './registry'
import type { Tone } from './types'

export interface GenUIMapPoint {
  key: string
  lat: number
  lng: number
  label: string
  /** Status key (printed as text: colour is never the only channel). */
  status?: string
  group?: string
  tone?: Tone
  details: Array<{ label?: string; value: string }>
}

export const MAP_MAX_POINTS = 200

const TONES = new Set(['default', 'muted', 'info', 'success', 'warning', 'danger'])
const DEFAULT_FIELDS = { key: 'id', lat: 'lat', lng: 'lng', label: 'name', status: 'status', group: 'group', tone: 'tone' } as const

/**
 * The points of a `map` block, from its inline `points` or from the rows of its
 * `source` through `fields` (column mapping). Rows with invalid coordinates are
 * dropped; the count is clamped to the block limit (data never widens a block).
 * Tone of a point: its own `tone`, else `status_tones[status]`.
 */
export function normalizeMapPoints(block: GenUIBlock, rows?: GenUIRow[], text: (v: unknown) => string = (v) => String(v ?? '')): GenUIMapPoint[] {
  const tones = (block.status_tones ?? {}) as Record<string, Tone>
  const toneOf = (status: string | undefined, own: unknown): Tone | undefined => {
    if (typeof own === 'string' && TONES.has(own)) return own as Tone
    return status !== undefined && Object.hasOwn(tones, status) ? tones[status] : undefined
  }
  const out: GenUIMapPoint[] = []
  if (Array.isArray(block.points)) {
    for (const p of block.points as Array<Record<string, any>>) { // eslint-disable-line @typescript-eslint/no-explicit-any
      out.push({
        key: p.key, lat: p.lat, lng: p.lng, label: text(p.label), status: p.status, group: p.group, tone: toneOf(p.status, p.tone),
        details: ((p.details ?? []) as Array<{ label?: unknown; value: unknown }>).map((d) => ({ label: d.label === undefined ? undefined : text(d.label), value: text(d.value) })),
      })
    }
    return out.slice(0, MAP_MAX_POINTS)
  }
  const f = { ...DEFAULT_FIELDS, ...(block.fields ?? {}) } as Record<keyof typeof DEFAULT_FIELDS, string>
  const mapped = new Set(Object.values(f))
  for (const r of rows ?? []) {
    const lat = Number(r[f.lat])
    const lng = Number(r[f.lng])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const status = r[f.status] === undefined || r[f.status] === null ? undefined : String(r[f.status])
    const label = String(r[f.label] ?? r[f.key] ?? '')
    out.push({
      key: String(r[f.key] ?? `${lat},${lng}`), lat, lng, label, status,
      group: r[f.group] === undefined || r[f.group] === null ? undefined : String(r[f.group]),
      tone: toneOf(status, r[f.tone]),
      details: Object.entries(r).filter(([k, v]) => !mapped.has(k) && v !== null && v !== undefined && typeof v !== 'object').slice(0, 8).map(([k, v]) => ({ label: k, value: String(v) })),
    })
    if (out.length >= MAP_MAX_POINTS) break
  }
  return out
}

/** Legend entries: one per distinct `group_by` value (status by default), in first-seen order. */
export function mapLegend(points: GenUIMapPoint[], groupBy: 'status' | 'group' = 'status'): Array<{ value: string; count: number; tone?: Tone }> {
  const seen = new Map<string, { value: string; count: number; tone?: Tone }>()
  for (const p of points) {
    const v = (groupBy === 'group' ? p.group : p.status) ?? '—'
    const e = seen.get(v)
    if (e) e.count++
    else seen.set(v, { value: v, count: 1, tone: p.tone })
  }
  return [...seen.values()]
}
