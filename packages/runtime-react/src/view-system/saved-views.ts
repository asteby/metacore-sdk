import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedView } from './types'

/** Pluggable persistence; default is per-user localStorage. A host can back it by the server so views follow the user across devices. */
export interface SavedViewsAdapter {
    load(model: string): Promise<SavedView[]> | SavedView[]
    save(model: string, views: SavedView[]): Promise<void> | void
}

export const MAX_SAVED_VIEWS = 20

export function localSavedViewsAdapter(userId?: string): SavedViewsAdapter {
    const key = (m: string) => `mc:saved-views:${userId ?? 'anon'}:${m}`
    return {
        load(model) {
            try {
                const raw = localStorage.getItem(key(model))
                const v = raw ? JSON.parse(raw) : []
                return Array.isArray(v) ? v : []
            } catch {
                return []
            }
        },
        save(model, views) {
            try {
                localStorage.setItem(key(model), JSON.stringify(views))
            } catch {
                /* ignore */
            }
        },
    }
}

/** Pure: add (or rename-replace by name) a view, bounded. */
export function upsertSavedView(list: SavedView[], v: SavedView): SavedView[] {
    const rest = list.filter((x) => x.id !== v.id && x.name !== v.name)
    return [...rest, v].slice(-MAX_SAVED_VIEWS)
}
export function removeSavedView(list: SavedView[], id: string): SavedView[] {
    return list.filter((x) => x.id !== id)
}

export function useSavedViews(model: string, opts: { userId?: string; adapter?: SavedViewsAdapter } = {}) {
    const adapter = useMemo(() => opts.adapter ?? localSavedViewsAdapter(opts.userId), [opts.adapter, opts.userId])
    const [views, setViews] = useState<SavedView[]>([])
    useEffect(() => {
        let live = true
        Promise.resolve(adapter.load(model)).then((v) => live && setViews(v))
        return () => {
            live = false
        }
    }, [adapter, model])
    const commit = useCallback(
        (next: SavedView[]) => {
            setViews(next)
            void adapter.save(model, next)
        },
        [adapter, model],
    )
    return {
        views,
        save: (v: Omit<SavedView, 'id'> & { id?: string }) =>
            commit(upsertSavedView(views, { ...v, id: v.id ?? `v_${Date.now().toString(36)}` })),
        remove: (id: string) => commit(removeSavedView(views, id)),
    }
}
