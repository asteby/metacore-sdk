// CancelWithReason — cancelación guiada de 2 pasos (benchmark §5.5 / §7): motivo
// del catálogo del tipo de documento → (documento sustituto si el motivo lo
// exige) → confirmación con consecuencias. Genérico: el catálogo de motivos, las
// consecuencias y la política de aceptación las declara el llamador; el
// componente no sabe de CFDI. Solo una acción primaria por paso (verbo +
// sustantivo) y, si la acción falla, el modal sigue abierto con el error.
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Loader2 } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    RadioGroup,
    RadioGroupItem,
} from '@asteby/metacore-ui/primitives'

export interface CancelReason {
    value: string
    label: string
    /** Ayuda corta bajo el motivo. */
    hint?: string
    /** Exige apuntar a un documento sustituto (motivo 01 del SAT). */
    requiresSubstitute?: boolean
    /** El motivo no aplica a este documento (se ve deshabilitado con `disabledReason`). */
    disabled?: boolean
    disabledReason?: string
}

export interface CancelPayload {
    reason: string
    substitute?: string
}

export interface CancelWithReasonProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Identificación del documento («Factura A-1042»). */
    documentLabel: string
    title?: string
    reasons: CancelReason[]
    /** Consecuencias que se muestran en el paso de confirmación (§6.2). */
    consequences: string[]
    /**
     * Aviso según el motivo elegido, p. ej. «requiere aceptación del receptor».
     * Devuelve `undefined` si no hay.
     */
    notice?: (reason: CancelReason) => string | undefined
    /** Formato del identificador del sustituto; si se define, valida en línea. */
    substitutePattern?: RegExp
    substituteLabel?: string
    substituteHelp?: string
    /** Zona para crear el sustituto desde el mismo asistente (el host la implementa). */
    substituteSlot?: (props: { value: string; onChange: (v: string) => void }) => ReactNode
    /** Ejecuta la cancelación; debe lanzar con `message` si falla. */
    onConfirm: (payload: CancelPayload) => Promise<unknown>
    /** Se llama tras un éxito, antes de cerrar. */
    onDone?: () => void
    confirmLabel?: string
}

type Step = 'reason' | 'confirm'

