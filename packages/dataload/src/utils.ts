import type {
  DataloadPlan,
  InlineSourceInput,
  MediaBackupStatus,
  PlanAction,
  RowPlan,
  RunProgress,
  RunState,
  SourceFormat,
} from './types'

export const TERMINAL_STATES: readonly RunState[] = ['succeeded', 'failed', 'canceled']
export const isTerminal = (s: RunState | undefined): boolean => !!s && TERMINAL_STATES.includes(s)

/** The kernel serializes unset times as 0001-01-01T00:00:00Z: treat them as absent. */
export function parseTime(iso: string | undefined | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) || d.getUTCFullYear() <= 1 ? null : d
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

/** Percentage (0-100, integer) of applicable rows already written. */
export function progressPercent(p: RunProgress, state?: RunState): number {
  if (state === 'succeeded') return 100
  if (!p.total) return 0
  return Math.max(0, Math.min(100, Math.floor((p.done / p.total) * 100)))
}

export interface PlanSummary {
  create: number
  update: number
  unchanged: number
  invalid: number
  duplicate: number
  /** Valid rows held for a person's decision; an apply never writes them. */
  review: number
  /** Rows an apply would write (create + update). */
  applicable: number
  /** Valid rows (apply also queues their media, even when unchanged). */
  valid: number
  mediaUrls: number
  ignoredColumns: number
}

export function summarizePlan(plan: DataloadPlan): PlanSummary {
  const c = plan.counts ?? {}
  const g = (a: PlanAction) => c[a] ?? 0
  const create = g('create')
  const update = g('update')
  const unchanged = g('unchanged')
  return {
    create,
    update,
    unchanged,
    invalid: g('invalid'),
    duplicate: g('duplicate'),
    review: g('review'),
    applicable: create + update,
    valid: create + update + unchanged,
    mediaUrls: plan.mediaUrls ?? 0,
    ignoredColumns: plan.ignoredColumns ?? 0,
  }
}

/** Applying makes sense when at least one valid row exists. */
export const canApply = (plan: DataloadPlan | undefined): boolean => !!plan && summarizePlan(plan).valid > 0

export type RowFilter = PlanAction | 'all' | 'changes'

/** Filters plan rows by action ('changes' = create + update) and by free text over key / fields. */
export function filterRows(rows: RowPlan[], filter: RowFilter, search = ''): RowPlan[] {
  const q = search.trim().toLowerCase()
  return rows.filter((r) => {
    if (filter === 'changes' ? r.action !== 'create' && r.action !== 'update' : filter !== 'all' && r.action !== filter) return false
    if (!q) return true
    if ((r.key ?? '').toLowerCase().includes(q) || String(r.row) === q) return true
    return (
      r.diffs.some((d) => d.field.toLowerCase().includes(q)) ||
      r.issues.some((i) => i.message.toLowerCase().includes(q)) ||
      (r.review ?? []).some((i) => `${i.code} ${i.field ?? ''} ${i.detail ?? ''}`.toLowerCase().includes(q))
    )
  })
}

/** Short, safe text for any diff value (null, objects, long strings). */
export function formatValue(v: unknown, max = 120, empty = '—'): string {
  if (v === null || v === undefined || v === '') return empty
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export type MediaHealth = 'empty' | 'healthy' | 'working' | 'attention'

/** Overall state of the backup: attention when something is dead, missing or corrupt. */
export function mediaHealth(s: MediaBackupStatus | undefined): MediaHealth {
  if (!s) return 'empty'
  const { queue: q, manifest: m } = s
  if (q.dead > 0 || m.missing > 0 || m.corrupt > 0) return 'attention'
  if (q.pending > 0 || q.running > 0) return 'working'
  return m.total > 0 || q.done > 0 ? 'healthy' : 'empty'
}

export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024

export class SourceFileError extends Error {
  constructor(public code: 'too_large' | 'unsupported' | 'empty') {
    super(code)
    this.name = 'SourceFileError'
  }
}

export function inferFormat(fileName: string, bundlePath?: string): SourceFormat | null {
  const n = fileName.toLowerCase()
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) return 'csv'
  if (n.endsWith('.json')) return bundlePath ? 'bundle' : 'json'
  return null
}

/** Reads a browser File into the text payload the API takes. Never uploads or stores anything. For files above the inline limit use `uploadSourceFile`. */
export async function readSourceFile(
  file: Pick<File, 'name' | 'size' | 'text'>,
  opts: { maxBytes?: number; bundlePath?: string } = {},
): Promise<InlineSourceInput> {
  if (file.size > (opts.maxBytes ?? DEFAULT_MAX_FILE_BYTES)) throw new SourceFileError('too_large')
  const format = inferFormat(file.name, opts.bundlePath?.trim() || undefined)
  if (!format) throw new SourceFileError('unsupported')
  const content = await file.text()
  if (!content.trim()) throw new SourceFileError('empty')
  const path = format === 'bundle' ? opts.bundlePath!.trim() : undefined
  return { format, name: file.name, content, ...(path ? { path } : {}) }
}
