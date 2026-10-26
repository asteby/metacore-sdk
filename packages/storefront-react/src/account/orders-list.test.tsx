// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { StorefrontError, type Order } from '@asteby/storefront'
import { OrderList, useCustomerOrder, useCustomerOrders, usePendingPayments } from './index.js'
import { demo } from './orders-fixtures.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const href = (o: Order) => `/cuenta/pedidos/${o.id}`

describe('<OrderList />', () => {
  it('lists the demo orders with status, total, progress, shipment and the one next action', async () => {
    const { list } = await demo()
    const { container } = render(<OrderList orders={list.nodes} orderHref={href} timeZone="UTC" />)
    const cards = [...container.querySelectorAll('[data-sf-order]')]
    expect(cards.length).toBeGreaterThanOrEqual(5)
    expect(cards[0]!.querySelector('[data-sf-order-link]')!.getAttribute('href')).toBe('/cuenta/pedidos/ord_seed_1')
    const shipped = container.querySelector('[data-sf-order-id=ord_seed_shipped]')!
    expect(shipped.getAttribute('data-sf-order-status')).toBe('in_transit')
    expect(shipped.querySelector('[data-sf-order-badge]')!.textContent).toBe('En camino')
    expect(shipped.querySelector('[data-sf-progress-summary]')!.textContent).toBe('Paso 4 de 5: En camino')
    expect(shipped.querySelector('[data-sf-order-shipment]')!.textContent).toBe('Estafeta · En camino')
    expect(shipped.querySelector('[data-sf-order-total]')!.textContent).toContain('$1,299.00')
    expect(shipped.querySelector('[data-sf-order-meta]')!.textContent).toContain('2 artículos')
    expect(shipped.querySelector('[data-sf-action=track]')!.getAttribute('href')).toBe('https://rastreo.example.com/estafeta/8012345678')
  })

  it('does not show a sandbox shipment as the order shipment', async () => {
    const { list } = await demo()
    const { container } = render(<OrderList orders={list.nodes} orderHref={href} />)
    const sandbox = container.querySelector('[data-sf-order-id=ord_seed_sandbox]')!
    expect(sandbox.querySelector('[data-sf-order-shipment]')?.textContent ?? '').not.toContain('Estafeta')
    expect(sandbox.querySelector('[data-sf-action=track]')).toBeNull()
  })

  it('has a loading state with fixed skeletons and a status for screen readers', () => {
    const { container } = render(<OrderList status="loading" orderHref={href} />)
    expect(container.querySelector('[role=status]')!.textContent).toBe('Cargando tus pedidos')
    expect(container.querySelector('[aria-busy=true]')).toBeTruthy()
    expect(container.querySelectorAll('[data-sf-skeleton]')).toHaveLength(3)
  })

  it('has a recoverable error state', () => {
    const onRetry = vi.fn()
    const { container } = render(<OrderList status="error" onRetry={onRetry} orderHref={href} />)
    expect(container.querySelector('[role=alert]')!.textContent).toContain('Tus compras están a salvo')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('has a useful empty state with the guest hint and the store call to action', () => {
    const { container } = render(<OrderList orders={[]} orderHref={href} emptyAction={<a href="/catalogo">Ver catálogo</a>} />)
    expect(container.querySelector('[data-sf-orders-empty]')!.textContent).toContain('Aún no tienes pedidos')
    expect(container.querySelector('[data-sf-orders-guest-hint]')!.textContent).toContain('Verifica tu correo')
    expect(screen.getByRole('link', { name: 'Ver catálogo' })).toBeTruthy()
    cleanup()
    expect(render(<OrderList orders={[]} guestHint={false} orderHref={href} />).container.querySelector('[data-sf-orders-guest-hint]')).toBeNull()
  })

  it('keeps the orders on screen when a later page fails, and loads more', () => {
    const onLoadMore = vi.fn()
    const order: Order = { id: 'o1', number: '1', status: 'paid', created_at: '2026-08-01T10:00:00Z', total: { amount: '1.00', currency_code: 'MXN' }, lines: [] }
    const { container } = render(<OrderList orders={[order]} status="error" onRetry={() => {}} hasMore onLoadMore={onLoadMore} orderHref={href} />)
    expect(container.querySelectorAll('[data-sf-order]')).toHaveLength(1)
    expect(container.querySelector('[role=alert]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver más pedidos' }))
    expect(onLoadMore).toHaveBeenCalled()
  })

  it('survives orders with unknown stage, status and garbage', () => {
    const odd = { id: 'x', number: '9', status: 'quantum', created_at: 'nope', total: { amount: '1.00', currency_code: 'MXN' }, lines: null, progress: { stage: 'warp', steps: [{ key: 'warp', state: 'zzz' }] }, next_action: { kind: 'teleport' } } as unknown as Order
    const { container } = render(<OrderList orders={[odd, null as never, 5 as never]} orderHref={href} />)
    expect(container.querySelectorAll('[data-sf-order]')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/quantum|warp|zzz|teleport/)
  })

  it('has no accessibility violations in any state, es and en', async () => {
    const { list } = await demo()
    const views = [
      <OrderList key="a" orders={list.nodes} orderHref={href} />,
      <OrderList key="b" orders={list.nodes} orderHref={href} locale="en" hasMore onLoadMore={() => {}} />,
      <OrderList key="c" status="loading" orderHref={href} />,
      <OrderList key="d" status="error" onRetry={() => {}} orderHref={href} />,
      <OrderList key="e" orders={[]} orderHref={href} />,
    ]
    for (const ui of views) {
      const r = render(<main>{ui}</main>)
      expect((await axe.run(r.container, AXE)).violations).toEqual([])
      r.unmount()
    }
  })
})

describe('hooks', () => {
  it('useCustomerOrders loads, pages and reloads; initial data skips the first fetch', async () => {
    const { client } = await demo()
    const spy = vi.spyOn(client.customer, 'orders')
    const { result } = renderHook(() => useCustomerOrders({ client, first: 2 }))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.nodes).toHaveLength(2)
    expect(result.current.hasMore).toBe(true)
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.nodes).toHaveLength(4))
    expect(new Set(result.current.nodes.map((o) => o.id)).size).toBe(4)
    spy.mockClear()
    const first = await client.customer.orders({ first: 2 })
    spy.mockClear()
    const seeded = renderHook(() => useCustomerOrders({ client, first: 2, initial: first }))
    expect(seeded.result.current.status).toBe('ready')
    expect(spy).not.toHaveBeenCalled()
  })

  it('useCustomerOrders turns a failure into a status, keeps the list on a retry, and recovers', async () => {
    const { client } = await demo()
    const orders = vi.spyOn(client.customer, 'orders').mockRejectedValueOnce(new StorefrontError({ status: 503, code: 'server_error', message: 'x' }))
    const { result } = renderHook(() => useCustomerOrders({ client }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBeInstanceOf(StorefrontError)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(orders).toHaveBeenCalledTimes(2)
  })

  it('usePendingPayments is independent of the orders', async () => {
    const { client } = await demo()
    const { result } = renderHook(() => usePendingPayments({ client }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.nodes.map((p) => p.status)).toEqual(['pending_payment', 'expired'])
  })

  it('useCustomerOrder: ready, not_found (also someone else\'s), error and silent reload', async () => {
    const { client } = await demo()
    const ok = renderHook(() => useCustomerOrder('ord_seed_shipped', { client }))
    expect(ok.result.current.status).toBe('loading')
    await waitFor(() => expect(ok.result.current.status).toBe('ready'))
    expect(ok.result.current.order!.shipments).toHaveLength(1)
    const missing = renderHook(() => useCustomerOrder('ord_nope', { client }))
    await waitFor(() => expect(missing.result.current.status).toBe('not_found'))
    const spy = vi.spyOn(client.customer, 'order').mockRejectedValueOnce(new Error('boom'))
    const bad = renderHook(() => useCustomerOrder('ord_seed_shipped', { client }))
    await waitFor(() => expect(bad.result.current.status).toBe('error'))
    act(() => bad.result.current.reload())
    await waitFor(() => expect(bad.result.current.status).toBe('ready'))
    // a failed silent reload keeps the order on screen
    spy.mockRejectedValueOnce(new Error('again'))
    act(() => bad.result.current.reload())
    await waitFor(() => expect(bad.result.current.error).toBeTruthy())
    expect(bad.result.current.status).toBe('ready')
    expect(bad.result.current.order).toBeTruthy()
  })

  it('useCustomerOrder with initial data fetches nothing; null initial is not_found', async () => {
    const { client, detail } = await demo()
    const spy = vi.spyOn(client.customer, 'order')
    const order = await detail('ord_seed_shipped')
    spy.mockClear()
    expect(renderHook(() => useCustomerOrder('ord_seed_shipped', { client, initial: order })).result.current.status).toBe('ready')
    expect(renderHook(() => useCustomerOrder('x', { client, initial: null })).result.current.status).toBe('not_found')
    expect(spy).not.toHaveBeenCalled()
  })

  it('useCustomerOrder polls silently while asked and stops when done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { client, detail } = await demo()
      const order = await detail('ord_seed_shipped')
      let pending = true
      const spy = vi.spyOn(client.customer, 'order').mockImplementation(async () => ({ ...order }))
      const { result } = renderHook(() => useCustomerOrder('ord_seed_shipped', { client, initial: order, poll: { while: () => pending, everyMs: 1000, forMs: 5000 } }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100)
      })
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(result.current.status).toBe('ready')
      pending = false
      spy.mockClear()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      const afterStop = spy.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(spy.mock.calls.length).toBe(afterStop)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the provider client when none is passed, and does nothing without one', () => {
    expect(renderHook(() => useCustomerOrders()).result.current.status).toBe('loading')
  })
})
