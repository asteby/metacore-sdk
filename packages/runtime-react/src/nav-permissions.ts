// nav-permissions — the sidebar follows the role's EFFECTIVE permissions
// (PIT-044). Before, every installed addon's entries were listed for every
// role and only failed with a 403 after the click.
//
// Rules (same capability vocabulary as useCan/gateTableMetadata):
//   - no <PermissionsProvider> mounted, or isAdmin / "*"  -> nothing hidden
//     (useCan() is always-true then, so the predicate is a no-op);
//   - an entry with an explicit `requires` capability     -> can(requires);
//   - an entry pointing at a model screen (`/m/<model>`)  -> can('<model>.index');
//   - any other entry (custom pages, activity, settings…) -> kept. Those are
//     gated by the backend / the host's own `requires`, never guessed here.
import { useCallback } from 'react'
import { modelCapability, useCan, usePermissionsActive, type CanFn } from './permissions-context'

/** Minimal structural shape of a sidebar leaf (matches `@asteby/metacore-ui` NavLinkItem). */
export interface NavLeafLike {
    url: string
    requires?: string
}

const MODEL_URL_RE = /^\/(?:app\/)?m\/([^/?#]+)/i

/** Model key of a `/m/<model>` url, or undefined for any other route. */
export function modelFromNavUrl(url: string | undefined): string | undefined {
    if (!url) return undefined
    const m = MODEL_URL_RE.exec(url)
    if (!m) return undefined
    try {
        return decodeURIComponent(m[1])
    } catch {
        return m[1]
    }
}

/** Capability a leaf needs, or undefined when it is not gated by the SDK. */
export function capabilityForNavItem(item: NavLeafLike): string | undefined {
    if (item.requires) return item.requires
    const model = modelFromNavUrl(item.url)
    return model ? modelCapability(model, 'index') : undefined
}

/** Pure visibility predicate for a leaf given a capability checker. */
export function isNavItemAllowed(item: NavLeafLike, can: CanFn): boolean {
    const cap = capabilityForNavItem(item)
    return cap ? can(cap) : true
}

/**
 * Hook for the host's sidebar: returns a predicate for `<AppSidebar
 * isItemVisible>` / `filterNavGroups`, or `undefined` when permission gating
 * is not active (nothing to filter).
 */
export function useNavItemVisible(): ((item: NavLeafLike) => boolean) | undefined {
    const can = useCan()
    const active = usePermissionsActive()
    const predicate = useCallback((item: NavLeafLike) => isNavItemAllowed(item, can), [can])
    return active ? predicate : undefined
}
