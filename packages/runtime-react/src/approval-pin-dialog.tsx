// ApprovalPinDialog — the supervisor PIN prompt shared by every sensitive action
// (POS sell-without-stock, discount above the cap, price below the floor, refund,
// CFDI cancel, inventory adjust). Presentational: it collects a reason + a PIN and
// hands them to `onSubmit`, which does the network call, so federated addons that
// carry their own HTTP client reuse the same dialog as hosts with an ApiProvider.
//
// The reason is always required (audit trail: who asked, who authorized, why).
// A rejected `onSubmit` keeps the dialog open and shows the error inline (wrong
// PIN, locked, no permission) instead of a toast that can be missed.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, ShieldCheck } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Textarea,
} from '@asteby/metacore-ui/primitives'

export interface ApprovalPinSubmit {
    pin: string
    reason: string
}

export interface ApprovalPinDialogProps {
    open: boolean
    /** Headline, e.g. "Venta sin existencias". */
    title: string
    /** What is being authorized, in the operator's words. */
    description?: React.ReactNode
    /** Called with the typed PIN + reason. Throw (or reject) to keep the dialog open. */
    onSubmit: (v: ApprovalPinSubmit) => Promise<void>
    onCancel: () => void
    /** Optional secondary action, e.g. "Enviar a la bandeja" (async request). */
    secondaryAction?: { label: string; onClick: () => void }
}

/** Best human message out of an axios-style error carrying the kernel envelope. */
export function approvalErrorMessage(err: unknown, t: (k: string, o?: { defaultValue?: string }) => string): string {
    const data = (err as { response?: { data?: { error?: { code?: string; message?: string }; message?: string } } })?.response?.data
    switch (data?.error?.code) {
        case 'approval_pin_invalid':
            return t('approvals.pin_invalid', { defaultValue: 'PIN incorrecto o sin permiso para autorizar esto.' })
        case 'approval_pin_locked':
            return t('approvals.pin_locked', { defaultValue: 'Demasiados intentos. Espera unos minutos.' })
        case 'approval_pin_unavailable':
            return t('approvals.pin_unavailable', { defaultValue: 'La autorización con PIN no está disponible.' })
        case 'approval_reason_required':
            return t('approvals.reason_required', { defaultValue: 'Escribe el motivo.' })
    }
    return data?.error?.message || data?.message || (err as Error)?.message || t('common.error', { defaultValue: 'Algo salió mal' })
}

export function ApprovalPinDialog({ open, title, description, onSubmit, onCancel, secondaryAction }: ApprovalPinDialogProps) {
    const { t } = useTranslation()
    const [pin, setPin] = useState('')
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setPin('')
            setReason('')
            setError(null)
            setBusy(false)
        }
    }, [open])

    const ready = /^\d{4,8}$/.test(pin) && reason.trim().length > 0

    const submit = async () => {
        if (!ready || busy) return
        setBusy(true)
        setError(null)
        try {
            await onSubmit({ pin, reason: reason.trim() })
        } catch (err) {
            setError(approvalErrorMessage(err, t as never))
            setPin('')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onCancel() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        {title}
                    </DialogTitle>
                    <DialogDescription asChild>
                        <div>
                            {description ?? t('approvals.pin_prompt', { defaultValue: 'Requiere autorización de un supervisor.' })}
                        </div>
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void submit()
                    }}
                >
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="approval-reason">
                            {t('approvals.reason', { defaultValue: 'Motivo' })}
                        </label>
                        <Textarea
                            id="approval-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            placeholder={t('approvals.reason_placeholder', { defaultValue: 'Por qué se autoriza' })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="approval-pin">
                            {t('approvals.pin', { defaultValue: 'PIN del supervisor' })}
                        </label>
                        <Input
                            id="approval-pin"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={8}
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            aria-invalid={error ? true : undefined}
                        />
                    </div>
                    {error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}
                    <DialogFooter className="gap-2 sm:gap-2">
                        {secondaryAction ? (
                            <Button type="button" variant="ghost" onClick={secondaryAction.onClick} disabled={busy}>
                                {secondaryAction.label}
                            </Button>
                        ) : null}
                        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
                            {t('common.cancel', { defaultValue: 'Cancelar' })}
                        </Button>
                        <Button type="submit" disabled={!ready || busy}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {t('approvals.authorize', { defaultValue: 'Autorizar' })}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
