import { useEffect, useMemo, useState } from 'react'
import type { ShopBranch, StorefrontClient } from '@asteby/storefront'
import { rankByDistance, type GeoPoint } from '@asteby/storefront/geo'
import { useOptionalStorefront } from './context.js'

export type NearbyLocation<L extends ShopBranch = ShopBranch> = L & { distance_km: number | null }

export type UseNearestLocationsOptions<L extends ShopBranch = ShopBranch> = {
  /** The buyer's point (from `useGeolocation().request()`). */
  origin?: GeoPoint | null
  /** Postal code typed by the buyer (5 digits). The server resolves it to coordinates, so this always asks the server. */
  postalCode?: string | null
  /** Branches to rank. Defaults to `shop.branches` from the provider. */
  locations?: readonly L[]
  /** Keep the closest N. */
  limit?: number
  /** Keep those within this many km. */
  radiusKm?: number
  /** Force the server (`locations.nearest`) for `origin` instead of ranking `locations` in the browser. */
  remote?: boolean
  /** Defaults to the provider's client. */
  client?: StorefrontClient
}

export type UseNearestLocationsResult<L extends ShopBranch = ShopBranch> = {
  locations: NearbyLocation<L>[]
  status: 'idle' | 'loading' | 'success' | 'error'
  error: Error | null
  /** `local`: ranked in the browser, the point never leaves it. `remote`: answered by the server. */
  source: 'local' | 'remote' | null
}

const EMPTY: readonly ShopBranch[] = []
const IDLE = { locations: [], status: 'idle', error: null, source: null } as const

/**
 * Branches ordered by distance. With an `origin` and branches at hand (explicit or `shop.branches`) the ranking
 * runs in the browser with haversine and the coordinates are sent nowhere. `postalCode` (or `remote`) asks the
 * server, which rounds and never stores the point. With zero branches, or neither origin nor postal code, the
 * result is empty and `idle`.
 */
export function useNearestLocations<L extends ShopBranch = ShopBranch>(options: UseNearestLocationsOptions<L> = {}): UseNearestLocationsResult<L> {
  const { origin = null, postalCode = null, limit, radiusKm, remote = false } = options
  const sf = useOptionalStorefront()
  const client = options.client ?? sf?.client ?? null
  const branches = (options.locations ?? sf?.shop?.branches ?? EMPTY) as readonly L[]
  const lat = origin?.lat
  const lng = origin?.lng
  const hasOrigin = lat !== undefined && lng !== undefined
  const cp = postalCode?.trim() || null

  const mode = useMemo<'local' | 'remote' | null>(() => {
    if (cp) return client ? 'remote' : null
    if (!hasOrigin) return null
    if (remote) return client ? 'remote' : null
    return branches.length ? 'local' : null
  }, [cp, hasOrigin, remote, client, branches.length])

  const local = useMemo<NearbyLocation<L>[]>(() => {
    if (mode !== 'local' || !hasOrigin) return []
    return rankByDistance(branches, { lat, lng }, { ...(radiusKm !== undefined ? { radiusKm } : {}), ...(limit !== undefined ? { limit } : {}) })
      .map(({ item, distanceKm }) => ({ ...item, distance_km: distanceKm }))
  }, [mode, branches, lat, lng, radiusKm, limit, hasOrigin])

  const [remoteState, setRemoteState] = useState<{ key: string; nodes: NearbyLocation<L>[] } | { key: string; error: Error } | null>(null)
  const key = mode === 'remote' ? (cp ? `cp:${cp}` : `ll:${lat},${lng}`) : ''

  useEffect(() => {
    if (mode !== 'remote' || !client) return
    const ctrl = new AbortController()
    const req = cp
      ? client.locations.list({ postal_code: cp }, { signal: ctrl.signal })
      : client.locations.nearest({ lat: lat!, lng: lng! }, { signal: ctrl.signal })
    req.then(
      (res) => !ctrl.signal.aborted && setRemoteState({ key, nodes: res.nodes as unknown as NearbyLocation<L>[] }),
      (err: unknown) => !ctrl.signal.aborted && setRemoteState({ key, error: err instanceof Error ? err : new Error(String(err)) }),
    )
    return () => ctrl.abort()
  }, [mode, client, key, cp, lat, lng])

  return useMemo(() => {
    if (mode === 'local') return { locations: local, status: 'success', error: null, source: 'local' } as const
    if (mode !== 'remote') return IDLE as unknown as UseNearestLocationsResult<L>
    if (!remoteState || remoteState.key !== key) return { locations: [], status: 'loading', error: null, source: 'remote' } as const
    if ('error' in remoteState) return { locations: [], status: 'error', error: remoteState.error, source: 'remote' } as const
    let nodes = remoteState.nodes
    if (radiusKm !== undefined) nodes = nodes.filter((n) => n.distance_km == null || n.distance_km <= radiusKm)
    if (limit !== undefined) nodes = nodes.slice(0, Math.max(0, limit))
    return { locations: nodes, status: 'success', error: null, source: 'remote' } as const
  }, [mode, local, remoteState, key, radiusKm, limit])
}
