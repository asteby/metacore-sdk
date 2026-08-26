import { useEffect, useRef } from 'react'
import type { NotificationWsPayload } from './types'

export type NotificationStreamOptions = {
  /** Absolute or same-origin URL, e.g. `/api/notifications/stream` */
  url: string
  /** Bearer token (EventSource cannot set headers — pass as `?access_token=` if needed). */
  accessToken?: string | null
  /** Called for every `notification` SSE event (and unnamed events with JSON body). */
  onMessage: (payload: NotificationWsPayload) => void
  /** Optional Last-Event-ID resume cursor (notification id / sequence). */
  lastEventId?: string | null
  enabled?: boolean
}

function buildUrl(base: string, accessToken?: string | null, lastEventId?: string | null): string {
  const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : 'http://local')
  if (accessToken) u.searchParams.set('access_token', accessToken)
  if (lastEventId) u.searchParams.set('last_event_id', lastEventId)
  return u.pathname + u.search
}

/**
 * Subscribe to the host's SSE notification stream (`text/event-stream`).
 * Prefer this over WebSocket for bell fan-out: auto-reconnect, Last-Event-ID,
 * and no socket multiplexing with chat/presence.
 *
 * Returns an unsubscribe function. No-ops when `EventSource` is unavailable.
 */
export function subscribeNotificationSSE(
  opts: NotificationStreamOptions,
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {}
  }
  if (opts.enabled === false || !opts.url) return () => {}

  const url = buildUrl(opts.url, opts.accessToken, opts.lastEventId)
  const es = new EventSource(url, { withCredentials: true })

  const handle = (ev: MessageEvent) => {
    try {
      const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
      if (!data || typeof data !== 'object') return
      // Accept either bare payload or { type, payload } envelope.
      const payload =
        data.type === 'NOTIFICATION' && data.payload
          ? data.payload
          : data.title
            ? data
            : null
      if (payload?.title) opts.onMessage(payload as NotificationWsPayload)
    } catch {
      // ignore malformed frames
    }
  }

  es.addEventListener('notification', handle as EventListener)
  es.onmessage = handle

  return () => {
    es.close()
  }
}

/**
 * React helper: open SSE for the lifetime of the component.
 * Prefer passing a stable `onMessage` (useCallback).
 */
export function useNotificationSSE(opts: NotificationStreamOptions): void {
  const onMessageRef = useRef(opts.onMessage)
  onMessageRef.current = opts.onMessage

  useEffect(() => {
    return subscribeNotificationSSE({
      ...opts,
      onMessage: (p) => onMessageRef.current(p),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url/token/enabled are the live deps
  }, [opts.url, opts.accessToken, opts.lastEventId, opts.enabled])
}
