// Mandatory reason on destructive operations (PER-4).
//
// A manifest model declares `reason_required` (delete and/or actions such as
// cancel). The kernel then answers a DELETE / action WITHOUT a reason with
// 422 `errors.reason: [{code: "required" | "min", params: {min}}]`. Instead of
// every screen carrying its own "motivo" prompt, `useReasonPrompt().run()` wraps
// the request: it tries it, and when the server says a reason is needed it asks
// once (a dialog) and retries with the reason attached. Screens that already know
// they need one can pass `reason` up front through the same helper.
//
// The reason is stamped on the canonical event by the kernel, so the activity log
// (RecordHistory) shows who removed/cancelled what, when, and why.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Textarea,
} from '@asteby/metacore-ui/primitives'

/** What the server told us about the missing reason. */
export interface ReasonRequiredInfo {
    /** Minimum trimmed length the policy demands (default 3). */
    min: number
    /** True when a reason WAS sent but was too short. */
    tooShort: boolean
}

export const DEFAULT_REASON_MIN = 3

/**
 * Detects the kernel's mandatory-reason refusal in an axios error (or a bare
 * response body): HTTP 422 with `errors.reason[0].code` of `required` | `min`.
 * Returns null for any other error.
 */
export function reasonRequiredInfo(err: unknown): ReasonRequiredInfo | null {
    const data = (err as { response?: { data?: unknown } } | undefined)?.response?.data ?? err
    const issues = (data as { errors?: { reason?: unknown } } | undefined)?.errors?.reason
    if (!Array.isArray(issues) || issues.length === 0) return null
    const first = issues[0] as { code?: string; params?: { min?: number } } | string
    const code = typeof first === 'string' ? first : first?.code
    if (code !== 'required' && code !== 'min') return null
    const min = typeof first === 'object' && typeof first?.params?.min === 'number' ? first.params.min : DEFAULT_REASON_MIN
    return { min, tooShort: code === 'min' }
}

export interface ReasonPromptDialogProps {
    open: boolean
    title: string
    description?: React.ReactNode
    /** Minimum trimmed length; the submit button stays disabled below it. */
    min?: number
    /** Label of the confirm button (default "Continuar"). */
    confirmLabel?: string
    /** Style the confirm button as destructive (delete / cancel). */
    destructive?: boolean
    /** Inline error from a previous attempt. */
    error?: string | null
    busy?: boolean
    onSubmit: (reason: string) => void
    onCancel: () => void
}

export function ReasonPromptDialog({
    open,
    title,
    description,
    min = DEFAULT_REASON_MIN,
    confirmLabel,
    destructive = true,
    error,
    busy,
    onSubmit,
    onCancel,
}: ReasonPromptDialogProps) {
    const { t } = useTranslation()
    const [reason, setReason] = useState('')

    useEffect(() => {
        if (open) setReason('')
    }, [open])

    const ready = reason.trim().length >= min

    return (
        <Dialog open={open} onOpenChange={(o: boolean) => !o && !busy && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description ? <DialogDescription>{description}</DialogDescription> : null}
                </DialogHeader>
                <div className="space-y-2">
                    <label htmlFor="mc-reason" className="text-sm font-medium">
                        {t('reason.label', { defaultValue: 'Motivo' })}
                    </label>
                    <Textarea
                        id="mc-reason"
                        autoFocus
                        rows={3}
                        value={reason}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)}
                        placeholder={t('reason.placeholder', { defaultValue: 'Explica por qué. Queda en la bitácora.' })}
                    />
                    {error ? <p className="text-destructive text-sm">{error}</p> : null}
                    {!error && reason.length > 0 && !ready ? (
                        <p className="text-muted-foreground text-xs">
                            {t('reason.min', { min, defaultValue: 'Escribe al menos {{min}} caracteres.' })}
                        </p>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel} disabled={busy}>
                        {t('common.cancel', { defaultValue: 'Cancelar' })}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'default'}
                        disabled={!ready || busy}
                        onClick={() => onSubmit(reason.trim())}
                    >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {confirmLabel ?? t('reason.confirm', { defaultValue: 'Continuar' })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export interface RunWithReasonOptions<T> {
    /** Dialog headline, e.g. "Eliminar registro". */
    title: string
    description?: React.ReactNode
    confirmLabel?: string
    destructive?: boolean
    /**
     * Performs the request. Called first WITHOUT a reason; when the server
     * demands one it is called again with the operator's reason. Throw (axios
     * style) on failure.
     */
    request: (reason?: string) => Promise<T>
    /** A reason already collected (bulk operations reuse one for every row). */
    reason?: string
}

export interface ReasonPromptApi {
    /**
     * Resolves the request's result, or `undefined` when the operator cancelled
     * the reason prompt. Any error that is NOT a reason refusal is rethrown.
     */
    run: <T>(opts: RunWithReasonOptions<T>) => Promise<T | undefined>
    /** Render once near the caller: the dialog the helper opens. */
    dialog: React.ReactNode
}

interface PendingReason {
    opts: RunWithReasonOptions<unknown>
    info: ReasonRequiredInfo
    resolve: (v: unknown) => void
    reject: (e: unknown) => void
    error: string | null
}

/** See the module comment. Render `dialog` somewhere in the caller's tree. */
export function useReasonPrompt(): ReasonPromptApi {
    const { t } = useTranslation()
    const [pending, setPending] = useState<PendingReason | null>(null)
    const [busy, setBusy] = useState(false)
    const pendingRef = useRef<PendingReason | null>(null)
    pendingRef.current = pending

    const run = useCallback(<T,>(opts: RunWithReasonOptions<T>): Promise<T | undefined> => {
        return new Promise<T | undefined>((resolve, reject) => {
            opts
                .request(opts.reason)
                .then((v) => resolve(v))
                .catch((err) => {
                    const info = reasonRequiredInfo(err)
                    if (!info) return reject(err)
                    setPending({
                        opts: opts as RunWithReasonOptions<unknown>,
                        info,
                        resolve: resolve as (v: unknown) => void,
                        reject,
                        error: null,
                    })
                })
        })
    }, [])

    const submit = async (reason: string) => {
        const p = pendingRef.current
        if (!p) return
        setBusy(true)
        try {
            const v = await p.opts.request(reason)
            setPending(null)
            p.resolve(v)
        } catch (err) {
            const info = reasonRequiredInfo(err)
            if (info) {
                // Server still not satisfied (a longer minimum): stay open, say why.
                setPending({
                    ...p,
                    info,
                    error: t('reason.min', {
                        min: info.min,
                        defaultValue: 'Escribe al menos {{min}} caracteres.',
                    }),
                })
            } else {
                setPending(null)
                p.reject(err)
            }
        } finally {
            setBusy(false)
        }
    }

    const cancel = () => {
        const p = pendingRef.current
        setPending(null)
        p?.resolve(undefined)
    }

    const dialog = (
        <ReasonPromptDialog
            open={pending !== null}
            title={pending?.opts.title ?? ''}
            description={pending?.opts.description}
            min={pending?.info.min}
            confirmLabel={pending?.opts.confirmLabel}
            destructive={pending?.opts.destructive}
            error={pending?.error}
            busy={busy}
            onSubmit={submit}
            onCancel={cancel}
        />
    )

    return { run, dialog }
}
