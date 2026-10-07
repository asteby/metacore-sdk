// useRecordPickerDialog — create/edit plumbing for pickers on hand-written
// screens that sit outside the host's RecordCreateBridge (POS, federated
// panels): the in-tree, metadata-driven <CreateRecordDialog> posting to the
// standard org-scoped CRUD (`/data/<model>/me`). Declarative pickers use the
// host events instead (requestRecordCreate / requestRecordEdit).
//
// One implementation for EntitySelect, CustomerPicker and VehiclePicker: the
// searched text prefills the new record's label field, the saved record is
// handed back to select it (create) or refresh its label (edit).
import { useState, type ReactNode } from 'react'
import { CreateRecordDialog } from './dialogs/create-record-dialog'
import { useApi } from './api-context'
import { withSearchPrefill } from './record-picker-actions'

export interface UseRecordPickerDialogOptions {
    /** Kernel model key. */
    model: string
    /** CRUD base. Default `/data/<model>/me`; edit PUTs `<base>/<id>`. */
    endpoint?: string
    /** Field seeded with the searched text on create (null = none). Default "name". */
    prefillField?: string | null
    /** Seed values for create (win over the prefill). */
    createDefaults?: Record<string, unknown>
    /** Fields of `createDefaults` rendered locked on create. */
    lockedCreateFields?: string[]
    /** The saved record (`{ id, ...fields }`). */
    onSaved: (record: Record<string, unknown>, kind: 'create' | 'edit') => void
}

export interface UseRecordPickerDialogResult {
    openCreate: (query?: string) => void
    openEdit: (id: string) => void
    /** Render it next to the picker. */
    dialog: ReactNode
}

const unwrap = (res: { data?: any }) => ((res.data?.data ?? res.data) ?? {}) as Record<string, unknown>

export function useRecordPickerDialog({
    model,
    endpoint,
    prefillField = 'name',
    createDefaults,
    lockedCreateFields,
    onSaved,
}: UseRecordPickerDialogOptions): UseRecordPickerDialogResult {
    const api = useApi()
    const base = endpoint ?? `/data/${model}/me`
    const [state, setState] = useState<{ recordId?: string; defaults?: Record<string, unknown> } | null>(null)

    const dialog = state ? (
        <CreateRecordDialog
            modelKey={model}
            open
            onOpenChange={(o) => {
                if (!o) setState(null)
            }}
            recordId={state.recordId}
            endpoint={base}
            defaults={state.recordId ? undefined : state.defaults}
            lockedFields={state.recordId ? undefined : lockedCreateFields}
            onCreate={async (data) => {
                const rec = unwrap(await api.post(base, data))
                onSaved(rec, 'create')
                return rec.id != null ? { id: String(rec.id) } : undefined
            }}
            onUpdate={async (id, data) => {
                const rec = unwrap(await api.put(`${base}/${id}`, data))
                onSaved({ ...rec, id: rec.id ?? id }, 'edit')
                return { id: String(id) }
            }}
        />
    ) : null

    return {
        openCreate: (query = '') => setState({ defaults: withSearchPrefill(query, prefillField, createDefaults) }),
        openEdit: (id: string) => setState({ recordId: id }),
        dialog,
    }
}
