/**
 * Shared types for record-oriented dialogs in `@asteby/metacore-runtime-react`.
 *
 * These dialogs are intentionally generic: any addon that drives a metadata-
 * backed CRUD surface can render them by passing a `modelKey`. The dialogs
 * resolve field shape, labels, and validation hints from the metadata server
 * (default: `/metadata/modal/:modelKey`) via the configured `useApi()`
 * transport. Hosts may override transport behaviour by supplying explicit
 * `endpoint` overrides and/or `onCreate` / `onDelete` callbacks.
 *
 * Wave 2.5 cleanup — replaces the product-specific dialogs that used to live
 * in `ops/frontend/src/components/dynamic/` for any record kind that does not
 * need pricing rules, media galleries, or category-driven custom fields.
 */

/**
 * Identifier for a model registered with the metadata service. The wire format
 * is a plain string (e.g. `"products"`, `"organizations"`, `"users"`). The
 * dialogs do not interpret this value; it is forwarded to the API transport.
 */
export type ModelKey = string

/**
 * Optional schema hint, accepted only as a passthrough for hosts that want to
 * supply pre-fetched metadata instead of waiting for the dialog to call
 * `/metadata/modal/:modelKey`. The runtime intentionally keeps the shape loose
 * because metadata is owned by each backend addon.
 */
export interface ModelSchema {
    title?: string
    createTitle?: string
    editTitle?: string
    fields?: Array<{
        key: string
        label: string
        type: string
        required?: boolean
        defaultValue?: unknown
        placeholder?: string
        readonly?: boolean
        hidden?: boolean
        // additional metadata may be present; the dialogs treat it as opaque
        [extra: string]: unknown
    }>
}

/**
 * Result shape returned by `onCreate` callbacks. Hosts may return `void` if
 * the resulting record id is not needed downstream.
 */
export type CreateResult = { id: string } | void

/**
 * Base props shared by every record dialog.
 */
export interface RecordDialogProps {
    /** Model key forwarded to the metadata service and transport calls. */
    modelKey: ModelKey
    /** Controlled open state. */
    open: boolean
    /** Open-state controller. */
    onOpenChange: (open: boolean) => void
    /**
     * Optional custom endpoint base. When provided, the dialog uses
     * `${endpoint}` (for create/list) and `${endpoint}/${recordId}` (for
     * fetch/update/delete). When omitted, the dialog uses
     * `/dynamic/${modelKey}` / `/dynamic/${modelKey}/${recordId}`.
     */
    endpoint?: string
    /**
     * Optional pre-fetched schema. When omitted, the dialog fetches metadata
     * from `/metadata/modal/${modelKey}` via the configured API transport.
     */
    schema?: ModelSchema
}

/**
 * Props for the create / edit dialog.
 *
 * When `recordId` is provided the dialog operates in edit mode; otherwise it
 * starts in create mode. Supplying `onCreate` overrides the default transport
 * call so that hosts may route writes through custom mutations (optimistic
 * updates, audit hooks, etc.). The default behaviour POSTs/PUTs through the
 * configured `useApi()` transport.
 */
export interface CreateRecordDialogProps extends RecordDialogProps {
    /** When set, the dialog operates as an editor for this record id. */
    recordId?: string | null
    /**
     * Optional override invoked instead of the default POST. The dialog still
     * closes and calls `onSaved` on success. Hosts that need to support both
     * create and edit through callbacks should also pass `onUpdate`.
     */
    onCreate?: (data: Record<string, unknown>) => Promise<CreateResult>
    /**
     * Optional override invoked instead of the default PUT when `recordId`
     * is provided.
     */
    onUpdate?: (recordId: string, data: Record<string, unknown>) => Promise<CreateResult>
    /** Default values seeded into the form on create. */
    defaults?: Record<string, unknown>
    /** Notification when a create or update succeeds. */
    onSaved?: () => void
}

/**
 * Props for the read-only viewer dialog.
 */
export interface ViewRecordDialogProps extends RecordDialogProps {
    /** Identifier of the record to display. */
    recordId: string
    /** Optional handler triggered by the "Edit" affordance. */
    onEdit?: () => void
    /**
     * Optional handler triggered by the "Delete" affordance. When omitted the
     * delete button is hidden. The dialog awaits the promise before closing.
     */
    onDelete?: () => Promise<void>
}
