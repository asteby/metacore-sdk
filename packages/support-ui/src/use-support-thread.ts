import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applySupportEvent,
  supportErrorCode,
  type SendSupportMessageInput,
  type SupportApi,
  type SupportCase,
  type SupportMessage,
} from '@asteby/metacore-sdk/support'

/**
 * What the hook needs from the transport: the host passes `createSupportApi(...)` or any
 * stand-in. `listMessages` enables "load earlier", `reopen` enables reopening a resolved case.
 */
export type SupportThreadApi = Pick<SupportApi, 'getCase' | 'sendMessage' | 'subscribe'> &
  Partial<Pick<SupportApi, 'listMessages' | 'reopen'>>

export interface UseSupportThreadOptions {
  api: SupportThreadApi
  folio: string
  /** Author name of the optimistic message (the person who is writing). */
  authorName?: string
  /** Idempotency key generator. Defaults to `crypto.randomUUID`. */
  newId?: () => string
  /** Page size of the first load and of "load earlier". The server decides when omitted. */
  pageSize?: number
}

export type SupportThreadStatus = 'loading' | 'error' | 'ready'

type MessageInput = Pick<SendSupportMessageInput, 'body' | 'attachments'>

export interface UseSupportThread {
  status: SupportThreadStatus
  error: unknown
  /** `code` of the API error that failed the load (`support_disabled`, `forbidden`, `not_found`...). */
  errorCode?: string
  supportCase: SupportCase | null
  /** Resolves when the server accepted the message; rejects (and marks it `failed`) otherwise. */
  send: (input: MessageInput) => Promise<void>
  /** Code of the last failed send (`rate_limited`, `case_resolved`, `body_too_long`...); cleared on the next send. */
  sendErrorCode: string | null
  /** Re-sends a message that failed. */
  retry: (messageId: string) => Promise<void>
  /** There are earlier messages and the transport can fetch them. */
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => Promise<void>
  /** Reopens the case through `api.reopen` and shows the case it returns. */
  reopen: (body?: string) => Promise<void>
  reload: () => void
}

const defaultId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * Loads a case, keeps it live through `api.subscribe`, pages earlier messages with the keyset
 * cursor and sends messages optimistically. Knows nothing about URLs, auth or the instance:
 * all of that lives in `api`.
 */
export function useSupportThread({ api, folio, authorName, newId = defaultId, pageSize }: UseSupportThreadOptions): UseSupportThread {
  const [supportCase, setCase] = useState<SupportCase | null>(null)
  const [status, setStatus] = useState<SupportThreadStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)
  const [olderCursor, setOlderCursor] = useState<string | undefined>()
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sendErrorCode, setSendErrorCode] = useState<string | null>(null)
  const apiRef = useRef(api)
  apiRef.current = api
  const caseRef = useRef<SupportCase | null>(null)
  caseRef.current = supportCase

  useEffect(() => {
    const ctl = new AbortController()
    setStatus('loading')
    setError(null)
    setCase(null)
    setOlderCursor(undefined)
    setSendErrorCode(null)
    apiRef.current.getCase(folio, { signal: ctl.signal, limit: pageSize }).then(
      (c) => {
        if (ctl.signal.aborted) return
        setCase(c)
        setOlderCursor(c.messages_older_cursor)
        setStatus('ready')
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return
        setError(e ?? new Error('load failed'))
        setStatus('error')
      },
    )
    const off = apiRef.current.subscribe(folio, (ev) => setCase((cur) => (cur ? applySupportEvent(cur, ev) : cur)))
    return () => {
      ctl.abort()
      off()
    }
  }, [folio, nonce, pageSize])

  const patch = useCallback((id: string, fn: (m: SupportMessage) => SupportMessage) => {
    setCase((cur) => (cur ? { ...cur, messages: cur.messages.map((m) => (m.id === id ? fn(m) : m)) } : cur))
  }, [])

  const deliver = useCallback(
    async (id: string, input: MessageInput) => {
      setSendErrorCode(null)
      try {
        const saved = await apiRef.current.sendMessage(folio, { clientMessageId: id, ...input })
        setCase((cur) => {
          if (!cur) return cur
          // The echo may already be there (event stream); keep a single copy, in the optimistic slot.
          const at = cur.messages.findIndex((m) => m.id === id)
          const rest = cur.messages.filter((m) => m.id !== id && m.id !== saved.id)
          rest.splice(at < 0 ? rest.length : Math.min(at, rest.length), 0, { ...saved, state: undefined })
          return { ...cur, messages: rest }
        })
      } catch (e) {
        const code = supportErrorCode(e)
        setSendErrorCode(code ?? 'unknown')
        patch(id, (m) => ({ ...m, state: 'failed' }))
        // The case changed under us: show its real state so the composer gives way to the notice.
        if (code === 'case_resolved') setCase((cur) => (cur ? { ...cur, status: 'resolved' } : cur))
        if (code === 'case_closed') setCase((cur) => (cur ? { ...cur, status: 'closed' } : cur))
        throw e
      }
    },
    [folio, patch],
  )

  const send = useCallback<UseSupportThread['send']>(
    async (input) => {
      const id = newId()
      const optimistic: SupportMessage = {
        id,
        author_type: 'reporter',
        author_name: authorName,
        body: input.body,
        created_at: new Date().toISOString(),
        attachments: input.attachments,
        state: 'sending',
      }
      setCase((cur) => (cur ? { ...cur, messages: [...cur.messages, optimistic] } : cur))
      await deliver(id, input)
    },
    [authorName, deliver, newId],
  )

  const retry = useCallback<UseSupportThread['retry']>(
    async (messageId) => {
      const m = caseRef.current?.messages.find((x) => x.id === messageId)
      if (!m) return
      patch(messageId, (x) => ({ ...x, state: 'sending' }))
      await deliver(messageId, { body: m.body, attachments: m.attachments })
    },
    [deliver, patch],
  )

  const loadOlder = useCallback(async () => {
    const list = apiRef.current.listMessages
    if (!list || !olderCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await list(folio, { before: olderCursor, limit: pageSize })
      setCase((cur) => {
        if (!cur) return cur
        const known = new Set(cur.messages.map((m) => m.id))
        return { ...cur, messages: [...page.items.filter((m) => !known.has(m.id)), ...cur.messages] }
      })
      setOlderCursor(page.nextCursor)
    } finally {
      setLoadingOlder(false)
    }
  }, [folio, olderCursor, loadingOlder, pageSize])

  const reopen = useCallback(
    async (body?: string) => {
      const fn = apiRef.current.reopen
      if (!fn) return
      const c = await fn(folio, { body, clientMessageId: body ? newId() : undefined })
      setCase(c)
      setOlderCursor(c.messages_older_cursor)
      setSendErrorCode(null)
    },
    [folio, newId],
  )

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    status,
    error,
    errorCode: error ? supportErrorCode(error) : undefined,
    supportCase,
    send,
    sendErrorCode,
    retry,
    hasOlder: Boolean(olderCursor && apiRef.current.listMessages),
    loadingOlder,
    loadOlder,
    reopen,
    reload,
  }
}
