import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'

export interface UseOptimisticMutationOptions<TData, TVariables, TCache> {
  /** Query whose cached value the mutation changes. */
  queryKey: QueryKey
  mutationFn: (variables: TVariables) => Promise<TData>
  /**
   * Cache value to show while the request is in flight. Runs synchronously on
   * `mutate`, so the UI repaints on the same frame as the click. Return
   * `undefined` to leave the cache untouched.
   */
  optimistic: (current: TCache | undefined, variables: TVariables) => TCache | undefined
  /**
   * Cache value once the server confirms. Write/apply endpoints that return
   * the resulting resource should map it here, so nothing is refetched.
   * Default: keep the optimistic value.
   */
  reconcile?: (data: TData, variables: TVariables, current: TCache | undefined) => TCache | undefined
  /**
   * Coalesce bursts (drag and drop, sliders): the cache updates on every
   * call, and only the last variables are sent once `debounceMs` pass
   * without a new call. Pending work is flushed on unmount.
   */
  debounceMs?: number
  /**
   * A call equal to the one already in flight is ignored (double clicks).
   * Default: structural equality via JSON.
   */
  isEqual?: (a: TVariables, b: TVariables) => boolean
  /** Other queries to refresh in the background after a confirmed write. */
  invalidate?: QueryKey[]
  onSuccess?: (data: TData, variables: TVariables) => void
  /** Runs after the cache was rolled back to the last confirmed value. */
  onError?: (error: unknown, variables: TVariables) => void
}

export interface UseOptimisticMutationResult<TVariables> {
  /** Apply optimistically and persist. Safe to call repeatedly. */
  mutate: (variables: TVariables) => void
  /** True from the first `mutate` until the last one settles. */
  isPending: boolean
  /** Variables of the latest unconfirmed call (e.g. which card is applying). */
  pendingVariables: TVariables | undefined
  error: unknown
}

type Envelope<TVariables> = { variables: TVariables; seq: number }

const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Optimistic write over a TanStack Query cache entry, with rollback.
 *
 * - The cache is patched before the request, so the screen answers at once.
 * - Writes to the same `queryKey` run one at a time, in call order (mutation
 *   `scope`), so the last click is the last write the server sees.
 * - Only the latest call decides what the cache shows: an older response
 *   never overwrites a newer optimistic value. If the latest call fails, the
 *   cache returns to the last value the server confirmed.
 */
export function useOptimisticMutation<TData, TVariables, TCache = TData>(
  options: UseOptimisticMutationOptions<TData, TVariables, TCache>,
): UseOptimisticMutationResult<TVariables> {
  const qc = useQueryClient()
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const seqRef = useRef(0)
  // Last value the server confirmed, captured before the first unconfirmed
  // optimistic write. Null while nothing is in flight.
  const confirmedRef = useRef<{ value: TCache | undefined } | null>(null)
  const inFlightRef = useRef<TVariables | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queuedRef = useRef<Envelope<TVariables> | null>(null)
  const [pendingVariables, setPendingVariables] = useState<TVariables | undefined>(undefined)
  const [error, setError] = useState<unknown>(null)

  const scopeId = `optimistic:${JSON.stringify(options.queryKey)}`

  const settleLatest = useCallback(() => {
    confirmedRef.current = null
    inFlightRef.current = undefined
    setPendingVariables(undefined)
  }, [])

  const mutation = useMutation<TData, unknown, Envelope<TVariables>>({
    scope: { id: scopeId },
    mutationFn: ({ variables }) => optionsRef.current.mutationFn(variables),
    onSuccess: (data, { variables, seq }) => {
      const opts = optionsRef.current
      const latest = seq === seqRef.current && queuedRef.current === null
      if (latest) {
        const current = qc.getQueryData<TCache>(opts.queryKey)
        const next = opts.reconcile ? opts.reconcile(data, variables, current) : current
        if (next !== undefined) qc.setQueryData<TCache>(opts.queryKey, next)
        settleLatest()
        setError(null)
        for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key })
      } else if (confirmedRef.current) {
        // A newer call owns the screen; only move the rollback point forward.
        const base = confirmedRef.current.value
        const next = opts.reconcile
          ? opts.reconcile(data, variables, base)
          : opts.optimistic(base, variables)
        confirmedRef.current = { value: next ?? base }
      }
      opts.onSuccess?.(data, variables)
    },
    onError: (err, { variables, seq }) => {
      const opts = optionsRef.current
      const latest = seq === seqRef.current && queuedRef.current === null
      if (latest) {
        const confirmed = confirmedRef.current
        if (confirmed && confirmed.value !== undefined) {
          qc.setQueryData<TCache>(opts.queryKey, confirmed.value)
        }
        settleLatest()
        // The server may have partially applied; resync in the background.
        void qc.invalidateQueries({ queryKey: opts.queryKey })
      }
      setError(err)
      opts.onError?.(err, variables)
    },
  })

  const mutateRef = useRef(mutation.mutate)
  useEffect(() => {
    mutateRef.current = mutation.mutate
  })

  const send = useCallback((envelope: Envelope<TVariables>) => {
    inFlightRef.current = envelope.variables
    mutateRef.current(envelope)
  }, [])

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const queued = queuedRef.current
    queuedRef.current = null
    if (queued) send(queued)
  }, [send])

  const mutate = useCallback(
    (variables: TVariables) => {
      const opts = optionsRef.current
      const isEqual = opts.isEqual ?? jsonEqual
      const latestPending = queuedRef.current?.variables ?? inFlightRef.current
      if (latestPending !== undefined && isEqual(latestPending, variables)) return

      const seq = ++seqRef.current
      if (!confirmedRef.current) {
        confirmedRef.current = { value: qc.getQueryData<TCache>(opts.queryKey) }
      }
      // A refetch landing mid-write would paint the old value back.
      void qc.cancelQueries({ queryKey: opts.queryKey })
      const next = opts.optimistic(qc.getQueryData<TCache>(opts.queryKey), variables)
      if (next !== undefined) qc.setQueryData<TCache>(opts.queryKey, next)
      setPendingVariables(variables)
      setError(null)

      const envelope = { variables, seq }
      if (opts.debounceMs && opts.debounceMs > 0) {
        queuedRef.current = envelope
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flush, opts.debounceMs)
        return
      }
      send(envelope)
    },
    [qc, flush, send],
  )

  // Never drop a debounced write because the editor closed.
  useEffect(() => flush, [flush])

  return {
    mutate,
    isPending: pendingVariables !== undefined,
    pendingVariables,
    error,
  }
}
