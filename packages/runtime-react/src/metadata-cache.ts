// Metadata cache — a zustand store that memoizes table/modal metadata
// responses across dynamic-table mounts. Generalized from a host-app
// metadata-cache store so the runtime-react package no longer depends on
// a host-specific alias.
//
// The prefetchAll() method needs an `api` client (axios-like); we keep that
// as an injectable parameter so the store stays host-agnostic. If a caller
// never invokes prefetchAll, the `api` dep is not required.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TableMetadata } from './types'

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

interface MetadataCacheState {
    cache: Record<string, TableMetadata>
    modalCache: Record<string, TableMetadata>
    metadataVersion: string
    prefetched: boolean
    getMetadata: (key: string) => TableMetadata | undefined
    getModalMetadata: (key: string) => TableMetadata | undefined
    setMetadata: (key: string, metadata: TableMetadata) => void
    setModalMetadata: (key: string, metadata: TableMetadata) => void
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

            getMetadata: (key: string) => get().cache[key],
            getModalMetadata: (key: string) => get().modalCache[key],

            setMetadata: (key: string, metadata: TableMetadata) => {
                set((state) => ({
                    cache: { ...state.cache, [key]: metadata },
                }))
            },

            setModalMetadata: (key: string, metadata: TableMetadata) => {
                set((state) => ({
                    modalCache: { ...state.modalCache, [key]: metadata },
                }))
            },

            hasMetadata: (key: string) => key in get().cache,
            hasModalMetadata: (key: string) => key in get().modalCache,

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
                })
            },

            prefetchAll: async (api: MetadataApiClient) => {
                if (get().prefetched) return
                try {
                    const res = await api.get('/metadata/all')
                    const { tables, modals, version } = res.data.data

                    const serverVersion = version || ''
                    const localVersion = get().metadataVersion
                    const versionChanged = serverVersion !== localVersion && localVersion !== ''

                    const newCache: Record<string, TableMetadata> = versionChanged ? {} : { ...get().cache }
                    const newModalCache: Record<string, TableMetadata> = versionChanged ? {} : { ...get().modalCache }

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

                    set({
                        cache: newCache,
                        modalCache: newModalCache,
                        metadataVersion: serverVersion,
                        prefetched: true,
                    })
                } catch {
                    // Offline or error — keep using cached data.
                    set({ prefetched: true })
                }
            },
        }),
        {
            name: 'metacore-metadata-cache',
            version: 3,
            partialize: (state) => ({
                cache: state.cache,
                modalCache: state.modalCache,
                metadataVersion: state.metadataVersion,
            }),
        }
    )
)
