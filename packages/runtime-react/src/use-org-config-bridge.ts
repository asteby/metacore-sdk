// Bridge to `useOrgConfig` from `@asteby/metacore-app-providers` without
// adding it as a hard dependency of `runtime-react`. The provider package
// is a peer; in apps that mount it the hook returns the live config, in
// apps that don't the SDK falls through to a no-op shim that resolves
// every reference to null. Forms then leave $org.<key> tokens in place
// rather than crashing — the operator notices the missing config when
// the validator fails to fire, not at app boot.
//
// Why a bridge: runtime-react cannot import `@asteby/metacore-app-providers`
// directly without inverting the dependency graph (app-providers depends
// on runtime-react today via peerDependenciesMeta). The shim shape
// matches `OrgConfigContextValue` so DynamicForm code reads through one
// stable interface regardless of provider mount.

export interface OrgConfigBridge {
    /** Resolves a `$org.<key>` reference (or plain key) to a literal id. */
    resolveValidator: (refOrKey: string) => string | null
    /** When true the app actually has a provider mounted. */
    available: boolean
}

const NULL_BRIDGE: OrgConfigBridge = {
    resolveValidator: () => null,
    available: false,
}

let activeBridge: OrgConfigBridge = NULL_BRIDGE

/**
 * Apps that consume `runtime-react` AND `@asteby/metacore-app-providers`
 * call this once near the root (typically inside the OrgConfigProvider
 * children) so the SDK reads the same resolver. Hosts without an org
 * provider can ignore this entirely; the SDK's null bridge keeps every
 * call returning `null` so $org.<key> tokens stay verbatim in the form
 * — same fallback the kernel uses for unresolved references.
 */
export function setOrgConfigBridge(bridge: OrgConfigBridge | null) {
    activeBridge = bridge ?? NULL_BRIDGE
}

/**
 * Returns the active bridge. Pure read — no React hook so it can be
 * called from non-component code (zod schema builders, helpers).
 */
export function getOrgConfigBridge(): OrgConfigBridge {
    return activeBridge
}

/**
 * Resolves a Validation token into the validator identifier the SDK
 * should apply. Returns the resolved literal when the org config knows
 * the key, or the original token when it doesn't (so apps can decide).
 * Plain literals (no `$org.` prefix) pass through.
 */
export function resolveValidatorToken(token: string | undefined | null): string | null {
    if (!token) return null
    if (!token.startsWith('$org.')) return token
    const resolved = activeBridge.resolveValidator(token)
    return resolved ?? token
}
