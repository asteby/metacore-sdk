// DynamicTable — metadata-driven CRUD table used by every metacore host.
// Originally extracted from a host app and generalized so the host-specific
// aliases are swapped for metacore packages + context-injected peer deps:
//   * `@/lib/api` → <ApiProvider> (see api-context.tsx)
//   * `@/stores/branch-store` → <BranchProvider> (optional)
//   * `@/stores/metadata-cache` → internal ./metadata-cache zustand store
//   * `@/components/ui/*` → @asteby/metacore-ui/primitives
//   * `@/components/data-table/*` → @asteby/metacore-ui/data-table
//   * `@/components/dynamic/{record,export,import}-dialog` → ./dialogs/*
//   * `@/components/dynamic/dynamic-columns` → host-injected via the
//     `getDynamicColumns` prop (hosts retain ownership because the rendered
//     column cells are tightly coupled to their design system).
import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import {
    type SortingState,
    type VisibilityState,
    type ColumnFiltersState,
    type PaginationState,
    type ColumnDef,
    type HeaderGroup,
    type Header,
    type Row,
    type Cell,
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table'
import { cn } from '@asteby/metacore-ui/lib'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
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
} from '@asteby/metacore-ui/primitives'
import {
    DataTablePagination,
    DataTableToolbar,
    DataTableBulkActions,
    type FilterOption as DynamicFilterOption,
} from '@asteby/metacore-ui/data-table'
import { Inbox, Download, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Progress } from './dialogs/_primitives'
import { useMetadataCache } from './metadata-cache'
import { useApi, useCurrentBranch } from './api-context'
import type { ColumnFilterConfig, GetDynamicColumns } from './dynamic-columns-shim'
import { defaultGetDynamicColumns } from './dynamic-columns'
import { OptionsContext } from './options-context'
import { ActionModalDispatcher } from './action-modal-dispatcher'
import type { TableMetadata, ApiResponse, ActionMetadata } from './types'
import { DynamicRecordDialog } from './dialogs/dynamic-record'
import { ExportDialog } from './dialogs/export'
import { ImportDialog } from './dialogs/import'

interface DynamicTableProps {
    model: string
    endpoint?: string
    enableUrlSync?: boolean
    hiddenColumns?: string[]
    onAction?: (action: string, row: any) => void
    refreshTrigger?: any
    defaultFilters?: Record<string, any>
    extraColumns?: ColumnDef<any>[]
    /**
     * Host-provided factory that turns metadata into TanStack column defs.
     * Lives in the host because the rendered cells depend on the host's
     * design system (Badge, Avatar, MediaGallery, phone flags, etc.).
     * Optional — a sensible default maps each column to { accessorKey, header }.
     */
    getDynamicColumns?: GetDynamicColumns
}

