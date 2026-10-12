/**
 * Recover Aby replies when the HTTP response is cut by CDN/proxy while the
 * server keeps working (Cloudflare ~100s). Poll history; never assume failure
 * until the window expires.
 */
import { api } from '../host'
import type { AbyProposal } from '../workspace/aby-proposal-card'
import type { ChatAttachment } from '../team-chat/data/types'

export type AbySendSuccess = {
  success: true
  session_id: string
  message: string
  proposals?: AbyProposal[]
  embeds?: ChatAttachment[]
  images?: { url: string; caption: string }[]
  suggested_guide?: { id: string; title: string; confidence: number }
  billing_mode?: 'metered' | 'free' | string
  sparks_apply?: boolean
}

export function isAbyTransportError(err: unknown): boolean {
  const ax = err as {
    code?: string
    message?: string
    response?: { status?: number }
  }
  const status = ax.response?.status
  if (status === 502 || status === 504 || status === 524 || status === 408) return true
  if (status === 409) return true // still_processing
  if (ax.response) return false
  return (
    ax.code === 'ERR_NETWORK' ||
    ax.code === 'ECONNABORTED' ||
    /network error|timeout|exceeded/i.test(ax.message || '')
  )
}

export function isAbyStillProcessing(err: unknown): boolean {
  const ax = err as { response?: { status?: number; data?: { message?: string } } }
  return (
    ax.response?.status === 409 ||
    /still_processing|en curso|procesando/i.test(ax.response?.data?.message || '')
  )
}

type HistoryRow = {
  role: string
  content: string
  created_at?: string
  metadata?:
    | {
        embeds?: ChatAttachment[]
        proposals?: AbyProposal[]
        suggested_guide?: { id: string; title: string; confidence: number }
      }
    | string
}

function parseMeta(raw: HistoryRow['metadata']): {
  embeds?: ChatAttachment[]
  proposals?: AbyProposal[]
  suggested_guide?: { id: string; title: string; confidence: number }
} {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as {
        embeds?: ChatAttachment[]
        proposals?: AbyProposal[]
        suggested_guide?: { id: string; title: string; confidence: number }
      }
    } catch {
      return {}
    }
  }
  return raw
}

/** Find the newest assistant message after the given user text in this session. */
export async function pollAbyAssistantReply(opts: {
  sessionId: string
  userMessage: string
  /** Abort after this many ms (default 3 min — bulk ERP turns). */
  timeoutMs?: number
  intervalMs?: number
  onTick?: (elapsedMs: number) => void
  signal?: AbortSignal
}): Promise<AbySendSuccess | null> {
  const timeoutMs = opts.timeoutMs ?? 180_000
  const intervalMs = opts.intervalMs ?? 2_500
  const started = Date.now()
  const userNorm = opts.userMessage.trim()

  while (Date.now() - started < timeoutMs) {
    if (opts.signal?.aborted) return null
    opts.onTick?.(Date.now() - started)
    try {
      const { data } = await api.get(`/chat/history/${opts.sessionId}`, {
        timeout: 20_000,
      })
      const rows = (data?.data || []) as HistoryRow[]
      let sawUser = false
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        if (r.role === 'user' && r.content?.trim() === userNorm) {
          sawUser = true
          continue
        }
        if (sawUser && (r.role === 'assistant' || r.role === 'ai') && r.content?.trim()) {
          const meta = parseMeta(r.metadata)
          return {
            success: true,
            session_id: opts.sessionId,
            message: r.content,
            proposals: meta.proposals || [],
            embeds: meta.embeds || [],
            suggested_guide: meta.suggested_guide,
          }
        }
      }
      // Also accept latest assistant if user message is last-but-one (fuzzy).
      if (rows.length >= 2) {
        const last = rows[rows.length - 1]
        const prev = rows[rows.length - 2]
        if (
          (last.role === 'assistant' || last.role === 'ai') &&
          prev.role === 'user' &&
          prev.content?.trim() === userNorm &&
          last.content?.trim()
        ) {
          const meta = parseMeta(last.metadata)
          return {
            success: true,
            session_id: opts.sessionId,
            message: last.content,
            proposals: meta.proposals || [],
            embeds: meta.embeds || [],
            suggested_guide: meta.suggested_guide,
          }
        }
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}
