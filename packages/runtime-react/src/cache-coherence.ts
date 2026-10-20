// Client side of the backend's cache coherence (metacore-kernel
// `cachecoherence`): the server keeps one epoch that moves whenever something
// the UI is derived from changes (addon installed / upgraded / enabled /
// disabled / uninstalled, server restarted) and tells the browser through
// `X-Cache-Epoch` on every response and a `CACHE_EPOCH_CHANGED` WebSocket frame.
//
// `@asteby/metacore-sdk` owns the comparison (`observeCacheEpoch`,
// `onCacheEpochChange`, `wireCacheEpochPush`). This package talks to it through
// the window-event protocol it documents, so neither needs to import the other:
//
//   "metacore:cache-epoch-observed"  { detail: { epoch } }  -> report a token
//   "metacore:cache-epoch-changed"   { detail: { epoch, previous, source } }
//
// What runtime-react adds is what to DROP when the epoch moves: the metadata
// cache, the read batch (rows, metadata, i18n), the option lists, and the
// react-query cache.

import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { useMetadataCache } from './metadata-cache'
import { invalidateOptionsCache } from './use-options-resolver'
import { invalidateQueryBatchAll } from './query-batch'

export const CACHE_EPOCH_HEADER = 'x-cache-epoch'
export const CACHE_EPOCH_OBSERVED_EVENT = 'metacore:cache-epoch-observed'
export const CACHE_EPOCH_CHANGED_EVENT = 'metacore:cache-epoch-changed'

/** Report the epoch token of a response (the SDK core compares it). */
export function reportCacheEpoch(token: unknown): void {
    if (typeof token !== 'string' || !token.trim()) return
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
    try {
        window.dispatchEvent(new CustomEvent(CACHE_EPOCH_OBSERVED_EVENT, { detail: { epoch: token } }))
    } catch {
        /* non-DOM environment */
    }
}

/** Reads the token out of an axios headers bag (plain object or AxiosHeaders). */
export function epochFromAxiosHeaders(headers: unknown): string | undefined {
    if (!headers || typeof headers !== 'object') return undefined
    const h = headers as { get?: (k: string) => unknown } & Record<string, unknown>
    if (typeof h.get === 'function') {
        const v = h.get(CACHE_EPOCH_HEADER)
        if (typeof v === 'string') return v
    }
    const v = h[CACHE_EPOCH_HEADER] ?? h['X-Cache-Epoch']
    return typeof v === 'string' ? v : undefined
}

export interface CacheEpochChange {
    epoch: string
    previous: string | null
    source: 'header' | 'push' | 'event'
}

/** Subscribe to "the epoch moved". Returns the unsubscribe fn. */
export function onCacheEpochChanged(listener: (change: CacheEpochChange) => void): () => void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
    const handler = (e: Event) => listener((e as CustomEvent<CacheEpochChange>).detail)
    window.addEventListener(CACHE_EPOCH_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CACHE_EPOCH_CHANGED_EVENT, handler)
}

/**
 * Drops every cache this package derives from installed addons: table/modal
 * metadata, the read batch (rows, metadata, i18n) and the option lists. Mounted
 * components refetch on their next render/mount.
 */
export function dropAddonDerivedCaches(): void {
    useMetadataCache.getState().clearAll()
    invalidateQueryBatchAll()
    invalidateOptionsCache()
}

/**
 * Query keys that belong to the shell rather than to one addon: the installed
 * list, manifests, navigation, permissions, capabilities, metadata, i18n. An
 * addon change can alter any of them.
 */
export const SHELL_QUERY_ROOTS: readonly string[] = [
    'marketplace',
    'metacore',
    'manifests',
    'navigation',
    'sidebar',
    'permissions',
    'capabilities',
    'metadata',
    'i18n',
    'installed-addons',
    'addons',
]

function keyStrings(key: readonly unknown[]): string[] {
    const out: string[] = []
    const walk = (v: unknown, depth: number) => {
        if (depth > 4 || v == null) return
        if (typeof v === 'string') out.push(v)
        else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1))
        else if (typeof v === 'object') Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1))
    }
    walk(key, 0)
    return out
}

