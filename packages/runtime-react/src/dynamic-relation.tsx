// DynamicRelation — primitivo metadata-driven que renderiza el lado N de una
// relación 1:N o N:N entre modelos. Cubre dos kinds:
//   - "one_to_many": lista inline editable que cuelga del registro padre.
//   - "many_to_many": multi-select sobre la tabla destino con sync a la pivot.
// La RFC completa vive en `packages/runtime-react/docs/relations.md`.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Button,
    Skeleton,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    MultiSelect,
} from '@asteby/metacore-ui/primitives'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { DynamicForm } from './dynamic-form'
import { useOptionsResolver } from './use-options-resolver'
import type { ApiResponse, TableMetadata } from './types'
import {
    buildCreatePayload,
    buildPivotAttachPayload,
    buildPivotRowIndex,
    buildRelationFilterParams,
    deriveRelationFormFields,
    diffSelection,
    extractSelectedTargetIds,
    pickOptionLabel,
    relationRowKey,
    type DynamicRelationKind,
} from './dynamic-relation-helpers'

export type { DynamicRelationKind } from './dynamic-relation-helpers'
export {
    buildCreatePayload,
    buildPivotAttachPayload,
    buildPivotRowIndex,
    buildRelationFilterParams,
    deriveRelationFormFields,
    diffSelection,
    extractSelectedTargetIds,
    pickOptionLabel,
    relationRowKey,
} from './dynamic-relation-helpers'

export interface DynamicRelationStrings {
    title: string
    emptyState: string
    addLabel: string
    editLabel: string
    removeLabel: string
    confirmRemoveTitle: string
    confirmRemoveDescription: string
    cancelLabel: string
    saveLabel: string
    selectPlaceholder: string
    selectSearchPlaceholder: string
    selectEmpty: string
}

const DEFAULT_STRINGS: DynamicRelationStrings = {
    title: '',
    emptyState: 'No hay registros relacionados.',
    addLabel: 'Agregar',
    editLabel: 'Editar',
    removeLabel: 'Quitar',
    confirmRemoveTitle: '¿Quitar el registro?',
    confirmRemoveDescription: 'Esta acción no se puede deshacer.',
    cancelLabel: 'Cancelar',
    saveLabel: 'Guardar',
    selectPlaceholder: 'Seleccionar…',
    selectSearchPlaceholder: 'Buscar…',
    selectEmpty: 'Sin resultados.',
}

interface CommonProps {
    /** id del registro padre. */
    parentId: string | number
    /** Hidden columns; el FK siempre se oculta automáticamente. */
    hiddenColumns?: string[]
    /** Permisos visibles. Default true. */
    canCreate?: boolean
    canDelete?: boolean
    canEdit?: boolean
    /** Strings traducibles. */
    strings?: Partial<DynamicRelationStrings>
    /** Wrapper className. */
    className?: string
    /** Callback opcional cuando la selección o la lista cambia. */
    onChange?: () => void
}

export interface DynamicRelationOneToManyProps extends CommonProps {
    kind: 'one_to_many'
    /** Modelo hijo (lado N) cuyas filas se listan filtradas por `foreignKey == parentId`. */
    model: string
    /** Foreign key del lado N que apunta al padre. */
    foreignKey: string
    /** Endpoint override; default `/data/${model}`. */
    endpoint?: string
}

export interface DynamicRelationManyToManyProps extends CommonProps {
    kind: 'many_to_many'
    /** Tabla pivote (`through`). FK al padre vive acá como `foreignKey`. */
    through: string
    /** Tabla destino (`references`) sobre la que se hace multi-select. */
    references: string
    /** FK del pivot al padre. */
    foreignKey: string
    /** FK del pivot a la tabla destino (default `${references}_id`). */
    referencesKey?: string
    /** Override del endpoint del pivot; default `/data/${through}`. */
    pivotEndpoint?: string
    /** Override del endpoint del target; default `/data/${references}`. */
    referencesEndpoint?: string
    /**
     * Columna del target que se usa como label en el multi-select. Si no se
     * pasa, se infiere de la metadata (primer columna no-id, no-hidden).
     */
    displayKey?: string
}

