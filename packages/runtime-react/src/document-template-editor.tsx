// DocumentTemplateEditor — textarea + preview/save/reset for one org overlay
// of an addon document. Headless-friendly: plain buttons + textarea, styled via
// className. Host surfaces (ops Plantillas) can wrap this or roll their own
// using the hooks in use-org-document-templates.
import { useEffect, useState } from 'react'
import {
    useOrgDocumentTemplate,
    usePreviewOrgDocumentTemplate,
    useResetOrgDocumentTemplate,
    useSaveOrgDocumentTemplate,
} from './use-org-document-templates'

export interface DocumentTemplateEditorProps {
    addonKey: string
    documentKey: string
    /** Called after a successful save or reset. */
    onSaved?: () => void
    onError?: (err: unknown) => void
    className?: string
    disabled?: boolean
}

export function DocumentTemplateEditor({
    addonKey,
    documentKey,
    onSaved,
    onError,
    className,
    disabled,
}: DocumentTemplateEditorProps) {
    const { template, isLoading } = useOrgDocumentTemplate(addonKey, documentKey)
    const save = useSaveOrgDocumentTemplate()
    const reset = useResetOrgDocumentTemplate()
    const preview = usePreviewOrgDocumentTemplate()
    const [html, setHtml] = useState('')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewing, setPreviewing] = useState(false)

    useEffect(() => {
        if (template?.html != null) setHtml(template.html)
    }, [template?.html])

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl)
        }
    }, [previewUrl])

    const busy = save.isPending || reset.isPending || previewing || disabled

    async function onPreview() {
        setPreviewing(true)
        try {
            const url = await preview({
                addonKey,
                documentKey,
                html,
                paper: template?.paper,
            })
            setPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev)
                return url
            })
        } catch (err) {
            onError?.(err)
        } finally {
            setPreviewing(false)
        }
    }

    async function onSave() {
        try {
            await save.mutateAsync({
                addonKey,
                documentKey,
                html,
                paper: template?.paper,
            })
            onSaved?.()
        } catch (err) {
            onError?.(err)
        }
    }

    async function onReset() {
        try {
            const detail = await reset.mutateAsync({ addonKey, documentKey })
            setHtml(detail.html)
            onSaved?.()
        } catch (err) {
            onError?.(err)
        }
    }

    if (isLoading && !template) {
        return <p className={className}>…</p>
    }

    return (
        <div className={className}>
            <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                disabled={busy}
                spellCheck={false}
                rows={22}
                style={{
                    width: '100%',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 12,
                    lineHeight: 1.45,
                }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" disabled={busy} onClick={() => void onPreview()}>
                    {previewing ? '…' : 'Vista previa'}
                </button>
                <button type="button" disabled={busy} onClick={() => void onSave()}>
                    Guardar
                </button>
                <button
                    type="button"
                    disabled={busy || !template?.customized}
                    onClick={() => void onReset()}
                >
                    Restaurar default
                </button>
            </div>
            {previewUrl ? (
                <iframe
                    title="Vista previa"
                    src={previewUrl}
                    style={{
                        width: '100%',
                        height: 480,
                        marginTop: 12,
                        border: '1px solid #e5e7eb',
                    }}
                />
            ) : null}
        </div>
    )
}
