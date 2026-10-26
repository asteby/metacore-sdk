/**
 * Data hooks of the account screens. They talk to the client of the `StorefrontProvider` (or `client`), which must carry
 * the buyer's session (`withCustomerToken`); on a store that renders on the server, pass what the loader read as
 * `initial` and nothing is fetched until the buyer asks (`reload`, `loadMore`) or a poll tick fires.
 *
 * They never throw: a failure is `status: 'error'` with the `StorefrontError` in `error`, and `reload()` is the retry.
 * A 404 on one order is `status: 'not_found'` (also when it belongs to someone else: the server does not tell).
 */
import type { Connection, Order, PendingPayment, StorefrontClient } from '@asteby/storefront'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalStorefront } from '../context.js'

export type AccountStatus = 'loading' | 'ready' | 'error' | 'not_found'

function useClient(client?: StorefrontClient | null): StorefrontClient | null {
  const ctx = useOptionalStorefront()
  return client ?? ctx?.client ?? null
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error('Request failed'))

// ---------------------------------------------------------------------------
// Lists (orders, pending payments)
// ---------------------------------------------------------------------------

export type UseConnectionResult<T> = {
  status: Exclude<AccountStatus, 'not_found'>
  nodes: T[]
  error: Error | null
  hasMore: boolean
  loadingMore: boolean
  totalCount: number | null
  /** Fetches the first page again (the retry). Keeps showing the current list meanwhile. */
  reload: () => void
  /** Appends the next page. */
  loadMore: () => void
}

