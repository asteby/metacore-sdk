import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ShopBranch } from '@asteby/storefront'
import { useOptionalStorefront } from './context.js'

/** Query param that carries the chosen branch (also the default `name` of `<LocationPicker>`). */
export const SELECTED_LOCATION_PARAM = 'sucursal'
/** localStorage key of "Mi sucursal". Never a cookie: the choice is per browser and is not sent to the server. */
export const SELECTED_LOCATION_STORAGE_KEY = 'sf_sucursal'

const CHANGE_EVENT = 'storefront:selected-location'

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // blocked storage throws on access
  }
}

/**
 * The saved branch id: `?sucursal=` wins over localStorage. Pure helper for loaders and tests; on the server
 * pass the request's search string (`new URL(request.url).search`) and no storage.
 */
export function readSelectedLocationId(
  { search = typeof location === 'undefined' ? '' : location.search, store = storage(), param = SELECTED_LOCATION_PARAM, storageKey = SELECTED_LOCATION_STORAGE_KEY }:
    { search?: string; store?: Pick<Storage, 'getItem'> | null; param?: string; storageKey?: string } = {},
): string | null {
  const fromUrl = new URLSearchParams(search).get(param)
  if (fromUrl) return fromUrl
  try {
    return store?.getItem(storageKey) || null
  } catch {
    return null
  }
}

export type UseSelectedLocationOptions = {
  /** Branches to validate against. Defaults to `shop.branches` from `<StorefrontProvider>`. */
  locations?: readonly ShopBranch[]
  /** Id already known on the server (from `?sucursal=`), so SSR and hydration render the same. */
  initialId?: string | null
  param?: string
  storageKey?: string
  /** Mirror the choice in the address bar with `history.replaceState` (default true). */
  syncUrl?: boolean
}

export type UseSelectedLocationResult<L extends ShopBranch = ShopBranch> = {
  id: string | null
  location: L | null
  /** `false` until the saved choice has been read on the client. */
  ready: boolean
  select: (id: string) => void
  clear: () => void
}

const EMPTY: readonly ShopBranch[] = []

/**
 * "Mi sucursal": the chosen branch lives in the URL (`?sucursal=<id>`, shareable) and in localStorage. It is
 * never written to a cookie, so it does not travel with every request. An id that is not among `locations`
 * is ignored and forgotten; with zero branches nothing is ever selected.
 */
export function useSelectedLocation<L extends ShopBranch = ShopBranch>(options: UseSelectedLocationOptions & { locations?: readonly L[] } = {}): UseSelectedLocationResult<L> {
  const { initialId = null, param = SELECTED_LOCATION_PARAM, storageKey = SELECTED_LOCATION_STORAGE_KEY, syncUrl = true } = options
  const sf = useOptionalStorefront()
  const locations = (options.locations ?? sf?.shop?.branches ?? EMPTY) as readonly L[]
  const [raw, setRaw] = useState<string | null>(initialId)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const read = () => setRaw(readSelectedLocationId({ param, storageKey }))
    read()
    setReady(true)
    window.addEventListener(CHANGE_EVENT, read)
    window.addEventListener('storage', read)
    window.addEventListener('popstate', read)
    return () => {
      window.removeEventListener(CHANGE_EVENT, read)
      window.removeEventListener('storage', read)
      window.removeEventListener('popstate', read)
    }
  }, [param, storageKey])

  const location = useMemo(() => (raw ? locations.find((l) => l.id === raw) ?? null : null), [raw, locations])
  const id = location?.id ?? null

  // A valid choice that came from a shared link is remembered; a stale id (branch removed or hidden) is forgotten.
  useEffect(() => {
    if (!ready || !raw || !locations.length) return
    try {
      if (location) storage()?.setItem(storageKey, raw)
      else storage()?.removeItem(storageKey)
    } catch { /* storage blocked */ }
  }, [ready, raw, locations, location, storageKey])

  const write = useCallback(
    (next: string | null) => {
      try {
        if (next) storage()?.setItem(storageKey, next)
        else storage()?.removeItem(storageKey)
      } catch {
        // Storage full or blocked: the URL (if synced) and React state still carry the choice.
      }
      if (syncUrl && typeof history !== 'undefined') {
        const url = new URL(window.location.href)
        if (next) url.searchParams.set(param, next)
        else url.searchParams.delete(param)
        history.replaceState(history.state, '', url)
      }
      setRaw(next)
      window.dispatchEvent(new Event(CHANGE_EVENT))
    },
    [param, storageKey, syncUrl],
  )

  const select = useCallback((next: string) => write(next), [write])
  const clear = useCallback(() => write(null), [write])
  return { id, location, ready, select, clear }
}
