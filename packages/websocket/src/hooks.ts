import { useContext, useEffect, useRef } from 'react'
import { WebSocketContext } from './provider'
import type { WebSocketContextValue, WebSocketMessage } from './types'

/**
 * Access the WebSocket context. Throws if used outside of
 * `<WebSocketProvider>`.
 */
export function useWebSocket<
  TMessage extends WebSocketMessage = WebSocketMessage,
>(): WebSocketContextValue<TMessage> {
  const ctx = useContext(WebSocketContext) as
    | WebSocketContextValue<TMessage>
    | undefined
  if (!ctx) {
    throw new Error('useWebSocket must be used within a <WebSocketProvider>')
  }
  return ctx
}

/**
 * Subscribe to messages of a specific `type`. The handler is kept fresh
 * via a ref so consumers don't need to memoize it. The subscription is
 * torn down automatically on unmount or when `type` changes.
 */
export function useWebSocketMessage<
  TMessage extends WebSocketMessage = WebSocketMessage,
  TType extends TMessage['type'] = TMessage['type'],
>(
  type: TType,
  handler: (message: Extract<TMessage, { type: TType }>) => void,
): void {
  const { subscribe } = useWebSocket<TMessage>()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const unsubscribe = subscribe(type, (message) => {
      handlerRef.current(message as Extract<TMessage, { type: TType }>)
    })
    return unsubscribe
  }, [type, subscribe])
}
