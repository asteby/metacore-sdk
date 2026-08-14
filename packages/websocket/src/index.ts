export { WebSocketProvider, WebSocketContext } from './provider'
export { useWebSocket, useWebSocketMessage } from './hooks'
export { WebSocketStatus } from './types'
export type {
  WebSocketMessage,
  WebSocketContextValue,
  WebSocketProviderProps,
  SendPayload,
  TokenGetter,
  CallKind,
  CallInvitePayload,
  CallJoinPayload,
  CallSignalPayload,
  CallEndPayload,
  CallSignalType,
} from './types'

/** Well-known WebSocket message types for realtime A/V calls. */
export const CallMessageType = {
  Invite: 'CALL_INVITE',
  Join: 'CALL_JOIN',
  Signal: 'CALL_SIGNAL',
  End: 'CALL_END',
} as const

export type CallMessageType = (typeof CallMessageType)[keyof typeof CallMessageType]

// Multi-channel imperative client (one socket per logical channel, routed
// by query params). Complements the single-socket WebSocketProvider.
export { createChannelClient } from './channels'
export type {
  ChannelClient,
  ChannelClientOptions,
  ChannelMessageHandler,
  ChannelConnectionState,
} from './channels'
