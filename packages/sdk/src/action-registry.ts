import { createElement, type ComponentType } from 'react'

// Canonical action registry. Hosts re-export this module so every addon
// modal lives in a single registry regardless of which host loaded it.
//
// ÚNICA fuente de verdad del front para lo que un addon aporta a la pantalla
// de un registro, siempre etiquetado con el addon dueño (`owner`):
//   - componentes de acción por (modelo, acción)   registerActionComponent
//   - modales por slug `<addon>.<nombre>`          registerModalComponent
//   - acciones de registro (compartir, imprimir,
//     enviar al chat…) con su proveedor            registerRecordAction
//   - slots con nombre                             slotStore
// `Registry.scope(addon).register*` (AddonAPI), `registerFederatedModal` y
// `registerDocumentContribution` de runtime-react escriben AQUÍ; quien pinta
// filtra por addon instalado y activo (InstalledAddonsProvider).

export interface ActionFieldDef {
    key: string
    label: string
    type: string // text, textarea, select, search, number, date, email, url, boolean
    required?: boolean
    options?: { value: string; label: string }[]
    defaultValue?: any
    placeholder?: string
    searchEndpoint?: string
}

/**
 * A single page of a multi-step (wizard) action. Declared by an action's
 * `steps` metadata; each step gathers a subset of the action's fields, validated
 * before the wizard advances. On the final step ALL accumulated fields POST to
 * the same endpoint a single-page GenericActionModal would use.
 */
export interface ActionStep {
    /** Step heading (an i18n key or literal). */
    title: string
    /** Optional sub-heading shown under the title. */
    description?: string
    /** Fields collected on this step. Same shape as a flat action's `fields`. */
    fields: ActionFieldDef[]
}

export interface ActionMetadata {
    key: string
    label: string
    icon: string
    color?: string
    confirm?: boolean
    confirmMessage?: string
    fields?: ActionFieldDef[]
    /**
     * Multi-step (wizard) form. When present, the dispatcher renders a
     * step-by-step wizard instead of the single-page GenericActionModal: a
     * progress/step bar, per-step validation before advancing, back/next, and a
     * final submit that POSTs every accumulated field to the action endpoint.
     * Not yet part of the kernel's manifest v3 — read tolerantly off the action
     * object. When both `steps` and `fields` are present, `steps` wins.
     */
    steps?: ActionStep[]
    requiresState?: string[]
    /**
     * Manifest `supervisor_policy`: the action needs the on-the-spot authorization
     * of a supervisor for that policy (`general.approve_<policy>`). The action
     * modals ask for the PIN and send the grant as `approval_id`.
     */
    supervisorPolicy?: string
    executable?: boolean
    /** Optional modal slug "<addon_key>.<action_key>" pointing at a registered custom component. */
    modal?: string
    /**
     * Where the host surfaces the trigger. Mirrors manifest/v3 Action.placement.
     *   "row" (default) — per-row table action.
     *   "table"         — page toolbar button (no record context).
     *   "create"        — toolbar button that replaces the generic create button.
     */
    placement?: 'row' | 'table' | 'create'
    /**
     * Optional addon this action depends on, stamped by the host only while it
     * is NOT installed (wire: `requires_addon`). The runtime keeps the action
     * visible but locked and offers to install the addon instead of running it.
     */
    requiresAddon?: { key: string; name?: string; reason?: string }
    /**
     * Manifest v3 `priority`: "primary" = la única acción destacada; "secondary"
     * = compartir/imprimir/correo/chat, que el host manda al pie del documento
     * y al «Más…» del menú de fila. Sin valor se clasifica por convención.
     */
    priority?: ActionPriority
}

export type ActionPriority = 'primary' | 'secondary'

export interface ActionModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    action: ActionMetadata
    model: string
    record: any
    endpoint?: string
    onSuccess: () => void
}

type ActionComponentEntry = ComponentType<ActionModalProps>

interface OwnedActionComponent {
    component: ActionComponentEntry
    owner?: string
}

const registry = new Map<string, OwnedActionComponent>()
const listeners = new Set<() => void>()

