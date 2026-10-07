// permissions-context — runtime permission primitives for dynamic hosts.
//
// The host loads the session's capability set (e.g. ops `GET /permissions/me`)
// and mounts <PermissionsProvider permissions={caps} isAdmin={me.is_admin}>
// once at the root. Any SDK component (or host code) then calls `useCan()` to
// gate UI by capability:
//
//   const can = useCan()
//   can('pos_orders.create')  // → boolean
//
// Capability format is the canonical `lowercase(<model_table>).<action_key>`
// derived from installed manifests (CRUD: index|create|update|delete|export|
// import; custom actions use their own key, e.g. `pos_orders.pagar`). General
// flags live under the `general` module (`general.work_after_hours`).
//
// Semantics:
//   - isAdmin → every capability allowed (superrole bypass mirror).
//   - the list contains the exact capability or the `*` wildcard → allowed.
//   - NO provider mounted → `useCan()` returns an always-true function, so
//     every existing host keeps its current behaviour (nothing is hidden).
//     Deny-by-default only kicks in once the host opts in by mounting the
//     provider; the backend enforcement remains the source of truth.
import React, { createContext, useContext, useMemo } from 'react'
import type { TableMetadata, ActionDefinition } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Predicate answering "can the current user use this capability?". */
export type CanFn = (capability: string) => boolean

export interface PermissionsProviderProps {
    /** Granted capabilities (`"pos_orders.create"`, `"general.x"`, or `"*"`). */
    permissions: string[]
    /** Superrole bypass — admins/owners see everything, no filtering at all. */
    isAdmin: boolean
    /**
     * Roles of the current user (e.g. `['doctor']`), used ONLY to honour the
     * per-action `allowedRoles` declared in table metadata. Opt-in: while this
     * is `undefined` (and `loading` is not set) role filtering is OFF and
     * `allowedRoles` is ignored, exactly as before this prop existed. Once the
     * host passes an array (even `[]` = "resolved, no roles") the filter is
     * fail-closed: an action with a non-empty `allowedRoles` that shares no
     * role with the user is hidden.
     */
    roles?: string[]
    /**
     * Roles that bypass `allowedRoles` entirely (the host's superroles, e.g.
     * `['admin', 'super_admin']`). Default `[]` = no role bypasses. `isAdmin`
     * also bypasses.
     */
    superRoles?: string[]
    /**
     * The host is still hydrating the session roles. While true no action is
     * hidden by `allowedRoles` (avoids a flash of missing actions); set it back
     * to false once `roles` is resolved.
     */
    rolesLoading?: boolean
    children: React.ReactNode
}

