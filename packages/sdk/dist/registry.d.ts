/**
 * Runtime registry an addon populates to contribute UI to the host.
 *
 * An addon's `Plugin.register(api)` pushes modals, routes, widgets and
 * action components. Host renders them through `<Slot>` and reads routes
 * to wire its router.
 *
 * Contributions are tagged with an owner addon key when registered through
 * {@link Registry.scope}. {@link Registry.unbind} drops every contribution
 * of that owner so a fiber can remount without leaking routes/actions/slots
 * — the Cordis dispose equivalent for the host UI registry.
 *
 * Write-through: modales, acciones de registro y slots se publican además en
 * los stores canónicos (action-registry.ts / slot-store.ts) con su addon
 * dueño, que es lo que leen ActionModalDispatcher, `<Slot>` de runtime-react y
 * los menús de acciones. Los getters de esta clase siguen sirviendo a quien
 * los use (sdk/react `<Slot>`, rutas), pero la fuente de verdad es el store.
 */
import type { ComponentType } from "react";
import { type RecordPrefillContribution } from "./record-prefill-registry.js";
import { type RecordActionContribution } from "./action-registry.js";
export interface RouteContribution {
    path: string;
    component: ComponentType<unknown>;
    /** Optional parent layout — defaults to the authenticated layout. */
    layout?: string;
}
export interface ModalContribution {
    /** Key used by manifest action defs (`actions[model][].modal`). */
    slug: string;
    component: ComponentType<ModalProps>;
}
export interface ActionContribution {
    model: string;
    action: string;
    component: ComponentType<ActionProps>;
}
export interface SlotContribution {
    /** Slot name: "invoice.header.right", "dashboard.widget", etc. */
    name: string;
    component: ComponentType<unknown>;
    /** Sort weight; higher renders first. Default 0. See docs/slot-priority.md. */
    priority?: number;
}
export interface ModalProps {
    payload: Record<string, unknown>;
    close: (result?: unknown) => void;
}
export interface ActionProps {
    recordId: string;
    payload: Record<string, unknown>;
    close: (result?: unknown) => void;
}
export type RegistryEvent = {
    type: "route";
    contribution: RouteContribution;
    owner?: string;
} | {
    type: "modal";
    contribution: ModalContribution;
    owner?: string;
} | {
    type: "action";
    contribution: ActionContribution;
    owner?: string;
} | {
    type: "slot";
    contribution: SlotContribution;
    owner?: string;
} | {
    type: "unbind";
    addonKey: string;
};
export interface RegistryListener {
    (event: RegistryEvent): void;
}
/** Mutators handed to an addon via AddonAPI — always scoped to one owner. */
export interface ScopedRegistry {
    registerRoute(c: RouteContribution): void;
    registerModal(c: ModalContribution): void;
    registerAction(c: ActionContribution): void;
    registerSlot(c: SlotContribution): void;
    /** Ayudante de captura en el formulario genérico de un modelo (p. ej. CSF en Customer). */
    registerRecordPrefill(c: RecordPrefillContribution): void;
    /**
     * Acción secundaria sobre registros (compartir, imprimir, enviar…). Se pinta
     * en el «Más…» del menú de fila y en el pie del documento sólo mientras este
     * addon (o el proveedor de `requires`) esté instalado y activo.
     */
    registerRecordAction(c: RecordActionContribution): void;
}
/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands a {@link Registry.scope scoped}
 * view to each plugin so {@link Registry.unbind} can tear a fiber down.
 */
export declare class Registry {
    private routes;
    private modals;
    private actions;
    private slots;
    private listeners;
    /**
     * Scoped mutators for one addon. Every contribution is tagged with
     * `addonKey` so a later {@link unbind} can drop them as a unit.
     */
    scope(addonKey: string): ScopedRegistry;
    /**
     * Drop every contribution owned by `addonKey`. Idempotent. Emits one
     * `{ type: "unbind" }` event so host subscribers (routes, slots, action
     * bridge) refresh. Returns how many contributions were removed.
     */
    unbind(addonKey: string): number;
    registerRoute(c: RouteContribution, owner?: string): void;
    registerModal(c: ModalContribution, owner?: string): void;
    registerAction(c: ActionContribution, owner?: string): void;
    registerSlot(c: SlotContribution, owner?: string): void;
    getRoutes(): RouteContribution[];
    getModal(slug: string): ModalContribution | undefined;
    getAction(model: string, action: string): ActionContribution | undefined;
    getSlot(name: string): SlotContribution[];
    subscribe(fn: RegistryListener): () => void;
    private emit;
}
//# sourceMappingURL=registry.d.ts.map