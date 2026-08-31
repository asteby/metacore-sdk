/**
 * Realtime data-event client — the wire protocol behind `host.realtime` /
 * `api.realtime` (see `RealtimeAPI` in `@asteby/metacore-sdk`).
 *
 * Protocol (server = ops hub, `docs/REALTIME.md`):
 *
 *   client → server  {"type":"SUBSCRIBE","models":["SalesOrder","work_orders"]}
 *                    {"type":"UNSUBSCRIBE","models":["SalesOrder"]}
 *   server → client  {"type":"DATA_SUBSCRIBED","payload":{"models":[...]}}
 *                    {"type":"DATA_EVENT","payload":{org_id,addon,model,table,action,id,...}}
 *                    {"type":"DATA_EVENTS_DROPPED","payload":{"dropped":N,"models":[...]}}
 *
 * The client ref-counts models across every `subscribe()` call so the server
 * only ever forwards what somebody on this page is listening to, re-sends the
 * whole subscription set on every (re)open, and turns a reconnect or a
 * DROPPED notice into synthetic `resync` events so consumers refetch instead
 * of trusting a stream with a hole in it.
 *
 * Two ways to run it:
 *
 *   1. Own socket — `createRealtimeClient({ wsUrl, getToken, channel })`.
 *      Opens `wsUrl?channel=org:<id>&token=<jwt>` with reconnect/backoff.
 *   2. Host socket — `createRealtimeClient({ transport })` where the host
 *      adapts its existing authenticated connection (`send`, `onFrame`,
 *      `isOpen`, `onOpen`). This is what ops does: one socket for chat,
 *      presence, calls AND data events.
 */

import type {
  DataEvent,
  DataEventHandler,
  RealtimeAPI,
  RealtimeStatus,
  RealtimeSubscribeOptions,
} from '@asteby/metacore-sdk'
import { dataEventMatches } from '@asteby/metacore-sdk'

/** Minimal frame shape the client reads off the transport. */
export interface RealtimeFrame {
  type: string
  payload?: unknown
}

/**
 * Transport adapter for hosts that already own an authenticated socket. Every
 * method must be safe to call at any time (before open, after close).
 */
export interface RealtimeTransport {
  /** Send a JSON-serialisable frame. Return false when the socket is not open. */
  send(frame: unknown): boolean
  /** Receive every parsed frame. Returns an unsubscribe function. */
  onFrame(handler: (frame: RealtimeFrame) => void): () => void
  /** True while the socket is OPEN. */
  isOpen(): boolean
  /** Fires after every successful (re)open. Returns an unsubscribe function. */
  onOpen(handler: () => void): () => void
  /** Optional status feed — when absent the client derives it from isOpen/onOpen. */
  onStatus?(handler: (status: RealtimeStatus) => void): () => void
  status?(): RealtimeStatus
  /** Optional teardown (own-socket transports close the socket). */
  close?(): void
}

export interface RealtimeClientOptions {
  /** Base WS URL (e.g. `wss://panel.example.com/ws`) — own-socket mode. */
  wsUrl?: string
  /** JWT getter — own-socket mode. `null` postpones the connection. */
  getToken?: () => string | null | undefined
  /** Channel to join, e.g. `org:<org_id>` (from `GET /api/realtime/info`). */
  channel?: string
  /** Reuse the host's socket instead of opening one. Wins over `wsUrl`. */
  transport?: RealtimeTransport
  /** Base reconnect delay in ms (own-socket mode). Default 2000. */
  reconnectInterval?: number
  /** Max reconnect attempts (own-socket mode). Default Infinity. */
  maxReconnectAttempts?: number
  /** Tap every delivered event (diagnostics). */
  onEvent?: (event: DataEvent) => void
  /** Diagnostics logger. Silent by default. */
  log?: (msg: string, data?: unknown) => void
}

export interface RealtimeClient extends RealtimeAPI {
  /** Observe status changes. Returns an unsubscribe function. */
  onStatus(listener: (status: RealtimeStatus) => void): () => void
  /** Models currently ref-counted on this page (normalised, sorted). */
  subscribedModels(): string[]
  /** Models the server last acknowledged (`DATA_SUBSCRIBED`). */
  serverModels(): string[]
  /** Drop every subscription and, in own-socket mode, close the socket. */
  close(): void
}

interface Subscription {
  opts: RealtimeSubscribeOptions
  handler: DataEventHandler
}

const DATA_EVENT = 'DATA_EVENT'
const DATA_SUBSCRIBED = 'DATA_SUBSCRIBED'
const DATA_EVENTS_DROPPED = 'DATA_EVENTS_DROPPED'

