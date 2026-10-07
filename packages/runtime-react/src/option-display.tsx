// OptionDisplay — paints the declarative option display the kernel resolves for
// every option of a model with `option_display` (manifest v3): avatar, title on
// up to two lines, muted subtitle, badges, and right-aligned metrics (price,
// stock…) with tabular numbers and a toned chip («Agotado» in danger, low
// stock in warning). The server already evaluated formats' inputs, tones,
// dim/block — this file only formats and paints, so every picker of the model
// (dynamic_select, the document editor's product cell, an addon screen) reads
// the same.
//
// It plugs into <RecordPicker> through its existing slots (`renderItem`,
// `renderValue`, `isItemDisabled`), never by editing the picker itself. An
// option without `display` keeps rendering exactly as before.
import { useTranslation } from 'react-i18next'
import { Badge } from '@asteby/metacore-ui/primitives'
import { useFormatter, type Formatter } from './business/format'
import { OptionThumb } from './record-picker-option'

export type OptionDisplayTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/** One resolved right-aligned metric (`display.trailing[]`). */
export interface OptionTrailingItem {
    key: string
    label?: string
    value: unknown
    format?: 'money' | 'number' | 'integer' | 'percent' | 'date' | 'relative_date' | 'text' | string
    currency?: string
    tone?: OptionDisplayTone | string
    /** Replaces the formatted value («Agotado»). */
    text?: string
}

export interface OptionBadgeItem {
    text: string
    tone?: OptionDisplayTone | string
}

/** The `display` object of an option (kernel `OptionDisplayValue`). */
export interface OptionDisplayData {
    title?: string
    subtitle?: string
    image?: string | null
    trailing?: OptionTrailingItem[]
    badges?: OptionBadgeItem[]
    tone?: OptionDisplayTone | string
    /** Attenuated row (still selectable). */
    dimmed?: boolean
    /** Not selectable. */
    blocked?: boolean
}

/** Reads a well-formed display off any option-like value (null when absent). */
export function getOptionDisplay(option: unknown): OptionDisplayData | null {
    const d = option && typeof option === 'object' ? (option as { display?: unknown }).display : null
    return d && typeof d === 'object' ? (d as OptionDisplayData) : null
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'
const TONE_VARIANT: Record<string, BadgeVariant> = {
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    info: 'info',
    neutral: 'muted',
}
export const toneVariant = (tone?: string): BadgeVariant => TONE_VARIANT[tone ?? ''] ?? 'muted'

const asNumber = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v)
        return Number.isFinite(n) ? n : null
    }
    return null
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['week', 7 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
]

/** «hace 3 días» / «en 2 semanas» in the formatter's locale. */
export function formatRelativeDate(input: unknown, locale: string, now: Date = new Date()): string {
    if (input == null || input === '') return ''
    const d = new Date(input as string)
    if (Number.isNaN(d.getTime())) return String(input)
    const secs = (d.getTime() - now.getTime()) / 1000
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    for (const [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit)
    }
    return rtf.format(0, 'minute')
}

/** Formats one trailing value per its declared format (org currency for money). */
export function formatTrailingValue(item: OptionTrailingItem, fmt: Formatter, now?: Date): string {
    const v = item.value
    if (v == null || v === '') return ''
    switch (item.format) {
        case 'money':
            return fmt.money(v, item.currency || undefined)
        case 'number':
            return fmt.quantity(v)
        case 'integer': {
            const n = asNumber(v)
            return n == null ? String(v) : new Intl.NumberFormat(fmt.locale, { maximumFractionDigits: 0 }).format(n)
        }
        case 'percent': {
            const n = asNumber(v)
            if (n == null) return String(v)
            // 0.16 and 16 both mean 16 %.
            const frac = Math.abs(n) <= 1 ? n : n / 100
            return new Intl.NumberFormat(fmt.locale, { style: 'percent', maximumFractionDigits: 1 }).format(frac)
        }
        case 'date':
            return fmt.date(v)
        case 'relative_date':
            return formatRelativeDate(v, fmt.locale, now)
        default:
            return typeof v === 'number' ? fmt.quantity(v) : String(v)
    }
}

/** Fixed width per metric so columns line up across rows. */
const METRIC_MIN_WIDTH = '4.75rem'

