import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import { SUPPORT_STATE_META, SUPPORT_TICKET_GROUPS, type SupportClientState, type SupportTicketGroup } from './lifecycle'
import { SupportStatusBadge } from './status-badge'
import { useSupportT } from './labels'

/** One row of the ticket list. */
export interface SupportTicketItem {
  /** Opaque id the host uses to open it (channel id in the team chat, folio in the embed). */
  id: string
  folio: string
  subject: string
  state: SupportClientState
  unread?: number
  lastMessage?: { body: string; at?: string; fromMe?: boolean }
  updatedAt?: string
}

/** Per-group paging info (the server paginates the finished group). */
export interface SupportTicketGroupMeta {
  key: SupportTicketGroup
  count?: number
  unread?: number
  hasMore?: boolean
}

export interface SupportTicketListProps {
  tickets: SupportTicketItem[]
  groups?: SupportTicketGroupMeta[]
  /** Currently open ticket id (highlighted). */
  activeId?: string | null
  loading?: boolean
  error?: boolean
  onSelect: (t: SupportTicketItem) => void
  /** "New ticket" is always visible while this is given. */
  onNewTicket?: () => void
  onLoadMore?: (group: SupportTicketGroup) => void
  loadingMore?: SupportTicketGroup | null
  className?: string
}

const fmtShort = (iso: string | undefined, locale: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(locale, sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium' }).format(d)
}

/**
 * The customer's tickets, grouped by state (Waiting for your reply / Open / Resolved / Finished),
 * each with folio, subject, last message, unread count and state. Shared by the team chat and the
 * embed; the host supplies the data and what "select" does. Never an endless thread: the finished
 * group loads on demand.
 */
export function SupportTicketList({ tickets, groups, activeId, loading, error, onSelect, onNewTicket, onLoadMore, loadingMore, className }: SupportTicketListProps) {
  const { t, locale } = useSupportT()
  const byGroup = useMemo(() => {
    const m = new Map<SupportTicketGroup, SupportTicketItem[]>()
    for (const k of SUPPORT_TICKET_GROUPS) m.set(k, [])
    for (const tk of tickets) m.get(SUPPORT_STATE_META[tk.state].group)!.push(tk)
    return m
  }, [tickets])
  const meta = (k: SupportTicketGroup) => groups?.find((g) => g.key === k)
  const total = tickets.reduce((n, tk) => n + (tk.unread ?? 0), 0)

  return (
    <div className={['flex h-full min-h-0 flex-col', className].filter(Boolean).join(' ')} data-testid="support-ticket-list">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <h2 className="text-sm font-semibold">
          {t('tickets.title')}
          {total > 0 ? (
            <Badge variant="info" className="ms-2" aria-label={t('tickets.unreadTotal', { count: String(total) })}>
              {total}
            </Badge>
          ) : null}
        </h2>
        {onNewTicket ? (
          <Button type="button" size="sm" onClick={onNewTicket} data-testid="new-ticket">
            <Plus aria-hidden />
            {t('action.newTicket')}
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && tickets.length === 0 ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            {t('tickets.loading')}
          </p>
        ) : error && tickets.length === 0 ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {t('tickets.loadError')}
          </p>
        ) : tickets.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium">{t('tickets.empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('tickets.emptyBody')}</p>
          </div>
        ) : (
          SUPPORT_TICKET_GROUPS.map((g) => {
            const items = byGroup.get(g) ?? []
            const gm = meta(g)
            if (items.length === 0 && !gm?.hasMore) return null
            const headingId = `support-group-${g}`
            return (
              <section key={g} aria-labelledby={headingId} data-group={g}>
                <h3 id={headingId} className="sticky top-0 z-10 flex items-center justify-between bg-background/90 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <span>{t(`tickets.group.${g}`)}</span>
                  <span className="tabular-nums">{gm?.count ?? items.length}</span>
                </h3>
                <ul>
                  {items.map((tk) => {
                    const Icon = SUPPORT_STATE_META[tk.state].icon
                    const when = fmtShort(tk.lastMessage?.at ?? tk.updatedAt, locale)
                    const unread = tk.unread ?? 0
                    return (
                      <li key={tk.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(tk)}
                          aria-current={activeId === tk.id ? 'true' : undefined}
                          data-testid="ticket-row"
                          data-unread={unread > 0 ? 'true' : undefined}
                          className={[
                            'flex w-full items-start gap-3 px-3 py-2.5 text-start transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                            activeId === tk.id ? 'bg-muted' : '',
                          ].join(' ')}
                        >
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={['truncate text-sm', unread > 0 ? 'font-semibold' : 'font-medium'].join(' ')}>{tk.subject || tk.folio}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{when}</span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{tk.folio}</span>
                              <SupportStatusBadge state={tk.state} hideHint className="h-5 px-1.5 text-[11px]" />
                            </span>
                            <span className="flex items-center justify-between gap-2">
                              <span className="line-clamp-1 text-xs text-muted-foreground">
                                {tk.lastMessage ? `${tk.lastMessage.fromMe ? t('tickets.you') : ''}${tk.lastMessage.body}` : t('tickets.noMessages')}
                              </span>
                              {unread > 0 ? (
                                <Badge variant="info" className="h-5 min-w-5 px-1.5" aria-label={t('tickets.unread', { count: String(unread) })}>
                                  {unread > 99 ? '99+' : unread}
                                </Badge>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {gm?.hasMore && onLoadMore ? (
                  <div className="px-3 pb-2">
                    <Button type="button" variant="ghost" size="sm" disabled={loadingMore === g} onClick={() => onLoadMore(g)}>
                      {loadingMore === g ? t('tickets.loading') : t('tickets.loadMore')}
                    </Button>
                  </div>
                ) : null}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
