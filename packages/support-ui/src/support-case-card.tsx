import type { ReactNode } from 'react'
import { CheckCircle2, CircleDot, Lock } from 'lucide-react'
import { Badge } from '@asteby/metacore-ui/primitives'
import type { SupportCaseStatus } from '@asteby/metacore-sdk/support'
import { useSupportT } from './labels'

/** Badge variant per case status (shared with `SupportThread`'s header). */
export const STATUS_VARIANT = { open: 'info', resolved: 'success', closed: 'muted' } as const satisfies Record<SupportCaseStatus, string>

const STATUS_ICON = { open: CircleDot, resolved: CheckCircle2, closed: Lock } as const satisfies Record<SupportCaseStatus, unknown>

export interface SupportCaseCardProps {
  /** Case status; drives the badge colour, icon and label. */
  status: SupportCaseStatus
  /** Case folio shown in the header. */
  folio: string
  subject?: string
  /** Resolution text (resolved / closed cases). */
  solution?: string
  /** Optional trailing slot (e.g. a link to the case page); the host decides what it does. */
  action?: ReactNode
  className?: string
}

/** True when `s` is one of the three case statuses (guards untrusted wire data). */
export const isSupportCaseStatus = (s: unknown): s is SupportCaseStatus => s === 'open' || s === 'resolved' || s === 'closed'

/**
 * Case state card: folio, status badge (icon + text, never colour alone), subject and solution.
 * Presentational and instance-agnostic; used inside a conversation thread (team chat) or anywhere
 * a case summary is needed. Labels come from `supportThread.*` (es/en bundled).
 */
export function SupportCaseCard({ status, folio, subject, solution, action, className }: SupportCaseCardProps) {
  const { t } = useSupportT()
  const Icon = STATUS_ICON[status]
  const caseLabel = t('card.case', { folio })
  const statusLabel = t(`status.${status}`)
  return (
    <section
      aria-label={`${caseLabel}: ${statusLabel}`}
      data-testid="support-case-card"
      data-status={status}
      className={['flex w-full flex-col gap-1.5 rounded-lg border bg-card p-3 text-card-foreground', className].filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{caseLabel}</span>
        </span>
        <Badge variant={STATUS_VARIANT[status]} data-testid="case-card-status">
          {statusLabel}
        </Badge>
      </div>
      {subject ? <p className="break-words text-sm">{subject}</p> : null}
      {solution ? (
        <div className="rounded-md bg-muted/60 px-2 py-1.5 text-xs">
          <span className="font-medium">{t('card.solution')}</span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{solution}</p>
        </div>
      ) : null}
      {action ? <div className="pt-0.5">{action}</div> : null}
    </section>
  )
}
