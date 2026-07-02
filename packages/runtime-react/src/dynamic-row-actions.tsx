// useDynamicRowActions — the single source of truth for what a per-row action
// (the "…" kebab → Ver / Editar / Eliminar / custom / link) DOES when clicked.
//
// Extracted verbatim from DynamicTable so the kanban board's per-card menu
// behaves IDENTICALLY to a table row (it used to forward the raw action object
// to the host and silently no-op). Both renderers call the returned
// `handleInternalAction(actionKey, row)` with the action's STRING key and mount
// the returned `dialogs` node once in their tree:
//
//   delete                 → opens the SDK's own confirm dialog, then DELETEs.
//   view / edit            → host `onAction(action, row)` when provided (string
//                            contract), else the built-in record dialog.
//   link action            → navigate to the action's templated `linkUrl`.
//   custom (fields/confirm/
//   executable) action     → opens the ActionModal via the dispatcher.
//   anything else          → host `onAction` + refresh (or just refresh).
//
// The host `onAction` contract is a STRING action key on purpose — the existing
// ops `handleAction(action: string, row)` keeps working unchanged.
import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@asteby/metacore-ui/primitives'
import { useApi } from './api-context'
import { ActionModalDispatcher } from './action-modal-dispatcher'
import { DynamicRecordDialog } from './dialogs/dynamic-record'
import type { TableMetadata, ActionMetadata } from './types'

export interface UseDynamicRowActionsParams {
    /** Model key as registered on the backend (e.g. "issue"). */
    model: string
    /**
     * Data endpoint base. The per-record DELETE hits `<endpoint>/<id>`; when
     * omitted it falls back to `/data/<model>/<id>`. Pass the SAME base the
     * caller lists from (e.g. `/data/<model>/me`) so writes stay org-scoped.
     */
    endpoint?: string
    /** Raw model metadata — used to resolve link/custom action definitions. */
    metadata: TableMetadata | null
    /**
     * Host hook for `view`/`edit` (and any unhandled key). STRING contract:
     * receives the action key, not the action object. When absent, `view`/`edit`
     * fall back to the built-in record dialog.
     */
    onAction?: (action: string, row: any) => void
    /** Called after a successful delete / custom action to refetch the list. */
    onRefresh: () => void
}

export interface DynamicRowActions {
    /** Dispatch a row action by its STRING key. */
    handleInternalAction: (action: string, row: any) => Promise<void>
    /**
     * The delete-confirm dialog + record dialog + action modal this handler
     * drives. Render it ONCE in the consuming component's tree.
     */
    dialogs: React.ReactElement
}

/**
 * Owns the state + dialogs + dispatch logic for per-row actions, shared by
 * DynamicTable and DynamicKanban so both behave identically.
 */
export function useDynamicRowActions({
    model,
    endpoint,
    metadata,
    onAction,
    onRefresh,
}: UseDynamicRowActionsParams): DynamicRowActions {
    const { t } = useTranslation()
    const api = useApi()
    const navigate = useNavigate()

    const [recordDialog, setRecordDialog] = useState<{
        open: boolean
        mode: 'view' | 'edit' | 'create'
        recordId: string | null
    }>({ open: false, mode: 'view', recordId: null })

    const [rowToDelete, setRowToDelete] = useState<any | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [actionModal, setActionModal] = useState<{
        open: boolean
        action: ActionMetadata | null
        record: any | null
    }>({ open: false, action: null, record: null })

    const handleInternalAction = useCallback(async (action: string, row: any) => {
        if (action === 'delete') { setRowToDelete(row); return }
        if (action === 'view' || action === 'edit') {
            if (onAction) await Promise.resolve(onAction(action, row))
            else setRecordDialog({ open: true, mode: action, recordId: row.id })
            return
        }
        const linkDef = metadata?.actions?.find((a) => a.key === action && a.type === 'link')
        if (linkDef?.linkUrl) {
            const url = linkDef.linkUrl.replace(/\{(\w+)\}/g, (_: string, field: string) => String(row[field] ?? ''))
            navigate({ to: url })
            return
        }
        const actionDef = metadata?.actions?.find((a) => a.key === action)
        if (actionDef && (actionDef.fields?.length || actionDef.confirm || actionDef.executable)) {
            setActionModal({
                open: true,
                action: {
                    key: actionDef.key,
                    label: actionDef.label,
                    icon: actionDef.icon || 'Zap',
                    color: actionDef.color,
                    confirm: actionDef.confirm,
                    confirmMessage: actionDef.confirmMessage,
                    fields: actionDef.fields,
                    requiresState: actionDef.requiresState,
                    executable: actionDef.executable,
                },
                record: row,
            })
            return
        }
        if (onAction) { await Promise.resolve(onAction(action, row)); onRefresh() }
        else onRefresh()
    }, [onAction, onRefresh, metadata, navigate])

    const confirmDelete = async () => {
        if (!rowToDelete) return
        setIsDeleting(true)
        try {
            const deleteEndpoint = endpoint ? `${endpoint}/${rowToDelete.id}` : `/data/${model}/${rowToDelete.id}`
            const res = await api.delete(deleteEndpoint)
            // CRUD estándar: no usar res.data.message (el endpoint dinámico
            // devuelve texto en inglés que se filtraría al toast). String localizado.
            if (res.data.success) { toast.success(t('dynamic.delete_success', { defaultValue: 'Registro eliminado correctamente' })); onRefresh() }
            else toast.error(t('dynamic.delete_error', { defaultValue: 'No se pudo eliminar el registro' }))
        } catch (error) {
            console.error('Error al eliminar', error)
            toast.error(t('dynamic.delete_error', { defaultValue: 'No se pudo eliminar el registro' }))
        } finally {
            setIsDeleting(false)
            setRowToDelete(null)
        }
    }

    const dialogs = (
        <>
            <AlertDialog open={!!rowToDelete} onOpenChange={(open: boolean) => !open && setRowToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>Esta acción no se puede deshacer. Esto eliminará permanentemente el registro seleccionado de nuestros servidores.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={(e: React.MouseEvent) => { e.preventDefault(); confirmDelete() }} className="bg-red-600 hover:bg-red-700" disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Eliminar'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DynamicRecordDialog
                open={recordDialog.open}
                onOpenChange={(open: boolean) => setRecordDialog((prev) => ({ ...prev, open }))}
                mode={recordDialog.mode}
                model={model}
                recordId={recordDialog.recordId}
                endpoint={endpoint}
                onSaved={onRefresh}
            />

            {actionModal.action && (
                <ActionModalDispatcher
                    open={actionModal.open}
                    onOpenChange={(open: boolean) => setActionModal((prev) => ({ ...prev, open }))}
                    action={actionModal.action}
                    model={model}
                    record={actionModal.record}
                    endpoint={endpoint}
                    onSuccess={onRefresh}
                />
            )}
        </>
    )

    return { handleInternalAction, dialogs }
}
