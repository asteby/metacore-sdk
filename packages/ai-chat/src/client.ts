import { normalizeProposals } from './proposals'
import type {
  ChatClient,
  ChatMessage,
  ChatSessionSummary,
  HttpLike,
  SendMessageInput,
  SendMessageResult,
} from './types'

export interface HttpChatClientOptions {
  /** Route prefix of the chat API. Default "/chat". */
  basePath?: string
  /** Per-turn timeout in ms (agent turns can be long). Default 180000. */
  timeoutMs?: number
}

let seq = 0
export const nextMessageId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

/** Normalises a stored history row ({role:'user'|'ai'|'assistant', content}). */
export function toChatMessage(row: any): ChatMessage {
  return {
    id: String(row?.id ?? nextMessageId()),
    role: row?.role === 'user' ? 'user' : 'ai',
    content: String(row?.content ?? row?.message ?? ''),
    attachments: Array.isArray(row?.attachments) ? row.attachments : undefined,
    proposals: normalizeProposals(row?.proposals),
  }
}

/**
 * Chat client for the metacore chat REST contract:
 *   POST {base}/send  {message, session_id, attachments} -> {success, session_id, reply|response, proposals}
 *   GET  {base}/sessions, GET {base}/history/:id
 *   POST {base}/proposals/:id/decide {approve}
 * `http` is the host's own authenticated client (axios instance, etc.).
 */
export function createHttpChatClient(http: HttpLike, opts: HttpChatClientOptions = {}): ChatClient {
  const base = (opts.basePath ?? '/chat').replace(/\/$/, '')
  return {
    async send(input: SendMessageInput): Promise<SendMessageResult> {
      const res = await http.post(
        `${base}/send`,
        { message: input.message, session_id: input.sessionId, attachments: input.attachments ?? [] },
        { timeout: opts.timeoutMs ?? 180_000, signal: input.signal },
      )
      const d = res.data
      if (!d || d.success === false) throw new Error(d?.error ?? 'chat_failed')
      return {
        sessionId: String(d.session_id ?? input.sessionId ?? ''),
        reply: String(d.reply ?? d.response ?? d.message ?? ''),
        proposals: normalizeProposals(d.proposals),
        attachments: Array.isArray(d.attachments) ? d.attachments : undefined,
        demo: d.demo === true || d.is_demo === true ? true : undefined,
      }
    },
    async listSessions(): Promise<ChatSessionSummary[]> {
      const { data } = await http.get(`${base}/sessions`)
      const rows = data?.data ?? data?.sessions ?? data
      return Array.isArray(rows) ? rows : []
    },
    async loadHistory(sessionId: string): Promise<ChatMessage[]> {
      const { data } = await http.get(`${base}/history/${encodeURIComponent(sessionId)}`)
      const rows = data?.data ?? data?.messages ?? data
      return Array.isArray(rows) ? rows.map(toChatMessage) : []
    },
    async decideProposal(id: string, approve: boolean): Promise<void> {
      await http.post(`${base}/proposals/${encodeURIComponent(id)}/decide`, { approve })
    },
  }
}
