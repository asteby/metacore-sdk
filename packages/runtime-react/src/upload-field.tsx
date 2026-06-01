// UploadField — the `upload` widget renderer shared by DynamicForm's
// FieldRenderer and the action-modal-dispatcher's renderField so the two stay
// in lockstep. Renders a themed Button that proxies a hidden <input type=file>,
// POSTs the picked file to the host upload endpoint as multipart/form-data, and
// stores the returned file url/path as the field value.
//
// Endpoint assumption: `POST /uploads` (multipart) returning
//   { success: true, data: { file_url?, url?, path?, file_path? } }
// matching the kernel envelope. A field may override the path via
// `field.searchEndpoint` (reused as the upload endpoint escape hatch) — kept
// generic so this carries no host-specific route. Honors field.accept /
// field.maxSize and forwards field.storagePath as `storage_path`.
import { useCallback, useRef, useState } from 'react'
import { Button } from '@asteby/metacore-ui/primitives'
import { Loader2, Paperclip, X } from 'lucide-react'
import { useApi } from './api-context'
import { getUploadConfig } from './dynamic-form-schema'
import type { ActionFieldDef } from './types'

export interface UploadFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
}

/** Default host upload endpoint. Overridable per-field via `searchEndpoint`. */
const DEFAULT_UPLOAD_ENDPOINT = '/uploads'

/**
 * Pulls the stored file url/path out of an upload response envelope, tolerating
 * the common key shapes a host might return. Pure — exported for tests.
 */
export function extractUploadedValue(payload: any): string {
    if (payload === null || payload === undefined) return ''
    if (typeof payload === 'string') return payload
    const d = (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload) ?? payload
    if (typeof d === 'string') return d
    if (d && typeof d === 'object') {
        const candidate =
            d.file_url ?? d.fileUrl ?? d.url ?? d.file_path ?? d.filePath ?? d.path
        if (typeof candidate === 'string') return candidate
    }
    return ''
}

/** Short, human display name for an already-stored file value (a url/path). */
export function uploadedDisplayName(value: unknown): string {
    if (typeof value !== 'string' || value === '') return ''
    const cleaned = value.split('?')[0]
    const parts = cleaned.split('/')
    return parts[parts.length - 1] || cleaned
}

export function UploadField({ field, value, onChange }: UploadFieldProps) {
    const api = useApi()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { accept, maxSize, storagePath } = getUploadConfig(field)
    const endpoint = field.searchEndpoint || DEFAULT_UPLOAD_ENDPOINT

    const handlePick = useCallback(() => {
        if (uploading) return
        inputRef.current?.click()
    }, [uploading])

    const handleFile = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            // Reset the input so picking the same file again re-fires change.
            if (inputRef.current) inputRef.current.value = ''
            if (!file) return
            setError(null)
            if (maxSize && file.size > maxSize) {
                const mb = (maxSize / (1024 * 1024)).toFixed(1)
                setError(`Archivo muy grande (máx. ${mb} MB).`)
                return
            }
            const form = new FormData()
            form.append('file', file)
            if (storagePath) form.append('storage_path', storagePath)
            setUploading(true)
            try {
                const res = await api.post(endpoint, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const body = (res as { data?: any })?.data
                if (body && body.success === false) {
                    setError(body.message || 'No se pudo subir el archivo.')
                    return
                }
                const stored = extractUploadedValue(body)
                if (!stored) {
                    setError('Respuesta de subida inválida.')
                    return
                }
                onChange(stored)
            } catch (err: any) {
                setError(err?.response?.data?.message || 'No se pudo subir el archivo.')
            } finally {
                setUploading(false)
            }
        },
        [api, endpoint, maxSize, storagePath, onChange],
    )

    const handleClear = useCallback(() => {
        if (uploading) return
        setError(null)
        onChange('')
    }, [uploading, onChange])

    const hasValue = typeof value === 'string' && value !== ''

    return (
        <div className="grid gap-1.5" data-widget="upload">
            <input
                ref={inputRef}
                id={field.key}
                type="file"
                accept={accept}
                className="sr-only"
                onChange={handleFile}
                tabIndex={-1}
                aria-hidden="true"
            />
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePick}
                    disabled={uploading}
                >
                    {uploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Paperclip className="mr-2 h-4 w-4" />
                    )}
                    {hasValue ? 'Reemplazar' : field.placeholder || 'Subir archivo'}
                </Button>
                {hasValue && !uploading && (
                    <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                        <span className="truncate" title={String(value)}>
                            {uploadedDisplayName(value)}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={handleClear}
                            aria-label="Quitar archivo"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>
            {error && (
                <span className="text-sm text-destructive" role="alert">
                    {error}
                </span>
            )}
        </div>
    )
}