function normaliseModel(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Build a realtime client. Never throws from `subscribe`; a transport that is
 * not open yet simply defers the SUBSCRIBE frame to the next open.
 */
export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  const log = options.log ?? (() => {})
  const transport: RealtimeTransport =
    options.transport ?? createSocketTransport(options)

  const subscriptions = new Set<Subscription>()
  const modelCounts = new Map<string, number>()
  let acked: string[] = []
  let everOpened = false
  let closed = false
  const statusListeners = new Set<(status: RealtimeStatus) => void>()

  const currentStatus = (): RealtimeStatus => {
    if (transport.status) return transport.status()
    return transport.isOpen() ? 'open' : closed ? 'closed' : 'connecting'
  }

  const emitStatus = (status: RealtimeStatus) => {
    statusListeners.forEach((l) => {
      try {
        l(status)
      } catch (err) {
        log('status listener threw', err)
      }
    })
  }

  const send = (type: 'SUBSCRIBE' | 'UNSUBSCRIBE', models: string[]) => {
    if (models.length === 0) return
    if (!transport.isOpen()) return
    transport.send({ type, models })
  }

  const dispatch = (event: DataEvent) => {
    options.onEvent?.(event)
    subscriptions.forEach((sub) => {
      if (!dataEventMatches(sub.opts, event)) return
      try {
        sub.handler(event)
      } catch (err) {
        log('data event handler threw', err)
      }
    })
  }

  /** Synthesises one `resync` per subscribed model so every consumer refetches. */
  const resyncAll = (reason: string) => {
    const at = new Date().toISOString()
    const models = Array.from(modelCounts.keys())
    if (models.length === 0) return
    log(`resync (${reason})`, models)
    for (const model of models) {
      dispatch({
        org_id: '',
        addon: '',
        model,
        action: 'resync',
        id: '',
        at,
      })
    }
  }

  const offFrame = transport.onFrame((frame) => {
    if (!frame || typeof frame.type !== 'string') return
    switch (frame.type) {
      case DATA_EVENT: {
        const p = frame.payload as Partial<DataEvent> | undefined
        if (!p || typeof p.model !== 'string' || typeof p.action !== 'string') return
        dispatch({
          org_id: String(p.org_id ?? ''),
          addon: String(p.addon ?? ''),
          model: p.model,
          table: typeof p.table === 'string' ? p.table : undefined,
          action: p.action,
          id: String(p.id ?? ''),
          stage_from: typeof p.stage_from === 'string' ? p.stage_from : undefined,
          stage_to: typeof p.stage_to === 'string' ? p.stage_to : undefined,
          actor_id: typeof p.actor_id === 'string' ? p.actor_id : undefined,
          at: typeof p.at === 'string' ? p.at : new Date().toISOString(),
          fields: Array.isArray(p.fields) ? (p.fields as string[]) : undefined,
          coalesced: typeof p.coalesced === 'number' ? p.coalesced : undefined,
        })
        return
      }
      case DATA_SUBSCRIBED: {
        const p = frame.payload as { models?: unknown } | undefined
        acked = Array.isArray(p?.models) ? (p!.models as unknown[]).map(String) : []
        return
      }
      case DATA_EVENTS_DROPPED:
        resyncAll('server dropped frames')
        return
      default:
        return
    }
  })

  const offOpen = transport.onOpen(() => {
    const models = Array.from(modelCounts.keys())
    send('SUBSCRIBE', models)
    if (everOpened) {
      // Frames emitted during the gap are gone — refetch everything shown.
      resyncAll('reconnect')
    }
    everOpened = true
    emitStatus('open')
  })

  const offStatus = transport.onStatus
    ? transport.onStatus((s) => {
        if (s !== 'open') emitStatus(s)
      })
    : () => {}

  const subscribe: RealtimeAPI['subscribe'] = (opts, handler) => {
    if (closed) return () => {}
    const sub: Subscription = { opts: { ...opts, models: opts.models ?? [] }, handler }
    subscriptions.add(sub)
    const added: string[] = []
    for (const raw of sub.opts.models ?? []) {
      const m = normaliseModel(raw)
      if (!m) continue
      const n = (modelCounts.get(m) ?? 0) + 1
      modelCounts.set(m, n)
      if (n === 1) added.push(m)
    }
    send('SUBSCRIBE', added)
    let active = true
    return () => {
      if (!active) return
      active = false
      subscriptions.delete(sub)
      const removed: string[] = []
      for (const raw of sub.opts.models ?? []) {
        const m = normaliseModel(raw)
        if (!m) continue
        const n = (modelCounts.get(m) ?? 0) - 1
        if (n <= 0) {
          modelCounts.delete(m)
          removed.push(m)
        } else {
          modelCounts.set(m, n)
        }
      }
      send('UNSUBSCRIBE', removed)
    }
  }

  return {
    subscribe,
    status: currentStatus,
    onStatus(listener) {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    },
    subscribedModels: () => Array.from(modelCounts.keys()).sort(),
    serverModels: () => acked.slice(),
    close() {
      if (closed) return
      closed = true
      const models = Array.from(modelCounts.keys())
      send('UNSUBSCRIBE', models)
      subscriptions.clear()
      modelCounts.clear()
      offFrame()
      offOpen()
      offStatus()
      transport.close?.()
      emitStatus('closed')
      statusListeners.clear()
    },
  }
}

/**
 * Own-socket transport: native WebSocket on `wsUrl?channel=…&token=…` with
 * exponential backoff (capped at 30 s). Exported so hosts can wrap it or
 * reuse it for other channels.
 */
