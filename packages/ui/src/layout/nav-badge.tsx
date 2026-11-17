import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  formatBadgeCount,
  DEFAULT_BADGE_MAX,
  type NavBadgeValue,
  type Severity,
} from './badge-model'

// Tone -> classes. Light + dark, never color alone: critical also shows "!".
// `motion-safe:` keeps the pulse off for prefers-reduced-motion users, and only
// urgent/critical pulse (opacity only: no layout shift).
export const BADGE_TONE_CLASS: Record<Severity, string> = {
  info: 'bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300',
  attention: 'bg-amber-500/20 text-amber-800 ring-amber-500/40 dark:text-amber-300',
  urgent: 'bg-orange-500/20 text-orange-800 ring-orange-500/40 dark:text-orange-300 motion-safe:animate-pulse',
  critical: 'bg-red-600 text-white ring-red-600/50 dark:bg-red-500 motion-safe:animate-pulse',
}

export interface NavBadgeProps {
  value: NavBadgeValue
  /** Cap before "N+" (default 99). */
  max?: number
  className?: string
}

/**
 * Severity-toned count pill. Renders null for count <= 0. Capped at "99+" but
 * the exact number is always in aria-label/title. Not interactive: it lives
 * inside the nav link, so there is no nested anchor.
 */
export function NavBadge({ value, max = DEFAULT_BADGE_MAX, className }: NavBadgeProps) {
  const text = formatBadgeCount(value.count, max)
  if (!text) return null
  const aria = value.label ? `${value.count} ${value.label}` : String(value.count)
  return (
    <span
      role='status'
      aria-label={aria}
      title={aria}
      data-tone={value.tone}
      className={cn(
        'ms-auto inline-flex min-w-5 shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 text-xs font-semibold leading-5 tabular-nums ring-1 ring-inset',
        BADGE_TONE_CLASS[value.tone],
        className
      )}
    >
      {value.tone === 'critical' && <span aria-hidden='true'>!</span>}
      <span aria-hidden='true'>{text}</span>
    </span>
  )
}
