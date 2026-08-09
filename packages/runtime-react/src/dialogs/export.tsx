// ExportDialog — lets users pick format (csv/json) + columns and kicks off
// either a sync download or an async export job (polled via /exports/:id/status).
//
// Labels work for BOTH host styles:
//   - Core DefineTable with human text ("Especialidades") → shown as-is via
//     t(label, { defaultValue: label })
//   - Manifest i18n keys ("purchases.field.state") → resolved by the host i18n
//     bundle the same way DynamicTable already translates column headers
// The localized labels are also sent to the API as `column_labels` so the CSV
// headers match what the user sees in the dialog (backend may not have the
// addon locale bundles that only live on the frontend).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Label,
    Checkbox,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@asteby/metacore-ui/primitives'
import { Progress, RadioGroup, RadioGroupItem } from './_primitives'
import { toast } from 'sonner'
import { Download, ChevronDown, Loader2 } from 'lucide-react'
import type { TableMetadata } from '../types'
import { useApi } from '../api-context'

interface ExportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    model: string
    metadata: TableMetadata
    currentFilters?: Record<string, any>
    hasActiveFilters?: boolean
}

export function ExportDialog({
    open,
    onOpenChange,
    model,
    metadata,
    currentFilters,
    hasActiveFilters,
}: ExportDialogProps) {
    const api = useApi()
    const { t, i18n } = useTranslation()
    const [format, setFormat] = useState<'csv' | 'json'>('csv')
    const [exportAll, setExportAll] = useState(false)
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    const [columnsOpen, setColumnsOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [progress, setProgress] = useState(0)
    const [asyncJobId, setAsyncJobId] = useState<string | null>(null)

    const tr = useCallback(
        (label?: string, fallback?: string) => {
            const raw = (label && label.trim()) || fallback || ''
            if (!raw) return fallback || ''
            return t(raw, { defaultValue: raw })
        },
        [t],
    )

    const title = useMemo(
        () => tr((metadata as { titleKey?: string }).titleKey || metadata.title, metadata.title || model),
        [metadata, model, tr],
    )

    const visibleColumns = useMemo(
        () =>
            (metadata?.columns?.filter((col) => !col.hidden) ?? []).map((col) => ({
                ...col,
                displayLabel: tr(col.label, col.key),
            })),
        [metadata, tr],
    )
    useEffect(() => {
        if (open && metadata?.columns) {
            setSelectedColumns(
                metadata.columns
                    .filter((col) => !col.hidden)
                    .map((col) => col.key),
            )
            setFormat('csv')
            setExportAll(false)
            setColumnsOpen(false)
            setExporting(false)
            setProgress(0)
            setAsyncJobId(null)
        }
    }, [open, metadata])

    const toggleColumn = useCallback((key: string) => {
        setSelectedColumns((prev: string[]) =>
            prev.includes(key)
                ? prev.filter((k: string) => k !== key)
                : [...prev, key],
        )
    }, [])

    const toggleAllColumns = useCallback(() => {
        const visibleKeys = visibleColumns.map((col) => col.key)

        if (selectedColumns.length === visibleKeys.length) {
            setSelectedColumns([])
        } else {
            setSelectedColumns(visibleKeys)
        }
    }, [visibleColumns, selectedColumns])

    useEffect(() => {
        if (!asyncJobId) return

        const interval = setInterval(async () => {
            try {
                const res = await api.get(`/exports/${asyncJobId}/status`)
                const status = res.data?.data ?? res.data

                if (status.progress !== undefined) {
                    setProgress(status.progress)
                }

                if (status.status === 'completed') {
                    clearInterval(interval)
                    const downloadRes = await api.get(
                        `/exports/${asyncJobId}/download`,
                        { responseType: 'blob' }
                    )
                    triggerDownload(downloadRes.data, format)
                    setExporting(false)
                    setAsyncJobId(null)
                    toast.success('Exportación completada')
                    onOpenChange(false)
                } else if (status.status === 'failed') {
                    clearInterval(interval)
                    setExporting(false)
                    setAsyncJobId(null)
                    toast.error(status.error_message || 'Error al exportar')
                }
            } catch {
                clearInterval(interval)
                setExporting(false)
                setAsyncJobId(null)
                toast.error('Error al verificar el estado de la exportación')
            }
        }, 2000)

        return () => clearInterval(interval)
    }, [asyncJobId, format, onOpenChange, api])

    const triggerDownload = (blob: Blob, fmt: string) => {
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${model}-export.${fmt === 'json' ? 'json' : 'csv'}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
    }

    const handleExport = async () => {
        if (selectedColumns.length === 0) {
            toast.error('Selecciona al menos una columna para exportar')
            return
        }

        setExporting(true)
        setProgress(0)

        try {
            const columnLabels: Record<string, string> = {}
            for (const col of visibleColumns) {
                if (selectedColumns.includes(col.key)) {
                    columnLabels[col.key] = col.displayLabel
                }
            }

            const params: Record<string, any> = {
                format,
                columns: selectedColumns.join(','),
                // Localized headers so CSV matches the dialog (core text OR
                // manifest i18n keys resolved by the host frontend).
                column_labels: JSON.stringify(columnLabels),
                lang: i18n.language || 'es',
            }

            if (!exportAll && currentFilters) {
                Object.entries(currentFilters).forEach(([key, value]) => {
                    if (value !== undefined && value !== '') {
                        params[key] = value
                    }
                })
            }

            const response = await api.get(`/dynamic/${model}/export`, {
                params,
                responseType: 'blob',
                validateStatus: () => true,
            })

            const contentType = response.headers?.['content-type'] || ''

            if (contentType.includes('application/json')) {
                const text = await response.data.text()
                const json = JSON.parse(text)

                if (json.async && json.job_id) {
                    setAsyncJobId(json.job_id)
                    setProgress(10)
                    toast.info(`Exportando ${json.total} registros...`)
                } else if (!json.success) {
                    setExporting(false)
                    toast.error(json.message || 'Error al exportar')
                }
            } else {
                triggerDownload(response.data, format)
                setExporting(false)
                toast.success('Exportación completada')
                onOpenChange(false)
            }
        } catch {
            setExporting(false)
            toast.error('Error al exportar los datos')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>Exportar {title}</DialogTitle>
                    <DialogDescription>
                        Selecciona el formato y las columnas a exportar.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {exporting ? (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground text-center">
                                Exportando datos...
                            </p>
                            <Progress value={progress} />
                            <p className="text-xs text-muted-foreground text-center">
                                {progress > 0 ? `${Math.round(progress)}%` : 'Preparando...'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                <Label className="text-sm font-medium">Formato</Label>
                                <RadioGroup
                                    value={format}
                                    onValueChange={(val: string) => setFormat(val as 'csv' | 'json')}
                                    className="flex gap-4"
                                >
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem value="csv" id="format-csv" />
                                        <Label htmlFor="format-csv" className="font-normal cursor-pointer">
                                            CSV
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem value="json" id="format-json" />
                                        <Label htmlFor="format-json" className="font-normal cursor-pointer">
                                            JSON
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {hasActiveFilters && (
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="export-all"
                                        checked={exportAll}
                                        onCheckedChange={(checked) =>
                                            setExportAll(checked === true)
                                        }
                                    />
                                    <Label
                                        htmlFor="export-all"
                                        className="font-normal cursor-pointer text-sm"
                                    >
                                        Exportar todos los registros (ignorar filtros)
                                    </Label>
                                </div>
                            )}

                            <Collapsible open={columnsOpen} onOpenChange={setColumnsOpen}>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-between px-0 hover:bg-transparent"
                                    >
                                        <span className="text-sm font-medium">
                                            Columnas ({selectedColumns.length}/{visibleColumns.length})
                                        </span>
                                        <ChevronDown
                                            className={`h-4 w-4 transition-transform ${columnsOpen ? 'rotate-180' : ''}`}
                                        />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-2 pt-2">
                                    <div className="flex items-center gap-2 pb-2 border-b">
                                        <Checkbox
                                            id="select-all-columns"
                                            checked={
                                                selectedColumns.length === visibleColumns.length
                                            }
                                            onCheckedChange={toggleAllColumns}
                                        />
                                        <Label
                                            htmlFor="select-all-columns"
                                            className="font-normal cursor-pointer text-sm"
                                        >
                                            Seleccionar todas
                                        </Label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                        {visibleColumns.map(col => (
                                            <div
                                                key={col.key}
                                                className="flex items-center gap-2"
                                            >
                                                <Checkbox
                                                    id={`col-${col.key}`}
                                                    checked={selectedColumns.includes(col.key)}
                                                    onCheckedChange={() => toggleColumn(col.key)}
                                                />
                                                <Label
                                                    htmlFor={`col-${col.key}`}
                                                    className="font-normal cursor-pointer text-sm truncate"
                                                >
                                                    {col.displayLabel}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </>
                    )}
                </div>

                <DialogFooter className="p-4 border-t shrink-0">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={exporting}
                    >
                        Cancelar
                    </Button>
                    {!exporting && (
                        <Button onClick={handleExport} disabled={selectedColumns.length === 0}>
                            <Download className="h-4 w-4 mr-1" />
                            Exportar
                        </Button>
                    )}
                    {exporting && (
                        <Button disabled>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Exportando...
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
