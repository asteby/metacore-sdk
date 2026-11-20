import { BADGE_TONE_CLASS, type Severity } from '@asteby/metacore-ui/layout'
import { cn } from '@asteby/metacore-ui/lib'
import { formatAmount } from '@asteby/metacore-lib'
import type { CardFieldSpec, CardSpec } from './types'

export interface ResolvedCard {
    title: string
    subtitle?: string
    badge?: { text: string; tone: Severity }
    chips: string[]
    meta: { label?: string; value: string }[]
}

function fmt(v: unknown, f: CardFieldSpec['format'] = 'text', locale?: string, currency?: string): string {
    if (v == null || v === '') return ''
    try {
        if (f === 'number') return new Intl.NumberFormat(locale).format(Number(v))
        if (f === 'percent') return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(v))}%`
        if (f === 'currency') return formatAmount(v as number | string, { currency, locale })
        if (f === 'date') return new Date(String(v)).toLocaleDateString(locale)
        if (f === 'datetime') return new Date(String(v)).toLocaleString(locale)
    } catch {
        /* fall through */
    }
    return String(v)
}

/** Pure: row + manifest CardSpec -> display model. Missing fields are skipped, never throw. */
export function resolveCard(spec: CardSpec, row: Record<string, unknown>, locale?: string, currency?: string): ResolvedCard {
    const bv = spec.badge ? row[spec.badge.field] : undefined
    const key = bv == null ? '' : String(bv)
    return {
        title: fmt(row[spec.title]) || '—',
        subtitle: spec.subtitle ? fmt(row[spec.subtitle]) || undefined : undefined,
        badge: spec.badge && key ? { text: spec.badge.labels?.[key] ?? key, tone: spec.badge.tones?.[key] ?? 'info' } : undefined,
        chips: (spec.chips ?? []).map((f) => fmt(row[f])).filter(Boolean),
        meta: (spec.meta ?? []).map((m) => ({ label: m.label, value: fmt(row[m.field], m.format, locale, currency) })).filter((m) => m.value),
    }
}

export function ConfigurableCard({ spec, row, onClick, locale, currency }: { spec: CardSpec; row: Record<string, unknown>; onClick?: () => void; locale?: string; currency?: string }) {
    const c = resolveCard(spec, row, locale, currency)
    const Tag = onClick ? 'button' : 'div'
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={cn('flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-start', onClick && 'transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        >
            <div className='flex items-start justify-between gap-2'>
                <span className='line-clamp-2 font-medium'>{c.title}</span>
                {c.badge && (
                    <span data-tone={c.badge.tone} className={cn('shrink-0 rounded-full px-2 text-xs font-semibold leading-5 ring-1 ring-inset', BADGE_TONE_CLASS[c.badge.tone].replace(/motion-safe:animate-pulse/, ''))}>
                        {c.badge.text}
                    </span>
                )}
            </div>
            {c.subtitle && <span className='line-clamp-2 text-sm text-muted-foreground'>{c.subtitle}</span>}
            {c.chips.length > 0 && (
                <div className='flex flex-wrap gap-1'>
                    {c.chips.map((x, i) => (
                        <span key={i} className='rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                            {x}
                        </span>
                    ))}
                </div>
            )}
            {c.meta.length > 0 && (
                <dl className='mt-auto grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                    {c.meta.map((m, i) => (
                        <div key={i} className='min-w-0'>
                            {m.label && <dt className='sr-only'>{m.label}</dt>}
                            <dd className='truncate'>{m.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </Tag>
    )
}
