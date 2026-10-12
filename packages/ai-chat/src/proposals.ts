import type { ChatProposal, RawProposal } from './types'

const compact = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    const s = JSON.stringify(v)
    return s.length > 200 ? `${s.slice(0, 199)}…` : s
  } catch {
    return ''
  }
}

/**
 * Accepts both proposal shapes and returns the one the UI renders:
 *   - `{ id, title, summary? }`
 *   - `{ id, action, model?, payload? }` (title = "action · model", summary = compact payload)
 * Explicit `title`/`summary` always win. Returns null when there is no id or
 * nothing to show, so a malformed row never crashes the thread.
 */
export function normalizeProposal(raw: unknown): ChatProposal | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as RawProposal
  if (r.id == null || r.id === '') return null
  const action = typeof r.action === 'string' ? r.action : undefined
  const model = typeof r.model === 'string' ? r.model : undefined
  const title = (typeof r.title === 'string' && r.title) || [action, model].filter(Boolean).join(' · ')
  if (!title) return null
  const summary = (typeof r.summary === 'string' && r.summary) || compact(r.payload) || undefined
  const status = r.status === 'approved' || r.status === 'rejected' || r.status === 'pending' ? r.status : undefined
  return { id: String(r.id), title, summary, status, action, model, payload: r.payload }
}

export function normalizeProposals(raw: unknown): ChatProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out = raw.map(normalizeProposal).filter((p): p is ChatProposal => p !== null)
  return out.length ? out : undefined
}
