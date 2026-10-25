// Metadata cache — a zustand store that memoizes table/modal metadata
// responses across dynamic-table mounts. Generalized from a host-app
// metadata-cache store so the runtime-react package no longer depends on
// a host-specific alias.
//
// Contract (stale-while-revalidate):
//   - Cache entries are a FIRST PAINT hint only.
//   - Every consumer (DynamicTable, DynamicCRUDPage, ModelActionToolbar hosts)
//     MUST still GET /metadata/table/:model and apply the live payload —
//     including `actions[]`. Skipping the live fetch on a cache hit is how
//     cross-addon toolbar actions disappear after an addon upgrade while
//     localStorage still holds the pre-upgrade catalog.
//   - Entries are keyed by the `org:user:lang` scope (see cache-scope.ts):
//     metadata carries the user's permissions, so a different account,
//     organization or language never sees them. Unknown scope = no cache.
//     Hosts call `clearMetadataCache()` on logout.
//   - `prefetchAll` replaces the catalog from `/metadata/all` and advances
//     `metadataVersion`; a version change wipes the prior cache.
//
// The prefetchAll() method needs an `api` client (axios-like); we keep that
// as an injectable parameter so the store stays host-agnostic. If a caller
// never invokes prefetchAll, the `api` dep is not required.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TableMetadata } from './types'
import { cacheScope, onCacheScopeChange, peekCacheScope } from './cache-scope'

export interface MetadataApiClient {
    get: (url: string, config?: any) => Promise<{ data: any }>
}

/**
 * Predicate matching a cache key against an addon. The default
 * implementation (see {@link defaultAddonKeyMatcher}) treats `addonKey`
 * itself plus any key beginning with `${addonKey}.`, `${addonKey}:` or
 * `${addonKey}/` as belonging to the addon. Hosts that namespace their
 * `model` strings differently can pass a custom matcher to
 * {@link MetadataCacheState.invalidateAddon}.
 */
export type AddonKeyMatcher = (cacheKey: string, addonKey: string) => boolean

/**
 * Default matcher used by {@link MetadataCacheState.invalidateAddon}.
 * Mirrors the convention used by the kernel installer when it scopes
 * model metadata under an addon's key.
 */
export function defaultAddonKeyMatcher(cacheKey: string, addonKey: string): boolean {
    if (!addonKey) return false
    if (cacheKey === addonKey) return true
    return (
        cacheKey.startsWith(`${addonKey}.`) ||
        cacheKey.startsWith(`${addonKey}:`) ||
        cacheKey.startsWith(`${addonKey}/`)
    )
}

export interface SetMetadataOptions {
    /** Scope captured when the request was made (null = it was unknown: discard). */
    scope?: string | null
}

/** Scope to write under, or null when the answer must be dropped. */
function writeScope(opts?: SetMetadataOptions): string | null {
    const now = cacheScope()
    if (!now) return null
    if (opts && opts.scope !== undefined && opts.scope !== now) return null
    return now
}

interface MetadataCacheState {
    cache: Record<string, TableMetadata>
    modalCache: Record<string, TableMetadata>
    metadataVersion: string
    prefetched: boolean
    /** `org:user:lang` the entries above were read for ('' = none). */
    scope: string
    getMetadata: (key: string) => TableMetadata | undefined
    getModalMetadata: (key: string) => TableMetadata | undefined
    /**
     * `opts.scope` is the `cacheScope()` captured when the request was ASKED.
     * If the identity moved while it travelled, the answer is dropped instead
     * of being stored under the new account. Without it the scope is read at
     * write time (only safe for synchronous writes).
     */
    setMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => void
    setModalMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => void
    hasMetadata: (key: string) => boolean
    hasModalMetadata: (key: string) => boolean
    prefetchAll: (api: MetadataApiClient) => Promise<void>
    /**
     * Remove cached entries belonging to a specific addon. Used by the
     * hot-swap subscriber when the kernel announces a manifest change.
     *
     * Returns the number of entries removed across both caches, which is
     * useful for tests and observability — `0` means the cache had nothing
     * to flush (the addon either hadn't been hit yet or uses a key
     * convention the default matcher doesn't recognise; pass a custom
     * `matcher` if your host namespaces differently).
     *
     * Also resets `prefetched` to `false` so the next mount re-runs
     * `prefetchAll()` and the `metadataVersion` is allowed to advance to
     * the kernel's freshly-bumped hash.
     */
    invalidateAddon: (addonKey: string, matcher?: AddonKeyMatcher) => number
    /**
     * Remove every cached entry. Heavier hammer for hosts that prefer a
     * blanket flush on hot-swap rather than per-addon scoping.
     */
    clearAll: () => void
}

