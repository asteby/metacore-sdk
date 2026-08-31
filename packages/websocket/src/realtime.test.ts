// createRealtimeClient over a fake transport: subscription ref-counting,
// (re)subscribe on open, DATA_EVENT dispatch with model/action filters, and
// the resync synthesised on DROPPED notices / reconnects.
import { describe, expect, it, vi } from 'vitest'
import type { DataEvent } from '@asteby/metacore-sdk'
import { createRealtimeClient, transportFromHostSocket, type RealtimeFrame, type RealtimeTransport } from './realtime'

function fakeTransport(open = true) {
  const frameHandlers = new Set<(f: RealtimeFrame) => void>()
  const openHandlers = new Set<() => void>()
  const sent: unknown[] = []
  let isOpen = open
  const transport: RealtimeTransport = {
    send: (frame) => {
      if (!isOpen) return false
      sent.push(frame)
      return true
    },
    onFrame: (h) => {
      frameHandlers.add(h)
      return () => frameHandlers.delete(h)
    },
    isOpen: () => isOpen,
    onOpen: (h) => {
      openHandlers.add(h)
      return () => openHandlers.delete(h)
    },
    close: vi.fn(),
  }
  return {
    transport,
    sent,
    open() {
      isOpen = true
      openHandlers.forEach((h) => h())
    },
    drop() {
      isOpen = false
    },
    frame(f: RealtimeFrame) {
      frameHandlers.forEach((h) => h(f))
    },
  }
}

const event = (over: Partial<DataEvent> = {}): DataEvent => ({
  org_id: 'org-1',
  addon: 'pos',
  model: 'SalesOrder',
  table: 'sales_orders',
  action: 'updated',
  id: 'so-1',
  at: '2026-08-31T00:00:00Z',
  fields: ['status'],
  ...over,
})

