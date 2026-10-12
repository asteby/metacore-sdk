import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { normalizeProposals } from './proposals'
import { chatReducer, initialChatState } from './chat-state'
import { nextMessageId } from './client'
import { useCopilot } from './context'
import type { ChatAttachment } from './types'

/** Conversation state machine over the injected `ChatClient`. */
export function useChat(initialSessionId?: string | null) {
  const { client, labels } = useCopilot()
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const abortRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => () => abortRef.current?.abort(), [])

  const [historyNonce, setHistoryNonce] = useState(0)
  const [decideFailed, setDecideFailed] = useState(false)

  useEffect(() => {
    if (!initialSessionId || !client.loadHistory) return
    let cancelled = false
    client
      .loadHistory(initialSessionId)
      .then((messages) => {
        if (cancelled) return
        dispatch({
          type: 'history',
          sessionId: initialSessionId,
          messages: messages.map((m) => ({ ...m, proposals: normalizeProposals(m.proposals) })),
        })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'historyError' })
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSessionId, historyNonce])

  const send = useCallback(
    async (text: string, attachments?: ChatAttachment[]) => {
      const message = text.trim()
      if (!message || stateRef.current.loading) return
      dispatch({ type: 'user', message: { id: nextMessageId(), role: 'user', content: message, attachments } })
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await client.send({
          message,
          sessionId: stateRef.current.sessionId,
          attachments,
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) return
        dispatch({
          type: 'reply',
          sessionId: res.sessionId,
          message: {
            id: nextMessageId(),
            role: 'ai',
            content: res.reply,
            proposals: normalizeProposals(res.proposals),
            attachments: res.attachments,
            demo: res.demo,
          },
        })
      } catch {
        if (ctrl.signal.aborted) return
        dispatch({ type: 'error', message: { id: nextMessageId(), role: 'ai', content: labels.error } })
      }
    },
    [client, labels.error],
  )

  const decide = useCallback(
    async (id: string, approve: boolean) => {
      if (!client.decideProposal) return
      setDecideFailed(false)
      try {
        await client.decideProposal(id, approve)
        dispatch({ type: 'proposal', id, status: approve ? 'approved' : 'rejected' })
      } catch {
        setDecideFailed(true)
      }
    },
    [client],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'reset' })
  }, [])

  /** Re-send the turn that failed (drops the error bubble first). */
  const retry = useCallback(async () => {
    const s = stateRef.current
    const last = s.messages[s.messages.length - 1]
    if (!last?.error || s.loading) return
    const prev = s.messages[s.messages.length - 2]
    dispatch({ type: 'discardFailed' })
    if (prev?.role === 'user') await send(prev.content, prev.attachments)
  }, [send])

  const reloadHistory = useCallback(() => setHistoryNonce((n) => n + 1), [])
  const clearDecideError = useCallback(() => setDecideFailed(false), [])

  return { ...state, decideFailed, clearDecideError, send, decide, reset, retry, reloadHistory }
}