export function CancelWithReason(props: CancelWithReasonProps) {
    const { open, onOpenChange, reasons, consequences, onConfirm, onDone } = props
    const { t } = useTranslation()
    const [step, setStep] = useState<Step>('reason')
    const [reasonValue, setReasonValue] = useState('')
    const [substitute, setSubstitute] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (open) {
            setStep('reason')
            setReasonValue('')
            setSubstitute('')
            setError(null)
            setBusy(false)
        }
    }, [open])

    const reason = reasons.find((r) => r.value === reasonValue)
    const substituteValid =
        !reason?.requiresSubstitute ||
        (substitute.trim().length > 0 && (!props.substitutePattern || props.substitutePattern.test(substitute.trim())))
    const notice = reason ? props.notice?.(reason) : undefined
    const tr = (s: string) => t(s, { defaultValue: s })

    const confirm = async () => {
        if (!reason) return
        setBusy(true)
        setError(null)
        try {
            await onConfirm({ reason: reason.value, substitute: reason.requiresSubstitute ? substitute.trim() : undefined })
            onDone?.()
            onOpenChange(false)
        } catch (e) {
            setError((e as { message?: string })?.message || t('document.cancel.failed', { defaultValue: 'No se pudo cancelar. Revisa el detalle e intenta de nuevo.' }))
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => (!busy ? onOpenChange(o) : undefined)}>
            <DialogContent className='sm:max-w-lg'>
                <DialogHeader>
                    <DialogTitle>{props.title ?? t('document.cancel.title', { defaultValue: 'Solicitar cancelación' })}</DialogTitle>
                    <DialogDescription>
                        {props.documentLabel} ·{' '}
                        {step === 'reason'
                            ? t('document.cancel.step_reason', { defaultValue: 'Paso 1 de 2: elige el motivo' })
                            : t('document.cancel.step_confirm', { defaultValue: 'Paso 2 de 2: confirma' })}
                    </DialogDescription>
                </DialogHeader>

                {step === 'reason' ? (
                    <div className='flex flex-col gap-4'>
                        <RadioGroup value={reasonValue} onValueChange={setReasonValue} className='gap-2'>
                            {reasons.map((r) => (
                                <label
                                    key={r.value}
                                    className='flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[[data-state=checked]]:border-primary'
                                >
                                    <RadioGroupItem value={r.value} disabled={r.disabled} className='mt-0.5' />
                                    <span className='flex flex-col'>
                                        <span className='text-sm font-medium'>{tr(r.label)}</span>
                                        {r.disabled && r.disabledReason ? (
                                            <span className='text-xs text-muted-foreground'>{tr(r.disabledReason)}</span>
                                        ) : r.hint ? (
                                            <span className='text-xs text-muted-foreground'>{tr(r.hint)}</span>
                                        ) : null}
                                    </span>
                                </label>
                            ))}
                        </RadioGroup>

                        {reason?.requiresSubstitute ? (
                            props.substituteSlot ? (
                                props.substituteSlot({ value: substitute, onChange: setSubstitute })
                            ) : (
                                <div className='grid gap-2'>
                                    <Label>{props.substituteLabel ?? t('document.cancel.substitute', { defaultValue: 'Documento sustituto' })}</Label>
                                    <Input value={substitute} onChange={(e) => setSubstitute(e.target.value)} className='font-mono text-sm' />
                                    {props.substituteHelp ? <p className='text-xs text-muted-foreground'>{tr(props.substituteHelp)}</p> : null}
                                    {substitute && !substituteValid ? (
                                        <p className='text-xs text-destructive'>{t('document.cancel.substitute_invalid', { defaultValue: 'El formato del identificador no es válido.' })}</p>
                                    ) : null}
                                </div>
                            )
                        ) : null}
                        {notice ? <p className='rounded-md bg-muted p-3 text-sm'>{tr(notice)}</p> : null}
                    </div>
                ) : (
                    <div className='flex flex-col gap-3'>
                        <div className='flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
                            <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                            <ul className='list-disc pl-4'>
                                {consequences.map((c) => (
                                    <li key={c}>{tr(c)}</li>
                                ))}
                            </ul>
                        </div>
                        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm'>
                            <dt className='text-muted-foreground'>{t('document.cancel.reason', { defaultValue: 'Motivo' })}</dt>
                            <dd className='font-medium'>{reason ? tr(reason.label) : ''}</dd>
                            {reason?.requiresSubstitute ? (
                                <>
                                    <dt className='text-muted-foreground'>{t('document.cancel.substitute_short', { defaultValue: 'Sustituto' })}</dt>
                                    <dd className='break-all font-mono text-xs'>{substitute}</dd>
                                </>
                            ) : null}
                        </dl>
                        {notice ? <p className='text-sm text-muted-foreground'>{tr(notice)}</p> : null}
                        {error ? (
                            <p role='alert' className='rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'>
                                {error}
                            </p>
                        ) : null}
                    </div>
                )}

                <DialogFooter>
                    {step === 'reason' ? (
                        <>
                            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                                {t('document.cancel.keep', { defaultValue: 'Conservar documento' })}
                            </Button>
                            <Button type='button' disabled={!reason || !substituteValid} onClick={() => setStep('confirm')}>
                                {t('document.cancel.continue', { defaultValue: 'Continuar' })}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button type='button' variant='outline' disabled={busy} onClick={() => setStep('reason')}>
                                {t('document.cancel.back', { defaultValue: 'Volver al motivo' })}
                            </Button>
                            <Button type='button' variant='destructive' disabled={busy} onClick={confirm}>
                                {busy ? <Loader2 className='mr-1.5 h-4 w-4 animate-spin' /> : null}
                                {props.confirmLabel ?? t('document.cancel.confirm', { defaultValue: 'Solicitar cancelación' })}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