describe('createRealtimeClient', () => {
  it('sends SUBSCRIBE once per model and UNSUBSCRIBE when the last listener leaves', () => {
    const t = fakeTransport()
    const client = createRealtimeClient({ transport: t.transport })
    const offA = client.subscribe({ models: ['SalesOrder', 'WorkOrder'] }, () => {})
    const offB = client.subscribe({ models: ['salesorder'] }, () => {})
    expect(t.sent).toEqual([{ type: 'SUBSCRIBE', models: ['salesorder', 'workorder'] }])
    expect(client.subscribedModels()).toEqual(['salesorder', 'workorder'])

    offA()
    // WorkOrder had a single listener → unsubscribed; SalesOrder still has B.
    expect(t.sent[1]).toEqual({ type: 'UNSUBSCRIBE', models: ['workorder'] })
    offB()
    expect(t.sent[2]).toEqual({ type: 'UNSUBSCRIBE', models: ['salesorder'] })
    expect(client.subscribedModels()).toEqual([])
    // Idempotent unsubscribe.
    offB()
    expect(t.sent).toHaveLength(3)
  })

  it('defers SUBSCRIBE until the transport opens and re-sends the full set on every open', () => {
    const t = fakeTransport(false)
    const client = createRealtimeClient({ transport: t.transport })
    const handler = vi.fn()
    client.subscribe({ models: ['SalesOrder'] }, handler)
    expect(t.sent).toEqual([])

    t.open()
    expect(t.sent).toEqual([{ type: 'SUBSCRIBE', models: ['salesorder'] }])
    expect(client.status()).toBe('open')
    // First open → no resync (nothing was missed).
    expect(handler).not.toHaveBeenCalled()

    t.drop()
    t.open()
    expect(t.sent[1]).toEqual({ type: 'SUBSCRIBE', models: ['salesorder'] })
    // Reconnect → synthetic resync so consumers refetch.
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0]).toMatchObject({ action: 'resync', model: 'salesorder' })
  })

  it('dispatches DATA_EVENT frames only to matching subscriptions', () => {
    const t = fakeTransport()
    const client = createRealtimeClient({ transport: t.transport })
    const byModel = vi.fn()
    const byTable = vi.fn()
    const byQualified = vi.fn()
    const other = vi.fn()
    const onlyDeletes = vi.fn()
    client.subscribe({ models: ['SalesOrder'] }, byModel)
    client.subscribe({ models: ['sales_orders'] }, byTable)
    client.subscribe({ models: ['pos.SalesOrder'] }, byQualified)
    client.subscribe({ models: ['WorkOrder'] }, other)
    client.subscribe({ models: ['SalesOrder'], events: ['deleted'] }, onlyDeletes)

    t.frame({ type: 'DATA_EVENT', payload: event() })
    expect(byModel).toHaveBeenCalledTimes(1)
    expect(byTable).toHaveBeenCalledTimes(1)
    expect(byQualified).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    expect(onlyDeletes).not.toHaveBeenCalled()
    expect(byModel.mock.calls[0]![0]).toEqual(event())

    t.frame({ type: 'DATA_EVENT', payload: event({ action: 'deleted', fields: undefined }) })
    expect(onlyDeletes).toHaveBeenCalledTimes(1)

    // Malformed / unrelated frames are ignored.
    t.frame({ type: 'DATA_EVENT', payload: { nope: true } })
    t.frame({ type: 'NOTIFICATION', payload: { title: 'x' } })
    expect(byModel).toHaveBeenCalledTimes(2)
  })

  it('records the server ack and turns DROPPED notices into resync events', () => {
    const t = fakeTransport()
    const client = createRealtimeClient({ transport: t.transport })
    const handler = vi.fn()
    client.subscribe({ models: ['SalesOrder', 'WorkOrder'] }, handler)
    t.frame({ type: 'DATA_SUBSCRIBED', payload: { models: ['salesorder', 'workorder'] } })
    expect(client.serverModels()).toEqual(['salesorder', 'workorder'])

    t.frame({ type: 'DATA_EVENTS_DROPPED', payload: { dropped: 7, models: ['salesorder'] } })
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls.map((c) => (c[0] as DataEvent).model).sort()).toEqual(['salesorder', 'workorder'])
    expect(handler.mock.calls.every((c) => (c[0] as DataEvent).action === 'resync')).toBe(true)
  })

  it('never lets a throwing handler starve the others', () => {
    const t = fakeTransport()
    const log = vi.fn()
    const client = createRealtimeClient({ transport: t.transport, log })
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    client.subscribe({ models: ['SalesOrder'] }, bad)
    client.subscribe({ models: ['SalesOrder'] }, good)
    t.frame({ type: 'DATA_EVENT', payload: event() })
    expect(good).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalled()
  })

  it('close() unsubscribes everything, closes the transport and reports closed', () => {
    const t = fakeTransport()
    const client = createRealtimeClient({ transport: t.transport })
    const status = vi.fn()
    client.onStatus(status)
    client.subscribe({ models: ['SalesOrder'] }, () => {})
    client.close()
    expect(t.sent.at(-1)).toEqual({ type: 'UNSUBSCRIBE', models: ['salesorder'] })
    expect(t.transport.close).toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith('closed')
    expect(client.subscribedModels()).toEqual([])
    // After close, subscribe is a no-op.
    const off = client.subscribe({ models: ['X'] }, () => {})
    off()
    expect(client.subscribedModels()).toEqual([])
  })
})

describe('transportFromHostSocket', () => {
  it('adapts a host subscribe/send/isConnected surface', () => {
    const subs = new Map<string, (f: RealtimeFrame) => void>()
    const sent: unknown[] = []
    let connected = false
    const listeners = new Set<(c: boolean) => void>()
    const transport = transportFromHostSocket({
      subscribe: (type, handler) => {
        subs.set(type, handler)
        return () => subs.delete(type)
      },
      send: (p) => sent.push(p),
      isConnected: () => connected,
      onConnected: (l) => {
        listeners.add(l)
        return () => listeners.delete(l)
      },
    })
    const client = createRealtimeClient({ transport })
    const handler = vi.fn()
    client.subscribe({ models: ['SalesOrder'] }, handler)
    expect(sent).toEqual([]) // not connected yet
    expect(client.status()).toBe('connecting')

    connected = true
    listeners.forEach((l) => l(true))
    expect(sent).toEqual([{ type: 'SUBSCRIBE', models: ['salesorder'] }])
    expect(client.status()).toBe('open')

    subs.get('DATA_EVENT')!({ type: 'DATA_EVENT', payload: event() })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(subs.has('DATA_EVENTS_DROPPED')).toBe(true)
  })
})
