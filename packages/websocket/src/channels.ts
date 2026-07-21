/**
 * Multi-channel WebSocket client.
 *
 * Complements the single-socket `WebSocketProvider`: some backends (hubs
 * that route by logical channel — notifications, chat, live TV) expect ONE
 * connection PER channel, addressed by query params:
 *
 *   wss://api.example.com/ws?channel=chat&token=<jwt>&with=42
 *
 * This client manages that pool imperatively and framework-agnostically:
 * auto-reconnect with exponential backoff, React StrictMode-safe
 * subscription (100ms close debounce so double-mount doesn't drop the
 * socket), and lazy connection per channel.
 *
 * Origin: battle-tested client contributed upstream from doctores.lat.
 */

/** Handler for incoming messages on a channel. */
export type ChannelMessageHandler = (event: MessageEvent) => void

export interface ChannelClientOptions {
  /** WS base URL, e.g. `wss://api.example.com/ws`. */
  baseUrl: string
  /** Returns the current JWT; `null` suppresses the connection. */
  getToken: () => string | null
  /** Max reconnection attempts per channel (default: 5). */
  maxReconnectAttempts?: number
  /** Base reconnect delay in ms, doubled per attempt (default: 1000). */
  reconnectBaseDelay?: number
}

export type ChannelConnectionState =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'reconnecting'

interface ChannelConnection {
  socket: WebSocket
  handlers: Set<ChannelMessageHandler>
  reconnectAttempts: number
  reconnectTimeout: ReturnType<typeof setTimeout> | null
  closeTimeout: ReturnType<typeof setTimeout> | null
  isClosed: boolean
  extraParams?: Record<string, string | number>
}

export interface ChannelClient {
  /**
   * Subscribe a handler to a logical channel. Returns `unsubscribe`.
   * StrictMode-safe: unsubscribing debounces the actual close by 100ms so a
   * double-mount resubscription reuses the live socket.
   */
  subscribe: (
    channel: string,
    handler: ChannelMessageHandler,
    extraParams?: Record<string, string | number>
  ) => () => void
  /** Send a string or JSON-serializable payload over a channel. */
  send: (
    channel: string,
    payload: unknown,
    extraParams?: Record<string, string | number>
  ) => void
  /** Close every open connection (e.g. on app teardown). */
  disconnectAll: () => void
  /** Connection state for a channel. */
  getConnectionState: (channel: string) => ChannelConnectionState
}