export const useMetadataCache = create<MetadataCacheState>()(
    persist(
        (set, get) => ({
            cache: {},
            modalCache: {},
            metadataVersion: '',
            prefetched: false,
            scope: '',

            getMetadata: (key: string) => (inScope(get()) ? get().cache[key] : undefined),
            getModalMetadata: (key: string) => (inScope(get()) ? get().modalCache[key] : undefined),

            setMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => {
                const scope = writeScope(opts)
                if (!scope) return
                set((state) => ({
                    ...(state.scope === scope ? {} : emptyFor(scope)),
                    cache: { ...(state.scope === scope ? state.cache : {}), [key]: metadata },
                }))
            },

            setModalMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => {
                const scope = writeScope(opts)
                if (!scope) return
                set((state) => ({
                    ...(state.scope === scope ? {} : emptyFor(scope)),
                    modalCache: { ...(state.scope === scope ? state.modalCache : {}), [key]: metadata },
                }))
            },

            hasMetadata: (key: string) => inScope(get()) && key in get().cache,
            hasModalMetadata: (key: string) => inScope(get()) && key in get().modalCache,

            invalidateAddon: (addonKey: string, matcher = defaultAddonKeyMatcher) => {
                if (!addonKey) return 0
                let removed = 0
                const state = get()
                const nextCache: Record<string, TableMetadata> = {}
                for (const [key, value] of Object.entries(state.cache)) {
                    if (matcher(key, addonKey)) {
                        removed += 1
                        continue
                    }
                    nextCache[key] = value
                }
                const nextModalCache: Record<string, TableMetadata> = {}
                for (const [key, value] of Object.entries(state.modalCache)) {
                    if (matcher(key, addonKey)) {
                        removed += 1
                        continue
                    }
                    nextModalCache[key] = value
                }
                if (removed === 0) return 0
                set({
                    cache: nextCache,
                    modalCache: nextModalCache,
                    // Allow prefetchAll() to re-run so we pick up the new
                    // metadataVersion the kernel emits alongside the
                    // bumped manifest.
                    prefetched: false,
                })
                return removed
            },

            clearAll: () => {
                set({
                    cache: {},
                    modalCache: {},
                    metadataVersion: '',
                    prefetched: false,
                    scope: '',
                })
            },

            prefetchAll: async (api: MetadataApiClient) => {
                const scope = cacheScope()
                // Unknown identity: do not fetch into a cache nobody may read.
                if (!scope) return
                if (get().prefetched && get().scope === scope) return
                try {
                    const res = await api.get('/metadata/all')
                    const { tables, modals, version } = res.data.data

                    const serverVersion = version || ''
                    const localVersion = get().scope === scope ? get().metadataVersion : ''

                    // Always rebuild from the server catalog. Merging into a
                    // persisted cache left hosts with pre-upgrade actions /
                    // columns after an addon HotRegister while the tab (or
                    // localStorage) stayed open.
                    const newCache: Record<string, TableMetadata> = {}
                    const newModalCache: Record<string, TableMetadata> = {}

                    if (tables) {
                        for (const [key, meta] of Object.entries(tables)) {
                            newCache[key] = meta as TableMetadata
                        }
                    }
                    if (modals) {
                        for (const [key, meta] of Object.entries(modals)) {
                            newModalCache[key] = meta as TableMetadata
                        }
                    }

                    // The identity moved while the request was in flight: this
                    // answer belongs to the previous scope, drop it.
                    if (peekCacheScope() !== scope) return
                    set({
                        cache: newCache,
                        modalCache: newModalCache,
                        metadataVersion: serverVersion || localVersion || String(Date.now()),
                        prefetched: true,
                        scope,
                    })
                } catch {
                    // Offline or error — keep using cached data of this scope.
                    if (get().scope === scope) set({ prefetched: true })
                }
            },
        }),
        {
            name: 'metacore-metadata-cache',
            // Bump when display hints (e.g. image_stack) must wipe stale cache.
            // v5: always replace catalog on prefetchAll (no merge-with-stale).
            // v6: entries are keyed by the org:user:lang scope; anything
            // persisted before has no owner and is discarded.
            version: 6,
            migrate: () => ({
                cache: {},
                modalCache: {},
                metadataVersion: '',
                prefetched: false,
                scope: '',
            }),
            partialize: (state) => ({
                cache: state.cache,
                modalCache: state.modalCache,
                metadataVersion: state.metadataVersion,
                scope: state.scope,
            }),
        }
    )
)

function inScope(state: { scope: string }): boolean {
    const scope = peekCacheScope()
    return !!scope && state.scope === scope
}

function emptyFor(scope: string) {
    return { cache: {}, modalCache: {}, metadataVersion: '', prefetched: false, scope }
}

/**
 * Logout / account switch: drops the in-memory metadata AND the persisted copy
 * (`metacore-metadata-cache`). Hosts call it when the session ends; the cache
 * also clears itself when the org/user/lang scope changes.
 */
export function clearMetadataCache(): void {
    useMetadataCache.getState().clearAll()
    try {
        useMetadataCache.persist.clearStorage()
    } catch {
        /* storage unavailable */
    }
}

onCacheScopeChange(() => clearMetadataCache())
