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

/**
 * History polling gave up because the network is down (browser offline or
 * several consecutive requests without any HTTP response). Shaped like an
 * axios network error so the chat words it the same way.
 */
export class AbyNetworkDownError extends Error {
  readonly code = 'ERR_NETWORK'
  constructor() {
    super('Network Error: sin conexión')
    this.name = 'AbyNetworkDownError'
  }
}

/**
 * The reply found in history is the failed-turn notice the server saved
 * (`metadata.turn_error`). Shaped like the POST /chat/send failure so
 * `abyTurnErrorOf` reads the classified cause.
 */
export class AbyHistoryTurnError extends Error {
  readonly response: { status: number; data: { message: string; error: unknown } }
  constructor(message: string, turnError: unknown) {
    super(message)
    this.name = 'AbyHistoryTurnError'
    this.response = { status: 200, data: { message, error: turnError } }
  }
}

function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** No HTTP response at all: the request never reached a server. */
function isNoResponseError(err: unknown): boolean {
  const ax = err as { code?: string; message?: string; response?: unknown }
  if (ax?.response) return false
  return ax?.code === 'ERR_NETWORK' || /network error/i.test(ax?.message || '')
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
        turn_error?: unknown
      }
    | string
}

type ParsedMeta = {
  embeds?: ChatAttachment[]
  proposals?: AbyProposal[]
  suggested_guide?: { id: string; title: string; confidence: number }
  turn_error?: unknown
}

function parseMeta(raw: HistoryRow['metadata']): ParsedMeta {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ParsedMeta
    } catch {
      return {}
    }
  }
  return raw
}

function replyFrom(sessionId: string, row: HistoryRow): AbySendSuccess {
  const meta = parseMeta(row.metadata)
  if (meta.turn_error) throw new AbyHistoryTurnError(row.content, meta.turn_error)
  return {
    success: true,
    session_id: sessionId,
    message: row.content,
    proposals: meta.proposals || [],
    embeds: meta.embeds || [],
    suggested_guide: meta.suggested_guide,
  }
}

/**
 * Find the newest assistant message after the given user text in this session.
 *
 * Throws `AbyHistoryTurnError` when that message is a saved failed-turn notice
 * and `AbyNetworkDownError` when the browser is offline or
 * `maxNetworkFailures` consecutive requests got no HTTP response — polling a
 * dead network for minutes only delays the «Reintentar».
 */
export async function pollAbyAssistantReply(opts: {
  sessionId: string
  userMessage: string
  /** Abort after this many ms (default 3 min — bulk ERP turns). */
  timeoutMs?: number
  intervalMs?: number
  /** Consecutive no-response failures before giving up (default 3). */
  maxNetworkFailures?: number
  onTick?: (elapsedMs: number) => void
  signal?: AbortSignal
}): Promise<AbySendSuccess | null> {
  const timeoutMs = opts.timeoutMs ?? 180_000
  const intervalMs = opts.intervalMs ?? 2_500
  const maxNetworkFailures = Math.max(1, opts.maxNetworkFailures ?? 3)
  const started = Date.now()
  const userNorm = opts.userMessage.trim()
  let networkFailures = 0

  while (Date.now() - started < timeoutMs) {
    if (opts.signal?.aborted) return null
    if (browserOffline()) throw new AbyNetworkDownError()
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
          return replyFrom(opts.sessionId, r)
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
          return replyFrom(opts.sessionId, last)
        }
      }
      networkFailures = 0
    } catch (err) {
      if (err instanceof AbyHistoryTurnError) throw err
      if (isNoResponseError(err)) {
        networkFailures++
        if (networkFailures >= maxNetworkFailures) throw new AbyNetworkDownError()
      } else {
        networkFailures = 0
      }
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}
