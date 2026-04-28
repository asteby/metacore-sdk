// DynamicCRUDPage — drop-in route component for any model that has
// `DefineTable` metadata on the backend. Pulls the title and CRUD flag
// from `/metadata/table/<model>`, mounts <DynamicTable>, wires
// `<DynamicRecordDialog>` for create, and exposes `<ExportDialog>` /
// `<ImportDialog>` from a single toolbar.
//
// The whole thing exists so apps stop reinventing the same ~150 LOC of
// page chrome around DynamicTable. Override anything via props:
//
//   <DynamicCRUDPage
//     model="customers"
//     endpoint="/dynamic/customers"        // default: /dynamic/<model>
//     title="Mis clientes"                 // default: metadata.title
//     newLabel="Nuevo cliente"             // default: "New <singular>"
//     hideExport hideImport hideCreate     // toolbar trimming
//     headerExtras={<MyBranchSwitcher />}  // injected before the title row
//     toolbarExtras={<MyExtraActions />}   // injected before "Nuevo X"
//     i18n={{ refresh: 'Refrescar', export: 'Exportar', ... }}
//     onChange={() => analytics.track('table.refresh')}
//   />
//
// Apps that only need to swap the create endpoint or hide a button keep
// the boilerplate to one line. Apps that need richer per-model headers
// register a model-extension registry and feed it via `headerExtras`.
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react'
import { Plus, Download, Upload, RefreshCw } from 'lucide-react'
import { useApi } from './api-context'
import { useMetadataCache } from './metadata-cache'
import { DynamicTable } from './dynamic-table'
import { DynamicRecordDialog } from './dialogs/dynamic-record'
import { ExportDialog } from './dialogs/export'
import { ImportDialog } from './dialogs/import'
import { getModelExtension } from './model-extension-registry'
import type { TableMetadata } from './types'

export interface DynamicCRUDPageStrings {
    refresh?: string
    export?: string
    import?: string
    /** Used as the create button label when `newLabel` is not provided.
     *  Receives the singular form of the title. */
    newPrefix?: string
}

const defaultStrings: Required<DynamicCRUDPageStrings> = {
    refresh: 'Refresh',
    export: 'Export',
    import: 'Import',
    newPrefix: 'New',
}

export interface DynamicCRUDPageClasses {
    root?: string
    container?: string
    header?: string
    title?: string
    toolbar?: string
    tableWrapper?: string
}

export interface DynamicCRUDPageProps {
    /** Model key as registered on the backend (e.g. "customers"). */
    model: string
    /** Override the data endpoint. Defaults to `/dynamic/<model>`. */
    endpoint?: string
    /** Override the human title. Defaults to `metadata.title`. */
    title?: string
    /** Override the create button label. Defaults to `${newPrefix} ${singular}`. */
    newLabel?: string
    /** Strings used in default labels — pass when the host has its own i18n. */
    i18n?: DynamicCRUDPageStrings
    /** Hide the create button + dialog even when metadata says CRUD is enabled. */
    hideCreate?: boolean
    hideExport?: boolean
    hideImport?: boolean
    hideRefresh?: boolean
    /** Slot rendered above the title row (e.g. branch switcher, kpi strip). */
    headerExtras?: React.ReactNode
    /** Slot rendered in the toolbar, before the create button. */
    toolbarExtras?: React.ReactNode
    /** Tailwind class overrides for layout primitives. */
    classes?: DynamicCRUDPageClasses
    /** Fired after a create/import/refresh successfully reloads the table. */
    onChange?: () => void
}

/**
 * Page-level CRUD shell wired around <DynamicTable>. Hosts mount a single
 * `<DynamicCRUDPage model="..." />` per route and the SDK takes care of
 * metadata fetch, dialogs and toolbar.
 */
