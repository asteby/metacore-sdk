// useRecordPickerDialog — create/edit plumbing for pickers on hand-written
// screens that sit outside the host's RecordCreateBridge (POS, federated
// panels): the in-tree, metadata-driven <CreateRecordDialog> posting to the
// standard org-scoped CRUD (`/data/<model>/me`). Declarative pickers use the
// host events instead (requestRecordCreate / requestRecordEdit).
//
// One implementation for EntitySelect, CustomerPicker and VehiclePicker: the
// searched text prefills the new record's label field, the saved record is
// handed back to select it (create) or refresh its label (edit).
import { unwrapResponse } from '@asteby/metacore-lib/envelope'
import { useState, type ReactNode } from 'react'
import { CreateRecordDialog } from './dialogs/create-record-dialog'
import type { FieldDef } from './dialogs/dynamic-record'
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
    /** Fields merged into the modal schema (e.g. a `widget` field that fills siblings via `setValues`). */
    ensureFields?: FieldDef[]
    /**
     * Un injerto del modal (Loom `record.dialog.header`) detectó que el registro ya existe y pide
     * usarlo (`record.select`): se cierra el modal y se entrega el registro. Sin él, la intención
     * no se atiende y el injerto sigue su camino (p. ej. rellena el formulario).
     */
    onSelectExisting?: (record: Record<string, unknown>) => void
    /** The saved record (`{ id, ...fields }`). */
    onSaved: (record: Record<string, unknown>, kind: 'create' | 'edit') => void
}

export interface UseRecordPickerDialogResult {
    openCreate: (query?: string) => void
    openEdit: (id: string) => void
    /** Render it next to the picker. */
    dialog: ReactNode
}

const unwrapRecord = (res: { data?: unknown }) => unwrapResponse<Record<string, unknown> | null>(res) ?? {}

export function useRecordPickerDialog({
    model,
    endpoint,
    prefillField = 'name',
    createDefaults,
    lockedCreateFields,
    ensureFields,
    onSelectExisting,
    onSaved,
}: UseRecordPickerDialogOptions): UseRecordPickerDialogResult {
    const api = useApi()
    const base = endpoint ?? `/data/${model}/me`
    const [state, setState] = useState<{
        recordId?: string
        defaults?: Record<string, unknown>
        proposal?: { patch: Record<string, unknown>; reason?: string; apply?: 'review' | 'auto' }
    } | null>(null)

    // Intenciones Loom: `record.select` entrega el existente; `record.edit` reabre en edición con
    // el parche como propuesta revisable (nada se guarda sin confirmar).
    const onIntent = (intent: string, payload: unknown): boolean => {
        const p = (payload ?? {}) as {
            record?: Record<string, unknown>
            id?: unknown
            patch?: Record<string, unknown>
            reason?: string
            apply?: 'review' | 'auto'
        }
        if (intent === 'record.select' && onSelectExisting && p.record) {
            setState(null)
            onSelectExisting(p.record)
            return true
        }
        if (intent === 'record.edit' && p.id != null) {
            setState({ recordId: String(p.id), proposal: p.patch ? { patch: p.patch, reason: p.reason, apply: p.apply } : undefined })
            return true
        }
        return false
    }

    const dialog = state ? (
        <CreateRecordDialog
            key={state.recordId ?? 'new'}
            modelKey={model}
            open
            onOpenChange={(o) => {
                if (!o) setState(null)
            }}
            recordId={state.recordId}
            endpoint={base}
            defaults={state.recordId ? undefined : state.defaults}
            lockedFields={state.recordId ? undefined : lockedCreateFields}
            ensureFields={ensureFields}
            onIntent={onIntent}
            initialProposal={state.proposal}
            onCreate={async (data) => {
                const rec = unwrapRecord(await api.post(base, data))
                onSaved(rec, 'create')
                return rec.id != null ? { id: String(rec.id) } : undefined
            }}
            onUpdate={async (id, data) => {
                const rec = unwrapRecord(await api.put(`${base}/${id}`, data))
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
