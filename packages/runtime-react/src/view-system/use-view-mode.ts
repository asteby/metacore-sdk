import { useCallback, useState } from 'react'
import type { ViewModeDef, ViewModeKey } from './types'

export const DEFAULT_MODES: ViewModeDef[] = [{ key: 'cards' }, { key: 'table' }]

/** Legacy `?view=` values: list -> table. */
function normalize(v: string | undefined): string | undefined {
    if (!v) return undefined
    return v === 'list' ? 'table' : v
}

/**
 * Pure precedence: URL `?view=` > preference for (model, scope) > preference for
 * model > default > first mode. Only keys present in `modes` are accepted.
 */
export function resolveViewMode(
    modes: ViewModeDef[],
    o: { urlView?: string; scoped?: string; model?: string; defaultKey?: string },
): ViewModeKey {
    const keys = new Set(modes.map((m) => m.key as string))
    for (const c of [o.urlView, o.scoped, o.model, o.defaultKey]) {
        const n = normalize(c)
        if (n && keys.has(n)) return n
    }
    return modes[0]?.key ?? 'table'
}

function read(key: string): string | undefined {
    try {
        return localStorage.getItem(key) ?? undefined
    } catch {
        return undefined
    }
}
function write(key: string, v: string) {
    try {
        localStorage.setItem(key, v)
    } catch {
        /* storage blocked: preference just doesn't persist */
    }
}

export interface UseViewModeOptions {
    /** Per-user namespace so two users on one browser keep their own choice. */
    userId?: string
    /** Optional finer scope (e.g. a menu entry / segment). */
    scope?: string
    urlView?: string
    defaultKey?: ViewModeKey
    /** Called on change so the host can mirror it into `?view=`. */
    onUrlChange?: (view: string) => void
}

export function viewPrefKey(userId: string | undefined, model: string, scope?: string) {
    return `mc:view:${userId ?? 'anon'}:${model}${scope ? `:${scope}` : ''}`
}

/** Active mode + setter that persists the preference (localStorage, try/catch). */
export function useViewMode(model: string, modes: ViewModeDef[] = DEFAULT_MODES, opts: UseViewModeOptions = {}) {
    const { userId, scope, urlView, defaultKey, onUrlChange } = opts
    const [rev, setRev] = useState(0)
    void rev
    const active = resolveViewMode(modes, {
        urlView,
        scoped: scope ? read(viewPrefKey(userId, model, scope)) : undefined,
        model: read(viewPrefKey(userId, model)),
        defaultKey,
    })
    const setMode = useCallback(
        (key: ViewModeKey) => {
            write(viewPrefKey(userId, model), key)
            if (scope) write(viewPrefKey(userId, model, scope), key)
            onUrlChange?.(key)
            setRev((r) => r + 1)
        },
        [userId, model, scope, onUrlChange],
    )
    return [active, setMode] as const
}