export function DynamicTable({
    model,
    endpoint,
    enableUrlSync = true,
    hiddenColumns = [],
    onAction,
    refreshTrigger,
    defaultFilters,
    extraColumns = [],
    getDynamicColumns = defaultGetDynamicColumns,
}: DynamicTableProps) {
    const { t, i18n } = useTranslation()
    const api = useApi()
    const currentBranch = useCurrentBranch()
    const navigate = useNavigate()

    const prevBranchId = useRef(currentBranch?.id)

    const { getMetadata, setMetadata: cacheMetadata } = useMetadataCache()
    const cachedMeta = getMetadata(model)

    const [metadata, setMetadata] = useState<TableMetadata | null>(cachedMeta || null)
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(!cachedMeta)
    const [loadingData, setLoadingData] = useState(true)
    const [optionsMap, setOptionsMap] = useState<Map<string, any[]>>(new Map())

    const [recordDialog, setRecordDialog] = useState<{
        open: boolean
        mode: 'view' | 'edit' | 'create'
        recordId: string | null
    }>({ open: false, mode: 'view', recordId: null })

    const [rowToDelete, setRowToDelete] = useState<any | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [exportOpen, setExportOpen] = useState(false)
    const [importOpen, setImportOpen] = useState(false)

    const [actionModal, setActionModal] = useState<{
        open: boolean
        action: ActionMetadata | null
        record: any | null
    }>({ open: false, action: null, record: null })

    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
    const [isBulkDeleting, setIsBulkDeleting] = useState(false)
    const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0)
    const [bulkDeleteTotal, setBulkDeleteTotal] = useState(0)

    const [rowSelection, setRowSelection] = useState({})
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
        const initial: VisibilityState = {}
        hiddenColumns.forEach(col => { initial[col] = false })
        return initial
    })
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
    const [globalFilter, setGlobalFilter] = useState('')
    const [rowCount, setRowCount] = useState(0)

    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
    const [dynamicFilters, setDynamicFilters] = useState<Record<string, string[]>>({})
    const [filterOptionsMap, setFilterOptionsMap] = useState<Map<string, DynamicFilterOption[]>>(new Map())

    const initializedFromUrl = useRef(false)
    const urlHadPerPage = useRef(false)

    useEffect(() => {
        if (prevBranchId.current !== currentBranch?.id) {
            prevBranchId.current = currentBranch?.id
            setPagination((prev: PaginationState) => ({ ...prev, pageIndex: 0 }))
            setRowSelection({})
        }
    }, [currentBranch?.id])

    const urlAliasToOperator: Record<string, string> = {
        'contains': 'ILIKE', 'like': 'LIKE', 'in': 'IN', 'not_in': 'NOT_IN',
        'gt': 'GT', 'lt': 'LT', 'gte': 'GTE', 'lte': 'LTE',
        'range': 'RANGE', 'null': 'NULL', 'not_null': 'NOT_NULL',
    }
    const operatorToUrlAlias: Record<string, string> = Object.fromEntries(
        Object.entries(urlAliasToOperator).map(([alias, op]) => [op, alias])
    )

    const urlValueToInternal = (value: string): string => {
        const colonIdx = value.indexOf(':')
        if (colonIdx === -1) return value
        const prefix = value.substring(0, colonIdx).toLowerCase()
        const rest = value.substring(colonIdx + 1)
        const operator = urlAliasToOperator[prefix]
        return operator ? `${operator}:${rest}` : value
    }
    const internalValueToUrl = (value: string): string => {
        const colonIdx = value.indexOf(':')
        if (colonIdx === -1) return value
        const prefix = value.substring(0, colonIdx)
        const rest = value.substring(colonIdx + 1)
        const alias = operatorToUrlAlias[prefix]
        return alias ? `${alias}:${rest}` : value
    }

    useEffect(() => {
        if (!enableUrlSync || initializedFromUrl.current) return
        initializedFromUrl.current = true
        const params = new URLSearchParams(window.location.search)
        const page = params.get('page')
        const perPage = params.get('per_page')
        if (perPage) urlHadPerPage.current = true
        if (page || perPage) {
            setPagination((prev: PaginationState) => ({
                pageIndex: page ? Math.max(0, parseInt(page, 10) - 1) : prev.pageIndex,
                pageSize: perPage ? parseInt(perPage, 10) : prev.pageSize,
            }))
        }
        const sortBy = params.get('sortBy')
        const order = params.get('order')
        if (sortBy) setSorting([{ id: sortBy, desc: order === 'desc' }])
        const search = params.get('search')
        if (search) setGlobalFilter(search)
        const filters: Record<string, string[]> = {}
        params.forEach((rawValue, key) => {
            if (key.startsWith('f_')) {
                const filterKey = key.substring(2)
                if (defaultFilters && filterKey in defaultFilters) return
                const value = urlValueToInternal(rawValue)
                if (value.startsWith('IN:')) filters[filterKey] = value.substring(3).split(',')
                else filters[filterKey] = [value]
            }
        })
        if (Object.keys(filters).length > 0) setDynamicFilters(filters)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!enableUrlSync || !initializedFromUrl.current) return
        const params = new URLSearchParams()
        if (pagination.pageIndex > 0) params.set('page', String(pagination.pageIndex + 1))
        if (pagination.pageSize !== 10) params.set('per_page', String(pagination.pageSize))
        if (sorting.length > 0) {
            params.set('sortBy', sorting[0].id)
            params.set('order', sorting[0].desc ? 'desc' : 'asc')
        }
        if (globalFilter) params.set('search', globalFilter)
        Object.entries(dynamicFilters).forEach(([key, values]) => {
            if (values.length === 0) return
            if (defaultFilters && key in defaultFilters) return
            if (values.length === 1) params.set(`f_${key}`, internalValueToUrl(values[0]))
            else params.set(`f_${key}`, `in:${values.join(',')}`)
        })
        const search = params.toString()
        const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname
        window.history.replaceState(null, '', newUrl)
    }, [enableUrlSync, pagination, sorting, globalFilter, dynamicFilters, defaultFilters])

    const prefetchOptions = useCallback(async (endpoints: string[]) => {
        if (endpoints.length === 0) return new Map<string, any[]>()
        const uniqueEndpoints = Array.from(new Set(endpoints))
        const promises = uniqueEndpoints.map(async (ep) => {
            try {
                const res = await api.get(ep)
                return { endpoint: ep, data: res.data?.success ? res.data.data : [] }
            } catch (e) {
                console.error(`Failed to fetch options for ${ep}`, e)
                return { endpoint: ep, data: [] }
            }
        })
        const results = await Promise.all(promises)
        const map = new Map<string, any[]>()
        results.forEach(r => map.set(r.endpoint, r.data))
        return map
    }, [api])

    const metaInitRef = useRef(false)
    useEffect(() => {
        if (metaInitRef.current) return
        metaInitRef.current = true
        const initMetadataAndOptions = async () => {
            let meta: TableMetadata
            const cached = getMetadata(model)
            if (cached) {
                meta = cached
                setMetadata(meta)
                if (!urlHadPerPage.current) setPagination((prev: PaginationState) => ({ ...prev, pageSize: meta.defaultPerPage || 10 }))
                setLoading(false)
            } else {
                setLoading(true)
                try {
                    const res = await api.get(`/metadata/table/${model}`) as { data: ApiResponse<TableMetadata> }
                    if (!res.data.success) return
                    meta = res.data.data
                    setMetadata(meta)
                    cacheMetadata(model, meta)
                    if (!urlHadPerPage.current) setPagination((prev: PaginationState) => ({ ...prev, pageSize: meta.defaultPerPage || 10 }))
                } catch (error) {
                    console.error('Error al cargar la configuración de la tabla', error)
                    return
                } finally {
                    setLoading(false)
                }
            }
            const columnEndpoints = meta.columns.filter(c => c.useOptions && c.searchEndpoint).map(c => c.searchEndpoint!)
            const filterEndpoints = (meta.filters || []).filter(f => f.searchEndpoint && (f.type === 'select' || f.type === 'boolean')).map(f => f.searchEndpoint!)
            const allEndpoints = [...columnEndpoints, ...filterEndpoints]
            if (allEndpoints.length > 0) {
                prefetchOptions(allEndpoints).then(fetchedMap => {
                    const colMap = new Map<string, any[]>()
                    columnEndpoints.forEach(ep => { if (fetchedMap.has(ep)) colMap.set(ep, fetchedMap.get(ep)!) })
                    setOptionsMap(colMap)
                    const fMap = new Map<string, DynamicFilterOption[]>()
                    filterEndpoints.forEach(ep => {
                        if (fetchedMap.has(ep)) {
                            fMap.set(ep, (fetchedMap.get(ep) || []).map((item: any) => ({
                                label: item.label || item.name || '',
                                value: String(item.value ?? item.id ?? ''),
                                icon: item.icon,
                                color: item.color || item.class,
                            })))
                        }
                    })
                    setFilterOptionsMap(fMap)
                })
            }
        }
        initMetadataAndOptions()
    }, [model]) // eslint-disable-line react-hooks/exhaustive-deps

    const buildFilterParams = useCallback(() => {
        const params: Record<string, any> = {}
        if (sorting.length > 0) {
            params.sortBy = sorting[0].id
            params.order = sorting[0].desc ? 'desc' : 'asc'
        }
        if (globalFilter) params.search = globalFilter
        columnFilters.forEach((filter: { id: string; value: unknown }) => { params[`f_${filter.id}`] = filter.value })
        if (defaultFilters) Object.entries(defaultFilters).forEach(([key, value]) => { params[`f_${key}`] = value })
        Object.entries(dynamicFilters).forEach(([key, values]) => {
            if (values.length === 0) return
            const gteVal = values.find(v => v.startsWith('GTE:'))
            const lteVal = values.find(v => v.startsWith('LTE:'))
            if (gteVal || lteVal) {
                const min = gteVal ? gteVal.replace('GTE:', '') : ''
                const max = lteVal ? lteVal.replace('LTE:', '') : ''
                params[`f_${key}`] = `RANGE:${min},${max}`
                return
            }
            if (values.length === 1) params[`f_${key}`] = values[0]
            else params[`f_${key}`] = `IN:${values.join(',')}`
        })
        if (dateRange?.from) {
            const startDate = format(dateRange.from, 'yyyy-MM-dd')
            const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : startDate
            params['f_created_at'] = `${startDate}_${endDate}`
        }
        return params
    }, [sorting, globalFilter, columnFilters, defaultFilters, dynamicFilters, dateRange])

    const hasActiveFilters = useMemo(() => {
        if (globalFilter) return true
        if (columnFilters.length > 0) return true
        if (Object.values(dynamicFilters).some(v => v.length > 0)) return true
        if (dateRange?.from) return true
        return false
    }, [globalFilter, columnFilters, dynamicFilters, dateRange])

    const fetchData = useCallback(async () => {
        if (!metadata) return
        setLoadingData(true)
        try {
            const params: Record<string, any> = {
                page: pagination.pageIndex + 1,
                per_page: pagination.pageSize,
                ...buildFilterParams(),
            }
            const res = await api.get(endpoint || `/data/${model}`, { params }) as { data: ApiResponse<any[]> }
            if (res.data.success) {
                setData(res.data.data || [])
                if (res.data.meta) setRowCount(res.data.meta.total)
            }
        } catch (error) {
            console.error('Error al cargar los datos', error)
        } finally {
            setLoadingData(false)
        }
    }, [model, metadata, pagination, buildFilterParams, refreshTrigger, endpoint, currentBranch?.id, api])

    const initialFetchDone = useRef(false)
    useEffect(() => {
        if (!metadata) return
        if (!initialFetchDone.current) {
            initialFetchDone.current = true
            fetchData()
            return
        }
        const timeoutId = setTimeout(fetchData, 300)
        return () => clearTimeout(timeoutId)
    }, [fetchData, metadata])

    const handleRefresh = useCallback(() => { fetchData() }, [fetchData])

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
        if (onAction) { await Promise.resolve(onAction(action, row)); handleRefresh() }
        else handleRefresh()
    }, [onAction, handleRefresh, metadata, navigate])

    const confirmDelete = async () => {
        if (!rowToDelete) return
        setIsDeleting(true)
        try {
            const deleteEndpoint = endpoint ? `${endpoint}/${rowToDelete.id}` : `/data/${model}/${rowToDelete.id}`
            const res = await api.delete(deleteEndpoint)
            if (res.data.success) { toast.success(res.data.message || 'Eliminado correctamente'); handleRefresh() }
            else toast.error(res.data.message || 'Error al eliminar')
        } catch (error) {
            console.error('Error al eliminar', error)
            toast.error('Error al eliminar el registro')
        } finally {
            setIsDeleting(false)
            setRowToDelete(null)
        }
    }

    const confirmBulkDelete = async () => {
        const selectedRows = table.getFilteredSelectedRowModel().rows
        if (selectedRows.length === 0) return
        setIsBulkDeleting(true)
        setBulkDeleteTotal(selectedRows.length)
        setBulkDeleteProgress(0)
        let successCount = 0, errorCount = 0
        for (let i = 0; i < selectedRows.length; i++) {
            const row = selectedRows[i]
            try {
                const deleteEndpoint = endpoint ? `${endpoint}/${row.original.id}` : `/data/${model}/${row.original.id}`
                const res = await api.delete(deleteEndpoint)
                if (res.data.success) successCount++; else errorCount++
            } catch (e) { console.error('Error al eliminar', e); errorCount++ }
            setBulkDeleteProgress(i + 1)
        }
        await new Promise(resolve => setTimeout(resolve, 500))
        setIsBulkDeleting(false)
        setShowBulkDeleteConfirm(false)
        setBulkDeleteProgress(0)
        setBulkDeleteTotal(0)
        setRowSelection({})
        if (successCount > 0) toast.success(`${successCount} registro(s) eliminado(s) correctamente`)
        if (errorCount > 0) toast.error(`${errorCount} registro(s) no pudieron ser eliminados`)
        handleRefresh()
    }

    const handleDynamicFilterChange = useCallback((filterKey: string, values: string[]) => {
        setDynamicFilters((prev: Record<string, string[]>) => ({ ...prev, [filterKey]: values }))
        setPagination((prev: PaginationState) => ({ ...prev, pageIndex: 0 }))
    }, [])

    const columnFilterConfigs = useMemo(() => {
        const map = new Map<string, ColumnFilterConfig>()
        if (!metadata) return map
        // Explicit `metadata.filters` wins. When the backend does not emit
        // them, derive a filter chip from every column flagged
        // `filterable: true` — keeps the kernel API minimal (one flag on the
        // column) while still rendering the FilterableColumnHeader.
        for (const f of metadata.filters ?? []) {
            const fType = f.type as ColumnFilterConfig['filterType']
            let options: { label: string; value: string; icon?: string; color?: string }[] = []
            if (f.options && f.options.length > 0) {
                options = f.options.map(o => ({ label: o.label, value: String(o.value), icon: o.icon, color: o.color }))
            }
            if (f.searchEndpoint && filterOptionsMap.has(f.searchEndpoint)) {
                options = filterOptionsMap.get(f.searchEndpoint) || []
            }
            if (fType === 'select' && options.length === 0 && !f.searchEndpoint) continue
            map.set(f.key, {
                filterType: fType,
                filterKey: f.column || f.key,
                options,
                selectedValues: dynamicFilters[f.column || f.key] || [],
                onFilterChange: handleDynamicFilterChange,
                loading: f.searchEndpoint ? !filterOptionsMap.has(f.searchEndpoint) : false,
                searchEndpoint: f.searchEndpoint,
            })
        }
        for (const c of metadata.columns ?? []) {
            if (!c.filterable || map.has(c.key)) continue
            const hasStaticOptions = (c.options?.length ?? 0) > 0
            const hasEndpoint = !!c.searchEndpoint
            // Pick the filter UI from column type:
            //   - explicit options or searchEndpoint → multi-select dropdown
            //   - boolean → boolean toggle (renders as select under the hood)
            //   - number / number_range / numeric → number range
            //   - everything else (text, email, phone, tags…) → text contains
            let filterType: ColumnFilterConfig['filterType'] = 'select'
            if (hasStaticOptions || hasEndpoint) filterType = 'select'
            else if (c.type === 'boolean') filterType = 'boolean'
            else if (c.type === 'number') filterType = 'number_range'
            else filterType = 'text'

            const options = hasStaticOptions
                ? c.options!.map(o => ({
                      label: o.label,
                      value: String(o.value),
                      icon: o.icon,
                      color: o.color,
                  }))
                : hasEndpoint && filterOptionsMap.has(c.searchEndpoint!)
                  ? filterOptionsMap.get(c.searchEndpoint!) || []
                  : []
            map.set(c.key, {
                filterType,
                filterKey: c.key,
                options,
                selectedValues: dynamicFilters[c.key] || [],
                onFilterChange: handleDynamicFilterChange,
                loading: hasEndpoint && !filterOptionsMap.has(c.searchEndpoint!),
                searchEndpoint: c.searchEndpoint,
            })
        }
        return map
    }, [metadata, filterOptionsMap, dynamicFilters, handleDynamicFilterChange])

    const columns = useMemo(() => {
        if (!metadata) return []
        const baseColumns = getDynamicColumns(metadata, handleInternalAction, t, i18n.language, columnFilterConfigs)
        const filteredBase = baseColumns.filter((col: ColumnDef<any>) => !hiddenColumns.includes(col.id as string))
        const actionsCol = filteredBase.find((c: ColumnDef<any>) => c.id === 'actions')
        const otherCols = filteredBase.filter((c: ColumnDef<any>) => c.id !== 'actions')
        return [...otherCols, ...extraColumns, ...(actionsCol ? [actionsCol] : [])]
    }, [metadata, handleInternalAction, hiddenColumns, extraColumns, t, i18n.language, columnFilterConfigs, getDynamicColumns])

    const filters = useMemo(() => [], [])

    const table = useReactTable({
        data,
        columns,
        state: { sorting, columnVisibility, rowSelection, columnFilters, globalFilter, pagination },
        pageCount: Math.ceil(rowCount / pagination.pageSize),
        manualPagination: true,
        manualSorting: true,
        manualFiltering: true,
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnVisibilityChange: setColumnVisibility,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    })

    const TableSkeleton = () => (
        <>
            {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                    <TableCell className="py-3 w-10"><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-[70%]" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-[50%]" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-[60%]" /></TableCell>
                    <TableCell className="py-3 w-16"><Skeleton className="h-6 w-6" /></TableCell>
                </TableRow>
            ))}
        </>
    )

    if (loading) {
        return (
            <div className='flex flex-col h-full min-h-0 w-full'>
                <div className='pb-4 shrink-0'>
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-9 w-[280px]" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-9" />
                            <Skeleton className="h-9 w-[70px]" />
                        </div>
                    </div>
                </div>
                <div className='flex-1 min-h-0 overflow-auto border rounded-md bg-card'>
                    <Table className='min-w-max w-full'>
                        <TableHeader className='sticky top-0 z-10'>
                            <TableRow className='border-b-0 hover:bg-transparent'>
                                <TableHead className='bg-card border-b h-10 w-10'><Skeleton className="h-4 w-4" /></TableHead>
                                <TableHead className='bg-card border-b h-10'><Skeleton className="h-4 w-16" /></TableHead>
                                <TableHead className='bg-card border-b h-10'><Skeleton className="h-4 w-14" /></TableHead>
                                <TableHead className='bg-card border-b h-10'><Skeleton className="h-4 w-20" /></TableHead>
                                <TableHead className='bg-card border-b h-10 w-16'><Skeleton className="h-4 w-12" /></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody><TableSkeleton /></TableBody>
                    </Table>
                </div>
            </div>
        )
    }

    if (!metadata) {
        return <div className="text-center text-muted-foreground py-8">Error al cargar la configuración de la tabla.</div>
    }

    return (
        <OptionsContext.Provider value={{ optionsMap }}>
            <div className='flex flex-col h-full min-h-0 w-full'>
                <div className='pb-4 shrink-0'>
                    <DataTableToolbar
                        table={table}
                        searchPlaceholder={metadata.searchPlaceholder || 'Buscar...'}
                        filters={filters}
                        activeFilters={dynamicFilters}
                        onDynamicFilterChange={handleDynamicFilterChange}
                        dateFilter={{ value: dateRange, onChange: setDateRange, placeholder: 'Filtrar por fecha' }}
                        perPageOptions={metadata.perPageOptions}
                        onRefresh={handleRefresh}
                        isLoading={loadingData}
                        selectedCount={Object.keys(rowSelection).length}
                        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
                        extraActions={
                            <>
                                {metadata.canExport && (
                                    <Button variant="outline" size="sm" className="h-8" onClick={() => setExportOpen(true)}>
                                        <Download className="h-4 w-4 mr-1" /> Exportar
                                    </Button>
                                )}
                                {metadata.canImport && (
                                    <Button variant="outline" size="sm" className="h-8" onClick={() => setImportOpen(true)}>
                                        <Upload className="h-4 w-4 mr-1" /> Importar
                                    </Button>
                                )}
                            </>
                        }
                    />
                </div>
                <div className='flex-1 min-h-0 overflow-auto border rounded-md bg-card'>
                    <Table className='min-w-max w-full'>
                        <TableHeader className='sticky top-0 z-10'>
                            {table.getHeaderGroups().map((headerGroup: HeaderGroup<any>) => (
                                <TableRow key={headerGroup.id} className='border-b-0 hover:bg-transparent'>
                                    {headerGroup.headers.map((header: Header<any, unknown>) => {
                                        const isActionsColumn = header.id === 'actions'
                                        return (
                                            <TableHead
                                                key={header.id}
                                                colSpan={header.colSpan}
                                                style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                                                className={cn('bg-card border-b h-10', isActionsColumn && 'sticky right-0 z-20 bg-card shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]')}
                                            >
                                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                            </TableHead>
                                        )
                                    })}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {loadingData && data.length === 0 ? (
                                <TableSkeleton />
                            ) : table.getRowModel().rows?.length ? (
                                table.getRowModel().rows.map((row: Row<any>) => (
                                    <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                                        {row.getVisibleCells().map((cell: Cell<any, unknown>) => {
                                            const isActionsColumn = cell.column.id === 'actions'
                                            return (
                                                <TableCell
                                                    key={cell.id}
                                                    style={cell.column.columnDef.size ? { width: cell.column.columnDef.size } : undefined}
                                                    className={cn('py-2', isActionsColumn && 'sticky right-0 bg-card shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]')}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            )
                                        })}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow className='border-b-0 hover:bg-transparent'>
                                    <TableCell colSpan={columns.length} className='h-full p-0'>
                                        <div className="flex h-full py-12 flex-col items-center justify-center gap-2 text-muted-foreground">
                                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
                                                <Inbox className="h-10 w-10" />
                                            </div>
                                            <div className="flex flex-col items-center gap-1">
                                                <h3 className="text-lg font-semibold text-foreground">No se encontraron resultados</h3>
                                                <p className="text-sm text-muted-foreground">No hay datos para mostrar en este momento.</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className='shrink-0 pt-4'>
                    <DataTablePagination
                        table={table}
                        pageSizeOptions={metadata.perPageOptions}
                    />
                </div>
            </div>

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

            <AlertDialog open={showBulkDeleteConfirm} onOpenChange={(open: boolean) => !open && !isBulkDeleting && setShowBulkDeleteConfirm(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{isBulkDeleting ? 'Eliminando registros...' : '¿Eliminar múltiples registros?'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {isBulkDeleting ? (
                                <div className="space-y-4 mt-4">
                                    <Progress value={(bulkDeleteProgress / bulkDeleteTotal) * 100} />
                                    <p className="text-center text-sm">Procesando {bulkDeleteProgress} de {bulkDeleteTotal} registros...</p>
                                </div>
                            ) : (
                                <>Esta acción no se puede deshacer. Se eliminarán permanentemente <strong>{Object.keys(rowSelection).length}</strong> registro(s) de nuestros servidores.</>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {!isBulkDeleting && (
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={(e: React.MouseEvent) => { e.preventDefault(); confirmBulkDelete() }} className="bg-red-600 hover:bg-red-700">Eliminar todos</AlertDialogAction>
                        </AlertDialogFooter>
                    )}
                </AlertDialogContent>
            </AlertDialog>

            <DynamicRecordDialog
                open={recordDialog.open}
                onOpenChange={(open: boolean) => setRecordDialog((prev) => ({ ...prev, open }))}
                mode={recordDialog.mode}
                model={model}
                recordId={recordDialog.recordId}
                endpoint={endpoint}
                onSaved={handleRefresh}
            />

            {metadata.canExport && (
                <ExportDialog open={exportOpen} onOpenChange={setExportOpen} model={model} metadata={metadata} currentFilters={buildFilterParams()} hasActiveFilters={hasActiveFilters} />
            )}
            {metadata.canImport && (
                <ImportDialog open={importOpen} onOpenChange={setImportOpen} model={model} metadata={metadata} onImported={handleRefresh} />
            )}
            {actionModal.action && (
                <ActionModalDispatcher
                    open={actionModal.open}
                    onOpenChange={(open: boolean) => setActionModal((prev) => ({ ...prev, open }))}
                    action={actionModal.action}
                    model={model}
                    record={actionModal.record}
                    endpoint={endpoint}
                    onSuccess={handleRefresh}
                />
            )}
            <DataTableBulkActions table={table} entityName="registro">
                <Button variant="destructive" size="sm" className="h-8" onClick={() => setShowBulkDeleteConfirm(true)}>
                    <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
                </Button>
            </DataTableBulkActions>
        </OptionsContext.Provider>
    )
}