function TrailingMetric({ item, fmt, compact }: { item: OptionTrailingItem; fmt: Formatter; compact?: boolean }) {
    const { t } = useTranslation()
    const text = item.text ? t(item.text, { defaultValue: item.text }) : formatTrailingValue(item, fmt)
    const label = item.label ? t(item.label, { defaultValue: item.label }) : ''
    const toned = !!item.tone
    const value = toned ? (
        <Badge
            variant={toneVariant(item.tone)}
            className="font-medium tabular-nums"
            data-slot="option-metric-chip"
            data-tone={item.tone}
        >
            {text}
        </Badge>
    ) : (
        <span className="text-sm font-medium tabular-nums text-foreground" data-slot="option-metric-value">
            {text}
        </span>
    )
    if (compact) return value
    return (
        <span
            className="flex shrink-0 flex-col items-end justify-center gap-0.5 text-right"
            style={{ minWidth: METRIC_MIN_WIDTH }}
            data-slot="option-metric"
            data-key={item.key}
        >
            {value}
            {label ? <span className="text-[10px] uppercase leading-none tracking-wide text-muted-foreground">{label}</span> : null}
        </span>
    )
}

export interface OptionDisplayRowProps {
    display: OptionDisplayData
    /** Fallback title (the option label) when the display has none. */
    label?: string
    /** Keyboard / pointer highlight (for the title color). */
    active?: boolean
    selected?: boolean
    /** Org currency override for money metrics without their own currency. */
    currency?: string
    /** Avatar size in px. Default 32. */
    avatarSize?: number
}

/**
 * The option row: avatar 32px · title (≤2 lines) + badges · muted subtitle ·
 * metrics aligned right. `dimmed` attenuates the content, never the hover.
 */
export function OptionDisplayRow({ display, label, active, selected, currency, avatarSize = 32 }: OptionDisplayRowProps) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const title = display.title || label || ''
    const trailing = display.trailing ?? []
    const badges = display.badges ?? []
    return (
        <span
            className="flex w-full min-w-0 items-center gap-3 py-0.5"
            data-slot="option-display"
            data-tone={display.tone || undefined}
            data-dimmed={display.dimmed || undefined}
            data-selected={selected || undefined}
        >
            <span className={display.dimmed ? 'opacity-60 grayscale' : undefined}>
                <OptionThumb image={display.image ?? null} name={title} size={avatarSize} />
            </span>
            <span className={'flex min-w-0 flex-1 flex-col gap-0.5' + (display.dimmed ? ' opacity-60' : '')}>
                <span className="flex min-w-0 items-start gap-1.5">
                    <span
                        className={'line-clamp-2 min-w-0 break-words text-sm font-medium leading-snug' + (active ? ' text-accent-foreground' : '')}
                        title={title}
                        data-slot="option-display-title"
                    >
                        {title}
                    </span>
                    {badges.map((b, i) => (
                        <Badge key={i} variant={toneVariant(b.tone)} className="mt-px px-1.5 py-0 text-[10px]" data-slot="option-display-badge">
                            {t(b.text, { defaultValue: b.text })}
                        </Badge>
                    ))}
                </span>
                {display.subtitle ? (
                    <span className="truncate text-xs text-muted-foreground" data-slot="option-display-subtitle">
                        {display.subtitle}
                    </span>
                ) : null}
            </span>
            {trailing.length > 0 ? (
                <span className="ml-auto flex shrink-0 items-center gap-3" data-slot="option-display-trailing">
                    {trailing.map((item) => (
                        <TrailingMetric key={item.key} item={item} fmt={fmt} />
                    ))}
                </span>
            ) : null}
        </span>
    )
}

/**
 * Compact summary for a picker's trigger: small avatar, title and the most
 * relevant metric (the toned one, else the first).
 */
export function OptionDisplayValue({ display, label, currency }: { display: OptionDisplayData; label?: string; currency?: string }) {
    const fmt = useFormatter({ currency })
    const title = display.title || label || ''
    const trailing = display.trailing ?? []
    const lead = trailing.find((i) => i.tone) ?? trailing[0]
    const extra = lead && trailing.find((i) => i !== lead && !i.tone)
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2" data-slot="option-display-value">
            <OptionThumb image={display.image ?? null} name={title} size={20} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {extra ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTrailingValue(extra, fmt)}</span>
            ) : null}
            {lead ? <TrailingMetric item={lead} fmt={fmt} compact /> : null}
        </span>
    )
}

/** Whether any of the options carries a display (switches a picker to rich rows). */
export const hasOptionDisplays = (options: readonly unknown[]): boolean => options.some((o) => getOptionDisplay(o) !== null)