/** True when a react-query key refers to `addonKey` (exact or `<key>.`, `<key>:`, `<key>/` prefixed). */
export function queryKeyBelongsToAddon(queryKey: readonly unknown[], addonKey: string): boolean {
    if (!addonKey) return false
    return keyStrings(queryKey).some(
        (s) =>
            s === addonKey ||
            s.startsWith(`${addonKey}.`) ||
            s.startsWith(`${addonKey}:`) ||
            s.startsWith(`${addonKey}/`) ||
            s.includes(`/${addonKey}/`) ||
            s.endsWith(`/${addonKey}`),
    )
}

/**
 * Invalidate every query that depends on an addon: the ones whose key mentions
 * it, plus the shell roots (installed list, manifests, navigation, permissions,
 * metadata...). Call after install / upgrade / enable / disable / uninstall.
 * Resolves when the refetches of the active queries settle.
 */
export function invalidateAddonQueries(
    queryClient: Pick<QueryClient, 'invalidateQueries'>,
    addonKey: string,
    options: { extraRoots?: readonly string[] } = {},
): Promise<void> {
    const roots = new Set([...SHELL_QUERY_ROOTS, ...(options.extraRoots ?? [])])
    return queryClient.invalidateQueries({
        predicate: (query) => {
            const key = query.queryKey as readonly unknown[]
            if (queryKeyBelongsToAddon(key, addonKey)) return true
            const root = key[0]
            return typeof root === 'string' && roots.has(root)
        },
    })
}

export interface UseCacheEpochSyncOptions {
    /** When given, the react-query cache is invalidated too. */
    queryClient?: Pick<QueryClient, 'invalidateQueries'>
    /** Extra work on a change (re-prefetch metadata, reload manifests, ...). */
    onChange?: (change: CacheEpochChange) => void
}

/**
 * Mount once high in the tree. When the server's cache epoch moves, every
 * runtime cache derived from installed addons is dropped and react-query is
 * invalidated, so the open tab stops showing the previous world.
 *
 *   useCacheEpochSync({ queryClient })
 *   useCacheEpochPush(ws)          // from @asteby/metacore-sdk/react, optional
 */
export function useCacheEpochSync({ queryClient, onChange }: UseCacheEpochSyncOptions = {}): void {
    useEffect(
        () =>
            onCacheEpochChanged((change) => {
                dropAddonDerivedCaches()
                void queryClient?.invalidateQueries()
                onChange?.(change)
            }),
        [queryClient, onChange],
    )
}

// ---------------------------------------------------------------------------
// Stale server state (mirrors @asteby/metacore-sdk `isStaleStateError`)
// ---------------------------------------------------------------------------

const STALE_PATTERNS = [
    /cached plan must not change result type/i,
    /SQLSTATE\s*0A000/i,
    /prepared statement\s+"?[^"\s]*"?\s+does not exist/i,
    /SQLSTATE\s*26000/i,
    /stale[_ -]?(?:plan|state|epoch)/i,
]

function collectText(err: unknown, out: string[], depth = 0): void {
    if (err == null || depth > 4) return
    if (typeof err === 'string') {
        out.push(err)
        return
    }
    if (typeof err !== 'object') return
    const o = err as Record<string, unknown>
    for (const k of ['message', 'error', 'code', 'detail', 'details']) {
        const v = o[k]
        if (typeof v === 'string') out.push(v)
        else if (v && typeof v === 'object') collectText(v, out, depth + 1)
    }
    if (o.response) collectText(o.response, out, depth + 1)
    if (o.data) collectText(o.data, out, depth + 1)
}

/**
 * True when an error says the SERVER's cached state was out of date (a prepared
 * plan outdated by a migration, SQLSTATE 0A000 / 26000). Those failures happen
 * before the statement ran, and the server has already dropped the stale state,
 * so one retry is safe and enough.
 */
export function isStaleStateError(err: unknown): boolean {
    const texts: string[] = []
    collectText(err, texts)
    return texts.some((t) => STALE_PATTERNS.some((re) => re.test(t)))
}

/** Marker on a request config that already had its one stale-state retry. */
export const STALE_RETRIED_FLAG = '__metacoreStaleRetried'

/** Pause before the retry, ms. */
export const STALE_RETRY_DELAY_MS = 200
