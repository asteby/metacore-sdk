import { SUPPORT_STATE_META, EVENT_STATE, type SupportClientState, type SupportEvent, type SupportStateTone } from './lifecycle'
import { SupportActionBar, type SupportCardAction } from './ticket-actions'
import { SupportStatusBadge } from './status-badge'
import { useSupportT } from './labels'

export interface SupportEventCardProps {
  /** Lifecycle transition this card announces. */
  event: SupportEvent
  folio: string
  subject?: string
  solution?: string
  /** Current state of the ticket (may differ from the event: an old "resolved" card of a reopened ticket). */
  state?: SupportClientState
  /** When it happened (ISO); shown as a localized time. */
  at?: string
  actions?: SupportCardAction[]
  onAction?: (a: SupportCardAction) => void | Promise<void>
  busy?: string | null
  className?: string
}

const TONE_TEXT: Record<SupportStateTone, string> = {
  info: 'text-[var(--info,oklch(0.55_0.13_235))]',
  warning: 'text-[var(--warning,oklch(0.6_0.15_65))]',
  success: 'text-[var(--success,oklch(0.6_0.15_155))]',
  muted: 'text-muted-foreground',
}

const fmtTime = (iso: string | undefined, locale: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

/**
 * System card for a ticket lifecycle event (opened, resolved, reopened, finished). It is NOT a chat
 * bubble: it spans the thread, carries icon + event + folio + subject + time, a tone by state and the
 * contextual actions ("Ver ticket", "Reabrir", "Finalizar"). Presentational; the host runs actions.
 */
export function SupportEventCard({ event, folio, subject, solution, state, at, actions, onAction, busy, className }: SupportEventCardProps) {
  const { t, locale } = useSupportT()
  const eventState = EVENT_STATE[event]
  const { icon: Icon, tone } = SUPPORT_STATE_META[eventState]
  const title = t(`event.${event}`)
  const time = fmtTime(at, locale)
  return (
    <section
      aria-label={`${title}: ${folio}`}
      data-testid="support-event-card"
      data-event={event}
      data-state={state ?? eventState}
      className={['w-full', className].filter(Boolean).join(' ')}
    >
      <div className={`rounded-lg border border-s-4 border-s-current bg-muted/40 p-3 ${TONE_TEXT[tone]}`}>
        <div className="flex items-start gap-2.5 text-foreground">
          <Icon className={`mt-0.5 size-4 shrink-0 ${TONE_TEXT[tone]}`} aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="text-sm font-semibold">
                {title} <span className="font-mono text-xs font-medium text-muted-foreground">{folio}</span>
              </p>
              {state ? <SupportStatusBadge state={state} /> : null}
            </div>
            {subject ? <p className="break-words text-sm">{subject}</p> : null}
            {solution ? (
              <div className="rounded-md bg-background/70 px-2 py-1.5 text-xs">
                <span className="font-medium">{t('card.solution')}</span>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{solution}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t(`event.${event}Hint`)}</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              {actions?.length ? <SupportActionBar actions={actions} onAction={onAction} busy={busy} /> : <span />}
              {time ? (
                <time dateTime={at} className="text-[11px] text-muted-foreground">
                  {time}
                </time>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
