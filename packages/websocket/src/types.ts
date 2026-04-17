/**
 * WebSocket connection states mirroring the native `WebSocket.readyState`
 * constants, exposed as an enum-like const for typed consumption.
 */
export const WebSocketStatus = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const

export type WebSocketStatus = (typeof WebSocketStatus)[keyof typeof WebSocketStatus]

/**
 * Minimal shape shared by all messages flowing through the provider. A
 * `type` discriminator is required so consumers can subscribe to specific
 * message kinds via `useWebSocketMessage`. Additional fields (payload,
 * channel, metadata, etc.) are left open to extension.
 */
export interface WebSocketMessage<TType extends string = string, TPayload = unknown> {
  type: TType
  payload?: TPayload
  [key: string]: unknown
}

export type TokenGetter = () => string | null | undefined | Promise<string | null | undefined>

export type SendPayload = string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketMessage

export interface WebSocketProviderProps<TMessage extends WebSocketMessage = WebSocketMessage> {
  /** WebSocket endpoint (e.g. `wss://api.example.com/ws`). */
  url: string | null | undefined
  /**
   * Optional token getter. When provided and a token is available, the
   * token is appended as `?token=<token>` to the URL (unless a custom
   * `buildUrl` is supplied). Returning `null`/`undefined` suppresses the
   * connection until a token becomes available.
   */
  getToken?: TokenGetter
  /**
   * Override how the final connection URL is built. Receives the base
   * `url` and the resolved token. Return `null` to skip the connection.
   */
  buildUrl?: (url: string, token: string | null | undefined) => string | null
  /** Base delay (ms) between reconnect attempts. Default: 3000. */
  reconnectInterval?: number
  /** Max reconnect attempts before giving up. Default: 10. */
  maxReconnectAttempts?: number
  /**
   * When true (default), uses exponential backoff capped at 30s based on
   * `reconnectInterval`. Set to false for a fixed interval.
   */
  exponentialBackoff?: boolean
  /** Heartbeat interval (ms). Set to 0 or omit to disable. */
  heartbeatInterval?: number
  /** Custom heartbeat message. Default: `{ type: 'ping' }`. */
  heartbeatMessage?: SendPayload
  /** Called after the socket successfully opens. */
  onOpen?: (event: Event) => void
  /** Called when the socket closes. */
  onClose?: (event: CloseEvent) => void
  /** Called on any error event from the socket. */
  onError?: (event: Event) => void
  /**
   * Called for every parsed message. Invoked after type-specific
   * subscribers registered via `useWebSocketMessage`.
   */
  onMessage?: (message: TMessage, event: MessageEvent) => void
  /** Protocols forwarded to the native `WebSocket` constructor. */
  protocols?: string | string[]
  children?: React.ReactNode
}

export interface WebSocketContextValue<TMessage extends WebSocketMessage = WebSocketMessage> {
  /** Current connection status. */
  status: WebSocketStatus
  /** True while the socket is OPEN. */
  isConnected: boolean
  /** Last parsed message received, or null. */
  lastMessage: TMessage | null
  /** Raw last MessageEvent (useful for binary frames). */
  lastEvent: MessageEvent | null
  /**
   * Send a message. Objects are serialized with `JSON.stringify`; strings
   * and binary frames are passed straight through.
   */
  send: (payload: SendPayload) => boolean
  /** Force-disconnect and prevent further reconnect attempts. */
  disconnect: () => void
  /** Manually trigger a (re)connection attempt. */
  reconnect: () => void
  /** Register a handler for a specific message `type`. Returns an unsubscribe fn. */
  subscribe: <T extends TMessage = TMessage>(
    type: T['type'],
    handler: (message: T) => void,
  ) => () => void
}
