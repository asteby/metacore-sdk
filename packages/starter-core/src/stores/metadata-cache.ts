import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TableMetadata } from '@/components/dynamic/types'
import { api } from '@/lib/api'
// Scope helpers come from runtime-react (already a peer/dev dependency of this
// package): one implementation of org:user:lang for every cache, so the two
// metadata stores can never disagree about who is asking.
import { cacheScope, onCacheScopeChange, peekCacheScope } from '@asteby/metacore-runtime-react'

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

function inScope(state: { scope: string }): boolean {
    const scope = peekCacheScope()
    return !!scope && state.scope === scope
}

function emptyFor(scope: string) {
    return { cache: {}, modalCache: {}, metadataVersion: '', prefetched: false, scope }
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
     * `opts.scope` is the `cacheScope()` captured when the request was ASKED;
     * if the identity moved meanwhile the answer is dropped. Without it the
     * scope is read at write time (only safe for synchronous writes).
     */
    setMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => void
    setModalMetadata: (key: string, metadata: TableMetadata, opts?: SetMetadataOptions) => void
    hasMetadata: (key: string) => boolean
    hasModalMetadata: (key: string) => boolean
    prefetchAll: () => Promise<void>
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

            prefetchAll: async () => {
                const scope = cacheScope()
                // Unknown identity: do not fetch into a cache nobody may read.
                if (!scope) return
                if (get().prefetched && get().scope === scope) return
                try {
                    const res = await api.get('/metadata/all')
                    const { tables, modals, version } = res.data.data

                    // If backend version changed, wipe old cache completely
                    const serverVersion = version || ''
                    const sameScope = get().scope === scope
                    const localVersion = sameScope ? get().metadataVersion : ''
                    const versionChanged = serverVersion !== localVersion && localVersion !== ''

                    const newCache: Record<string, TableMetadata> = versionChanged || !sameScope ? {} : { ...get().cache }
                    const newModalCache: Record<string, TableMetadata> = versionChanged || !sameScope ? {} : { ...get().modalCache }

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
                        metadataVersion: serverVersion,
                        prefetched: true,
                        scope,
                    })

                    if (versionChanged) {
                        console.log(`[MetadataCache] Version changed ${localVersion} → ${serverVersion}, cache refreshed`)
                    }
                } catch (err) {
                    // Offline or error — keep using cached data of this scope
                    if (get().scope === scope) set({ prefetched: true })
                }
            },
        }),
        {
            name: 'metadata-cache',
            // v4: entries are keyed by the org:user:lang scope; anything
            // persisted before has no owner (it may hold another account's
            // permissions) and is discarded.
            version: 4,
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
                // prefetched NOT persisted — always re-fetch once per session
            }),
        }
    )
)

/**
 * Logout / account switch: drops the in-memory metadata AND the persisted copy
 * (`metadata-cache`). Also runs by itself whenever the org/user/lang scope changes.
 */
export function clearMetadataCache(): void {
    useMetadataCache.setState(emptyFor(''))
    try {
        useMetadataCache.persist.clearStorage()
    } catch {
        /* storage unavailable */
    }
}

onCacheScopeChange(() => clearMetadataCache())
