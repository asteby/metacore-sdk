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
    children: React.ReactNode
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

export function PermissionsProvider({ permissions, isAdmin, children }: PermissionsProviderProps) {
    const can = useMemo(() => makeCan(permissions, isAdmin), [permissions, isAdmin])
    return <PermissionsContext.Provider value={can}>{children}</PermissionsContext.Provider>
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
 * Pure + idempotent. Callers should only invoke it when a provider is active
 * (`usePermissionsActive()`), otherwise pass the metadata through untouched.
 */
export function gateTableMetadata(
    metadata: TableMetadata,
    model: string,
    can: CanFn,
    tx: (i18nKey: string, fallback: string) => string = (_k, fallback) => fallback,
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
    const actions = base.filter((a) => allowed(a.key))

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
): ActionDefinition[] {
    const gated = permissionsActive ? gateTableMetadata(metadata, model, can, tx) : metadata
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
