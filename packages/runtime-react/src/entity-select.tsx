// EntitySelect — the shared, permission-aware single-select for a related model.
//
// Now a thin configuration of <RecordPicker> (record-picker.tsx); prefer it for
// new screens. Kept with its exact props for consumers (POS, collections and
// other federated addons).
//
// A searchable async combobox over a kernel model's records, plus the two
// affordances every "pick a related record" control should have, exactly like
// the dynamic create modal's relation fields (Categoría/Marca) do:
//
//   - nothing selected → a "+" that opens the model's CREATE dialog, and
//     auto-selects the record it creates;
//   - a record selected → a pencil that opens that record's EDIT dialog.
//
// Both affordances are gated by the kernel permissions (useCan): the "+" only
// shows when the user can create the model, the pencil only when they can edit
// it. Everything is DYNAMIC — the create/edit form comes from the model's
// `/metadata/modal/:model` schema via <CreateRecordDialog>, so no per-model form
// code is needed. This lives in the SDK so POS, purchases and any future addon
// share ONE implementation instead of each re-porting a bespoke picker.
import type { LucideIcon } from 'lucide-react'
import { RecordPicker, useLatestSearch } from './record-picker'
import { recordLabel } from './record-picker-actions'
import { useRecordPickerDialog } from './record-picker-dialog'
import { useCan } from './permissions-context'

/** One searchable option: `value` is the id, `label` the display text. */
export interface EntitySelectOption {
    value: string
    label: string
    description?: string
}

export interface EntitySelectProps {
    /** Kernel model key (e.g. "Supplier", "Warehouse", "Category"). */
    model: string
    /** Currently selected id (or null). */
    value: string | null
    /** Label of the selected record (rendered without a re-fetch). */
    label: string | null
    /** Called with (id, label) on select/create/clear. */
    onSelect: (id: string | null, label: string | null) => void
    /** Async search over the model. Callers pass their `/api/options/<model>` fetcher. */
    fetcher: (q: string, signal: AbortSignal) => Promise<EntitySelectOption[]>

    icon?: LucideIcon
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    /** Preload first results on open and drop the 2-char gate. */
    preload?: boolean

    /**
     * Permission overrides. By default create/edit are gated by the kernel
     * permissions `<model>.create` / `<model>.update` (useCan). Pass explicit
     * booleans to force them (e.g. a read-only surface).
     */
    canCreate?: boolean
    canEdit?: boolean

    /**
     * CRUD endpoint base for the create/edit dialog. Defaults to the standard
     * org-scoped `/data/<model>/me`, with edit at `/data/<model>/me/<id>`.
     */
    endpoint?: string
    /** Record field used as the label after create/edit (default "name"). */
    labelField?: string
    /** Disable the whole control. */
    disabled?: boolean

    /**
     * Values seeded into the create dialog's form (e.g. a parent id the caller
     * already knows — a POS sale's selected customer, when creating a vehicle
     * from the vehicle picker). Passed through to `CreateRecordDialog.defaults`.
     */
    createDefaults?: Record<string, unknown>
    /**
     * Field keys from `createDefaults` that must also render locked (visible,
     * disabled) on create instead of editable — e.g. don't let the user swap
     * the customer while creating their vehicle from this picker. Passed
     * through to `CreateRecordDialog.lockedFields`.
     */
    lockedCreateFields?: string[]
}

/** Lowercase model → permission capability namespace (Supplier → supplier). */
function capabilityNamespace(model: string): string {
    return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * @deprecated Thin wrapper over {@link RecordPicker}; prefer it for new code.
 */
export function EntitySelect({
    model,
    value,
    label,
    onSelect,
    fetcher,
    icon,
    placeholder = 'Seleccionar…',
    searchPlaceholder = 'Buscar…',
    emptyText = 'Sin resultados',
    preload = false,
    canCreate,
    canEdit,
    endpoint,
    labelField = 'name',
    disabled = false,
    createDefaults,
    lockedCreateFields,
}: EntitySelectProps) {
    const can = useCan()
    const ns = capabilityNamespace(model)
    const mayCreate = canCreate ?? can(`${ns}.create`)
    const mayEdit = canEdit ?? can(`${ns}.update`)

    // Read the {id,label} off a saved record and select it (create) or
    // refresh its label (edit).
    const { openCreate, openEdit, dialog } = useRecordPickerDialog({
        model,
        endpoint,
        prefillField: labelField,
        createDefaults,
        lockedCreateFields,
        onSaved: (rec) => {
            const id = rec.id != null ? String(rec.id) : value ?? ''
            onSelect(id, recordLabel(rec, labelField) ?? label ?? id)
        },
    })
    const search = useLatestSearch(fetcher)

    return (
        <>
            <RecordPicker<EntitySelectOption>
                slot="entity-select"
                search={search}
                minChars={preload ? 0 : 2}
                minCharsText="Escribe al menos 2 caracteres"
                getKey={(o) => o.value}
                getLabel={(o) => o.label}
                getDescription={(o) => o.description}
                showCheck={false}
                value={value}
                selected={value ? { value, label: label ?? value } : null}
                onSelect={(o) => onSelect(o.value, o.label)}
                onClear={() => onSelect(null, null)}
                icon={icon}
                placeholder={placeholder}
                renderValue={(sel) => (
                    <span className={'min-w-0 flex-1 truncate' + (sel ? '' : ' text-muted-foreground')}>{label ?? placeholder}</span>
                )}
                searchPlaceholder={searchPlaceholder}
                emptyText={emptyText}
                entityLabel={model}
                onCreate={mayCreate ? (q) => openCreate(q) : undefined}
                onEdit={mayEdit && value ? () => openEdit(value) : undefined}
                disabled={disabled}
            />
            {dialog}
        </>
    )
}
