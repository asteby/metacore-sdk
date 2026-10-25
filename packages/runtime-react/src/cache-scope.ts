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
let scopeProvider: (() => CacheScopeParts | null | undefined) | null = null

export interface CacheScopeParts {
    org?: string | null
    user?: string | null
    lang?: string | null
}
const listeners = new Set<ScopeListener>()
let lastScope: string | null | undefined

/** Lets a host with its own language source (not i18next / `<html lang>`) feed the scope. */
export function setCacheScopeLanguageProvider(fn: (() => string | null | undefined) | null): void {
    languageProvider = fn
}

/**
 * Lets the host feed the whole scope from its own session store instead of
 * `localStorage`. Takes precedence over `auth_user` and the token check; a
 * missing `lang` falls back to the language sources above. Returning `null`
 * (no session) makes the scope unknown, so nothing is cached. Pass `null` to
 * go back to reading `localStorage`.
 */
export function setCacheScopeProvider(fn: (() => CacheScopeParts | null | undefined) | null): void {
    scopeProvider = fn
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
        const json =
            typeof atob === 'function'
                ? decodeURIComponent(
                      Array.from(atob(padded), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
                  )
                : ''
        const claims = JSON.parse(json)
        return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null
    } catch {
        return null
    }
}

function claimOf(claims: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
        const v = claims[k]
        if (v != null && String(v).trim()) return String(v).trim()
    }
    return ''
}

/**
 * `auth_user` is written by the host after `/auth/me`, while the token
 * (`auth_token`) may already be the NEW one (SSO plants it first). Decodes the
 * stored JWT WITHOUT verifying it (the server verifies; here it is only a
 * consistency check) and returns false when the user/org it carries is not the
 * one in `auth_user`: the identity is in transition, so the scope is unknown.
 * A missing or non-JWT token (opaque/session tokens) keeps trusting `auth_user`
 * alone; that is the documented limit — such hosts should use
 * {@link setCacheScopeProvider}.
 */
function tokenMatches(org: string, user: string): boolean {
    let token = ''
    try {
        token = localStorage.getItem('auth_token') ?? ''
        // The auth store may keep it JSON-encoded.
        if (token.startsWith('"')) token = String(JSON.parse(token))
    } catch {
        return true
    }
    token = token.replace(/^Bearer\s+/i, '').trim()
    if (!token) return true
    const claims = decodeJwtClaims(token)
    if (!claims) return true
    const tUser = claimOf(claims, ['sub', 'ID', 'id', 'user_id', 'UserID'])
    const tOrg = claimOf(claims, ['org', 'OrganizationID', 'organization_id', 'org_id'])
    if (tUser && tUser !== user) return false
    if (tOrg && tOrg !== org) return false
    return true
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
    if (scopeProvider) {
        try {
            const p = scopeProvider()
            if (!p) return null
            const org = String(p.org ?? '').trim()
            const user = String(p.user ?? '').trim()
            const lang = String(p.lang ?? '').trim() || readLang()
            if (!org || !user || !lang) return null
            return [org, user, lang].map(encodeURIComponent).join(':')
        } catch {
            return null
        }
    }
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
    if (!tokenMatches(org, user)) return null
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
