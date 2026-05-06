import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  SendPayload,
  WebSocketContextValue,
  WebSocketMessage,
  WebSocketProviderProps,
} from './types'
import { WebSocketStatus } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WebSocketContext = createContext<WebSocketContextValue<any> | undefined>(
  undefined,
)

const MAX_BACKOFF_MS = 30_000

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !(value instanceof Blob) &&
    !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)
}

function serialize(payload: SendPayload): string | Blob | BufferSource {
  if (typeof payload === 'string') return payload
  if (payload instanceof Blob) return payload
  if (payload instanceof ArrayBuffer) return payload
  if (ArrayBuffer.isView(payload)) return payload as ArrayBufferView<ArrayBuffer>
  if (isPlainObject(payload)) return JSON.stringify(payload)
  return String(payload)
}

function defaultBuildUrl(url: string, token: string | null | undefined): string {
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

/**
 * Unified WebSocket provider. Native `WebSocket` implementation with
 * auto-reconnect (exponential backoff), optional heartbeat, typed message
 * dispatch, and a pub/sub registry consumed by `useWebSocketMessage`.
 */
export function WebSocketProvider<TMessage extends WebSocketMessage = WebSocketMessage>(
  props: WebSocketProviderProps<TMessage>,
) {
  const {
    url,
    getToken,
    buildUrl,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    exponentialBackoff = true,
    heartbeatInterval = 0,
    heartbeatMessage = { type: 'ping' },
    onOpen,
    onClose,
    onError,
    onMessage,
    protocols,
    children,
  } = props

  const [status, setStatus] = useState<WebSocketStatus>(WebSocketStatus.CLOSED)
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null)
  const [lastEvent, setLastEvent] = useState<MessageEvent | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const manualCloseRef = useRef(false)
  const subscribersRef = useRef<Map<string, Set<(message: TMessage) => void>>>(new Map())

  // Latest callbacks kept in refs so connect() can stay referentially stable.
  const handlersRef = useRef({ onOpen, onClose, onError, onMessage })
  handlersRef.current = { onOpen, onClose, onError, onMessage }

  const optsRef = useRef({
    reconnectInterval,
    maxReconnectAttempts,
    exponentialBackoff,
    heartbeatInterval,
    heartbeatMessage,
    protocols,
    buildUrl,
    getToken,
    url,
  })
  optsRef.current = {
    reconnectInterval,
    maxReconnectAttempts,
    exponentialBackoff,
    heartbeatInterval,
    heartbeatMessage,
    protocols,
    buildUrl,
    getToken,
    url,
  }

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
  }, [])

  const send = useCallback((payload: SendPayload): boolean => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(serialize(payload))
      return true
    } catch {
      return false
    }
  }, [])

  const startHeartbeat = useCallback(() => {
    clearHeartbeat()
    const { heartbeatInterval: hb, heartbeatMessage: hbMsg } = optsRef.current
    if (!hb || hb <= 0) return
    heartbeatTimerRef.current = setInterval(() => {
      send(hbMsg)
    }, hb)
  }, [clearHeartbeat, send])

  const teardownSocket = useCallback(() => {
    const ws = wsRef.current
    if (ws) {
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      try {
        ws.close()
      } catch {
        // ignore
      }
      wsRef.current = null
    }
  }, [])

  const connect = useCallback(async () => {
    const opts = optsRef.current
    if (!opts.url) {
      setStatus(WebSocketStatus.CLOSED)
      return
    }

    let token: string | null | undefined = null
    if (opts.getToken) {
      try {
        token = await opts.getToken()
      } catch {
        token = null
      }
    }

    const builder = opts.buildUrl ?? defaultBuildUrl
    const finalUrl = builder(opts.url, token)
    if (!finalUrl) {
      setStatus(WebSocketStatus.CLOSED)
      return
    }

    manualCloseRef.current = false
    teardownSocket()
    setStatus(WebSocketStatus.CONNECTING)

    let ws: WebSocket
    try {
      ws = opts.protocols
        ? new WebSocket(finalUrl, opts.protocols)
        : new WebSocket(finalUrl)
    } catch (err) {
      setStatus(WebSocketStatus.CLOSED)
      handlersRef.current.onError?.(err as Event)
      scheduleReconnect()
      return
    }
    wsRef.current = ws

    ws.onopen = (event) => {
      reconnectAttemptsRef.current = 0
      setStatus(WebSocketStatus.OPEN)
      startHeartbeat()
      handlersRef.current.onOpen?.(event)
    }

    ws.onmessage = (event: MessageEvent) => {
      setLastEvent(event)
      let parsed: TMessage | null = null
      if (typeof event.data === 'string') {
        try {
          parsed = JSON.parse(event.data) as TMessage
        } catch {
          parsed = null
        }
      }
      if (parsed) {
        setLastMessage(parsed)
        const type = (parsed as WebSocketMessage).type
        if (typeof type === 'string') {
          const subs = subscribersRef.current.get(type)
          if (subs) {
            subs.forEach((handler) => {
              try {
                handler(parsed as TMessage)
              } catch {
                // swallow — one bad subscriber shouldn't break the pipeline
              }
            })
          }
        }
        handlersRef.current.onMessage?.(parsed, event)
      }
    }

    ws.onerror = (event) => {
      handlersRef.current.onError?.(event)
    }

    ws.onclose = (event) => {
      clearHeartbeat()
      setStatus(WebSocketStatus.CLOSED)
      handlersRef.current.onClose?.(event)
      if (!manualCloseRef.current) {
        scheduleReconnect()
      }
    }
  }, [clearHeartbeat, startHeartbeat, teardownSocket])

  const scheduleReconnect = useCallback(() => {
    const opts = optsRef.current
    if (reconnectAttemptsRef.current >= opts.maxReconnectAttempts) return
    clearReconnectTimer()

    const base = opts.reconnectInterval
    const attempt = reconnectAttemptsRef.current
    const delay = opts.exponentialBackoff
      ? Math.min(base * 2 ** attempt, MAX_BACKOFF_MS)
      : base

    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptsRef.current += 1
      void connect()
    }, delay)
  }, [clearReconnectTimer, connect])

  const disconnect = useCallback(() => {
    manualCloseRef.current = true
    clearReconnectTimer()
    clearHeartbeat()
    teardownSocket()
    setStatus(WebSocketStatus.CLOSED)
  }, [clearHeartbeat, clearReconnectTimer, teardownSocket])

  const reconnect = useCallback(() => {
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    void connect()
  }, [clearReconnectTimer, connect])

  const subscribe = useCallback(
    <T extends TMessage = TMessage>(type: T['type'], handler: (message: T) => void) => {
      const key = String(type)
      const map = subscribersRef.current
      let set = map.get(key)
      if (!set) {
        set = new Set()
        map.set(key, set)
      }
      set.add(handler as (message: TMessage) => void)
      return () => {
        const current = subscribersRef.current.get(key)
        if (!current) return
        current.delete(handler as (message: TMessage) => void)
        if (current.size === 0) subscribersRef.current.delete(key)
      }
    },
    [],
  )

  // Establish / tear down the connection when `url` changes.
  useEffect(() => {
    if (url) {
      reconnectAttemptsRef.current = 0
      void connect()
    } else {
      disconnect()
    }
    return () => {
      manualCloseRef.current = true
      clearReconnectTimer()
      clearHeartbeat()
      teardownSocket()
    }
    // `connect`/`disconnect` are stable; re-running on every token change
    // would thrash the connection — consumers who want to force a refresh
    // on token changes can call `reconnect()` themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const value = useMemo<WebSocketContextValue<TMessage>>(
    () => ({
      status,
      isConnected: status === WebSocketStatus.OPEN,
      lastMessage,
      lastEvent,
      send,
      disconnect,
      reconnect,
      subscribe,
    }),
    [status, lastMessage, lastEvent, send, disconnect, reconnect, subscribe],
  )

  return (
    <WebSocketContext.Provider value={value as WebSocketContextValue<WebSocketMessage>}>
      {children}
    </WebSocketContext.Provider>
  )
}
