import { useEffect, useMemo } from 'react'
import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'

/**
 * A versioned, scoped copy of a value in localStorage. Shell data that decides
 * the first paint (navigation, the org's menu layout, installed presets,
 * permissions) is read from here synchronously, so a reload paints the last
 * known state instead of a default that reorders when the network answers.
 *
 * The entry lives under `<key>:v<version>:<scope>`. Bump `version` when the
 * stored shape changes; old entries are simply never read again. `scope` keeps
 * one org or user from seeing another's copy on a shared browser.
 */
export interface PersistedSnapshotOptions {
  key: string
  version: number
  /** Entries older than this are ignored (default: 30 days). */
  maxAgeMs?: number
}

export interface PersistedEntry<T> {
  data: T
  /** When the data was fetched (ms epoch). */
  ts: number
}

export interface PersistedSnapshot<T> {
  read(scope: string): PersistedEntry<T> | undefined
  write(scope: string, data: T, meta?: { ts?: number }): void
  clear(scope: string): void
}

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function createPersistedSnapshot<T>({
  key,
  version,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
}: PersistedSnapshotOptions): PersistedSnapshot<T> {
  const slot = (scope: string) => `${key}:v${version}:${scope}`
  return {
    read(scope) {
      const s = storage()
      if (!s) return undefined
      try {
        const raw = s.getItem(slot(scope))
        if (!raw) return undefined
        const parsed = JSON.parse(raw) as Partial<PersistedEntry<T>>
        if (typeof parsed?.ts !== 'number' || !('data' in parsed)) return undefined
        if (Date.now() - parsed.ts > maxAgeMs) return undefined
        return { data: parsed.data as T, ts: parsed.ts }
      } catch {
        return undefined
      }
    },
    write(scope, data, { ts = Date.now() } = {}) {
      try {
        storage()?.setItem(slot(scope), JSON.stringify({ data, ts }))
      } catch {
        // quota / private mode: the snapshot is an optimization, never fatal
      }
    },
    clear(scope) {
      try {
        storage()?.removeItem(slot(scope))
      } catch {
        /* ignore */
      }
    },
  }
}

export type UsePersistedQueryOptions<TQueryFnData, TData, TQueryKey extends QueryKey> = UseQueryOptions<
  TQueryFnData,
  Error,
  TData,
  TQueryKey
> & {
  persist: {
    snapshot: PersistedSnapshot<TQueryFnData>
    /**
     * Org/user the data belongs to. Without a scope nothing is read or
     * written (e.g. before sign-in).
     */
    scope: string | null | undefined
  }
}

/**
 * `useQuery` seeded from a {@link PersistedSnapshot}: the first render already
 * has the last fetched value (stale-while-revalidate), and every later value —
 * a refetch, or a `setQueryData` from a mutation — is written back. The seed is
 * stale from the start: every page load revalidates it once in the background,
 * so a change made elsewhere (a plantilla applied, an addon installed,
 * permissions edited) shows on the next load even inside `staleTime`.
 *
 * Persist the raw server payload and derive UI shapes with `select`; the
 * snapshot must be JSON.
 */
export function usePersistedQuery<
  TQueryFnData,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UsePersistedQueryOptions<TQueryFnData, TData, TQueryKey>,
): UseQueryResult<TData, Error> {
  const { persist, ...queryOptions } = options
  const { snapshot, scope } = persist
  const seed = useMemo(
    () => (scope ? snapshot.read(scope) : undefined),
    [snapshot, scope],
  )
  const query = useQuery<TQueryFnData, Error, TData, TQueryKey>({
    ...queryOptions,
    ...(seed && queryOptions.initialData === undefined
      ? { initialData: seed.data, initialDataUpdatedAt: 0 }
      : {}),
  } as UseQueryOptions<TQueryFnData, Error, TData, TQueryKey>)

  const queryClient = useQueryClient()
  const { dataUpdatedAt, status, isPlaceholderData } = query
  const queryKey = queryOptions.queryKey
  useEffect(() => {
    if (!scope || status !== 'success' || isPlaceholderData) return
    // Still the seed: nothing new to store.
    if (dataUpdatedAt === 0) return
    // `query.data` is the selected shape; persist the raw cache value.
    const raw = queryClient.getQueryData<TQueryFnData>(queryKey)
    if (raw === undefined) return
    snapshot.write(scope, raw, { ts: dataUpdatedAt })
    // queryKey is compared by react-query's hash, not identity: a new array
    // each render must not rewrite the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, scope, snapshot, seed, status, isPlaceholderData, dataUpdatedAt])

  return query
}

