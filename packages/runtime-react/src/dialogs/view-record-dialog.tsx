/**
 * ViewRecordDialog — read-only record viewer with optional edit/delete
 * affordances.
 *
 * Thin wrapper around `DynamicRecordDialog` (mode = `'view'`) that exposes a
 * narrower, intent-specific API matching the Wave 2.5 cleanup spec.
 * The "Edit" and "Delete" footer buttons are only rendered when the host
 * supplies `onEdit` / `onDelete`, so the dialog gracefully degrades to a
 * pure viewer when those affordances are not needed.
 */
import { DynamicRecordDialog } from './dynamic-record'
import type { ViewRecordDialogProps } from './types'

export function ViewRecordDialog({
    modelKey,
    open,
    onOpenChange,
    recordId,
    endpoint,
    schema,
    onEdit,
    onDelete,
}: ViewRecordDialogProps) {
    return (
        <DynamicRecordDialog
            open={open}
            onOpenChange={onOpenChange}
            mode="view"
            model={modelKey}
            recordId={recordId}
            endpoint={endpoint}
            schema={schema}
            onEdit={onEdit}
            onDelete={onDelete}
        />
    )
}