export function createChannelClient(options: ChannelClientOptions): ChannelClient {
  const connections = new Map<string, ChannelConnection>()
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 5
  const reconnectBaseDelay = options.reconnectBaseDelay ?? 1000

  function buildUrl(
    channel: string,
    token: string,
    extraParams?: Record<string, string | number>
  ): string {
    const url = new URL(options.baseUrl)
    url.searchParams.set('channel', channel)
    url.searchParams.set('token', token)
    if (extraParams) {
      Object.entries(extraParams).forEach(([key, value]) => {
        url.searchParams.set(key, String(value))
      })
    }
    return url.toString()
  }

  function createConnection(
    channel: string,
    existingHandlers?: Set<ChannelMessageHandler>,
    extraParams?: Record<string, string | number>
  ): ChannelConnection | null {
    const token = options.getToken()
    if (!token) {
      console.warn('[ws:channels] No token available for channel', channel)
      return null
    }

    const socket = new WebSocket(buildUrl(channel, token, extraParams))
    const handlers = existingHandlers ?? new Set<ChannelMessageHandler>()

    const connection: ChannelConnection = {
      socket,
      handlers,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      closeTimeout: null,
      isClosed: false,
      extraParams,
    }

    socket.onopen = () => {
      connection.reconnectAttempts = 0
    }

    socket.onmessage = (event) => {
      handlers.forEach((handler) => handler(event))
    }

    socket.onclose = (event) => {
      // Reconnect only when: not intentionally closed, someone is still
      // listening, attempts remain, and the closure wasn't clean (1000).
      if (
        !connection.isClosed &&
        handlers.size > 0 &&
        connection.reconnectAttempts < maxReconnectAttempts &&
        event.code !== 1000
      ) {
        const delay = reconnectBaseDelay * Math.pow(2, connection.reconnectAttempts)
        connection.reconnectTimeout = setTimeout(() => {
          connection.reconnectAttempts++
          const newConn = createConnection(channel, handlers, extraParams)
          if (newConn) {
            // Preserve the attempt counter across the replacement socket so
            // the backoff caps at maxReconnectAttempts overall.
            newConn.reconnectAttempts = connection.reconnectAttempts
            connections.set(channel, newConn)
          } else {
            connections.delete(channel)
          }
        }, delay)
      } else {
        connections.delete(channel)
      }
    }

    socket.onerror = (event) => {
      console.error('[ws:channels] Error on channel', channel, event)
    }

    connections.set(channel, connection)
    return connection
  }

  function ensureConnection(
    channel: string,
    extraParams?: Record<string, string | number>
  ): ChannelConnection | null {
    const existing = connections.get(channel)
    if (
      existing &&
      existing.socket.readyState !== WebSocket.CLOSED &&
      existing.socket.readyState !== WebSocket.CLOSING
    ) {
      return existing
    }
    if (existing) {
      if (existing.reconnectTimeout) clearTimeout(existing.reconnectTimeout)
      connections.delete(channel)
    }
    return createConnection(channel, undefined, extraParams)
  }

  function subscribe(
    channel: string,
    handler: ChannelMessageHandler,
    extraParams?: Record<string, string | number>
  ): () => void {
    const conn = ensureConnection(channel, extraParams)
    if (!conn) return () => {}

    // Cancel a pending close (StrictMode resubscription).
    if (conn.closeTimeout) {
      clearTimeout(conn.closeTimeout)
      conn.closeTimeout = null
      conn.isClosed = false
    }

    conn.handlers.add(handler)

    return () => {
      const current = connections.get(channel)
      if (!current) return
      current.handlers.delete(handler)
      if (current.handlers.size > 0) return

      if (current.closeTimeout) clearTimeout(current.closeTimeout)
      // 100ms debounce lets StrictMode resubscribe before the real close.
      current.closeTimeout = setTimeout(() => {
        if (current.handlers.size > 0) return
        current.isClosed = true
        if (current.reconnectTimeout) {
          clearTimeout(current.reconnectTimeout)
          current.reconnectTimeout = null
        }
        if (current.socket.readyState === WebSocket.OPEN) {
          current.socket.close(1000, 'No more handlers')
        } else if (current.socket.readyState === WebSocket.CONNECTING) {
          current.socket.addEventListener(
            'open',
            () => {
              if (current.handlers.size === 0) {
                current.socket.close(1000, 'No more handlers')
              }
            },
            { once: true }
          )
        }
        connections.delete(channel)
      }, 100)
    }
  }

  function send(
    channel: string,
    payload: unknown,
    extraParams?: Record<string, string | number>
  ) {
    const conn = ensureConnection(channel, extraParams)
    if (!conn) return

    const data = typeof payload === 'string' ? payload : JSON.stringify(payload)
    if (conn.socket.readyState === WebSocket.OPEN) {
      conn.socket.send(data)
    } else if (conn.socket.readyState === WebSocket.CONNECTING) {
      conn.socket.addEventListener('open', () => conn.socket.send(data), {
        once: true,
      })
    } else {
      console.warn('[ws:channels] Cannot send, socket not open for channel', channel)
    }
  }

  function disconnectAll() {
    connections.forEach((conn) => {
      conn.isClosed = true
      if (conn.reconnectTimeout) clearTimeout(conn.reconnectTimeout)
      if (conn.closeTimeout) clearTimeout(conn.closeTimeout)
      if (
        conn.socket.readyState === WebSocket.OPEN ||
        conn.socket.readyState === WebSocket.CONNECTING
      ) {
        conn.socket.close(1000, 'Disconnect all')
      }
    })
    connections.clear()
  }

  function getConnectionState(channel: string): ChannelConnectionState {
    const conn = connections.get(channel)
    if (!conn) return 'disconnected'
    if (conn.reconnectTimeout) return 'reconnecting'
    switch (conn.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'connected'
      default:
        return 'disconnected'
    }
  }

  return { subscribe, send, disconnectAll, getConnectionState }
}
