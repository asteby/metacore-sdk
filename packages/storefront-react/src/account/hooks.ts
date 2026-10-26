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

// A stable id per client object (one per buyer session with `withCustomerToken`), to tell whose data a hook holds.
const ids = new WeakMap<object, string>()
let seq = 0
function clientKey(c: StorefrontClient | null): string {
  if (!c) return 'none'
  let k = ids.get(c)
  if (!k) ids.set(c, (k = `c${++seq}`))
  return k
}

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

type ConnectionState<T> = { status: UseConnectionResult<T>['status']; nodes: T[]; error: Error | null; cursor: string | null; hasMore: boolean; total: number | null; owner: string }

function useConnection<T>(fetchPage: (c: StorefrontClient, after: string | null, signal: AbortSignal) => Promise<Connection<T>>, client: StorefrontClient | null, initial: Connection<T> | null | undefined, key: string): UseConnectionResult<T> {
  // What the list belongs to: this client (a buyer's session) and this query. Data of another owner is never returned,
  // so the next buyer on a shared device never sees the previous one's orders, not even while his own load.
  const owner = `${clientKey(client)}|${key}`
  const empty = (status: ConnectionState<T>['status']): ConnectionState<T> => ({ status, nodes: [], error: null, cursor: null, hasMore: false, total: null, owner })
  const [state, setState] = useState<ConnectionState<T>>(() =>
    initial
      ? { status: 'ready', nodes: initial.nodes ?? [], error: null, cursor: initial.page_info?.end_cursor ?? null, hasMore: !!initial.page_info?.has_next_page, total: initial.total_count ?? null, owner }
      : empty('loading'),
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const alive = useRef<AbortController | null>(null)
  const more = useRef<AbortController | null>(null)
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage

  const first = useCallback(() => {
    alive.current?.abort()
    more.current?.abort()
    setLoadingMore(false)
    if (!client) {
      // No session (yet, or signed out): nothing is fetched and nothing of a previous session is kept.
      setState(empty('loading'))
      return
    }
    const ctl = new AbortController()
    alive.current = ctl
    setState((s) => (s.owner === owner && s.nodes.length ? { ...s, error: null } : empty('loading')))
    fetchRef.current(client, null, ctl.signal).then(
      (page) => !ctl.signal.aborted && setState({ status: 'ready', nodes: page.nodes ?? [], error: null, cursor: page.page_info?.end_cursor ?? null, hasMore: !!page.page_info?.has_next_page, total: page.total_count ?? null, owner }),
      (e: unknown) => !ctl.signal.aborted && setState((s) => (s.owner === owner ? { ...s, status: 'error', error: asError(e) } : { ...empty('error'), error: asError(e) })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, owner])

  useEffect(() => {
    if (!(initial && state.owner === owner)) first()
    return () => {
      alive.current?.abort()
      more.current?.abort()
    }
    // `owner` restarts the load when the session or what is asked for changes (page size, filter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, owner])

  const loadMore = useCallback(() => {
    if (!client || state.owner !== owner || !state.hasMore || loadingMore) return
    const ctl = new AbortController()
    more.current = ctl
    setLoadingMore(true)
    fetchRef.current(client, state.cursor, ctl.signal).then(
      (page) => {
        // A reload or another session since this page was asked: it belongs to a list that no longer exists.
        if (ctl.signal.aborted) return
        setLoadingMore(false)
        setState((s) => (s.owner !== owner ? s : { ...s, nodes: [...s.nodes, ...(page.nodes ?? [])], cursor: page.page_info?.end_cursor ?? null, hasMore: !!page.page_info?.has_next_page, total: page.total_count ?? s.total, error: null }))
      },
      (e: unknown) => {
        if (ctl.signal.aborted) return
        setLoadingMore(false)
        setState((s) => (s.owner !== owner ? s : { ...s, error: asError(e) }))
      },
    )
  }, [client, owner, state.owner, state.hasMore, state.cursor, loadingMore])

  const view = state.owner === owner ? state : empty('loading')
  return { status: view.status, nodes: view.nodes, error: view.error, hasMore: view.hasMore, loadingMore: state.owner === owner && loadingMore, totalCount: view.total, reload: first, loadMore }
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
  // Whose order this is: the session and the id. A change of either never shows the previous order meanwhile.
  const owner = `${clientKey(c)}|${id ?? ''}`
  const [state, setState] = useState<{ status: AccountStatus; order: Order | null; error: Error | null; owner: string }>(() => (given ? { status: initial ? 'ready' : 'not_found', order: initial, error: null, owner } : { status: 'loading', order: null, error: null, owner }))
  const [refreshing, setRefreshing] = useState(false)
  const ctlRef = useRef<AbortController | null>(null)
  const initialOwner = useRef(given ? owner : null)

  const load = useCallback(
    (silent: boolean) => {
      ctlRef.current?.abort()
      setRefreshing(false)
      if (!c || !id) {
        setState({ status: 'loading', order: null, error: null, owner })
        return
      }
      const ctl = new AbortController()
      ctlRef.current = ctl
      if (silent) setRefreshing(true)
      else setState((s) => (s.owner === owner && s.order ? { ...s, error: null } : { status: 'loading', order: null, error: null, owner }))
      c.customer.order(id, { signal: ctl.signal }).then(
        (o) => {
          if (ctl.signal.aborted) return
          setRefreshing(false)
          setState(o ? { status: 'ready', order: o, error: null, owner } : { status: 'not_found', order: null, error: null, owner })
        },
        (e: unknown) => {
          if (ctl.signal.aborted) return
          setRefreshing(false)
          // A failed silent read keeps the order on screen; only a first load turns into an error.
          setState((s) => (s.owner === owner && s.order ? { ...s, error: asError(e) } : { status: 'error', order: null, error: asError(e), owner }))
        },
      )
    },
    [c, id, owner],
  )

  useEffect(() => {
    if (initialOwner.current !== owner) load(false)
    initialOwner.current = null
    return () => ctlRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, owner])

  const mine = state.owner === owner
  const order = mine ? state.order : null
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

  const hasOrder = order !== null
  const reload = useCallback(() => load(hasOrder), [load, hasOrder])
  return { status: mine ? state.status : 'loading', order, error: mine ? state.error : null, refreshing: mine && refreshing, reload }
}
