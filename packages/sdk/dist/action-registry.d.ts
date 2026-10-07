import { type ComponentType } from 'react';
export interface ActionFieldDef {
    key: string;
    label: string;
    type: string;
    required?: boolean;
    options?: {
        value: string;
        label: string;
    }[];
    defaultValue?: any;
    placeholder?: string;
    searchEndpoint?: string;
}
/**
 * A single page of a multi-step (wizard) action. Declared by an action's
 * `steps` metadata; each step gathers a subset of the action's fields, validated
 * before the wizard advances. On the final step ALL accumulated fields POST to
 * the same endpoint a single-page GenericActionModal would use.
 */
export interface ActionStep {
    /** Step heading (an i18n key or literal). */
    title: string;
    /** Optional sub-heading shown under the title. */
    description?: string;
    /** Fields collected on this step. Same shape as a flat action's `fields`. */
    fields: ActionFieldDef[];
}
export interface ActionMetadata {
    key: string;
    label: string;
    icon: string;
    color?: string;
    confirm?: boolean;
    confirmMessage?: string;
    fields?: ActionFieldDef[];
    /**
     * Multi-step (wizard) form. When present, the dispatcher renders a
     * step-by-step wizard instead of the single-page GenericActionModal: a
     * progress/step bar, per-step validation before advancing, back/next, and a
     * final submit that POSTs every accumulated field to the action endpoint.
     * Not yet part of the kernel's manifest v3 — read tolerantly off the action
     * object. When both `steps` and `fields` are present, `steps` wins.
     */
    steps?: ActionStep[];
    requiresState?: string[];
    /**
     * Manifest `supervisor_policy`: the action needs the on-the-spot authorization
     * of a supervisor for that policy (`general.approve_<policy>`). The action
     * modals ask for the PIN and send the grant as `approval_id`.
     */
    supervisorPolicy?: string;
    executable?: boolean;
    /** Optional modal slug "<addon_key>.<action_key>" pointing at a registered custom component. */
    modal?: string;
    /**
     * Where the host surfaces the trigger. Mirrors manifest/v3 Action.placement.
     *   "row" (default) — per-row table action.
     *   "table"         — page toolbar button (no record context).
     *   "create"        — toolbar button that replaces the generic create button.
     */
    placement?: 'row' | 'table' | 'create';
    /**
     * Optional addon this action depends on, stamped by the host only while it
     * is NOT installed (wire: `requires_addon`). The runtime keeps the action
     * visible but locked and offers to install the addon instead of running it.
     */
    requiresAddon?: {
        key: string;
        name?: string;
        reason?: string;
    };
    /**
     * Manifest v3 `priority`: "primary" = la única acción destacada; "secondary"
     * = compartir/imprimir/correo/chat, que el host manda al pie del documento
     * y al «Más…» del menú de fila. Sin valor se clasifica por convención.
     */
    priority?: ActionPriority;
}
export type ActionPriority = 'primary' | 'secondary';
export interface ActionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    action: ActionMetadata;
    model: string;
    record: any;
    endpoint?: string;
    onSuccess: () => void;
}
type ActionComponentEntry = ComponentType<ActionModalProps>;
/**
 * Subscribe to registry changes (register / unregister). Federated remotes
 * register after the host has already rendered, so readers use this with
 * `useSyncExternalStore` to pick the component up the moment it lands.
 * Returns the unsubscribe function.
 */
export declare function subscribeActionComponents(listener: () => void): () => void;
export declare function registerActionComponent(model: string, actionKey: string, component: ActionComponentEntry, owner?: string): void;
export declare function getActionComponent(model: string, actionKey: string): ActionComponentEntry | undefined;
export declare function hasActionComponent(model: string, actionKey: string): boolean;
export declare function unregisterActionComponent(model: string, actionKey: string): void;
/** Drop every action modal owned by `addonKey`. Used on fiber unbind. */
export declare function unregisterActionComponentsByOwner(addonKey: string): number;
export interface ModalComponentEntry {
    slug: string;
    /** Addon dueño: si no está instalado y activo, el host no lo resuelve. */
    owner?: string;
    /** Componente ya cargado… */
    component?: ComponentType<any>;
    /** …o loader perezoso del remote federado (`() => import('addon/Modal')`). */
    load?: () => Promise<{
        default: ComponentType<any>;
    }>;
}
/**
 * Registra el modal del slug. Re-registrar el mismo slug reemplaza. Devuelve el
 * disposer (no borra si otro registro ya lo reemplazó).
 */
export declare function registerModalComponent(entry: ModalComponentEntry): () => void;
export declare function getModalComponent(slug: string): ModalComponentEntry | undefined;
/** `<addon>.<nombre>` → `<addon>`; sin punto no hay dueño deducible. */
export declare function ownerOfSlug(slug: string): string | undefined;
export interface RecordActionContext {
    model: string;
    record: Record<string, unknown>;
}
export interface RecordActionItem {
    key: string;
    label: string;
    icon?: string;
    run: () => unknown;
}
export interface RecordActionContribution {
    /** Id estable `<proveedor>.<nombre>`. Re-registrar el mismo id reemplaza. */
    id: string;
    /** Clave i18n o literal. */
    label?: string;
    /** Ícono lucide. */
    icon?: string;
    /** Modelos donde aplica (clave o tabla, como el host la nombre). Default: todos. */
    models?: string[] | '*';
    /** Default "secondary": una contribución externa nunca roba la primaria. */
    priority?: ActionPriority;
    /**
     * Proveedor que debe estar instalado y activo. `addon` = clave del addon;
     * `capability` = contrato `provides_capabilities` (cualquier addon que lo
     * provea, o el host si es core). Sin `requires` vale el dueño del registro.
     */
    requires?: {
        addon?: string;
        capability?: string;
    };
    /** Menor = antes. Default 0. */
    order?: number;
    when?: (ctx: RecordActionContext) => boolean;
    run?: (ctx: RecordActionContext) => unknown;
    /** Una entrada por elemento (p. ej. un PDF por plantilla del modelo). */
    expand?: (ctx: RecordActionContext) => RecordActionItem[];
    /** Pinta su propio control en la barra secundaria (no aparece en el menú de fila). */
    render?: ComponentType<RecordActionContext>;
}
export interface OwnedRecordAction {
    contribution: RecordActionContribution;
    owner?: string;
}
export declare function registerRecordAction(c: RecordActionContribution, owner?: string): () => void;
/** Snapshot estable (cambia de identidad sólo al registrar/quitar): apto para useSyncExternalStore. */
export declare function listRecordActions(): readonly OwnedRecordAction[];
/** Quita modales y acciones de registro de `addonKey` (fiber unbind). */
export declare function unregisterContributionsByOwner(addonKey: string): number;
export type BridgedActionProps = ActionModalProps & {
    recordId: string;
    payload: Record<string, unknown>;
    close: (result?: unknown) => void;
};
export declare function closeResultIsSuccess(result: unknown): boolean;
export declare function adaptActionProps(p: ActionModalProps): BridgedActionProps;
export declare function withAdaptedActionProps(component: ComponentType<any>): ComponentType<ActionModalProps>;
export {};
//# sourceMappingURL=action-registry.d.ts.map