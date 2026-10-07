// RecordPickerActions — create/edit affordances of the shared <RecordPicker>
// (record-picker.tsx), the ONE "pick a related record" control of the runtime.
// Every picker (DynamicSelectField, EntitySelect, the business pickers) gets
// the same contract from here:
//
//   - nothing selected → "+" joined to the trigger: opens the model's CREATE
//     modal and the new record ends up selected;
//   - a record selected → pencil joined to the trigger: opens THAT record's
//     EDIT modal and the label refreshes on save;
//   - "Crear …" at the foot of the result list, so creating is one step away
//     from a search with no hits (prefilled with the searched text).
//
// The action renders as a segment of the trigger (shared border, no gap) so the
// control reads as a single field instead of a select plus a loose button.
//
// The create/edit modals themselves are the HOST's (decoupled window events the
// host's RecordCreateBridge listens for) or, for hand-written screens, the
// in-tree <CreateRecordDialog> (see record-picker-dialog.tsx).
import type { ReactNode } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button, CommandGroup, CommandItem, CommandSeparator } from '@asteby/metacore-ui/primitives'

/** Classes for a trigger that has a joined action segment on its right. */
export const JOINED_TRIGGER_CLASS = 'rounded-r-none focus-visible:z-10'

export interface RecordPickerActionProps {
    /** Current value: drives create (+) vs edit (pencil). */
    hasValue: boolean
    /** Human label of the referenced model / field, for the accessible name. */
    label: string
    onCreate?: () => void
    onEdit?: () => void
    disabled?: boolean
    /** Accessible name override for the "+" (default `Crear <label>`). */
    createLabel?: string
    /** Accessible name override for the pencil (default `Editar <label>`). */
    editLabel?: string
    /** `cell` → compact, borderless segment for table cells. */
    variant?: 'field' | 'cell'
    className?: string
}

/**
 * Joined trailing segment: pencil when there is a value (and `onEdit`), "+"
 * otherwise (and `onCreate`). Renders nothing when neither applies — callers
 * should then drop {@link JOINED_TRIGGER_CLASS} from the trigger.
 */
export function RecordPickerAction({
    hasValue,
    label,
    onCreate,
    onEdit,
    disabled,
    createLabel,
    editLabel,
    variant = 'field',
    className,
}: RecordPickerActionProps) {
    const edit = hasValue && !!onEdit
    const create = !hasValue && !!onCreate
    if (!edit && !create) return null
    const name = edit ? editLabel ?? `Editar ${label}` : createLabel ?? `Crear ${label}`
    const size = variant === 'cell' ? 'size-8 border-transparent bg-transparent shadow-none' : 'size-9'
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation()
                if (edit) onEdit?.()
                else onCreate?.()
            }}
            aria-label={name}
            title={name}
            data-slot="record-picker-action"
            data-action={edit ? 'edit' : 'create'}
            className={
                `-ml-px ${size} shrink-0 rounded-l-none text-muted-foreground hover:text-foreground focus-visible:z-10` +
                (className ? ` ${className}` : '')
            }
        >
            {edit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        </Button>
    )
}

/** True when a picker will render a joined action for the given state. */
export function hasRecordPickerAction(hasValue: boolean, onCreate?: unknown, onEdit?: unknown): boolean {
    return hasValue ? !!onEdit : !!onCreate
}

/**
 * "Crear …" row at the foot of a cmdk `<Command>` list.
 *
 * @deprecated <RecordPicker> renders its own create footer (with the searched
 * text prefilled). Kept for hand-written cmdk lists in consumers.
 */
export function PickerCreateItem({ label, onSelect, children }: { label: string; onSelect: () => void; children?: ReactNode }) {
    return (
        <>
            <CommandSeparator />
            <CommandGroup>
                <CommandItem value="__create__" onSelect={onSelect} data-slot="picker-create" className="text-primary">
                    <Plus className="mr-2 size-4 shrink-0" />
                    <span className="truncate">{children ?? `Crear ${label}`}</span>
                </CommandItem>
            </CommandGroup>
        </>
    )
}

// ---------------------------------------------------------------------------
// Host create/edit modal — decoupled window events.
//
// The SDK never imports host code: a picker fires `metacore:create-record` /
// `metacore:edit-record` and the host's RecordCreateBridge opens the model's
// REAL modal (full fields from /metadata/modal), handing the saved record back
// through the callback. Works for ANY model.
// ---------------------------------------------------------------------------

/** Detail of the `metacore:create-record` event (contract with the host). */
export interface RecordCreateRequest {
    model: string
    /** Seed values for the new record. Keys that aren't fields of the model are ignored by the dialog. */
    defaults?: Record<string, unknown>
    /** Fields rendered locked in the create modal. */
    lockedFields?: string[]
    onCreated?: (record: any) => void
}

/** Detail of the `metacore:edit-record` event (contract with the host). */
export interface RecordEditRequest {
    model: string
    recordId: string
    onSaved?: (record: any) => void
}

/** Ask the host to open `model`'s create modal. No-op outside a browser. */
export function requestRecordCreate(req: RecordCreateRequest): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('metacore:create-record', { detail: req }))
}

/** Ask the host to open the edit modal of `recordId`. No-op outside a browser. */
export function requestRecordEdit(req: RecordEditRequest): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('metacore:edit-record', { detail: req }))
}

/** Display label of a saved record: `labelField`, else name / label / title. */
export function recordLabel(rec: Record<string, unknown> | null | undefined, labelField = 'name'): string | undefined {
    if (!rec) return undefined
    for (const k of [labelField, 'name', 'label', 'title']) {
        const v = rec[k]
        if (v != null && v !== '') return String(v)
    }
    return undefined
}

/**
 * Create defaults with the searched text seeded into `field` (the model's
 * label column: name, plate…). Explicit `defaults` win over the prefill.
 */
export function withSearchPrefill(
    query: string | undefined,
    field: string | null | undefined,
    defaults?: Record<string, unknown>,
): Record<string, unknown> | undefined {
    const q = (query ?? '').trim()
    if (!q || !field) return defaults
    return { [field]: q, ...(defaults ?? {}) }
}
