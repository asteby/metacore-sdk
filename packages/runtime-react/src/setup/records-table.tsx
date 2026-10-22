import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@asteby/metacore-ui/primitives'
import { cn } from '@asteby/metacore-ui/lib'
import { useSetupT } from './messages'
import { RECORD_TONE, TONE_BADGE } from './tone'
import type { RecordStatus, SetupDiagnostic, SetupFix, SetupRecord } from './types'

/**
 * Copies text with a fallback: the async Clipboard API when the page may use
 * it, otherwise a hidden textarea + `execCommand('copy')` (http pages, older
 * webviews, denied permission). Resolves to whether something was copied.
 */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text)
            return true
        }
    } catch {
        /* fall through to the legacy path */
    }
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
        return document.execCommand('copy')
    } catch {
        return false
    } finally {
        document.body.removeChild(ta)
    }
}

function CopyButton({ text, what }: { text: string; what: string }) {
    const t = useSetupT()
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    useEffect(() => () => clearTimeout(timer.current), [])
    const onCopy = useCallback(async () => {
        const ok = await copyText(text)
        setState(ok ? 'copied' : 'failed')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setState('idle'), 2500)
    }, [text])
    return (
        <span className='inline-flex items-center gap-1'>
            <Button
                type='button'
                variant='ghost'
                size='sm'
                className='h-7 w-7 shrink-0 p-0'
                onClick={onCopy}
                aria-label={t('records.copy_label', { what })}
                title={t('records.copy')}
            >
                {state === 'copied' ? (
                    <Check className='h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400' aria-hidden='true' />
                ) : (
                    <Copy className='h-3.5 w-3.5' aria-hidden='true' />
                )}
            </Button>
            <span role='status' className={cn('text-xs', state === 'failed' ? 'text-destructive' : 'text-muted-foreground', state === 'idle' && 'sr-only')}>
                {state === 'copied' ? t('records.copied') : state === 'failed' ? t('records.copy_failed') : ''}
            </span>
        </span>
    )
}

function diagOf(d: SetupRecord['diagnostic']): SetupDiagnostic | null {
    if (!d) return null
    return typeof d === 'string' ? { message: d } : d
}

export interface RecordsTableProps {
    records: SetupRecord[]
    caption?: string
    /** Fix button of a row's diagnostic (`fix.action|url|step`). */
    onFix?: (fix: SetupFix, record: SetupRecord) => void
    /** Shows a "check now" button above the table. */
    onRecheck?: () => void
    rechecking?: boolean
    className?: string
}

/**
 * Type / name / value table (DNS records and the like) with per-row copy,
 * status and diagnostic. Scrolls horizontally on narrow screens instead of
 * squeezing the values; values wrap (`break-all`) so a long DKIM key is readable.
 */
export function RecordsTable({ records, caption, onFix, onRecheck, rechecking, className }: RecordsTableProps) {
    const t = useSetupT()
    if (!records || records.length === 0) {
        return <p className={cn('text-sm text-muted-foreground', className)}>{t('records.empty')}</p>
    }
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {onRecheck ? (
                <div className='flex justify-end'>
                    <Button type='button' variant='outline' size='sm' onClick={onRecheck} disabled={rechecking} className='gap-2'>
                        <RefreshCw className={cn('h-3.5 w-3.5', rechecking && 'animate-spin motion-reduce:animate-none')} aria-hidden='true' />
                        {t('records.recheck')}
                    </Button>
                </div>
            ) : null}
            <div className='overflow-x-auto rounded-md border'>
                <table className='w-full min-w-[34rem] border-collapse text-left text-sm'>
                    {caption ? <caption className='sr-only'>{caption}</caption> : null}
                    <thead className='bg-muted/50 text-xs text-muted-foreground'>
                        <tr>
                            <th scope='col' className='px-3 py-2 font-medium'>{t('records.type')}</th>
                            <th scope='col' className='px-3 py-2 font-medium'>{t('records.name')}</th>
                            <th scope='col' className='px-3 py-2 font-medium'>{t('records.value')}</th>
                            <th scope='col' className='px-3 py-2 font-medium'>{t('records.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.map((r, i) => {
                            const status: RecordStatus = r.status ?? 'pending'
                            const diag = diagOf(r.diagnostic)
                            const tone = RECORD_TONE[status] ?? 'neutral'
                            return (
                                <Fragment key={r.id ?? `${r.type}-${r.name}-${i}`}>
                                    <tr className={cn(!diag && i < records.length - 1 && 'border-b')}>
                                    <td className='whitespace-nowrap px-3 py-2 align-top'>
                                        <span className='rounded border bg-muted px-1.5 py-0.5 font-mono text-xs'>{r.type}</span>
                                    </td>
                                    <td className='px-3 py-2 align-top'>
                                        <div className='flex items-start gap-1'>
                                            <code className='break-all font-mono text-xs'>{r.name}</code>
                                            <CopyButton text={r.name} what={t('records.name').toLowerCase()} />
                                        </div>
                                    </td>
                                    <td className='px-3 py-2 align-top'>
                                        <div className='flex items-start gap-1'>
                                            <code className='break-all font-mono text-xs'>{r.value}</code>
                                            <CopyButton text={r.value} what={t('records.value').toLowerCase()} />
                                        </div>
                                        {r.found && r.found !== r.value ? (
                                            <p className='pt-1 text-xs text-muted-foreground break-all'>{t('records.found', { value: r.found })}</p>
                                        ) : null}
                                    </td>
                                    <td className='px-3 py-2 align-top'>
                                        <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONE_BADGE[tone])} data-record-status={status}>
                                            {t(`record.status.${status}`)}
                                        </span>
                                    </td>
                                    </tr>
                                    {diag ? (
                                        <tr className={cn(i < records.length - 1 && 'border-b')}>
                                            <DiagnosticCell diag={diag} onFix={onFix ? (f) => onFix(f, r) : undefined} />
                                        </tr>
                                    ) : null}
                                </Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function DiagnosticCell({ diag, onFix }: { diag: SetupDiagnostic; onFix?: (f: SetupFix) => void }) {
    const t = useSetupT()
    return (
        <td colSpan={4} className='bg-muted/30 px-3 py-2 text-xs'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='min-w-0 flex-1 text-muted-foreground'>
                    {diag.message}
                    {diag.detail ? <span className='block break-words'>{diag.detail}</span> : null}
                </p>
                {diag.fix && onFix ? (
                    <Button type='button' size='sm' variant='outline' className='h-7' onClick={() => onFix(diag.fix!)}>
                        {diag.fix.label ?? t('flow.fix')}
                    </Button>
                ) : null}
            </div>
        </td>
    )
}
