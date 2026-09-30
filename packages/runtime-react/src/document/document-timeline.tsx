// DocumentTimeline — línea de tiempo de eventos de negocio del documento
// («creó», «timbró», «envió a…», «abrió», «pagó», «solicitó cancelación»,
// «respuesta del SAT»). Complementa a <RecordHistory> (que muestra diffs de
// campos): aquí cada entrada es un hecho legible, con actor y hora.
import { useTranslation } from 'react-i18next'
import { Circle } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon } from '../dynamic-icon'
import { formatFieldValue, type FieldFormatOptions } from './format'
import type { StatusTone } from './types'

export interface TimelineEntry {
    id: string
    at: string
    /** Texto ya redactado («Timbró la factura»). */
    label: string
    actor?: string
    detail?: string
    icon?: string
    tone?: StatusTone
}

export interface DocumentTimelineProps extends FieldFormatOptions {
    entries: TimelineEntry[]
    /** Texto del estado vacío; lleva `emptyAction` si el host da una acción. */
    emptyText?: string
    className?: string
}

const TONE_DOT: Record<StatusTone, string> = {
    neutral: 'text-muted-foreground',
    info: 'text-[var(--info,oklch(0.55_0.13_235))]',
    success: 'text-[var(--success,oklch(0.6_0.15_155))]',
    caution: 'text-[var(--warning,oklch(0.6_0.15_65))]',
    warning: 'text-[var(--warning,oklch(0.6_0.15_65))]',
    critical: 'text-destructive',
}

export function DocumentTimeline({ entries, emptyText, className, ...fmt }: DocumentTimelineProps) {
    const { t } = useTranslation()
    if (entries.length === 0) {
        return (
            <p className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
                {emptyText ?? t('document.timeline_empty', { defaultValue: 'Aún no hay actividad en este documento.' })}
            </p>
        )
    }
    const sorted = [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return (
        <ol className={cn('relative flex flex-col gap-4 border-l pl-5', className)} data-document-timeline=''>
            {sorted.map((e) => (
                <li key={e.id} className='relative'>
                    <span className={cn('absolute -left-[1.85rem] flex h-5 w-5 items-center justify-center rounded-full bg-card', TONE_DOT[e.tone ?? 'neutral'])}>
                        {e.icon ? <DynamicIcon name={e.icon} className='h-4 w-4' /> : <Circle className='h-3 w-3 fill-current' />}
                    </span>
                    <p className='text-sm font-medium'>{t(e.label, { defaultValue: e.label })}</p>
                    <p className='text-xs text-muted-foreground'>
                        {formatFieldValue(e.at, 'datetime', fmt)}
                        {e.actor ? ` · ${e.actor}` : ''}
                    </p>
                    {e.detail ? <p className='mt-1 whitespace-pre-wrap text-sm text-muted-foreground'>{e.detail}</p> : null}
                </li>
            ))}
        </ol>
    )
}
