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
export interface ActionMetadata {
    key: string;
    label: string;
    icon: string;
    color?: string;
    confirm?: boolean;
    confirmMessage?: string;
    fields?: ActionFieldDef[];
    requiresState?: string[];
    executable?: boolean;
    /** Optional modal slug "<addon_key>.<action_key>" pointing at a registered custom component. */
    modal?: string;
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