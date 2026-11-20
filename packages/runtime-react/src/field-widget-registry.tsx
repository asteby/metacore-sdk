// Field widget registry. The kernel serves `FieldDef.Widget` (wire: `widget`)
// on modal/form fields; the SDK knows a closed set of built-ins (upload, icon,
// dynamic_select…). A host-specific widget — a map pin for latitude/longitude,
// a weekly schedule editor — plugs in by name, so `DefineModal` can declare
// `Widget: "map-pin"` and both `<DynamicRecordDialog>` and `<DynamicForm>`
// render the host's component:
//
//   import { registerFieldWidget } from '@asteby/metacore-runtime-react'
//
//   const dispose = registerFieldWidget('map-pin', MapPinWidget)
//
// The widget owns the field's value: it receives `value` and reports edits
// through `onChange`, with no access to the form internals. A name with no
// registration is ignored and the renderer falls back to its `type`-based
// default, exactly as before.
//
// Module-level singleton like the model-extension / agent-result registries,
// and observable so a federated addon that registers after first paint
// re-renders the fields that were waiting for it.
import * as React from 'react'
import type { ActionFieldDef } from './types'

export interface FieldWidgetProps {
    /** The served field definition (key, label, type, widget, options…). */
    field: ActionFieldDef
    /** Current value of the field. */
    value: any
    /** Report a new value for the field. */
    onChange: (value: any) => void
    /** The field is not editable right now (readonly / locked). */
    disabled?: boolean
    /** Validation message for the field, when there is one. */
    error?: string
    /**
     * Record the widget can read sibling fields from. In `DynamicForm` these are the
     * LIVE form values (they update as the user types, also in create mode); in the
     * record dialog (`EditField`) it is the loaded/edited record.
     */
    record?: Record<string, any>
    /**
     * Merge several sibling fields into the form at once. For widgets that fill
     * the form from an external source (a scanned document, a lookup) instead of
     * editing their own value. Absent where the host form cannot patch siblings.
     */
    setValues?: (patch: Record<string, any>) => void
}

export type FieldWidgetComponent = React.ComponentType<FieldWidgetProps>

const widgets = new Map<string, FieldWidgetComponent>()
const listeners = new Set<() => void>()
let version = 0

function emit(): void {
    version++
    listeners.forEach((l) => l())
}

/**
 * Registers the component that renders fields declaring `widget: <name>`.
 * Returns a disposer; a later registration for the same name replaces the
 * earlier one, and the earlier disposer then leaves the newer one alone.
 */
export function registerFieldWidget(name: string, component: FieldWidgetComponent): () => void {
    widgets.set(name, component)
    emit()
    return () => {
        if (widgets.get(name) === component) {
            widgets.delete(name)
            emit()
        }
    }
}

/** The component registered for `name`, or undefined (never throws). */
export function getFieldWidget(name?: string | null): FieldWidgetComponent | undefined {
    if (!name) return undefined
    return widgets.get(name)
}

/** Registered widget names, for diagnostics. */
export function listFieldWidgets(): string[] {
    return [...widgets.keys()]
}

export function clearFieldWidgets(): void {
    if (widgets.size === 0) return
    widgets.clear()
    emit()
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

/** Re-renders the caller whenever a widget is (un)registered. */
export function useFieldWidgetRegistryVersion(): number {
    return React.useSyncExternalStore(
        subscribe,
        () => version,
        () => version,
    )
}
