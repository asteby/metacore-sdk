// UploadField — the `upload` widget renderer shared by DynamicForm's
// FieldRenderer and the action-modal-dispatcher's renderField so the two stay
// in lockstep. Renders a locale-aware FilePickButton that proxies a hidden
// <input type=file>, POSTs the picked file to the host upload endpoint as
// multipart/form-data, and stores the returned file url/path as the field value.
//
// Endpoint assumption: `POST /uploads` (multipart) returning
//   { success: true, data: { file_url?, url?, path?, file_path? } }
// matching the kernel envelope. A field may override the path via
// `field.searchEndpoint` (reused as the upload endpoint escape hatch) — kept
// generic so this carries no host-specific route. Honors field.accept /
// field.maxSize and forwards field.storagePath as `storage_path`.
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getUploadConfig } from './dynamic-form-schema'
import { FilePickButton } from './file-pick-button'
import { useApi } from './api-context'
import type { ActionFieldDef } from './types'

export interface UploadFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
}

/** Default host upload endpoint. Overridable per-field via `searchEndpoint`. */
const DEFAULT_UPLOAD_ENDPOINT = '/upload'

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
    const { t } = useTranslation()
    const api = useApi()
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { accept, maxSize, storagePath } = getUploadConfig(field)
    const endpoint = field.searchEndpoint || DEFAULT_UPLOAD_ENDPOINT
    const hasValue = typeof value === 'string' && value !== ''

    const handleFile = useCallback(
        async (file: File | null) => {
            if (!file) {
                setError(null)
                onChange('')
                return
            }
            setError(null)
            if (maxSize && file.size > maxSize) {
                const mb = (maxSize / (1024 * 1024)).toFixed(1)
                setError(
                    t('common.upload.too_large', {
                        mb,
                        defaultValue: `File too large (max {{mb}} MB).`,
                    }),
                )
                return
            }
            const form = new FormData()
            form.append('file', file)
            // The destination subfolder, declared per field via the manifest
            // (`storage_path`). Sent under BOTH keys: `folder` is what the ops
            // host reads (`c.FormValue("folder")`), `storage_path` is the
            // canonical SDK name kept for hosts that read it.
            if (storagePath) {
                form.append('folder', storagePath)
                form.append('storage_path', storagePath)
            }
            setUploading(true)
            try {
                const res = await api.post(endpoint, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const body = (res as { data?: any })?.data
                if (body && body.success === false) {
                    setError(
                        body.message ||
                            t('common.upload.failed', { defaultValue: 'Could not upload the file.' }),
                    )
                    return
                }
                const stored = extractUploadedValue(body)
                if (!stored) {
                    setError(
                        t('common.upload.invalid', {
                            defaultValue: 'Invalid upload response.',
                        }),
                    )
                    return
                }
                onChange(stored)
            } catch (err: any) {
                setError(
                    err?.response?.data?.message ||
                        t('common.upload.failed', { defaultValue: 'Could not upload the file.' }),
                )
            } finally {
                setUploading(false)
            }
        },
        [api, endpoint, maxSize, storagePath, onChange, t],
    )

    return (
        <div className="grid gap-1.5" data-widget="upload">
            <FilePickButton
                id={field.key}
                accept={accept}
                loading={uploading}
                hasFile={hasValue}
                fileName={hasValue ? uploadedDisplayName(value) : undefined}
                onFile={(f) => void handleFile(f)}
                pickLabel={field.placeholder || undefined}
            />
            {error && (
                <span className="text-sm text-destructive" role="alert">
                    {error}
                </span>
            )}
        </div>
    )
}
