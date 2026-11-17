// Pure model for attention badges: one severity vocabulary shared by sidebar
// badges, bell, tab title, favicon, alert cards. No JSX, no `@/` aliases so it
// is unit-testable in the package's node environment.

/** info < attention < urgent < critical. */
export type Severity = 'info' | 'attention' | 'urgent' | 'critical'

export interface NavBadgeValue {
  /** Exact count. 0 (or negative) renders nothing. */
  count: number
  tone: Severity
  /** Already-translated, human label used for aria-label/tooltip ("alertas abiertas"). */
  label?: string
}

export const SEVERITIES: readonly Severity[] = ['info', 'attention', 'urgent', 'critical']
const RANK: Record<Severity, number> = { info: 0, attention: 1, urgent: 2, critical: 3 }

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && v in RANK
}

/** The more severe of two tones. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return RANK[b] > RANK[a] ? b : a
}

export const DEFAULT_BADGE_MAX = 99

/** 0 -> '', 7 -> '7', 100 -> '99+'. */
export function formatBadgeCount(n: number, max: number = DEFAULT_BADGE_MAX): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const c = Math.floor(n)
  return c > max ? `${max}+` : String(c)
}

export function isNavBadgeValue(v: unknown): v is NavBadgeValue {
  return typeof v === 'object' && v !== null && typeof (v as NavBadgeValue).count === 'number' && isSeverity((v as NavBadgeValue).tone)
}

/** Whether a nav `badge` prop (number | string | NavBadgeValue) renders. */
export function hasNavBadge(badge: number | string | NavBadgeValue | undefined | null): boolean {
  if (badge == null) return false
  if (typeof badge === 'number') return badge !== 0
  if (typeof badge === 'string') return Boolean(badge)
  return badge.count > 0
}

/** "(99+) Vantora" — the tab title with an aggregate counter; unchanged when 0. */
export function formatTabTitle(base: string, count: number, max: number = DEFAULT_BADGE_MAX): string {
  const c = formatBadgeCount(count, max)
  return c ? `(${c}) ${base}` : base
}

/** Strips a previously applied "(n) " prefix so the title can be re-stamped idempotently. */
export function stripTabTitleCount(title: string): string {
  return title.replace(/^\((?:\d+\+?)\)\s+/, '')
}

/** Aggregates badge values: summed count (deduped by caller) + the most severe tone. */
export function aggregateBadges(values: Iterable<NavBadgeValue>): { count: number; tone: Severity } {
  let count = 0
  let tone: Severity = 'info'
  for (const v of values) {
    if (v.count <= 0) continue
    count += v.count
    tone = maxSeverity(tone, v.tone)
  }
  return { count, tone }
}
