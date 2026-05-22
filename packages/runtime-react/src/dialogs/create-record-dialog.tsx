/**
 * CreateRecordDialog — generic record create/edit dialog.
 *
 * Thin wrapper around the underlying `DynamicRecordDialog` that exposes a
 * narrower, intent-specific API (`onCreate` / `onUpdate` callbacks, `defaults`)
 * matching the Wave 2.5 cleanup spec. Callers that need the full mode-switched
 * dialog (including the read-only `view` mode) should reach for
 * `DynamicRecordDialog` directly.
 *
 * When `recordId` is supplied, the dialog operates in edit mode; otherwise it
 * starts in create mode. Callbacks (`onCreate`, `onUpdate`) are optional —
 * when omitted, the dialog falls back to the configured `useApi()` transport
 * with the default `/dynamic/${modelKey}` endpoint convention.
 */
import { DynamicRecordDialog } from './dynamic-record'
import type { CreateRecordDialogProps } from './types'

export function CreateRecordDialog({
    modelKey,
    open,
    onOpenChange,
    recordId,
    endpoint,
    schema,
    defaults,
    onCreate,
    onUpdate,
    onSaved,
}: CreateRecordDialogProps) {
    const mode = recordId ? 'edit' : 'create'
    return (
        <DynamicRecordDialog
            open={open}
            onOpenChange={onOpenChange}
            mode={mode}
            model={modelKey}
            recordId={recordId}
            endpoint={endpoint}
            schema={schema}
            defaults={defaults}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onSaved={onSaved}
        />
    )
}
