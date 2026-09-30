// DocumentHeader — cabecera estándar (benchmark §5.2): serie/folio, badges de
// cada máquina de estado, cliente enlazable, métricas (total, saldo, fechas) y
// un identificador copiable (UUID).
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { StatusBadge } from './status-badge'
import { formatFieldValue, type FieldFormatOptions } from './format'
import type { StatusDef } from './types'

export interface HeaderBadge {
    id: string
    label?: string
    status: StatusDef
}

export interface HeaderMetric {
    label: string
    value: string
    tone?: 'default' | 'critical'
    mono?: boolean
}

export interface DocumentHeaderProps {
    title: string
    /** Texto bajo el título; si `subtitleHref` viene, es un enlace (ficha del cliente). */
    subtitle?: string
    subtitleHref?: string
    badges: HeaderBadge[]
    metrics?: HeaderMetric[]
    copyable?: { label: string; value: string }
    /** Zona de acciones (normalmente `<ActionBar/>`). */
    actions?: ReactNode
    /** Slot antes del título (botón «Volver»). */
    leading?: ReactNode
    /** Renderiza el subtítulo como enlace del router del host. */
    renderLink?: (props: { href: string; children: ReactNode; className?: string }) => ReactNode
    className?: string
}

export function DocumentHeader({
    title,
    subtitle,
    subtitleHref,
    badges,
    metrics,
    copyable,
    actions,
    leading,
    renderLink,
    className,
}: DocumentHeaderProps) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        if (!copyable?.value) return
        try {
            await navigator.clipboard.writeText(copyable.value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            /* sin portapapeles (contexto inseguro): el valor sigue seleccionable */
        }
    }

    const subtitleNode = subtitle ? (
        subtitleHref ? (
            renderLink ? (
                renderLink({ href: subtitleHref, children: subtitle, className: 'text-sm text-primary hover:underline' })
            ) : (
                <a href={subtitleHref} className='text-sm text-primary hover:underline'>
                    {subtitle}
                </a>
            )
        ) : (
            <span className='text-sm text-muted-foreground'>{subtitle}</span>
        )
    ) : null

    return (
        <header className={cn('flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground', className)} data-document-header=''>
            {leading}
            <div className='flex flex-wrap items-start justify-between gap-4'>
                <div className='flex min-w-0 flex-col gap-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
                        {badges.map((b) => (
                            <StatusBadge key={b.id} status={b.status} srLabel={b.label ? t(b.label, { defaultValue: b.label }) : undefined} />
                        ))}
                    </div>
                    {subtitleNode}
                </div>
                {actions}
            </div>

            {metrics && metrics.length > 0 ? (
                <dl className='grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5'>
                    {metrics.map((m) => (
                        <div key={m.label}>
                            <dt className='text-xs uppercase tracking-wide text-muted-foreground'>{m.label}</dt>
                            <dd
                                className={cn(
                                    'font-medium tabular-nums',
                                    m.mono && 'font-mono text-xs',
                                    m.tone === 'critical' && 'text-destructive',
                                )}
                            >
                                {m.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : null}

            {copyable?.value ? (
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <span className='uppercase tracking-wide'>{copyable.label}</span>
                    <code className='break-all font-mono text-foreground'>{copyable.value}</code>
                    <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        className='h-6 px-1.5'
                        onClick={copy}
                        aria-label={t('document.copy', { defaultValue: 'Copiar' })}
                    >
                        {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                        <span className='ml-1'>{copied ? t('document.copied', { defaultValue: 'Copiado' }) : t('document.copy', { defaultValue: 'Copiar' })}</span>
                    </Button>
                </div>
            ) : null}
        </header>
    )
}

export { formatFieldValue }
export type { FieldFormatOptions }
