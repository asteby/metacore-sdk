// DynamicRelation — primitivo metadata-driven que renderiza el lado N de una
// relación 1:N o N:N entre modelos. Cubre dos kinds:
//   - "one_to_many": lista inline editable que cuelga del registro padre.
//   - "many_to_many": multi-select sobre la tabla destino con sync a la pivot.
// La RFC completa vive en `packages/runtime-react/docs/relations.md`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    type ColumnDef,
    type Row,
    type Cell,
    type HeaderGroup,
    type Header,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table'
import { cn } from '@asteby/metacore-ui/lib'
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
    Input,
    MultiSelect,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@asteby/metacore-ui/primitives'
import { Plus, Trash2, Pencil, Search } from 'lucide-react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { OptionsContext } from './options-context'
import { DynamicForm } from './dynamic-form'
import { useImageUrl } from './image-url-context'
import { useTimeZone, useCurrency } from './org-runtime-context'
import { makeDefaultGetDynamicColumns } from './dynamic-columns'
import { isColumnVisibleInLineSubtable } from './column-visibility'
import { useOptionsResolver } from './use-options-resolver'
import { dedupeById, useInfiniteScrollSentinel } from './use-infinite-scroll'
import type { ApiResponse, ColumnDefinition, TableMetadata } from './types'
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
    formatRelationCell,
    objectLabel,
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
    /** Placeholder del buscador de la sub-tabla 1:N. */
    searchPlaceholder: string
    /** Pie de la sub-tabla: "{{loaded}} de {{total}}". */
    countLabel: string
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
    searchPlaceholder: 'Buscar…',
    countLabel: '{{loaded}} de {{total}}',
}

// Tamaño de página de la sub-tabla 1:N. Antes la lista pedía el hijo COMPLETO
// (sin page/per_page), así que abrir un almacén traía todas sus existencias y
// traspasos. Se pagina de a 25 y el resto entra por scroll infinito.
const REL_PAGE_SIZE = 25

