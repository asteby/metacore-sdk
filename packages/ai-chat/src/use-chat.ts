import { useCallback, useEffect, useReducer, useRef } from 'react'
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

  useEffect(() => {
    if (!initialSessionId || !client.loadHistory) return
    let cancelled = false
    client
      .loadHistory(initialSessionId)
      .then((messages) => !cancelled && dispatch({ type: 'history', sessionId: initialSessionId, messages }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, initialSessionId])

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
            proposals: res.proposals,
            attachments: res.attachments,
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
      await client.decideProposal(id, approve)
      dispatch({ type: 'proposal', id, status: approve ? 'approved' : 'rejected' })
    },
    [client],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'reset' })
  }, [])

  return { ...state, send, decide, reset }
}
