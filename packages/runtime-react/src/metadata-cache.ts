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
