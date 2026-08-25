// FilePickButton — locale-aware file picker. Native <input type="file"> always
// paints the browser/OS chrome ("Choose File" / "No file chosen") in the
// *browser* language, not the app language — so Spanish UIs on an English
// Chrome show English. Hide the native control and drive it from a Button
// whose labels come from i18n (common.upload.*).
import { useCallback, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@asteby/metacore-ui/primitives'
import { Loader2, Paperclip, X } from 'lucide-react'

export interface FilePickButtonProps {
    /** Called with the picked File, or null when cleared. */
    onFile: (file: File | null) => void
    accept?: string
    /** HTML capture attribute (e.g. "environment" for rear camera). */
    capture?: boolean | 'user' | 'environment'
    disabled?: boolean
    loading?: boolean
    /** When true, shows replace + clear affordances. */
    hasFile?: boolean
    /** Optional display name next to the button when hasFile. */
    fileName?: string
    className?: string
    /** Override the empty-state pick label (still falls back to i18n). */
    pickLabel?: string
    replaceLabel?: string
    clearLabel?: string
    id?: string
}

export function FilePickButton({
    onFile,
    accept,
    capture,
    disabled,
    loading,
    hasFile,
    fileName,
    className,
    pickLabel,
    replaceLabel,
    clearLabel,
    id: idProp,
}: FilePickButtonProps) {
    const { t } = useTranslation()
    const autoId = useId()
    const id = idProp || autoId
    const inputRef = useRef<HTMLInputElement | null>(null)
    const busy = Boolean(disabled || loading)

    const pick = useCallback(() => {
        if (busy) return
        inputRef.current?.click()
    }, [busy])

    const onChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0] ?? null
            if (inputRef.current) inputRef.current.value = ''
            if (file) onFile(file)
        },
        [onFile],
    )

    const onClear = useCallback(() => {
        if (busy) return
        onFile(null)
    }, [busy, onFile])

    const emptyLabel =
        pickLabel || t('common.upload.choose', { defaultValue: 'Choose file' })
    const filledLabel =
        replaceLabel || t('common.upload.replace', { defaultValue: 'Replace' })
    const removeLabel =
        clearLabel || t('common.upload.remove', { defaultValue: 'Remove file' })
    const emptyHint = t('common.upload.none', { defaultValue: 'No file chosen' })

    return (
        <div className={className ? `grid gap-1.5 ${className}` : 'grid gap-1.5'} data-widget="file-pick">
            <input
                ref={inputRef}
                id={id}
                type="file"
                accept={accept}
                {...(capture !== undefined ? { capture } : {})}
                className="sr-only"
                onChange={onChange}
                tabIndex={-1}
                aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={pick} disabled={busy}>
                    {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Paperclip className="mr-2 h-4 w-4" />
                    )}
                    {hasFile ? filledLabel : emptyLabel}
                </Button>
                {hasFile ? (
                    <div className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                        {fileName ? (
                            <span className="truncate" title={fileName}>
                                {fileName}
                            </span>
                        ) : null}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={onClear}
                            disabled={busy}
                            aria-label={removeLabel}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ) : (
                    <span className="text-xs text-muted-foreground">{emptyHint}</span>
                )}
            </div>
        </div>
    )
}