export function createSocketTransport(options: RealtimeClientOptions): RealtimeTransport {
  const frameHandlers = new Set<(frame: RealtimeFrame) => void>()
  const openHandlers = new Set<() => void>()
  const statusHandlers = new Set<(status: RealtimeStatus) => void>()
  const log = options.log ?? (() => {})
  const baseDelay = options.reconnectInterval ?? 2000
  const maxAttempts = options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY

  let ws: WebSocket | null = null
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let status: RealtimeStatus = 'closed'

  const setStatus = (s: RealtimeStatus) => {
    status = s
    statusHandlers.forEach((h) => {
      try {
        h(s)
      } catch (err) {
        log('status handler threw', err)
      }
    })
  }

  const buildUrl = (): string | null => {
    if (!options.wsUrl) return null
    const token = options.getToken?.()
    if (options.getToken && !token) return null
    let url: URL
    try {
      url = new URL(options.wsUrl, typeof window !== 'undefined' ? window.location.href : undefined)
    } catch {
      return null
    }
    if (options.channel) url.searchParams.set('channel', options.channel)
    if (token) url.searchParams.set('token', token)
    return url.toString()
  }

  const schedule = () => {
    if (closed || attempts >= maxAttempts) return
    const delay = Math.min(baseDelay * 2 ** attempts, 30_000)
    attempts += 1
    timer = setTimeout(connect, delay)
  }

  const connect = () => {
    if (closed || typeof WebSocket === 'undefined') return
    const url = buildUrl()
    if (!url) {
      // No token yet — poll again with backoff.
      schedule()
      return
    }
    setStatus('connecting')
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (err) {
      log('socket construct failed', err)
      setStatus('closed')
      schedule()
      return
    }
    ws = socket
    socket.onopen = () => {
      attempts = 0
      setStatus('open')
      openHandlers.forEach((h) => {
        try {
          h()
        } catch (err) {
          log('open handler threw', err)
        }
      })
    }
    socket.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return
      let parsed: RealtimeFrame | null = null
      try {
        parsed = JSON.parse(ev.data) as RealtimeFrame
      } catch {
        return
      }
      if (!parsed || typeof parsed.type !== 'string') return
      frameHandlers.forEach((h) => {
        try {
          h(parsed!)
        } catch (err) {
          log('frame handler threw', err)
        }
      })
    }
    socket.onerror = (ev) => log('socket error', ev)
    socket.onclose = (ev: CloseEvent) => {
      if (ws === socket) ws = null
      setStatus('closed')
      // 1008 = policy violation (channel/org mismatch) — never retry that.
      if (closed || ev.code === 1008) return
      schedule()
    }
  }

  // Connect lazily on the first listener so building a client is side-effect free.
  const ensureConnected = () => {
    if (!ws && !timer && !closed) connect()
  }

  return {
    send(frame) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false
      try {
        ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame))
        return true
      } catch {
        return false
      }
    },
    onFrame(handler) {
      frameHandlers.add(handler)
      ensureConnected()
      return () => {
        frameHandlers.delete(handler)
      }
    },
    isOpen: () => !!ws && ws.readyState === WebSocket.OPEN,
    onOpen(handler) {
      openHandlers.add(handler)
      ensureConnected()
      return () => {
        openHandlers.delete(handler)
      }
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      return () => {
        statusHandlers.delete(handler)
      }
    },
    status: () => status,
    close() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      const socket = ws
      ws = null
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        try {
          socket.close(1000, 'realtime client closed')
        } catch {
          /* ignore */
        }
      }
      setStatus('closed')
    },
  }
}

/**
 * Adapter for hosts whose socket exposes `subscribe(type, handler)` +
 * `send(payload)` + a live `isConnected` flag (the ops `WebSocketProvider`
 * shape). `onConnected` must invoke its callback with the current flag AND on
 * every change — React hosts typically wire it to an effect on `isConnected`.
 */
export interface HostSocketLike {
  subscribe: (type: string, handler: (frame: RealtimeFrame) => void) => () => void
  send: (payload: unknown) => void
  isConnected: () => boolean
  /** Register a listener for connection-state changes. */
  onConnected: (listener: (connected: boolean) => void) => () => void
}

export function transportFromHostSocket(host: HostSocketLike): RealtimeTransport {
  const statusHandlers = new Set<(status: RealtimeStatus) => void>()
  return {
    send(frame) {
      if (!host.isConnected()) return false
      host.send(frame)
      return true
    },
    onFrame(handler) {
      const offs = [DATA_EVENT, DATA_SUBSCRIBED, DATA_EVENTS_DROPPED].map((t) =>
        host.subscribe(t, handler),
      )
      return () => offs.forEach((off) => off())
    },
    isOpen: () => host.isConnected(),
    onOpen(handler) {
      let was = host.isConnected()
      if (was) handler()
      return host.onConnected((connected) => {
        if (connected && !was) handler()
        was = connected
      })
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      const off = host.onConnected((connected) => handler(connected ? 'open' : 'connecting'))
      return () => {
        statusHandlers.delete(handler)
        off()
      }
    },
    status: () => (host.isConnected() ? 'open' : 'connecting'),
  }
}
