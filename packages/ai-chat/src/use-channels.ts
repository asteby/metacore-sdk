import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { applyChannelEvent, sortChannels, type ChannelAdapter, type ChatChannel } from './channels'

interface State {
  channels: ChatChannel[]
  loading: boolean
  error: boolean
}
type Action =
  | { type: 'loading' }
  | { type: 'loaded'; channels: ChatChannel[] }
  | { type: 'failed' }
  | { type: 'patch'; fn: (c: ChatChannel[]) => ChatChannel[] }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'loading':
      return { ...s, loading: true, error: false }
    case 'loaded':
      return { channels: sortChannels(a.channels), loading: false, error: false }
    case 'failed':
      return { ...s, loading: false, error: true }
    case 'patch':
      return { ...s, channels: a.fn(s.channels) }
  }
}

/**
 * Channel list over the injected adapter: loads, subscribes to live events and
 * tracks unread counts. Mount it above the widget so the FAB badge stays live
 * while the panel is closed. A null adapter is inert.
 */
export function useChannels(adapter: ChannelAdapter | null | undefined, activeId: string | null) {
  const [state, dispatch] = useReducer(reducer, { channels: [], loading: false, error: false })
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const reload = useCallback(() => {
    if (!adapter) return
    dispatch({ type: 'loading' })
    adapter.listChannels().then(
      (channels) => dispatch({ type: 'loaded', channels }),
      () => dispatch({ type: 'failed' }),
    )
  }, [adapter])

  useEffect(() => {
    if (!adapter) return
    let live = true
    dispatch({ type: 'loading' })
    adapter.listChannels().then(
      (channels) => live && dispatch({ type: 'loaded', channels }),
      () => live && dispatch({ type: 'failed' }),
    )
    const off = adapter.subscribe?.((event) => {
      if (!live) return
      if (event.type === 'channels') {
        reload()
        return
      }
      dispatch({ type: 'patch', fn: (c) => applyChannelEvent(c, event, activeRef.current) })
    })
    return () => {
      live = false
      off?.()
    }
  }, [adapter, reload])

  /** Clear the badge locally when a channel is opened (the adapter's `markRead` persists it). */
  const clearUnread = useCallback((id: string) => {
    dispatch({ type: 'patch', fn: (c) => c.map((x) => (x.id === id && x.unread ? { ...x, unread: 0 } : x)) })
  }, [])

  const totalUnread = useMemo(() => state.channels.reduce((n, c) => n + (c.unread ?? 0), 0), [state.channels])

  return { ...state, reload, clearUnread, totalUnread }
}
