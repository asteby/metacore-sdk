// CfdiStampPanel — human-readable result of stamping (timbrar) a CFDI.
//
// A stamp action answers `{ document_id, fiscal_uuid, pdf_url, xml_url }`. The
// dialog used to dump that JSON; this panel shows the fiscal UUID as text and
// the PDF / XML as download links instead (#1024, FAC-3 / PIT-051). The SDK
// invents nothing: only the keys the server actually returned are rendered.
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
} from '@asteby/metacore-ui/primitives'
import { CheckCircle2, FileCode2, FileText } from 'lucide-react'

export interface CfdiStampResult {
    fiscalUuid?: string
    pdfUrl?: string
    xmlUrl?: string
    /** Optional human folio (`serie-folio`) when the server sends it. */
    folio?: string
    documentId?: string
}

const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined

const isSafeUrl = (u: string) => /^(https?:)?\/\//i.test(u) || u.startsWith('/') || u.startsWith('blob:')

/**
 * Reads a stamp result out of a successful action response body. Looks at
 * `body.data`, `body.result` and the body itself. Returns `undefined` unless
 * the payload carries `fiscal_uuid` and/or `pdf_url` / `xml_url` — a response
 * without those keys is never turned into a fiscal result.
 */
export function extractStampResult(body: unknown): CfdiStampResult | undefined {
    if (!body || typeof body !== 'object') return undefined
    const b = body as Record<string, unknown>
    const candidates = [b.data, b.result, b]
    for (const c of candidates) {
        if (!c || typeof c !== 'object' || Array.isArray(c)) continue
        const o = c as Record<string, unknown>
        const fiscalUuid = str(o.fiscal_uuid) ?? str(o.fiscalUuid) ?? str(o.uuid)
        const pdf = str(o.pdf_url) ?? str(o.pdfUrl)
        const xml = str(o.xml_url) ?? str(o.xmlUrl)
        // A bare `uuid` is too generic to call a fiscal result on its own.
        const hasFiscal = !!str(o.fiscal_uuid) || !!str(o.fiscalUuid) || !!pdf || !!xml
        if (!hasFiscal) continue
        return {
            fiscalUuid,
            pdfUrl: pdf && isSafeUrl(pdf) ? pdf : undefined,
            xmlUrl: xml && isSafeUrl(xml) ? xml : undefined,
            folio: str(o.folio) ?? str(o.number),
            documentId: str(o.document_id) ?? str(o.documentId),
        }
    }
    return undefined
}

export interface CfdiStampPanelProps {
    result: CfdiStampResult
    className?: string
}

export function CfdiStampPanel({ result, className }: CfdiStampPanelProps) {
    const { t } = useTranslation()
    return (
        <div data-slot="cfdi-stamp-panel" className={`space-y-4 ${className ?? ''}`}>
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" aria-hidden />
                {t('cfdi.stamp.success', { defaultValue: 'CFDI timbrado correctamente' })}
            </div>
            <dl className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                {result.folio && (
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {t('cfdi.stamp.folio', { defaultValue: 'Folio' })}
                        </dt>
                        <dd>{result.folio}</dd>
                    </div>
                )}
                {result.fiscalUuid && (
                    <div className="flex flex-col gap-0.5">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {t('cfdi.stamp.uuid', { defaultValue: 'UUID fiscal' })}
                        </dt>
                        <dd className="break-all font-mono" data-slot="cfdi-stamp-uuid">
                            {result.fiscalUuid}
                        </dd>
                    </div>
                )}
            </dl>
            {(result.pdfUrl || result.xmlUrl) && (
                <div className="flex flex-wrap gap-2">
                    {result.pdfUrl && (
                        <Button asChild variant="outline" size="sm">
                            <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer" data-slot="cfdi-stamp-pdf">
                                <FileText className="mr-2 size-4" aria-hidden />
                                {t('cfdi.stamp.pdf', { defaultValue: 'Descargar PDF' })}
                            </a>
                        </Button>
                    )}
                    {result.xmlUrl && (
                        <Button asChild variant="outline" size="sm">
                            <a href={result.xmlUrl} target="_blank" rel="noopener noreferrer" data-slot="cfdi-stamp-xml">
                                <FileCode2 className="mr-2 size-4" aria-hidden />
                                {t('cfdi.stamp.xml', { defaultValue: 'Descargar XML' })}
                            </a>
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

export interface CfdiStampResultDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    result: CfdiStampResult
    title?: string
}

/** Dialog shell used by the action modals after a successful stamp. */
export function CfdiStampResultDialog({ open, onOpenChange, result, title }: CfdiStampResultDialogProps) {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title ?? t('cfdi.stamp.title', { defaultValue: 'Resultado del timbrado' })}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('cfdi.stamp.desc', { defaultValue: 'UUID fiscal y archivos del CFDI timbrado' })}
                    </DialogDescription>
                </DialogHeader>
                <CfdiStampPanel result={result} />
                <DialogFooter>
                    <Button onClick={() => onOpenChange(false)}>{t('common.close', { defaultValue: 'Cerrar' })}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
