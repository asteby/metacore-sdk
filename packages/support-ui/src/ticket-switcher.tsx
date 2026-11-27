import { ArrowLeft, ChevronsUpDown } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@asteby/metacore-ui/primitives'
import type { SupportTicketItem } from './ticket-list'
import { SupportStatusBadge } from './status-badge'
import { SUPPORT_STATE_META, type SupportClientState } from './lifecycle'
import { useSupportT } from './labels'

export interface SupportTicketHeaderProps {
  folio: string
  subject?: string
  state: SupportClientState
  /** Back to the ticket list. */
  onBack?: () => void
  /** Other tickets the person can jump to without going back (open ones first; the host trims it). */
  others?: SupportTicketItem[]
  onSwitch?: (t: SupportTicketItem) => void
  className?: string
}

/**
 * Header of a ticket thread: back to the list, folio + subject, state chip with its one-line
 * explanation, and a switcher to jump to another ticket without losing context.
 */
export function SupportTicketHeader({ folio, subject, state, onBack, others, onSwitch, className }: SupportTicketHeaderProps) {
  const { t } = useSupportT()
  return (
    <header className={['shrink-0 border-b p-2 sm:p-3', className].filter(Boolean).join(' ')} data-testid="ticket-header">
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={onBack} aria-label={t('action.back')} title={t('action.back')}>
            <ArrowLeft className="rtl:rotate-180" aria-hidden />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{subject || folio}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{folio}</p>
        </div>
        <SupportStatusBadge state={state} />
        {others && others.length > 0 && onSwitch ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" className="size-8 shrink-0" aria-label={t('tickets.switch')} title={t('tickets.switch')}>
                <ChevronsUpDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
              <DropdownMenuLabel>{t('tickets.switch')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {others.map((o) => {
                const Icon = SUPPORT_STATE_META[o.state].icon
                return (
                  <DropdownMenuItem key={o.id} onSelect={() => onSwitch(o)} className="flex items-start gap-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{o.subject || o.folio}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {o.folio} · {t(`state.${o.state}.label`)}
                        {o.unread ? ` · ${t('tickets.unread', { count: String(o.unread) })}` : ''}
                      </span>
                    </span>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground" data-testid="ticket-hint">
        {t(`state.${state}.hint`)}
      </p>
    </header>
  )
}
