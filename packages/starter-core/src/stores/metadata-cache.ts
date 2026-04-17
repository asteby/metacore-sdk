import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TableMetadata } from '@/components/dynamic/types'
import { api } from '@/lib/api'

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
    prefetchAll: () => Promise<void>
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

            prefetchAll: async () => {
                if (get().prefetched) return
                try {
                    const res = await api.get('/metadata/all')
                    const { tables, modals, version } = res.data.data

                    // If backend version changed, wipe old cache completely
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

                    if (versionChanged) {
                        console.log(`[MetadataCache] Version changed ${localVersion} → ${serverVersion}, cache refreshed`)
                    }
                } catch (err) {
                    // Offline or error — keep using cached data
                    set({ prefetched: true })
                }
            },
        }),
        {
            name: 'metadata-cache',
            version: 3,
            partialize: (state) => ({
                cache: state.cache,
                modalCache: state.modalCache,
                metadataVersion: state.metadataVersion,
                // prefetched NOT persisted — always re-fetch once per session
            }),
        }
    )
)
