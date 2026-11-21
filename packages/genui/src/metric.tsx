import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import type { GenUIBlockRendererProps } from './registry'
import { TEXT_TONE } from './generative-ui'
import type { Tone } from './types'
import { TrendSpark } from './tiles/spark'
import { toTileTone } from './tiles/tone-css'
import { formatAmount, relativeTime } from '@asteby/metacore-lib'

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight }
const TREND_LABEL = { up: 'al alza', down: 'a la baja', flat: 'estable' }

/** Formats a metric value with Intl (no host dependency). Unknown shapes print as text. */
export function formatMetric(value: unknown, format: string | undefined, locale?: string, currency?: string): string {
  if (value === null || value === undefined) return '—'
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : NaN
  try {
    switch (format) {
      case 'currency':
        return Number.isNaN(n) ? String(value) : formatAmount(n, { currency, locale })
      case 'percent':
        return Number.isNaN(n) ? String(value) : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(n > 1 ? n / 100 : n)
      case 'compact':
        return Number.isNaN(n) ? String(value) : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
      case 'date':
      case 'datetime': {
        const d = new Date(String(value))
        return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat(locale, format === 'date' ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }).format(d)
      }
      case 'relative_date': {
        const text = relativeTime(String(value), { locale })
        return text || String(value)
      }
      default:
        return Number.isNaN(n) ? String(value) : new Intl.NumberFormat(locale).format(n)
    }
  } catch {
    return String(value)
  }
}

/** Tone of a value from its thresholds: the highest `at` the value reaches wins; otherwise the block's own tone. */
export function toneFor(value: unknown, thresholds: Array<{ at: number; tone: Tone }> | undefined, base: Tone = 'default'): Tone {
  const n = typeof value === 'number' ? value : Number(value)
  if (!thresholds?.length || !Number.isFinite(n)) return base
  let tone = base
  let best = -Infinity
  for (const t of thresholds) if (n >= t.at && t.at > best) (best = t.at), (tone = t.tone)
  return tone
}

/** `metric` block: one KPI with trend, severity thresholds and an optional sparkline. */
export function MetricBlock({ block, rows, text, locale, currency }: GenUIBlockRendererProps) {
  const first = block.source ? rows?.[0] : undefined
  const raw = block.source ? first?.[block.field as string] : block.value
  const value = typeof raw === 'object' && raw !== null ? text(raw) : raw
  const tone = toneFor(value, block.thresholds, (block.tone as Tone) || 'default')
  const spark: number[] = block.source
    ? (rows ?? []).length > 1 && block.spark_field
      ? (rows ?? []).map((r) => Number(r[block.spark_field as string])).filter(Number.isFinite)
      : Array.isArray(first?.[block.spark_field as string])
        ? (first![block.spark_field as string] as unknown[]).map(Number).filter(Number.isFinite)
        : []
    : (block.spark ?? [])
  const Icon = block.trend ? TREND_ICON[block.trend as 'up'] : null
  const loading = block.source && rows === undefined
  return (
    <div className='flex w-full items-center justify-between gap-3 rounded-lg border bg-card p-3' data-genui-block='metric' aria-busy={loading || undefined}>
      <div className='min-w-0'>
        <p className='m-0 text-xs text-muted-foreground'>{text(block.label)}</p>
        <p className={cn('m-0 flex items-center gap-1 text-2xl font-semibold tabular-nums', TEXT_TONE[tone])}>
          {loading ? '…' : formatMetric(value, block.format, locale, currency)}
          {Icon ? (
            <>
              <Icon className='size-4' aria-hidden />
              <span className='sr-only'>{TREND_LABEL[block.trend as 'up']}</span>
            </>
          ) : null}
        </p>
        {block.delta || block.compare ? (
          <p className='m-0 text-xs text-muted-foreground'>
            {block.delta ? <span className='font-medium'>{block.delta}</span> : null} {block.compare}
          </p>
        ) : null}
        {block.hint ? <p className='m-0 text-xs text-muted-foreground'>{text(block.hint)}</p> : null}
      </div>
      {spark.length > 1 ? <div className='w-24 shrink-0'><TrendSpark data={spark} tone={toTileTone(tone)} height={28} /></div> : null}
    </div>
  )
}