/** Resolved role-gating state shared with the table surfaces. */
export interface RoleGate {
    /** User roles; `undefined` while unresolved. */
    roles?: string[]
    superRoles: string[]
    loading: boolean
    isAdmin: boolean
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Builds the capability predicate from a raw permission list. Pure — exported
 * so hosts/tests can evaluate permissions outside React.
 */
export function makeCan(permissions: string[], isAdmin: boolean): CanFn {
    if (isAdmin) return () => true
    const set = new Set(permissions)
    if (set.has('*')) return () => true
    return (capability) => set.has(capability)
}

const ALWAYS_ALLOW: CanFn = () => true

const PermissionsContext = createContext<CanFn | null>(null)
const RoleGateContext = createContext<RoleGate | null>(null)

const NO_ROLES: string[] = []

export function PermissionsProvider({
    permissions,
    isAdmin,
    roles,
    superRoles = NO_ROLES,
    rolesLoading = false,
    children,
}: PermissionsProviderProps) {
    const can = useMemo(() => makeCan(permissions, isAdmin), [permissions, isAdmin])
    const roleGate = useMemo<RoleGate>(
        () => ({ roles, superRoles, loading: rolesLoading, isAdmin }),
        [roles, superRoles, rolesLoading, isAdmin],
    )
    return (
        <PermissionsContext.Provider value={can}>
            <RoleGateContext.Provider value={roleGate}>{children}</RoleGateContext.Provider>
        </PermissionsContext.Provider>
    )
}

/**
 * Role-gating state of the nearest <PermissionsProvider>, or `null` when none
 * is mounted (no provider → no role filtering, legacy behaviour).
 */
export function useRoleGate(): RoleGate | null {
    return useContext(RoleGateContext)
}

/**
 * Whether `action` is visible for the user under `gate`. Pure.
 *
 * UX ONLY: this hides buttons, it does not authorize anything. The backend
 * remains the authority and must enforce the same `allowedRoles` on execution.
 *
 * Rules:
 *   - no gate (no provider) → visible (unchanged behaviour).
 *   - action without `allowedRoles` (or empty) → visible. Reads both the
 *     camelCase `allowedRoles` and the snake_case `allowed_roles` wire forms.
 *   - `gate.loading` → visible (don't flash-hide while the session hydrates).
 *   - `gate.roles === undefined` and not loading → the host did not opt in to
 *     role gating → visible.
 *   - `gate.isAdmin` or any user role in `gate.superRoles` → visible.
 *   - otherwise visible only if the user shares a role with `allowedRoles`
 *     (fail-closed: `roles: []` sees none of the restricted actions).
 */
export function isActionAllowedForRoles(action: ActionDefinition, gate: RoleGate | null): boolean {
    if (!gate) return true
    const declared = action.allowedRoles ?? action.allowed_roles
    if (!declared || declared.length === 0) return true
    if (gate.loading || gate.roles === undefined) return true
    if (gate.isAdmin) return true
    const userRoles = gate.roles
    if (userRoles.some((r) => gate.superRoles.includes(r))) return true
    return userRoles.some((r) => declared.includes(r))
}

/**
 * Returns the capability predicate. Without a <PermissionsProvider> ancestor
 * it returns an always-true function — existing hosts that never mount the
 * provider keep today's "everything visible" behaviour.
 */
export function useCan(): CanFn {
    return useContext(PermissionsContext) ?? ALWAYS_ALLOW
}

/** True when a <PermissionsProvider> is mounted above (permission gating active). */
export function usePermissionsActive(): boolean {
    return useContext(PermissionsContext) !== null
}

// ---------------------------------------------------------------------------
// Table-metadata gating (consumed by DynamicTable / DynamicCRUDPage /
// ModelActionToolbar — exported for hosts with bespoke tables)
// ---------------------------------------------------------------------------

/**
 * Maps a row/table action key onto the capability action segment. The UI's
 * legacy `view`/`edit` keys correspond to the kernel's `index`/`update`
 * capabilities; everything else (delete, custom keys) maps verbatim.
 */
export function capabilityForActionKey(actionKey: string): string {
    if (actionKey === 'view') return 'index'
    if (actionKey === 'edit') return 'update'
    return actionKey
}

/** Canonical capability for an action on a model: `lowercase(model).<action>`. */
export function modelCapability(model: string, actionKey: string): string {
    return `${model.toLowerCase()}.${capabilityForActionKey(actionKey)}`
}

const DEFAULT_TRIO: { key: string; i18nKey: string; fallback: string; icon: string }[] = [
    { key: 'view', i18nKey: 'datatable.view', fallback: 'Ver', icon: 'Eye' },
    { key: 'edit', i18nKey: 'datatable.edit', fallback: 'Editar', icon: 'Pencil' },
    { key: 'delete', i18nKey: 'datatable.delete', fallback: 'Eliminar', icon: 'Trash2' },
]

/**
 * Applies the capability predicate to a model's table metadata:
 *   - `canExport` / `canImport` are ANDed with `can(model.export|import)`.
 *   - explicit row/table actions are filtered by `can(model.<key>)` (with the
 *     view→index / edit→update mapping above).
 *   - when the metadata has NO explicit actions but `enableCRUDActions` is on,
 *     the implicit View/Edit/Delete trio is materialized here as explicit
 *     actions so individual entries can be dropped; `tx` resolves their labels
 *     (defaults to the Spanish fallbacks used by the column factory).
 *
 * When `roleGate` is given, actions declaring `allowedRoles` are also dropped
 * for users outside those roles (see `isActionAllowedForRoles`; UX only, the
 * backend stays the authority).
 *
 * Pure + idempotent. Callers should only invoke it when a provider is active
 * (`usePermissionsActive()`), otherwise pass the metadata through untouched.
 */
export function gateTableMetadata(
    metadata: TableMetadata,
    model: string,
    can: CanFn,
    tx: (i18nKey: string, fallback: string) => string = (_k, fallback) => fallback,
    roleGate: RoleGate | null = null,
): TableMetadata {
    const allowed = (key: string) => can(modelCapability(model, key))

    const explicit = metadata.actions ?? []
    const hasExplicit = (metadata.hasActions ?? explicit.length > 0) && explicit.length > 0
    const base: ActionDefinition[] = hasExplicit
        ? explicit
        : metadata.enableCRUDActions
          ? DEFAULT_TRIO.map(
                (a) =>
                    ({
                        key: a.key,
                        name: a.key,
                        label: tx(a.i18nKey, a.fallback),
                        icon: a.icon,
                    }) as ActionDefinition,
            )
          : []
    const actions = base.filter((a) => allowed(a.key) && isActionAllowedForRoles(a, roleGate))

    return {
        ...metadata,
        actions,
        hasActions: actions.length > 0,
        // The column factory synthesizes the implicit CRUD trio whenever the
        // action list is empty and this flag is on — turn it off once gating
        // has materialized (and possibly emptied) the list so nothing leaks
        // back in.
        enableCRUDActions: metadata.enableCRUDActions && actions.length > 0,
        canExport: Boolean(metadata.canExport) && allowed('export'),
        canImport: Boolean(metadata.canImport) && allowed('import'),
        canCreate:
            metadata.canCreate === undefined ? undefined : metadata.canCreate && allowed('create'),
    }
}

/**
 * Resolves the per-row (`placement: 'row'`) action list for a model exactly the
 * way DynamicTable's action column does, so the kanban card menu shows the SAME
 * actions:
 *   - when a <PermissionsProvider> is active, the metadata is run through
 *     `gateTableMetadata` first (filters by capability + materializes the CRUD
 *     trio), otherwise the raw metadata is used.
 *   - explicit actions win; absent them, the implicit View/Edit/Delete trio is
 *     materialized when `enableCRUDActions` is on.
 *   - table/create-placement actions are stripped (they belong to the toolbar).
 *
 * Pure. `tx` resolves the trio's i18n labels (defaults to the Spanish fallbacks).
 */
export function resolveRowActions(
    metadata: TableMetadata,
    model: string,
    can: CanFn,
    permissionsActive: boolean,
    tx: (i18nKey: string, fallback: string) => string = (_k, fallback) => fallback,
    roleGate: RoleGate | null = null,
): ActionDefinition[] {
    const gated = permissionsActive ? gateTableMetadata(metadata, model, can, tx, roleGate) : metadata
    const explicit = gated.actions ?? []
    const hasExplicit = (gated.hasActions ?? explicit.length > 0) && explicit.length > 0
    const base: ActionDefinition[] = hasExplicit
        ? explicit
        : gated.enableCRUDActions
          ? DEFAULT_TRIO.map(
                (a) =>
                    ({
                        key: a.key,
                        name: a.key,
                        label: tx(a.i18nKey, a.fallback),
                        icon: a.icon,
                    }) as ActionDefinition,
            )
          : []
    return base.filter((a) => ((a.placement ?? 'row') as string) === 'row')
}
