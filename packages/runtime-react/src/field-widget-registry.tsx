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
// The registry itself is the shared `createWidgetRegistry` (also used by relation
// widgets): module-level singleton, observable so a federated addon that registers
// after first paint re-renders the fields that were waiting for it.
import type * as React from 'react'
import type { ActionFieldDef } from './types'
import { createWidgetRegistry } from './widget-registry'

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

const registry = createWidgetRegistry<FieldWidgetComponent>()

/**
 * Registers the component that renders fields declaring `widget: <name>`.
 * Returns a disposer; a later registration for the same name replaces the
 * earlier one, and the earlier disposer then leaves the newer one alone.
 */
export const registerFieldWidget = registry.register

/** The component registered for `name`, or undefined (never throws). */
export const getFieldWidget = registry.get

/** Registered widget names, for diagnostics. */
export const listFieldWidgets = registry.list

export const clearFieldWidgets = registry.clear

/** Re-renders the caller whenever a widget is (un)registered. */
export const useFieldWidgetRegistryVersion = registry.useVersion
