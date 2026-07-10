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
}
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
export declare function registerActionComponent(model: string, actionKey: string, component: ActionComponentEntry): void;
export declare function getActionComponent(model: string, actionKey: string): ActionComponentEntry | undefined;
export declare function hasActionComponent(model: string, actionKey: string): boolean;
export declare function unregisterActionComponent(model: string, actionKey: string): void;
export {};
//# sourceMappingURL=action-registry.d.ts.map