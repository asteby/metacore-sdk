import {
  createPersistedSnapshot,
  usePersistedQuery,
} from '@asteby/metacore-runtime-react'
import { useMemo } from 'react'
import { myPermissionsQueryKey, type MyPermissions } from './permissions-api'

export interface UseMyPermissionsOptions {
  /** Loader, usually `api.fetchMyPermissions`. */
  fetch: () => Promise<MyPermissions>
  /** Signed-in user id; the query is disabled while empty. */
  userId: string | undefined | null
  /** Cache scope (org/user) for the persisted first-paint snapshot. */
  scope: string
  /** localStorage namespace of the snapshot. Default `metacore:permissions-me`. */
  snapshotKey?: string
  staleTime?: number
}

/**
 * The signed-in user's capability feed, seeded from a persisted per-scope
 * snapshot so gated UI does not reorder on reload. UI gating only - the server
 * still enforces every capability.
 */
export function useMyPermissions(opts: UseMyPermissionsOptions) {
  const { fetch, userId, scope, snapshotKey = 'metacore:permissions-me', staleTime = 60_000 } = opts
  const snapshot = useMemo(
    () => createPersistedSnapshot<MyPermissions>({ key: snapshotKey, version: 1 }),
    [snapshotKey],
  )
  return usePersistedQuery<MyPermissions>({
    queryKey: myPermissionsQueryKey(userId),
    queryFn: fetch,
    enabled: Boolean(userId),
    staleTime,
    persist: { snapshot, scope },
  })
}
