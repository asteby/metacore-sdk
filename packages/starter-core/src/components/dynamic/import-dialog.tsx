import { useState, useEffect, useRef } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { FileDown, Loader2, Check, AlertCircle } from 'lucide-react'
import type { TableMetadata } from './types'

interface ImportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    model: string
    metadata: TableMetadata
    onImported?: () => void
}

interface ValidationError {
    row: number
    field: string
    message: string
}

interface ValidationResult {
    valid: number
    errors: ValidationError[]
}

interface ImportResult {
    created: number
    errors: ValidationError[]
}

type Step = 'upload' | 'validation' | 'results'

export function ImportDialog({
    open,
    onOpenChange,
    model,
    metadata,
    onImported,
}: ImportDialogProps) {
    const [step, setStep] = useState<Step>('upload')
    const [file, setFile] = useState<File | null>(null)
    const [validating, setValidating] = useState(false)
    const [importing, setImporting] = useState(false)
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
    const [importResult, setImportResult] = useState<ImportResult | null>(null)
    const [progress, setProgress] = useState(0)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Reset state when dialog opens/closes
    useEffect(() => {
        if (open) {
            setStep('upload')
            setFile(null)
            setValidating(false)
            setImporting(false)
            setValidationResult(null)
            setImportResult(null)
            setProgress(0)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }, [open])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0] ?? null
        setFile(selectedFile)
    }

    const handleDownloadTemplate = async () => {
        try {
            const response = await api.get(`/data/${model}/export/template`, {
                responseType: 'blob',
            })
            const url = window.URL.createObjectURL(response.data)
            const link = document.createElement('a')
            link.href = url
            link.download = `${model}-plantilla.csv`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
        } catch {
            toast.error('Error al descargar la plantilla')
        }
    }

    const handleValidate = async () => {
        if (!file) {
            toast.error('Selecciona un archivo para validar')
            return
        }

        setValidating(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await api.post(`/data/${model}/import/validate`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })

            const data = res.data?.data ?? res.data
            setValidationResult({
                valid: data.valid ?? 0,
                errors: data.errors ?? [],
            })
            setStep('validation')
        } catch (err: any) {
            const message =
                err?.response?.data?.message || 'Error al validar el archivo'
            toast.error(message)
        } finally {
            setValidating(false)
        }
    }

    const handleImport = async () => {
        if (!file) return

        setImporting(true)
        setProgress(0)

        try {
            const formData = new FormData()
            formData.append('file', file)

            const res = await api.post(`/data/${model}/import`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        setProgress(
                            Math.round((progressEvent.loaded / progressEvent.total) * 100)
                        )
                    }
                },
            })

            const data = res.data?.data ?? res.data
            setImportResult({
                created: data.created ?? 0,
                errors: data.errors ?? [],
            })
            setStep('results')

            if ((data.created ?? 0) > 0) {
                onImported?.()
            }
        } catch (err: any) {
            const message =
                err?.response?.data?.message || 'Error al importar los datos'
            toast.error(message)
        } finally {
            setImporting(false)
            setProgress(0)
        }
    }

    const handleClose = () => {
        onOpenChange(false)
    }

    const stepTitle = {
        upload: 'Subir archivo',
        validation: 'Validacion',
        results: 'Resultados',
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b shrink-0">
                    <DialogTitle>
                        Importar {metadata.title}
                    </DialogTitle>
                    <DialogDescription>
                        {stepTitle[step]}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6">
                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <div className="space-y-6">
                            {/* Download template link */}
                            <div>
                                <Button
                                    variant="link"
                                    className="px-0 h-auto text-sm"
                                    onClick={handleDownloadTemplate}
                                >
                                    <FileDown className="h-4 w-4 mr-1" />
                                    Descargar plantilla CSV
                                </Button>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Descarga la plantilla para asegurar el formato correcto.
                                </p>
                            </div>

                            {/* File input */}
                            <div className="space-y-2">
                                <Label htmlFor="import-file" className="text-sm font-medium">
                                    Archivo
                                </Label>
                                <Input
                                    ref={fileInputRef}
                                    id="import-file"
                                    type="file"
                                    accept=".csv,.json"
                                    onChange={handleFileChange}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Formatos aceptados: CSV, JSON
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Validation */}
                    {step === 'validation' && validationResult && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 text-sm">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <span>
                                        <strong>{validationResult.valid}</strong> valido(s)
                                    </span>
                                </div>
                                {validationResult.errors.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                        <span>
                                            <strong>{validationResult.errors.length}</strong> error(es)
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Errors table */}
                            {validationResult.errors.length > 0 && (
                                <div className="border rounded-md max-h-60 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-16">Fila</TableHead>
                                                <TableHead>Campo</TableHead>
                                                <TableHead>Error</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {validationResult.errors.map((error, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-mono text-xs">
                                                        {error.row}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {error.field}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-destructive">
                                                        {error.message}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {/* Import progress */}
                            {importing && (
                                <div className="space-y-2">
                                    <Progress value={progress} />
                                    <p className="text-xs text-muted-foreground text-center">
                                        Importando... {progress > 0 ? `${progress}%` : ''}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Results */}
                    {step === 'results' && importResult && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="flex items-center gap-4">
                                {importResult.created > 0 && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Check className="h-4 w-4 text-green-600" />
                                        <span>
                                            <strong>{importResult.created}</strong> creado(s)
                                        </span>
                                    </div>
                                )}
                                {importResult.errors.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                        <span>
                                            <strong>{importResult.errors.length}</strong> error(es)
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Success message */}
                            {importResult.created > 0 && importResult.errors.length === 0 && (
                                <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-400">
                                    <Check className="h-4 w-4 shrink-0" />
                                    Todos los registros fueron importados correctamente.
                                </div>
                            )}

                            {/* Error list */}
                            {importResult.errors.length > 0 && (
                                <div className="border rounded-md max-h-60 overflow-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-16">Fila</TableHead>
                                                <TableHead>Campo</TableHead>
                                                <TableHead>Error</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {importResult.errors.map((error, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-mono text-xs">
                                                        {error.row}
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        {error.field}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-destructive">
                                                        {error.message}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t shrink-0">
                    {step === 'upload' && (
                        <>
                            <Button variant="outline" onClick={handleClose}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleValidate}
                                disabled={!file || validating}
                            >
                                {validating && (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                )}
                                {validating ? 'Validando...' : 'Validar'}
                            </Button>
                        </>
                    )}

                    {step === 'validation' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => setStep('upload')}
                                disabled={importing}
                            >
                                Atras
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={
                                    importing ||
                                    (validationResult !== null && validationResult.valid === 0)
                                }
                            >
                                {importing && (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                )}
                                {importing ? 'Importando...' : 'Importar'}
                            </Button>
                        </>
                    )}

                    {step === 'results' && (
                        <Button onClick={handleClose}>Cerrar</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
