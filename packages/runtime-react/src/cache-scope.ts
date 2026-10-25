/**
 * Scope of every client-side cache that holds server answers shaped by who is
 * asking: `org:user:lang`.
 *
 * Metadata carries the user's permissions (`actions[]`, `can*` flags) and the
 * operator's language, and rows depend on the organization. On a shared
 * browser a cache keyed by anything less shows the first paint of the previous
 * account. The scope is read from what the SDK already knows: the host session
 * (`auth_user` in localStorage: `organization_id`, `id`) and the UI language
 * (`i18nextLng`, or `<html lang>`; a host with another source calls
 * {@link setCacheScopeLanguageProvider}).
 *
 * Fails closed: when the organization, the user or the language is unknown the
 * scope is `null` and nothing is served from nor stored in a cache.
 */

type ScopeListener = (next: string | null, prev: string | null) => void

let languageProvider: (() => string | null | undefined) | null = null
const listeners = new Set<ScopeListener>()
let lastScope: string | null | undefined

/** Lets a host with its own language source (not i18next / `<html lang>`) feed the scope. */
export function setCacheScopeLanguageProvider(fn: (() => string | null | undefined) | null): void {
    languageProvider = fn
}

function readLang(): string {
    try {
        if (languageProvider) return String(languageProvider() ?? '').trim()
        if (typeof localStorage !== 'undefined') {
            const l = localStorage.getItem('i18nextLng')
            if (l) return l.trim()
        }
        if (typeof document !== 'undefined') return (document.documentElement?.lang ?? '').trim()
    } catch {
        /* unreadable storage: unknown language */
    }
    return ''
}

/** Reads the scope without notifying anyone (safe inside render/selectors). */
export function peekCacheScope(): string | null {
    if (typeof localStorage === 'undefined') return null
    let org = ''
    let user = ''
    try {
        const raw = localStorage.getItem('auth_user')
        if (!raw) return null
        const parsed = JSON.parse(raw) as { organization_id?: unknown; id?: unknown }
        org = String(parsed.organization_id ?? '').trim()
        user = String(parsed.id ?? '').trim()
    } catch {
        return null
    }
    const lang = readLang()
    if (!org || !user || !lang) return null
    return [org, user, lang].map(encodeURIComponent).join(':')
}

/**
 * Current `org:user:lang` scope, or `null` when any part is unknown (callers
 * must then neither read nor write caches). When the scope moved since the
 * last call, every registered cache is told to drop what it holds.
 */
export function cacheScope(): string | null {
    const next = peekCacheScope()
    if (lastScope !== undefined && next !== lastScope) {
        const prev = lastScope
        lastScope = next
        for (const fn of [...listeners]) {
            try {
                fn(next, prev)
            } catch {
                /* a cache failing to clear must not break the others */
            }
        }
    }
    lastScope = next
    return next
}

/** Re-reads the scope and clears caches if it changed (login, logout, org/user/lang switch). */
export function syncCacheScope(): void {
    cacheScope()
}

/** Registers a cache to be cleared when the scope changes. Returns the unsubscribe. */
export function onCacheScopeChange(fn: ScopeListener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

/** Test helper: forget the last seen scope without notifying. */
export function resetCacheScopeTracking(): void {
    lastScope = undefined
}