function useConnection<T>(fetchPage: (c: StorefrontClient, after: string | null, signal: AbortSignal) => Promise<Connection<T>>, client: StorefrontClient | null, initial: Connection<T> | null | undefined, key: string): UseConnectionResult<T> {
  const [state, setState] = useState<{ status: UseConnectionResult<T>['status']; nodes: T[]; error: Error | null; cursor: string | null; hasMore: boolean; total: number | null }>(() => ({
    status: initial ? 'ready' : 'loading',
    nodes: initial?.nodes ?? [],
    error: null,
    cursor: initial?.page_info?.end_cursor ?? null,
    hasMore: !!initial?.page_info?.has_next_page,
    total: initial?.total_count ?? null,
  }))
  const [loadingMore, setLoadingMore] = useState(false)
  const alive = useRef<AbortController | null>(null)
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage

  const first = useCallback(() => {
    if (!client) return
    alive.current?.abort()
    const ctl = new AbortController()
    alive.current = ctl
    setState((s) => (s.nodes.length ? { ...s, error: null } : { ...s, status: 'loading', error: null }))
    fetchRef.current(client, null, ctl.signal).then(
      (page) => !ctl.signal.aborted && setState({ status: 'ready', nodes: page.nodes ?? [], error: null, cursor: page.page_info?.end_cursor ?? null, hasMore: !!page.page_info?.has_next_page, total: page.total_count ?? null }),
      (e: unknown) => !ctl.signal.aborted && setState((s) => ({ ...s, status: 'error', error: asError(e) })),
    )
  }, [client])

  useEffect(() => {
    if (!initial) first()
    return () => alive.current?.abort()
    // `key` restarts the load when the caller changes what it asks for (page size, filter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, key])

  const loadMore = useCallback(() => {
    if (!client || !state.hasMore || loadingMore) return
    const ctl = new AbortController()
    setLoadingMore(true)
    fetchRef.current(client, state.cursor, ctl.signal).then(
      (page) => {
        setLoadingMore(false)
        setState((s) => ({ ...s, nodes: [...s.nodes, ...(page.nodes ?? [])], cursor: page.page_info?.end_cursor ?? null, hasMore: !!page.page_info?.has_next_page, total: page.total_count ?? s.total, error: null }))
      },
      (e: unknown) => {
        setLoadingMore(false)
        setState((s) => ({ ...s, error: asError(e) }))
      },
    )
  }, [client, state.hasMore, state.cursor, loadingMore])

  return { status: state.status, nodes: state.nodes, error: state.error, hasMore: state.hasMore, loadingMore, totalCount: state.total, reload: first, loadMore }
}

export type UseCustomerOrdersOptions = {
  client?: StorefrontClient | null
  /** Page size (default 20). */
  first?: number
  /** First page already read on the server: renders at once, nothing is fetched. */
  initial?: Connection<Order> | null
}

/** The buyer's orders (summaries), newest first, with `loadMore`. */
export function useCustomerOrders({ client, first = 20, initial }: UseCustomerOrdersOptions = {}): UseConnectionResult<Order> {
  return useConnection<Order>((c, after, signal) => c.customer.orders({ first, ...(after ? { after } : {}) }, { signal }), useClient(client), initial, `orders:${first}`)
}

export type UsePendingPaymentsOptions = UseCustomerOrdersOptions & { initial?: Connection<PendingPayment> | null }

/** Cash vouchers still waiting for payment. A failure of this section never blocks the orders: it is its own `status`. */
export function usePendingPayments({ client, first = 20, initial }: UsePendingPaymentsOptions = {}): UseConnectionResult<PendingPayment> {
  return useConnection<PendingPayment>((c, after, signal) => c.customer.pendingPayments({ first, ...(after ? { after } : {}) }, { signal }), useClient(client), initial, `pending:${first}`)
}

// ---------------------------------------------------------------------------
// One order
// ---------------------------------------------------------------------------

export type UseCustomerOrderOptions = {
  client?: StorefrontClient | null
  /** The order already read on the server (`null` = the server found none: `not_found`). */
  initial?: Order | null
  /**
   * Re-reads the order every `everyMs` (default 10 s) for at most `forMs` (default 60 s) while `while(order)` is true,
   * e.g. an invoice being generated: `{ while: (o) => ['queued','issuing'].includes(o.invoice?.stage ?? '') }`.
   * Polling is silent: the order stays on screen and `refreshing` flips.
   */
  poll?: { while: (order: Order) => boolean; everyMs?: number; forMs?: number }
}

export type UseCustomerOrderResult = {
  status: AccountStatus
  order: Order | null
  error: Error | null
  /** A silent re-read is in flight (retry or poll): keep showing `order`. */
  refreshing: boolean
  reload: () => void
}

/** One order with its detail (shipments, invoices, payments, refunds, `degraded`). */
export function useCustomerOrder(id: string | null | undefined, { client, initial, poll }: UseCustomerOrderOptions = {}): UseCustomerOrderResult {
  const c = useClient(client)
  const given = initial !== undefined
  const [state, setState] = useState<{ status: AccountStatus; order: Order | null; error: Error | null }>(() => (given ? { status: initial ? 'ready' : 'not_found', order: initial, error: null } : { status: 'loading', order: null, error: null }))
  const [refreshing, setRefreshing] = useState(false)
  const ctlRef = useRef<AbortController | null>(null)

  const load = useCallback(
    (silent: boolean) => {
      if (!c || !id) return
      ctlRef.current?.abort()
      const ctl = new AbortController()
      ctlRef.current = ctl
      if (silent) setRefreshing(true)
      else setState((s) => (s.order ? { ...s, error: null } : { status: 'loading', order: null, error: null }))
      c.customer.order(id, { signal: ctl.signal }).then(
        (o) => {
          if (ctl.signal.aborted) return
          setRefreshing(false)
          setState(o ? { status: 'ready', order: o, error: null } : { status: 'not_found', order: null, error: null })
        },
        (e: unknown) => {
          if (ctl.signal.aborted) return
          setRefreshing(false)
          // A failed silent read keeps the order on screen; only a first load turns into an error.
          setState((s) => (s.order ? { ...s, error: asError(e) } : { status: 'error', order: null, error: asError(e) }))
        },
      )
    },
    [c, id],
  )

  useEffect(() => {
    if (!given) load(false)
    return () => ctlRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, id])

  const order = state.order
  const keepPolling = !!poll && !!order && poll.while(order)
  const everyMs = poll?.everyMs ?? 10_000
  const forMs = poll?.forMs ?? 60_000
  useEffect(() => {
    if (!keepPolling) return
    const t0 = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - t0 >= forMs) clearInterval(timer)
      else load(true)
    }, everyMs)
    return () => clearInterval(timer)
  }, [keepPolling, everyMs, forMs, load])

  return { status: state.status, order, error: state.error, refreshing, reload: useCallback(() => load(state.order !== null), [load, state.order]) }
}