const keyOf = (model: string, actionKey: string) => `${model}::${actionKey}`

function notify() {
    for (const listener of [...listeners]) listener()
}

/**
 * Subscribe to registry changes (register / unregister). Federated remotes
 * register after the host has already rendered, so readers use this with
 * `useSyncExternalStore` to pick the component up the moment it lands.
 * Returns the unsubscribe function.
 */
export function subscribeActionComponents(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function registerActionComponent(
    model: string,
    actionKey: string,
    component: ActionComponentEntry,
    owner?: string,
) {
    registry.set(keyOf(model, actionKey), { component, owner })
    notify()
}

export function getActionComponent(
    model: string,
    actionKey: string,
): ActionComponentEntry | undefined {
    return registry.get(keyOf(model, actionKey))?.component
}

export function hasActionComponent(model: string, actionKey: string): boolean {
    return registry.has(keyOf(model, actionKey))
}

export function unregisterActionComponent(model: string, actionKey: string) {
    if (registry.delete(keyOf(model, actionKey))) notify()
}

/** Drop every action modal owned by `addonKey`. Used on fiber unbind. */
export function unregisterActionComponentsByOwner(addonKey: string): number {
    if (!addonKey) return 0
    let removed = 0
    for (const [key, row] of [...registry.entries()]) {
        if (row.owner === addonKey) {
            registry.delete(key)
            removed += 1
        }
    }
    if (removed > 0) notify()
    return removed
}

// ---- Modales por slug -------------------------------------------------------
// `action.modal` del manifest ("fiscal_mexico.import_cfdi"). Lo escriben
// Registry.registerModal (AddonAPI) y registerFederatedModal (runtime-react);
// lo lee ActionModalDispatcher. Antes eran dos mapas y el de Registry no tenía
// lector.

export interface ModalComponentEntry {
    slug: string
    /** Addon dueño: si no está instalado y activo, el host no lo resuelve. */
    owner?: string
    /** Componente ya cargado… */
    component?: ComponentType<any>
    /** …o loader perezoso del remote federado (`() => import('addon/Modal')`). */
    load?: () => Promise<{ default: ComponentType<any> }>
}

const modals = new Map<string, ModalComponentEntry>()

/**
 * Registra el modal del slug. Re-registrar el mismo slug reemplaza. Devuelve el
 * disposer (no borra si otro registro ya lo reemplazó).
 */
export function registerModalComponent(entry: ModalComponentEntry): () => void {
    if (!entry.component && !entry.load) throw new Error(`modal ${entry.slug}: component o load es obligatorio`)
    const owned = { ...entry, owner: entry.owner ?? ownerOfSlug(entry.slug) }
    modals.set(entry.slug, owned)
    notify()
    return () => {
        if (modals.get(entry.slug) === owned) {
            modals.delete(entry.slug)
            notify()
        }
    }
}

export function getModalComponent(slug: string): ModalComponentEntry | undefined {
    return modals.get(slug)
}

/** `<addon>.<nombre>` → `<addon>`; sin punto no hay dueño deducible. */
export function ownerOfSlug(slug: string): string | undefined {
    const i = slug.indexOf('.')
    return i > 0 ? slug.slice(0, i) : undefined
}

// ---- Acciones de registro (secundarias) --------------------------------------
// Lo que un addon (o el host, con una capacidad) aporta a CUALQUIER registro sin
// que el addon del modelo lo declare: «Enviar al chat», imprimir/descargar el
// PDF, enlace público… El SDK las pinta en el «Más…» del menú de fila y en la
// barra secundaria (pie) del documento, sólo si su proveedor está activo.

export interface RecordActionContext {
    model: string
    record: Record<string, unknown>
}

export interface RecordActionItem {
    key: string
    label: string
    icon?: string
    run: () => unknown
}

export interface RecordActionContribution {
    /** Id estable `<proveedor>.<nombre>`. Re-registrar el mismo id reemplaza. */
    id: string
    /** Clave i18n o literal. */
    label?: string
    /** Ícono lucide. */
    icon?: string
    /** Modelos donde aplica (clave o tabla, como el host la nombre). Default: todos. */
    models?: string[] | '*'
    /** Default "secondary": una contribución externa nunca roba la primaria. */
    priority?: ActionPriority
    /**
     * Proveedor que debe estar instalado y activo. `addon` = clave del addon;
     * `capability` = contrato `provides_capabilities` (cualquier addon que lo
     * provea, o el host si es core). Sin `requires` vale el dueño del registro.
     */
    requires?: { addon?: string; capability?: string }
    /** Menor = antes. Default 0. */
    order?: number
    when?: (ctx: RecordActionContext) => boolean
    run?: (ctx: RecordActionContext) => unknown
    /** Una entrada por elemento (p. ej. un PDF por plantilla del modelo). */
    expand?: (ctx: RecordActionContext) => RecordActionItem[]
    /** Pinta su propio control en la barra secundaria (no aparece en el menú de fila). */
    render?: ComponentType<RecordActionContext>
}

export interface OwnedRecordAction {
    contribution: RecordActionContribution
    owner?: string
}

const recordActions = new Map<string, OwnedRecordAction>()
let recordActionsSnapshot: OwnedRecordAction[] = []

export function registerRecordAction(c: RecordActionContribution, owner?: string): () => void {
    if (!c.run && !c.expand && !c.render) throw new Error(`record action ${c.id}: run, expand o render es obligatorio`)
    const row: OwnedRecordAction = { contribution: c, owner }
    recordActions.set(c.id, row)
    recordActionsChanged()
    return () => {
        if (recordActions.get(c.id) === row) {
            recordActions.delete(c.id)
            recordActionsChanged()
        }
    }
}

/** Snapshot estable (cambia de identidad sólo al registrar/quitar): apto para useSyncExternalStore. */
export function listRecordActions(): readonly OwnedRecordAction[] {
    return recordActionsSnapshot
}

function recordActionsChanged() {
    recordActionsSnapshot = [...recordActions.values()]
    notify()
}

/** Quita modales y acciones de registro de `addonKey` (fiber unbind). */
export function unregisterContributionsByOwner(addonKey: string): number {
    if (!addonKey) return 0
    let removed = 0
    for (const [slug, m] of [...modals.entries()]) {
        if (m.owner === addonKey) {
            modals.delete(slug)
            removed += 1
        }
    }
    let actionsRemoved = 0
    for (const [id, a] of [...recordActions.entries()]) {
        if (a.owner === addonKey) {
            recordActions.delete(id)
            actionsRemoved += 1
        }
    }
    if (actionsRemoved > 0) recordActionsSnapshot = [...recordActions.values()]
    removed += actionsRemoved
    if (removed > 0) notify()
    return removed
}

// ---- Adaptador de props -------------------------------------------------------
// Los remotes de addons se escriben contra dos contratos: ActionModalProps
// (open/onOpenChange/onSuccess) y el de AddonAPI (recordId/payload/close).
// Este envoltorio entrega ambos, así un mismo componente sirve registrado por
// acción o por slug.

export type BridgedActionProps = ActionModalProps & {
    recordId: string
    payload: Record<string, unknown>
    close: (result?: unknown) => void
}

export function closeResultIsSuccess(result: unknown): boolean {
    return (
        result === true ||
        (typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === true)
    )
}

export function adaptActionProps(p: ActionModalProps): BridgedActionProps {
    return {
        ...p,
        recordId: p.record?.id != null ? String(p.record.id) : '',
        payload: (p.record ?? {}) as Record<string, unknown>,
        close: (result?: unknown) => {
            p.onOpenChange(false)
            if (closeResultIsSuccess(result)) p.onSuccess?.()
        },
    }
}

export function withAdaptedActionProps(component: ComponentType<any>): ComponentType<ActionModalProps> {
    const Adapted = (p: ActionModalProps) => createElement(component, adaptActionProps(p))
    Adapted.displayName = `AdaptedAction(${component.displayName || component.name || 'Anonymous'})`
    return Adapted
}