export type DynamicRelationProps =
    | DynamicRelationOneToManyProps
    | DynamicRelationManyToManyProps

export function DynamicRelation(props: DynamicRelationProps) {
    if (props.kind === 'many_to_many') {
        return <ManyToManyRelation {...props} />
    }
    return <OneToManyRelation {...props} />
}

function OneToManyRelation({
    kind,
    model,
    foreignKey,
    parentId,
    endpoint,
    hiddenColumns = [],
    canCreate = true,
    canDelete = true,
    canEdit = true,
    strings,
    className,
    onChange,
}: DynamicRelationOneToManyProps) {
    const api = useApi()
    const { getMetadata, setMetadata: cacheMetadata } = useMetadataCache()
    const cachedMeta = getMetadata(model)
    const labels = { ...DEFAULT_STRINGS, ...(strings || {}) }

    const [metadata, setMetadata] = useState<TableMetadata | null>(cachedMeta || null)
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [rowToDelete, setRowToDelete] = useState<any | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const dataEndpoint = endpoint || `/data/${model}`

    const fetchAll = useCallback(async () => {
        setLoading(true)
        try {
            const params = buildRelationFilterParams(foreignKey, parentId)
            const [metaRes, dataRes] = await Promise.all([
                metadata ? Promise.resolve(null) : api.get(`/metadata/table/${model}`),
                api.get(dataEndpoint, { params }),
            ])
            if (metaRes && (metaRes as any).data?.success) {
                const fresh = (metaRes as { data: ApiResponse<TableMetadata> }).data.data
                setMetadata(fresh)
                cacheMetadata(model, fresh)
            }
            const list = (dataRes as { data: ApiResponse<any[]> }).data
            if (list.success) setRows(list.data || [])
        } catch (err) {
            console.error('DynamicRelation fetch error', err)
        } finally {
            setLoading(false)
        }
    }, [api, dataEndpoint, foreignKey, parentId, metadata, model, cacheMetadata])

    useEffect(() => { fetchAll() }, [fetchAll])

    const formFields = useMemo(
        () => deriveRelationFormFields(metadata, foreignKey),
        [metadata, foreignKey],
    )

    const visibleColumns = useMemo(() => {
        if (!metadata?.columns) return []
        const hidden = new Set([foreignKey, ...hiddenColumns])
        return metadata.columns.filter(c => !hidden.has(c.key) && !c.hidden)
    }, [metadata, foreignKey, hiddenColumns])

    const handleSubmit = useCallback(async (values: Record<string, any>) => {
        setSubmitting(true)
        try {
            if (editingRow) {
                const res = await api.put(`${dataEndpoint}/${editingRow.id}`, values)
                if (!(res as any).data?.success) throw new Error('update failed')
            } else {
                const payload = buildCreatePayload(foreignKey, parentId, values)
                const res = await api.post(dataEndpoint, payload)
                if (!(res as any).data?.success) throw new Error('create failed')
            }
            setFormOpen(false)
            setEditingRow(null)
            await fetchAll()
            onChange?.()
        } catch (err) {
            console.error('DynamicRelation submit error', err)
        } finally {
            setSubmitting(false)
        }
    }, [api, dataEndpoint, editingRow, fetchAll, foreignKey, onChange, parentId])

    const handleDelete = useCallback(async () => {
        if (!rowToDelete) return
        setSubmitting(true)
        try {
            const res = await api.delete(`${dataEndpoint}/${rowToDelete.id}`)
            if (!(res as any).data?.success) throw new Error('delete failed')
            setRowToDelete(null)
            await fetchAll()
            onChange?.()
        } catch (err) {
            console.error('DynamicRelation delete error', err)
        } finally {
            setSubmitting(false)
        }
    }, [api, dataEndpoint, fetchAll, onChange, rowToDelete])

    return (
        <div className={className} data-relation-kind={kind} data-relation-model={model}>
            {(labels.title || canCreate) && (
                <div className="flex items-center justify-between pb-3">
                    {labels.title ? <h3 className="text-sm font-medium">{labels.title}</h3> : <span />}
                    {canCreate && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditingRow(null); setFormOpen(true) }}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            {labels.addLabel}
                        </Button>
                    )}
                </div>
            )}

            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={`rel-skeleton-${i}`} className="h-10 w-full" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8 border rounded-md bg-muted/30">
                    {labels.emptyState}
                </div>
            ) : (
                <div className="border rounded-md divide-y bg-card">
                    {rows.map((row, idx) => (
                        <div
                            key={relationRowKey(row, idx, foreignKey)}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                            <div className="flex-1 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 text-sm">
                                {visibleColumns.map(col => (
                                    <span key={col.key} className="truncate" title={String(row[col.key] ?? '')}>
                                        {formatCell(row[col.key])}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {canEdit && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => { setEditingRow(row); setFormOpen(true) }}
                                        aria-label={labels.editLabel}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                )}
                                {canDelete && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setRowToDelete(row)}
                                        aria-label={labels.removeLabel}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={formOpen} onOpenChange={(open: boolean) => { setFormOpen(open); if (!open) setEditingRow(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingRow ? labels.editLabel : labels.addLabel}</DialogTitle>
                    </DialogHeader>
                    <DynamicForm
                        fields={formFields}
                        initialValues={editingRow || undefined}
                        onSubmit={handleSubmit}
                        onCancel={() => { setFormOpen(false); setEditingRow(null) }}
                        submitLabel={labels.saveLabel}
                        cancelLabel={labels.cancelLabel}
                        disabled={submitting}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!rowToDelete} onOpenChange={(open: boolean) => !open && setRowToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{labels.confirmRemoveTitle}</AlertDialogTitle>
                        <AlertDialogDescription>{labels.confirmRemoveDescription}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={submitting}>{labels.cancelLabel}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e: React.MouseEvent) => { e.preventDefault(); handleDelete() }}
                            className="bg-red-600 hover:bg-red-700"
                            disabled={submitting}
                        >
                            {labels.removeLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? '✓' : '—'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

function ManyToManyRelation({
    kind,
    through,
    references,
    foreignKey,
    referencesKey,
    parentId,
    pivotEndpoint,
    referencesEndpoint,
    displayKey,
    canCreate = true,
    canDelete = true,
    strings,
    className,
    onChange,
}: DynamicRelationManyToManyProps) {
    const api = useApi()
    const { getMetadata, setMetadata: cacheMetadata } = useMetadataCache()
    const labels = { ...DEFAULT_STRINGS, ...(strings || {}) }

    const refKey = referencesKey || `${references}_id`
    const pivotPath = pivotEndpoint || `/data/${through}`
    // referencesEndpoint is preserved as a legacy escape hatch — when set
    // we keep the old `/data/<references>` raw fetch path (so apps that
    // depend on a custom server route do not break). When unset we use
    // the canonical `/api/options/:references` endpoint via
    // useOptionsResolver, which is what the kernel auto-derives Ref to.
    const useResolver = !referencesEndpoint
    const legacyTargetPath = referencesEndpoint || `/data/${references}`

    const cachedTargetMeta = getMetadata(references)
    const [targetMeta, setTargetMeta] = useState<TableMetadata | null>(cachedTargetMeta || null)
    const [targetRows, setTargetRows] = useState<any[]>([])
    const [pivotRows, setPivotRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)

    // Canonical path: SDK options resolver. Only fires when no legacy
    // override is set. The hook is a no-op when `useResolver` is false.
    const resolved = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: useResolver ? references : undefined,
        enabled: useResolver,
    })

    const fetchPivotAndMeta = useCallback(async () => {
        setLoading(true)
        try {
            const params = buildRelationFilterParams(foreignKey, parentId)
            const tasks: Promise<unknown>[] = [
                api.get(pivotPath, { params }),
            ]
            if (!targetMeta) tasks.push(api.get(`/metadata/table/${references}`))
            // Legacy fallback path: the resolver is disabled, fetch the
            // target rows the old way so callers that depend on a custom
            // route keep working.
            if (!useResolver) tasks.push(api.get(legacyTargetPath))
            const results = await Promise.all(tasks)
            const pivotRes = results[0] as { data: ApiResponse<any[]> }
            if (pivotRes.data.success) setPivotRows(pivotRes.data.data || [])
            let cursor = 1
            if (!targetMeta) {
                const metaRes = results[cursor++] as { data: ApiResponse<TableMetadata> }
                if (metaRes.data?.success) {
                    setTargetMeta(metaRes.data.data)
                    cacheMetadata(references, metaRes.data.data)
                }
            }
            if (!useResolver) {
                const targetRes = results[cursor++] as { data: ApiResponse<any[]> }
                if (targetRes.data.success) setTargetRows(targetRes.data.data || [])
            }
        } catch (err) {
            console.error('DynamicRelation m2m fetch error', err)
        } finally {
            setLoading(false)
        }
    }, [api, pivotPath, foreignKey, parentId, references, targetMeta, cacheMetadata, useResolver, legacyTargetPath])

    useEffect(() => { fetchPivotAndMeta() }, [fetchPivotAndMeta])

    const options = useMemo(() => {
        if (useResolver) {
            return resolved.options.map((o) => ({
                value: String(o.id),
                label: o.label,
            }))
        }
        return targetRows
            .filter(r => r && r.id !== undefined && r.id !== null && r.id !== '')
            .map(r => ({
                value: String(r.id),
                label: pickOptionLabel(r, displayKey, targetMeta?.columns),
            }))
    }, [useResolver, resolved.options, targetRows, displayKey, targetMeta])

    const selectedIds = useMemo(
        () => extractSelectedTargetIds(pivotRows, refKey),
        [pivotRows, refKey],
    )

    const pivotIndex = useMemo(
        () => buildPivotRowIndex(pivotRows, refKey),
        [pivotRows, refKey],
    )

    const handleChange = useCallback(async (next: string[]) => {
        if (syncing) return
        const { toAdd, toRemove } = diffSelection(selectedIds, next)
        if (toAdd.length === 0 && toRemove.length === 0) return
        if (toAdd.length > 0 && !canCreate) return
        if (toRemove.length > 0 && !canDelete) return
        setSyncing(true)
        try {
            for (const targetId of toAdd) {
                const payload = buildPivotAttachPayload(foreignKey, parentId, refKey, targetId)
                const res = await api.post(pivotPath, payload)
                if (!(res as any).data?.success) throw new Error('attach failed')
            }
            for (const targetId of toRemove) {
                const pivotId = pivotIndex.get(targetId)
                if (pivotId === undefined) continue
                const res = await api.delete(`${pivotPath}/${pivotId}`)
                if (!(res as any).data?.success) throw new Error('detach failed')
            }
            await fetchPivotAndMeta()
            // Refresh resolver-driven options when active so newly attached
            // targets reflect immediately. Refetching the pivot rows alone
            // is enough when the resolver branch is off.
            if (useResolver) resolved.refetch()
            onChange?.()
        } catch (err) {
            console.error('DynamicRelation m2m sync error', err)
        } finally {
            setSyncing(false)
        }
    }, [api, canCreate, canDelete, fetchPivotAndMeta, useResolver, resolved, foreignKey, onChange, parentId, pivotIndex, pivotPath, refKey, selectedIds, syncing])

    return (
        <div
            className={className}
            data-relation-kind={kind}
            data-relation-through={through}
            data-relation-references={references}
        >
            {labels.title && (
                <div className="pb-3">
                    <h3 className="text-sm font-medium">{labels.title}</h3>
                </div>
            )}

            {(loading || (useResolver && resolved.loading)) ? (
                <Skeleton className="h-10 w-full" />
            ) : options.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8 border rounded-md bg-muted/30">
                    {labels.emptyState}
                </div>
            ) : (
                <MultiSelect
                    options={options}
                    selected={selectedIds}
                    onChange={handleChange}
                    placeholder={labels.selectPlaceholder}
                    searchPlaceholder={labels.selectSearchPlaceholder}
                    emptyMessage={labels.selectEmpty}
                />
            )}
        </div>
    )
}
