import * as React from 'react'
import { AlertTriangle, ArrowRight, Info, OctagonAlert, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'
import { formatBadgeCount, type Severity } from '../layout/badge-model'

const TONE: Record<Severity, { box: string; num: string; icon: LucideIcon }> = {
  info: { box: 'border-sky-500/30 bg-sky-500/5', num: 'text-sky-700 dark:text-sky-300', icon: Info },
  attention: { box: 'border-amber-500/40 bg-amber-500/5', num: 'text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  urgent: { box: 'border-orange-500/40 bg-orange-500/5', num: 'text-orange-700 dark:text-orange-300', icon: AlertTriangle },
  critical: { box: 'border-red-500/50 bg-red-500/5', num: 'text-red-700 dark:text-red-300', icon: OctagonAlert },
}

export interface AlertCardProps {
  /** Short title ("Hallazgos por revisar"). */
  title: string
  count: number
  tone: Severity
  /** Optional one-line context under the number. */
  description?: string
  /** CTA label ("Atender la más urgente"). Omit to render a non-actionable KPI. */
  ctaLabel?: string
  onCta?: () => void
  /** Or render the CTA as a link through the host router. */
  href?: string
  LinkComponent?: React.ComponentType<{ to: string; className?: string; children?: React.ReactNode }>
  className?: string
}

/**
 * KPI card for "where do I go next": severity-toned count + one CTA. Severity is
 * conveyed by icon + text label as well as color. Count 0 renders a calm state.
 */
export function AlertCard({ title, count, tone, description, ctaLabel, onCta, href, LinkComponent, className }: AlertCardProps) {
  const t = TONE[tone]
  const Icon = t.icon
  const cta = ctaLabel ? (
    href && LinkComponent ? (
      <LinkComponent to={href} className='mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline'>
        {ctaLabel} <ArrowRight className='size-4' aria-hidden='true' />
      </LinkComponent>
    ) : (
      <button type='button' onClick={onCta} className='mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline'>
        {ctaLabel} <ArrowRight className='size-4' aria-hidden='true' />
      </button>
    )
  ) : null
  return (
    <section
      data-tone={tone}
      aria-label={`${title}: ${count}`}
      className={cn('rounded-xl border p-4', count > 0 ? t.box : 'border-border bg-card', className)}
    >
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <Icon className={cn('size-4', count > 0 && t.num)} aria-hidden='true' />
        <span>{title}</span>
      </div>
      <div className={cn('mt-2 text-3xl font-semibold tabular-nums', count > 0 ? t.num : 'text-foreground')} title={String(count)}>
        {count > 0 ? formatBadgeCount(count, 999) : '0'}
      </div>
      {description && <p className='mt-1 text-sm text-muted-foreground'>{description}</p>}
      {count > 0 && cta}
    </section>
  )
}