export function DynamicCRUDPage(props: DynamicCRUDPageProps) {
    const {
        model,
        endpoint,
        title: titleOverride,
        newLabel,
        i18n,
        hideCreate,
        hideExport,
        hideImport,
        hideRefresh,
        headerExtras,
        toolbarExtras,
        classes,
        onChange,
    } = props

    const strings = { ...defaultStrings, ...(i18n ?? {}) }
    const dataEndpoint = endpoint ?? `/dynamic/${model}`
    const ext = getModelExtension(model)

    const api = useApi()
    const cachedMeta = useMetadataCache((s) => s.getMetadata(model))

    const [metadata, setMetadata] = useState<TableMetadata | null>(cachedMeta ?? null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [openCreate, setOpenCreate] = useState(false)
    const [openExport, setOpenExport] = useState(false)
    const [openImport, setOpenImport] = useState(false)

    useEffect(() => {
        if (cachedMeta) {
            setMetadata(cachedMeta)
            return
        }
        let cancelled = false
        api
            .get(`/metadata/table/${model}`)
            .then((res) => {
                if (cancelled) return
                const meta = (res.data?.data ?? res.data) as TableMetadata
                setMetadata(meta ?? null)
            })
            .catch(() => {
                if (!cancelled) setMetadata(null)
            })
        return () => {
            cancelled = true
        }
    }, [model, cachedMeta, api])

    const title = titleOverride ?? ext?.title ?? metadata?.title ?? model
    const resolvedNewLabel = newLabel ?? ext?.newLabel
    const singular = useMemo(() => {
        const t = title.replace(/s$/i, '')
        return t.charAt(0).toUpperCase() + t.slice(1)
    }, [title])

    const enableCRUD = metadata?.enableCRUDActions ?? false
    const effectiveHideCreate = hideCreate || ext?.hideCreate
    const effectiveHideExport = hideExport || ext?.hideExport
    const effectiveHideImport = hideImport || ext?.hideImport
    const effectiveHideRefresh = hideRefresh || ext?.hideRefresh
    const showCreate = enableCRUD && !effectiveHideCreate
    const showImport = enableCRUD && !effectiveHideImport
    const showExport = !effectiveHideExport
    const showRefresh = !effectiveHideRefresh

    const handleRefresh = useCallback(() => {
        setRefreshKey((k) => k + 1)
        onChange?.()
    }, [onChange])

    const rootCls = classes?.root ?? 'flex flex-col h-full overflow-hidden'
    const containerCls = classes?.container ?? 'flex flex-col flex-1 p-6 lg:p-8 gap-4 overflow-hidden'
    const headerCls = classes?.header ?? 'flex items-center justify-between shrink-0'
    const titleCls = classes?.title ?? 'text-2xl font-bold tracking-tight'
    const toolbarCls = classes?.toolbar ?? 'flex items-center gap-2'
    const tableWrapperCls = classes?.tableWrapper ?? 'flex-1 min-h-0'

    return (
        <div className={rootCls}>
            <div className={containerCls}>
                {ext?.headerExtras && <ext.headerExtras model={model} onRefresh={handleRefresh} />}
                {headerExtras}
                <div className={headerCls}>
                    {metadata ? (
                        <h1 className={titleCls}>{title}</h1>
                    ) : (
                        <div className='h-8 w-48 bg-muted rounded animate-pulse' />
                    )}
                    <div className={toolbarCls}>
                        {showRefresh && (
                            <button
                                type='button'
                                onClick={handleRefresh}
                                aria-label={strings.refresh}
                                className='inline-flex items-center justify-center size-9 rounded-md border border-border bg-background hover:bg-accent text-foreground'
                            >
                                <RefreshCw className='size-4' />
                            </button>
                        )}
                        {metadata && showExport && (
                            <button
                                type='button'
                                onClick={() => setOpenExport(true)}
                                className='inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background hover:bg-accent text-sm font-medium text-foreground'
                            >
                                <Download className='size-4' />
                                {strings.export}
                            </button>
                        )}
                        {metadata && showImport && (
                            <button
                                type='button'
                                onClick={() => setOpenImport(true)}
                                className='inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-background hover:bg-accent text-sm font-medium text-foreground'
                            >
                                <Upload className='size-4' />
                                {strings.import}
                            </button>
                        )}
                        {ext?.toolbarExtras && <ext.toolbarExtras model={model} onRefresh={handleRefresh} />}
                        {toolbarExtras}
                        {showCreate && (
                            <button
                                type='button'
                                onClick={() => setOpenCreate(true)}
                                className='inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium'
                            >
                                <Plus className='size-4' />
                                {resolvedNewLabel ?? `${strings.newPrefix} ${singular}`}
                            </button>
                        )}
                    </div>
                </div>

                <div className={tableWrapperCls}>
                    <DynamicTable
                        key={model}
                        model={model}
                        endpoint={dataEndpoint}
                        refreshTrigger={refreshKey}
                    />
                </div>
            </div>

            {showCreate && (
                <DynamicRecordDialog
                    open={openCreate}
                    onOpenChange={setOpenCreate}
                    mode='create'
                    model={model}
                    endpoint={dataEndpoint}
                    onSaved={handleRefresh}
                />
            )}

            {metadata && showExport && (
                <ExportDialog
                    open={openExport}
                    onOpenChange={setOpenExport}
                    model={model}
                    metadata={metadata}
                />
            )}

            {metadata && showImport && (
                <ImportDialog
                    open={openImport}
                    onOpenChange={setOpenImport}
                    model={model}
                    metadata={metadata}
                    onImported={handleRefresh}
                />
            )}
        </div>
    )
}