interface CommonProps {
    /** id del registro padre. */
    parentId: string | number
    /**
     * Filtros estáticos extra (igualdad) aplicados ADEMÁS del foreign-key.
     * Caso polimórfico: una tabla de hijos compartida (attachments,
     * addresses) scopeada por `foreign_key=owner_id` Y `owner_model=Customer`.
     * Cada entrada se thread-ea como `f_<col>=eq:<val>` junto al FK en la query
     * de la lista hija. Aditivo: sin filters el comportamiento es idéntico.
     */
    filters?: Record<string, string>
    /** Hidden columns; el FK siempre se oculta automáticamente. */
    hiddenColumns?: string[]
    /**
     * Contexto de sub-tabla de líneas dentro del MODAL de vista de un registro
     * padre. Cuando es true se aplican las reglas de {@link isColumnVisibleInLineSubtable}
     * — se ocultan por defecto las columnas de auditoría/sistema (created_by,
     * timestamps, organization_id) y las scopeadas a `visibility: "table"`, que
     * son ruido redundante bajo el registro padre.
     *
     * Default false: en una página de detalle autónoma (`/m/<model>/<id>`) el
     * panel de relación conserva el comportamiento previo (solo oculta FK, scope
     * y columnas `hidden`), donde esas columnas SÍ son útiles.
     */
    lineSubtable?: boolean
    /** Permisos visibles. Default true. */
    canCreate?: boolean
    canDelete?: boolean
    canEdit?: boolean
    /**
     * Relación de solo lectura. Cuando es true fuerza canCreate/canEdit/canDelete
     * = false (AND con lo que pase el host: readonly siempre gana), escondiendo el
     * botón "Agregar", el ícono editar (Pencil) y el de eliminar (Trash2). Tolera
     * el alias camelCase `readOnly`.
     */
    readonly?: boolean
    /** Alias camelCase de `readonly`. */
    readOnly?: boolean
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
    filters,
    endpoint,
    hiddenColumns = [],
    lineSubtable = false,
    canCreate = true,
    canDelete = true,
    canEdit = true,
    readonly,
    readOnly,
    strings,
    className,
    onChange,
}: DynamicRelationOneToManyProps) {
    // Read-only relation always wins over host-passed perms (AND). Tolerates the
    // camelCase alias the same way lock_rows/lockRows does.
    const isReadonly = readonly === true || readOnly === true
    if (isReadonly) {
        canCreate = false
        canDelete = false
        canEdit = false
    }
    const api = useApi()
    const getImageUrl = useImageUrl()
    const timeZone = useTimeZone()
    const currency = useCurrency()
    const { i18n } = useTranslation()
    const { getMetadata, setMetadata: cacheMetadata } = useMetadataCache()
    const cachedMeta = getMetadata(model)
    const labels = { ...DEFAULT_STRINGS, ...(strings || {}) }

    const [metadata, setMetadata] = useState<TableMetadata | null>(cachedMeta || null)
    // Options for the ref/relation columns so their cells render the record's
    // NAME (+ SKU subtitle) instead of the raw uuid. The main <DynamicTable>
    // preloads these into OptionsContext; a sub-table skipped it, so a `ref`
    // column (e.g. a purchase order line's Product) showed the bare uuid.
    const [optionsMap, setOptionsMap] = useState<Map<string, any[]>>(new Map())
    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    // Paginación server-side + scroll infinito, igual que <DynamicTable>.
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loadingMore, setLoadingMore] = useState(false)
    // El backend devolvió una página corta: no hay más filas aunque meta.total
    // diga otra cosa (drift count/list dispararía el sentinel para siempre).
    const [exhausted, setExhausted] = useState(false)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [formOpen, setFormOpen] = useState(false)
    const [editingRow, setEditingRow] = useState<any | null>(null)
    const [rowToDelete, setRowToDelete] = useState<any | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const dataEndpoint = endpoint || `/data/${model}`
    // Stable dependency key for the filters object (callers usually pass a fresh
    // literal each render). Keeps fetchAll from re-firing on identity churn while
    // still reacting to real scope changes.
    const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : ''), [filters])

    // La metadata se lee por ref dentro del fetch: si entrara como dependencia,
    // resolverla dispararía un segundo fetch de datos por cada montaje.
    const metadataRef = useRef<TableMetadata | null>(metadata)
    metadataRef.current = metadata

    // Debounce del buscador: cada tecla no puede pegarle al servidor.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
        return () => clearTimeout(id)
    }, [search])

    // Preload the options of the ref/relation columns (same shape <DynamicTable>
    // uses: `useOptions && searchEndpoint`) so their cells resolve the referenced
    // record's name via OptionsContext instead of printing the raw uuid.
    const refEndpointsKey = useMemo(() => {
        const eps = (metadata?.columns || [])
            .filter((c) => (c as any).useOptions && (c as any).searchEndpoint)
            .map((c) => (c as any).searchEndpoint as string)
        return Array.from(new Set(eps)).sort().join('|')
    }, [metadata])

    useEffect(() => {
        if (!refEndpointsKey) {
            setOptionsMap((prev) => (prev.size ? new Map() : prev))
            return
        }
        const endpoints = refEndpointsKey.split('|')
        let cancelled = false
        void Promise.all(
            endpoints.map(async (ep) => {
                try {
                    const res = (await api.get(ep)) as { data: ApiResponse<any[]> }
                    return [ep, res.data?.success ? res.data.data || [] : []] as const
                } catch {
                    return [ep, [] as any[]] as const
                }
            }),
        ).then((entries) => {
            if (!cancelled) setOptionsMap(new Map(entries))
        })
        return () => {
            cancelled = true
        }
    }, [api, refEndpointsKey])

    const optionsCtx = useMemo(() => ({ optionsMap }), [optionsMap])

    // fetchPage REEMPLAZA (página 1) o ANEXA (scroll infinito). Antes esta lista
    // pedía el modelo hijo entero sin page/per_page.
    const fetchPage = useCallback(async (nextPage: number, append: boolean) => {
        if (append) setLoadingMore(true)
        else setLoading(true)
        try {
            const params: Record<string, any> = {
                ...buildRelationFilterParams(foreignKey, parentId, filters),
                page: nextPage,
                per_page: REL_PAGE_SIZE,
            }
            if (debouncedSearch) params.search = debouncedSearch
            const [metaRes, dataRes] = await Promise.all([
                metadataRef.current ? Promise.resolve(null) : api.get(`/metadata/table/${model}`),
                api.get(dataEndpoint, { params }),
            ])
            if (metaRes && (metaRes as any).data?.success) {
                const fresh = (metaRes as { data: ApiResponse<TableMetadata> }).data.data
                setMetadata(fresh)
                cacheMetadata(model, fresh)
            }
            const list = (dataRes as { data: ApiResponse<any[]> }).data
            if (list.success) {
                const fetched = list.data || []
                setRows((prev) => (append ? dedupeById(prev, fetched) : fetched))
                setPage(nextPage)
                if (list.meta?.total !== undefined) setTotal(list.meta.total)
                else if (!append) setTotal(fetched.length)
                setExhausted(fetched.length < REL_PAGE_SIZE)
            }
        } catch (err) {
            console.error('DynamicRelation fetch error', err)
        } finally {
            if (append) setLoadingMore(false)
            else setLoading(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, dataEndpoint, foreignKey, parentId, filtersKey, model, cacheMetadata, debouncedSearch])

    // Recarga desde la primera página. Es lo que corren create/edit/delete.
    const fetchAll = useCallback(async () => {
        await fetchPage(1, false)
    }, [fetchPage])

    // Un cambio de padre/scope/búsqueda vuelve a la página 1.
    useEffect(() => { fetchPage(1, false) }, [fetchPage])

    const canLoadMore = !loading && !loadingMore && !exhausted && rows.length < total
    const { rootRef, sentinelRef } = useInfiniteScrollSentinel<HTMLDivElement, HTMLDivElement>({
        onLoadMore: () => { if (canLoadMore) fetchPage(page + 1, true) },
        disabled: !canLoadMore,
    })

    // El buscador solo aparece cuando hay algo que buscar: una sub-tabla de 3
    // líneas no necesita chrome extra. Se queda visible mientras haya término
    // activo para no dejar al usuario sin forma de limpiarlo.
    const showSearch = debouncedSearch !== '' || search !== '' || total > REL_PAGE_SIZE

    const formFields = useMemo(
        () => deriveRelationFormFields(metadata, foreignKey),
        [metadata, foreignKey],
    )

    const visibleColumns = useMemo(() => {
        if (!metadata?.columns) return []
        // Hide the FK and every scope column — they're fixed for this parent and
        // would just render the same value on every row.
        const hidden = new Set([foreignKey, ...Object.keys(filters || {}), ...hiddenColumns])
        // In the view-modal line-subtable context, isColumnVisibleInLineSubtable
        // additionally drops `hidden`/table-scoped columns AND the audit/system
        // noise (created_by, timestamps, org_id) that's redundant under a parent
        // record — see column-visibility.ts. Outside that context (standalone
        // detail page) we keep the previous behaviour and only drop `hidden`
        // columns, so those columns still show where they're useful.
        const keep = lineSubtable
            ? (c: ColumnDefinition) => !hidden.has(c.key) && isColumnVisibleInLineSubtable(c)
            : (c: ColumnDefinition) => !hidden.has(c.key) && !c.hidden
        return metadata.columns.filter(keep)
    }, [metadata, foreignKey, filtersKey, hiddenColumns, lineSubtable])

    // Reuse the EXACT column factory the main `<DynamicTable>` uses so each cell
    // renders identically — money in the org currency right-aligned, FK chips
    // with thumbnails, dates in the org timezone, status/option badges, creator
    // names — instead of a hand-rolled parallel formatting stack. Stable per
    // image-url resolver.
    const buildColumns = useMemo(
        () => makeDefaultGetDynamicColumns({ getImageUrl }),
        [getImageUrl],
    )

    const showActions = canEdit || canDelete

    const columns = useMemo<ColumnDef<any>[]>(() => {
        if (!metadata) return []
        // Feed the factory a metadata view scoped to the visible columns only,
        // with model-level actions stripped — the relation list owns its own
        // inline edit/delete column (appended below), and the factory's
        // select/actions columns don't belong in an embedded child list.
        const scopedMeta = {
            ...metadata,
            columns: visibleColumns,
            actions: [],
            hasActions: false,
            enableCRUDActions: false,
        } as TableMetadata
        const base = buildColumns(
            scopedMeta,
            () => {},
            (key: string, opts?: any) => opts?.defaultValue ?? key,
            i18n?.language || 'es',
            new Map(),
            timeZone,
            currency,
        ).filter((c) => c.id !== 'select' && c.id !== 'actions')

        if (!showActions) return base

        const actionsCol: ColumnDef<any> = {
            id: 'actions',
            header: () => <span className="sr-only">{labels.editLabel}</span>,
            size: 80,
            cell: ({ row }: { row: Row<any> }) => (
                <div className="flex items-center justify-end gap-1">
                    {canEdit && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setEditingRow(row.original); setFormOpen(true) }}
                            aria-label={labels.editLabel}
                        >
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                    {canDelete && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRowToDelete(row.original)}
                            aria-label={labels.removeLabel}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            ),
        }
        return [...base, actionsCol]
    }, [metadata, visibleColumns, buildColumns, i18n?.language, timeZone, currency, showActions, canEdit, canDelete, labels.editLabel, labels.removeLabel])

    const table = useReactTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    })

    const handleSubmit = useCallback(async (values: Record<string, any>) => {
        setSubmitting(true)
        try {
            if (editingRow) {
                const res = await api.put(`${dataEndpoint}/${editingRow.id}`, values)
                if (!(res as any).data?.success) throw new Error('update failed')
            } else {
                // Scope columns (polymorphic discriminators like owner_model)
                // are fixed for this relation, so a newly created child must
                // carry them too — otherwise it would not match the list filter.
                const payload = { ...(filters || {}), ...buildCreatePayload(foreignKey, parentId, values) }
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, dataEndpoint, editingRow, fetchAll, foreignKey, filtersKey, onChange, parentId])

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
            {(labels.title || canCreate || showSearch) && (
                <div className="flex items-center justify-between gap-2 pb-3">
                    {labels.title ? <h3 className="text-sm font-medium">{labels.title}</h3> : <span />}
                    <div className="flex items-center gap-2">
                        {showSearch && (
                            <div className="relative">
                                <Search className="absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                                    placeholder={labels.searchPlaceholder}
                                    className="h-8 w-40 ps-7 sm:w-56"
                                />
                            </div>
                        )}
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
                // Real metadata-driven table — same metacore-ui primitives and
                // cell renderers as `<DynamicTable>` so headers, money/currency,
                // FK thumbnails, dates and badges all match the main table.
                // `max-h` + scroll propio: la sub-tabla no puede estirar el modal
                // del padre a lo alto de cientos de filas. El sentinel del fondo
                // pide la página siguiente al entrar en vista.
                <OptionsContext.Provider value={optionsCtx}>
                <div ref={rootRef} className="overflow-auto max-h-[60vh] border rounded-md bg-card">
                    <Table noWrapper className="w-full">
                        <TableHeader>
                            {table.getHeaderGroups().map((headerGroup: HeaderGroup<any>) => (
                                <TableRow key={headerGroup.id} className="border-b-0 hover:bg-transparent">
                                    {headerGroup.headers.map((header: Header<any, unknown>) => {
                                        const isActions = header.id === 'actions'
                                        return (
                                            <TableHead
                                                key={header.id}
                                                colSpan={header.colSpan}
                                                style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                                                className={cn('bg-card border-b h-10', isActions && 'text-right')}
                                            >
                                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows.map((row: Row<any>, idx: number) => (
                                <TableRow key={relationRowKey(row.original, idx, foreignKey)}>
                                    {row.getVisibleCells().map((cell: Cell<any, unknown>) => (
                                        <TableCell
                                            key={cell.id}
                                            style={cell.column.columnDef.size ? { width: cell.column.columnDef.size } : undefined}
                                            className="py-2"
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {loadingMore && (
                        <div className="p-2">
                            <Skeleton className="h-8 w-full" />
                        </div>
                    )}
                    <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                </div>
                </OptionsContext.Provider>
            )}

            {/* Cuánto de la relación se ve. Sin esto una sub-tabla paginada
                miente: parece completa cuando solo trae la primera página. */}
            {!loading && rows.length > 0 && total > rows.length && (
                <div className="pt-2 text-end text-xs text-muted-foreground">
                    {labels.countLabel
                        .replace('{{loaded}}', String(rows.length))
                        .replace('{{total}}', String(total))}
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

function ManyToManyRelation({
    kind,
    through,
    references,
    foreignKey,
    referencesKey,
    parentId,
    filters,
    pivotEndpoint,
    referencesEndpoint,
    displayKey,
    canCreate = true,
    canDelete = true,
    readonly,
    readOnly,
    strings,
    className,
    onChange,
}: DynamicRelationManyToManyProps) {
    // Read-only relation always wins over host-passed perms (AND).
    if (readonly === true || readOnly === true) {
        canCreate = false
        canDelete = false
    }
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

    const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : ''), [filters])

    const fetchPivotAndMeta = useCallback(async () => {
        setLoading(true)
        try {
            const params = buildRelationFilterParams(foreignKey, parentId, filters)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, pivotPath, foreignKey, parentId, filtersKey, references, targetMeta, cacheMetadata, useResolver, legacyTargetPath])

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
                const payload = buildPivotAttachPayload(foreignKey, parentId, refKey, targetId, filters || undefined)
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [api, canCreate, canDelete, fetchPivotAndMeta, useResolver, resolved, foreignKey, filtersKey, onChange, parentId, pivotIndex, pivotPath, refKey, selectedIds, syncing])

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
