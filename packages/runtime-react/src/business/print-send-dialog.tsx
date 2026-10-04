// PrintSendDialog — imprimir o enviar un documento ya emitido (cotización,
// factura, nota de crédito…). El SDK NO llama a un proveedor de mensajería: el
// host recibe `onSend(channel, destination, document)` y decide qué hacer.
// Imprimir usa la URL del PDF que pasa el host (o su propio `onPrint`).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, MessageCircle, Printer, Loader2 } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
} from '@asteby/metacore-ui/primitives'
import { FormErrorBanner } from './feedback'

export type SendChannel = 'email' | 'whatsapp'

export interface PrintableDocument {
    folio: string
    /** URL del PDF ya generado. Sin ella no hay «Imprimir». */
    pdfUrl?: string
    /** Texto de cabecera («Factura», «Cotización»). */
    title?: string
    /** Destinos sugeridos (datos del cliente). */
    email?: string
    phone?: string
}

export interface PrintSendDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    document: PrintableDocument
    /** Canales de envío disponibles. Default: ambos. Vacío = solo imprimir. */
    channels?: SendChannel[]
    /**
     * Envío a cargo del host. Si rechaza, el mensaje se muestra en el diálogo.
     * Sin `onSend` no se ofrece enviar.
     */
    onSend?: (channel: SendChannel, destination: string, document: PrintableDocument) => Promise<void> | void
    /** Reemplaza la impresión por defecto (abrir `pdfUrl` en otra pestaña). */
    onPrint?: (document: PrintableDocument) => void
}

function defaultPrint(doc: PrintableDocument): void {
    if (!doc.pdfUrl || typeof window === 'undefined') return
    window.open(doc.pdfUrl, '_blank', 'noopener,noreferrer')
}

export function PrintSendDialog({
    open,
    onOpenChange,
    document: doc,
    channels = ['email', 'whatsapp'],
    onSend,
    onPrint,
}: PrintSendDialogProps) {
    const { t } = useTranslation()
    const [channel, setChannel] = useState<SendChannel>(channels[0] ?? 'email')
    const [destination, setDestination] = useState('')
    const [sending, setSending] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | undefined>()

    const suggested = channel === 'email' ? doc.email : doc.phone
    useEffect(() => {
        if (open) {
            setDestination(suggested ?? '')
            setSent(false)
            setError(undefined)
        }
    }, [open, channel, suggested])

    const canSend = !!onSend && channels.length > 0
    const send = async () => {
        const dest = destination.trim()
        if (!onSend || !dest) return
        setSending(true)
        setError(undefined)
        setSent(false)
        try {
            await onSend(channel, dest, doc)
            setSent(true)
        } catch (e) {
            const msg = (e as { message?: unknown } | undefined)?.message
            setError(
                typeof msg === 'string' && msg
                    ? msg
                    : t('printSend.error', { defaultValue: 'No se pudo enviar el documento. Inténtalo de nuevo.' }),
            )
        } finally {
            setSending(false)
        }
    }

    const channelLabel = (c: SendChannel) =>
        c === 'email' ? t('printSend.email', { defaultValue: 'Correo' }) : t('printSend.whatsapp', { defaultValue: 'WhatsApp' })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {t('printSend.title', { defaultValue: 'Imprimir o enviar' })}
                        {doc.title ? ` · ${doc.title}` : ''}
                    </DialogTitle>
                    <DialogDescription>{doc.folio}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={!doc.pdfUrl && !onPrint}
                        onClick={() => (onPrint ?? defaultPrint)(doc)}
                    >
                        <Printer className="mr-2 size-4" aria-hidden />
                        {t('printSend.print', { defaultValue: 'Imprimir' })}
                    </Button>

                    {canSend && (
                        <div className="space-y-2">
                            {channels.length > 1 && (
                                <div className="flex gap-2" role="group" aria-label={t('printSend.channel', { defaultValue: 'Canal de envío' })}>
                                    {channels.map((c) => (
                                        <Button
                                            key={c}
                                            type="button"
                                            size="sm"
                                            variant={c === channel ? 'default' : 'outline'}
                                            aria-pressed={c === channel}
                                            onClick={() => setChannel(c)}
                                        >
                                            {c === 'email' ? <Mail className="mr-1.5 size-4" aria-hidden /> : <MessageCircle className="mr-1.5 size-4" aria-hidden />}
                                            {channelLabel(c)}
                                        </Button>
                                    ))}
                                </div>
                            )}
                            <Input
                                value={destination}
                                type={channel === 'email' ? 'email' : 'tel'}
                                aria-label={t('printSend.destination', { defaultValue: 'Destino' })}
                                placeholder={channel === 'email' ? 'cliente@ejemplo.com' : '+52 55 0000 0000'}
                                onChange={(e) => setDestination(e.target.value)}
                            />
                            <FormErrorBanner message={error} />
                            {sent && (
                                <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                                    {t('printSend.sent', { defaultValue: 'Enviado.' })}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.close', { defaultValue: 'Cerrar' })}
                    </Button>
                    {canSend && (
                        <Button type="button" onClick={send} disabled={sending || !destination.trim()}>
                            {sending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                            {t('printSend.send', { defaultValue: 'Enviar' })}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
