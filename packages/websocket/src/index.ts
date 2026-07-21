export { WebSocketProvider, WebSocketContext } from './provider'
export { useWebSocket, useWebSocketMessage } from './hooks'
export { WebSocketStatus } from './types'
export type {
  WebSocketMessage,
  WebSocketContextValue,
  WebSocketProviderProps,
  SendPayload,
  TokenGetter,
} from './types'

// Multi-channel imperative client (one socket per logical channel, routed
// by query params). Complements the single-socket WebSocketProvider.
export { createChannelClient } from './channels'
export type {
  ChannelClient,
  ChannelClientOptions,
  ChannelMessageHandler,
  ChannelConnectionState,
} from './channels'
