import { useState, useEffect, useCallback } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Download, ChevronDown, Loader2 } from 'lucide-react'
import type { TableMetadata } from './types'

interface ExportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    model: string
    metadata: TableMetadata
    currentFilters?: Record<string, any> // Pre-built filter params (f_*, search, sortBy, order)
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
    const [format, setFormat] = useState<'csv' | 'json'>('csv')
    const [exportAll, setExportAll] = useState(false)
    const [selectedColumns, setSelectedColumns] = useState<string[]>([])
    const [columnsOpen, setColumnsOpen] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [progress, setProgress] = useState(0)
    const [asyncJobId, setAsyncJobId] = useState<string | null>(null)

    // Initialize selected columns when dialog opens
    useEffect(() => {
        if (open && metadata?.columns) {
            setSelectedColumns(
                metadata.columns
                    .filter(col => !col.hidden)
                    .map(col => col.key)
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
        setSelectedColumns(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        )
    }, [])

    const toggleAllColumns = useCallback(() => {
        const visibleKeys = metadata.columns
            .filter(col => !col.hidden)
            .map(col => col.key)

        if (selectedColumns.length === visibleKeys.length) {
            setSelectedColumns([])
        } else {
            setSelectedColumns(visibleKeys)
        }
    }, [metadata, selectedColumns])

    // Poll async export status
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
    }, [asyncJobId, format, onOpenChange])

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
            const params: Record<string, any> = {
                format,
                columns: selectedColumns.join(','),
            }

            // Pass current filters unless user chose "export all"
            if (!exportAll && currentFilters) {
                Object.entries(currentFilters).forEach(([key, value]) => {
                    if (value !== undefined && value !== '') {
                        params[key] = value
                    }
                })
            }

            const response = await api.get(`/data/${model}/export`, {
                params,
                responseType: 'blob',
                validateStatus: () => true,
            })

            const contentType = response.headers['content-type'] || ''

            if (contentType.includes('application/json')) {
                // Async job response
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
                // Direct download
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

    const visibleColumns = metadata?.columns?.filter(col => !col.hidden) ?? []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>Exportar {metadata.title}</DialogTitle>
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
                            {/* Format selection */}
                            <div className="space-y-3">
                                <Label className="text-sm font-medium">Formato</Label>
                                <RadioGroup
                                    value={format}
                                    onValueChange={(val) => setFormat(val as 'csv' | 'json')}
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

                            {/* Export all option (only shown when filters are active) */}
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

                            {/* Column selector */}
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
                                                    {col.label}
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
