import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applySupportEvent,
  type SendSupportMessageInput,
  type SupportApi,
  type SupportCase,
  type SupportMessage,
} from '@asteby/metacore-sdk/support'

/** What the hook needs from the transport: the host passes `createSupportApi(...)` or any stand-in. */
export type SupportThreadApi = Pick<SupportApi, 'getCase' | 'sendMessage' | 'subscribe'>

export interface UseSupportThreadOptions {
  api: SupportThreadApi
  folio: string
  /** Author name of the optimistic message (the person who is writing). */
  authorName?: string
  /** Idempotency key generator. Defaults to `crypto.randomUUID`. */
  newId?: () => string
}

export type SupportThreadStatus = 'loading' | 'error' | 'ready'

type MessageInput = Pick<SendSupportMessageInput, 'body' | 'attachments'>

export interface UseSupportThread {
  status: SupportThreadStatus
  error: unknown
  supportCase: SupportCase | null
  /** Resolves when the server accepted the message; rejects (and marks it `failed`) otherwise. */
  send: (input: MessageInput) => Promise<void>
  /** Re-sends a message that failed. */
  retry: (messageId: string) => Promise<void>
  reload: () => void
}

const defaultId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * Loads a case, keeps it live through `api.subscribe` and sends messages optimistically.
 * Knows nothing about URLs, auth or the instance: all of that lives in `api`.
 */
export function useSupportThread({ api, folio, authorName, newId = defaultId }: UseSupportThreadOptions): UseSupportThread {
  const [supportCase, setCase] = useState<SupportCase | null>(null)
  const [status, setStatus] = useState<SupportThreadStatus>('loading')
  const [error, setError] = useState<unknown>(null)
  const [nonce, setNonce] = useState(0)
  const apiRef = useRef(api)
  apiRef.current = api
  const caseRef = useRef<SupportCase | null>(null)
  caseRef.current = supportCase

  useEffect(() => {
    const ctl = new AbortController()
    setStatus('loading')
    setError(null)
    setCase(null)
    apiRef.current.getCase(folio, ctl.signal).then(
      (c) => {
        if (ctl.signal.aborted) return
        setCase(c)
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
  }, [folio, nonce])

  const patch = useCallback((id: string, fn: (m: SupportMessage) => SupportMessage) => {
    setCase((cur) => (cur ? { ...cur, messages: cur.messages.map((m) => (m.id === id ? fn(m) : m)) } : cur))
  }, [])

  const deliver = useCallback(
    async (id: string, input: MessageInput) => {
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
        patch(id, (m) => ({ ...m, state: 'failed' }))
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

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { status, error, supportCase, send, retry, reload }
}
