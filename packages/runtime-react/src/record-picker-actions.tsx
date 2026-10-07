// RecordPickerActions — create/edit affordances shared by every "pick a related
// record" control (DynamicSelectField for declarative forms, EntitySelect for
// hand-written screens). ONE implementation of the same contract:
//
//   - nothing selected → "+" joined to the trigger: opens the model's CREATE
//     modal and the new record ends up selected;
//   - a record selected → pencil joined to the trigger: opens THAT record's
//     EDIT modal and the label refreshes on save;
//   - "Crear …" at the foot of the result list, so creating is one step away
//     from a search with no hits.
//
// The action renders as a segment of the trigger (shared border, no gap) so the
// control reads as a single field instead of a select plus a loose button.
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
}

/**
 * Joined trailing segment: pencil when there is a value (and `onEdit`), "+"
 * otherwise (and `onCreate`). Renders nothing when neither applies — callers
 * should then drop {@link JOINED_TRIGGER_CLASS} from the trigger.
 */
export function RecordPickerAction({ hasValue, label, onCreate, onEdit, disabled }: RecordPickerActionProps) {
    const edit = hasValue && !!onEdit
    const create = !hasValue && !!onCreate
    if (!edit && !create) return null
    const name = edit ? `Editar ${label}` : `Crear ${label}`
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
            className="-ml-px size-9 shrink-0 rounded-l-none text-muted-foreground hover:text-foreground focus-visible:z-10"
        >
            {edit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        </Button>
    )
}

/** True when a picker will render a joined action for the given state. */
export function hasRecordPickerAction(hasValue: boolean, onCreate?: unknown, onEdit?: unknown): boolean {
    return hasValue ? !!onEdit : !!onCreate
}

/** "Crear …" row at the foot of a Command list. */
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
