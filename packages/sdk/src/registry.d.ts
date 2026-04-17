/**
 * Runtime registry an addon populates to contribute UI to the host.
 *
 * An addon's `Plugin.register(api)` pushes modals, routes, widgets and
 * action components. Host renders them through `<Slot>` and reads routes
 * to wire its router.
 */
import type { ComponentType } from "react";
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
    /** Lower renders first. */
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
} | {
    type: "modal";
    contribution: ModalContribution;
} | {
    type: "action";
    contribution: ActionContribution;
} | {
    type: "slot";
    contribution: SlotContribution;
};
export interface RegistryListener {
    (event: RegistryEvent): void;
}
/**
 * Registry is shared across all addons within a single host shell.
 * The host creates exactly one and hands `AddonAPI` to each plugin.
 */
export declare class Registry {
    private routes;
    private modals;
    private actions;
    private slots;
    private listeners;
    registerRoute(c: RouteContribution): void;
    registerModal(c: ModalContribution): void;
    registerAction(c: ActionContribution): void;
    registerSlot(c: SlotContribution): void;
    getRoutes(): RouteContribution[];
    getModal(slug: string): ModalContribution | undefined;
    getAction(model: string, action: string): ActionContribution | undefined;
    getSlot(name: string): SlotContribution[];
    subscribe(fn: RegistryListener): () => void;
    private emit;
}
//# sourceMappingURL=registry.d.ts.map