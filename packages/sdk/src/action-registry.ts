import { type ComponentType } from 'react'

// Canonical action registry. Hosts re-export this module so every addon
// modal lives in a single registry regardless of which host loaded it.

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

export interface ActionMetadata {
    key: string
    label: string
    icon: string
    color?: string
    confirm?: boolean
    confirmMessage?: string
    fields?: ActionFieldDef[]
    requiresState?: string[]
    executable?: boolean
    /** Optional modal slug "<addon_key>.<action_key>" pointing at a registered custom component. */
    modal?: string
}

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

const registry = new Map<string, ActionComponentEntry>()

const keyOf = (model: string, actionKey: string) => `${model}::${actionKey}`

export function registerActionComponent(
    model: string,
    actionKey: string,
    component: ActionComponentEntry,
) {
    registry.set(keyOf(model, actionKey), component)
}

export function getActionComponent(
    model: string,
    actionKey: string,
): ActionComponentEntry | undefined {
    return registry.get(keyOf(model, actionKey))
}

export function hasActionComponent(model: string, actionKey: string): boolean {
    return registry.has(keyOf(model, actionKey))
}

export function unregisterActionComponent(model: string, actionKey: string) {
    registry.delete(keyOf(model, actionKey))
}
