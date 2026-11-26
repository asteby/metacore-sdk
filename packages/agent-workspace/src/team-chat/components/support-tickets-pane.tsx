import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  SupportEventCard,
  SupportNewTicketForm,
  SupportResolvedPrompt,
  SupportTicketHeader,
  SupportTicketList,
  clientStateOf,
  type SupportCardAction,
  type SupportClientState,
} from '@asteby/metacore-support-ui'
import { api } from '../../host'
import { parseAttachments, supportEventFromAttachment, type TeamChatMessage } from '../data/types'
import type { SupportTicketsApi } from '../hooks/use-support-tickets'

/** Runs a card/prompt action: `view` navigates, `reopen` / `finalize` call the request the server declared. */
export function useSupportCardActions(onDone: (action: SupportCardAction['id']) => void) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const run = useCallback(
    async (a: SupportCardAction) => {
      if (a.id === 'view' && a.href) {
        void navigate({ to: a.href })
        return
      }
      if (!a.request) return
      setBusy(a.id)
      setFailed(false)
      try {
        const method = a.request.method.toLowerCase()
        if (method === 'post') await api.post(a.request.path, {})
        else if (method === 'delete') await api.delete(a.request.path)
        else await api.get(a.request.path)
        onDone(a.id)
      } catch {
        setFailed(true)
      } finally {
        setBusy(null)
      }
    },
    [navigate, onDone],
  )
  return { run, busy, failed }
}

/** The lifecycle card of a thread message (system card, never a bubble); null if the message is not one. */
export function SupportEventMessage({
  message,
  latest,
  onAction,
  busy,
}: {
  message: TeamChatMessage
  /** Only the newest card of a ticket keeps its actions (older ones are history). */
  latest: boolean
  onAction: (a: SupportCardAction) => void | Promise<void>
  busy: string | null
}) {
  const ev = parseAttachments(message.attachments)
    .map(supportEventFromAttachment)
    .find((x) => x !== null)
  if (!ev) return null
  return (
    <div className="w-full self-stretch py-1" data-message-id={message.id}>
      <SupportEventCard
        event={ev.event}
        folio={ev.folio}
        subject={ev.subject}
        solution={ev.solution}
        state={ev.state}
        at={ev.at ?? message.created_at}
        actions={latest ? ev.actions : ev.actions.filter((a) => a.id === 'view')}
        onAction={onAction}
        busy={busy}
      />
    </div>
  )
}

export const isSupportEventMessage = (m: TeamChatMessage): boolean => parseAttachments(m.attachments).some((a) => supportEventFromAttachment(a) !== null)

/** Id of the newest lifecycle card of a message list (the one that keeps its actions). */
export function latestEventId(messages: TeamChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) if (isSupportEventMessage(messages[i])) return messages[i].id
  return null
}

/** Actions of the newest lifecycle card: what the resolved prompt may offer (reopen / finalize). */
export function latestEventActions(messages: TeamChatMessage[]): SupportCardAction[] {
  const id = latestEventId(messages)
  const m = messages.find((x) => x.id === id)
  if (!m) return []
  const ev = parseAttachments(m.attachments)
    .map(supportEventFromAttachment)
    .find((x) => x !== null)
  return ev?.actions ?? []
}

/** What the contact shows instead of a thread: the ticket list, or the new-ticket form. */
export function SupportTicketsLanding({ tickets }: { tickets: SupportTicketsApi }) {
  if (tickets.composing) {
    return (
      <SupportNewTicketForm
        withSubject={false}
        openTicket={tickets.openTicket ? { folio: tickets.openTicket.folio, subject: tickets.openTicket.subject } : undefined}
        onContinue={() => tickets.openTicket && tickets.select(tickets.openTicket)}
        onSubmit={(_s, body) => tickets.create(body)}
        onCancel={tickets.cancelNew}
      />
    )
  }
  return (
    <SupportTicketList
      tickets={tickets.tickets}
      groups={tickets.groups}
      loading={tickets.loading}
      error={tickets.error}
      onSelect={tickets.select}
      onNewTicket={tickets.startNew}
      onLoadMore={tickets.loadMore}
      loadingMore={tickets.loadingMore}
    />
  )
}

/** Header of the open ticket: back, folio + subject, state with its explanation, switcher. */
export function SupportTicketChrome({ tickets }: { tickets: SupportTicketsApi }) {
  const t = tickets.selected
  if (!t) return null
  return (
    <SupportTicketHeader
      folio={t.folio}
      subject={t.subject}
      state={clientStateOf({ status: 'open', state: t.state })}
      onBack={tickets.back}
      others={tickets.others}
      onSwitch={tickets.select}
    />
  )
}

/**
 * Footer of a ticket that no longer takes messages: "Was it resolved?" with Reopen / Finish / Open another
 * (only the ones the server offers), or the finished notice. Returns null while the ticket is writable.
 */
export function SupportTicketFooter({
  state,
  folio,
  actions,
  onAction,
  onOpenAnother,
  busy,
  failed,
}: {
  state: SupportClientState
  folio: string
  actions: SupportCardAction[]
  onAction: (a: SupportCardAction) => void | Promise<void>
  onOpenAnother: () => void
  busy: string | null
  failed: boolean
}) {
  if (state !== 'resolved' && state !== 'closed') return null
  const find = (id: SupportCardAction['id']) => actions.find((a) => a.id === id)
  const reopen = find('reopen')
  const finalize = find('finalize')
  return (
    <SupportResolvedPrompt
      folio={folio}
      state={state}
      onReopen={reopen ? () => onAction(reopen) : undefined}
      onFinalize={finalize ? () => onAction(finalize) : undefined}
      onOpenAnother={onOpenAnother}
      busy={busy}
      failed={failed}
    />
  )
}
