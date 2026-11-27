import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SUPPORT_TICKET_GROUPS,
  clientStateOf,
  isSupportClientState,
  type SupportClientState,
  type SupportTicketGroup,
  type SupportTicketGroupMeta,
  type SupportTicketItem,
} from '@asteby/metacore-support-ui'
import { api } from '../../host'
import type { TeamChatChannel, TeamChatMessage } from '../data/types'

/** Wire shape of `GET /internal-chat/channels/:id/threads` (one ticket). */
interface WireTicket {
  id: string
  scope: string
  title?: string
  state?: string
  group?: string
  unread?: number
  last_message?: { body?: string; sender_name?: string; created_at?: string; from_me?: boolean } | null
  updated_at?: string
}
interface WireGroup {
  key: string
  count?: number
  unread?: number
  next_cursor?: string
}

const stateOf = (t: WireTicket): SupportClientState =>
  isSupportClientState(t.state) ? t.state : clientStateOf({ status: t.group === 'closed' ? 'closed' : t.group === 'resolved' ? 'resolved' : 'open' })

const toItem = (t: WireTicket): SupportTicketItem => ({
  id: t.id,
  folio: t.scope,
  subject: t.title ?? '',
  state: stateOf(t),
  unread: t.unread ?? 0,
  lastMessage: t.last_message?.body
    ? { body: t.last_message.body, at: t.last_message.created_at, fromMe: t.last_message.from_me }
    : undefined,
  updatedAt: t.updated_at,
})

const isGroup = (k: string): k is SupportTicketGroup => (SUPPORT_TICKET_GROUPS as readonly string[]).includes(k)

export interface SupportTicketsApi {
  /** The channel has one sub-thread per ticket (`channel.sub_threads`). */
  enabled: boolean
  tickets: SupportTicketItem[]
  groups: SupportTicketGroupMeta[]
  loading: boolean
  error: boolean
  loadingMore: SupportTicketGroup | null
  /** Ticket being read (its id is the channel id for messages / send / read), or null at the list. */
  selected: SupportTicketItem | null
  /** The "new ticket" form is showing. */
  composing: boolean
  /** Open ticket the person could continue instead of opening another (the most recent one needing attention). */
  openTicket: SupportTicketItem | null
  /** Other tickets for the header switcher (open and waiting first, at most 8). */
  others: SupportTicketItem[]
  /** Total unread across tickets. */
  unread: number
  select: (t: SupportTicketItem) => void
  back: () => void
  startNew: () => void
  cancelNew: () => void
  loadMore: (g: SupportTicketGroup) => void
  refresh: () => Promise<void>
  /** Opens a ticket from its first message and selects it. */
  create: (body: string) => Promise<void>
  /**
   * Feed it every live message of the contact channel: updates the row (last message, state, unread) or
   * refetches when unknown. Returns true when the message belongs to the ticket being read.
   */
  onLiveMessage: (m: TeamChatMessage) => boolean
  /** Sets the state of the selected ticket after an action or an event card (so the header/footer follow at once). */
  setSelectedState: (s: SupportClientState) => void
}

/**
 * State of the support contact's tickets: list (grouped, paginated), selection, "new ticket", live updates.
 * One hook for every surface that shows the contact (full team chat and floating widget); with
 * `channel.sub_threads` off it is inert and the channel behaves as a single thread, as always.
 */
export function useSupportTickets(channel: TeamChatChannel | null | undefined): SupportTicketsApi {
  const channelId = channel?.id
  const enabled = Boolean(channel?.sub_threads && channelId)
  const [tickets, setTickets] = useState<SupportTicketItem[]>([])
  const [groups, setGroups] = useState<SupportTicketGroupMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState<SupportTicketGroup | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const cursors = useRef<Record<string, string | undefined>>({})
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  const live = useRef(0)

  const fetchAll = useCallback(async () => {
    if (!channelId) return
    const seq = ++live.current
    try {
      const { data } = await api.get(`/internal-chat/channels/${channelId}/threads`)
      if (seq !== live.current) return
      const wire = (data.threads ?? []) as WireTicket[]
      const wg = (data.groups ?? []) as WireGroup[]
      cursors.current = {}
      for (const g of wg) if (g.next_cursor) cursors.current[g.key] = g.next_cursor
      setTickets(wire.map(toItem))
      setGroups(wg.filter((g) => isGroup(g.key)).map((g) => ({ key: g.key as SupportTicketGroup, count: g.count, unread: g.unread, hasMore: Boolean(g.next_cursor) })))
      setError(false)
    } catch {
      if (seq === live.current) setError(true)
    } finally {
      if (seq === live.current) setLoading(false)
    }
  }, [channelId])

  // A different contact (or sub-threads switched off) starts from the list again.
  useEffect(() => {
    setSelectedId(null)
    setComposing(false)
    setTickets([])
    setGroups([])
    if (!enabled) return
    setLoading(true)
    void fetchAll()
  }, [enabled, fetchAll])

  const loadMore = useCallback(
    (g: SupportTicketGroup) => {
      const cursor = cursors.current[g]
      if (!channelId || !cursor) return
      setLoadingMore(g)
      api
        .get(`/internal-chat/channels/${channelId}/threads`, { params: { group: g, before: cursor } })
        .then(({ data }) => {
          const more = ((data.threads ?? []) as WireTicket[]).map(toItem)
          const next = (data.groups as WireGroup[] | undefined)?.find((x) => x.key === g)?.next_cursor ?? (data.next_cursor as string | undefined)
          cursors.current[g] = next
          setTickets((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))])
          setGroups((prev) => prev.map((x) => (x.key === g ? { ...x, hasMore: Boolean(next) } : x)))
        })
        .catch(() => {})
        .finally(() => setLoadingMore(null))
    },
    [channelId],
  )

  const selected = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId])

  const select = useCallback((t: SupportTicketItem) => {
    setComposing(false)
    setSelectedId(t.id)
    // Reading clears its unread row at once; the server confirms with the read call of the host.
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)))
  }, [])
  const back = useCallback(() => {
    setSelectedId(null)
    setComposing(false)
    void fetchAll()
  }, [fetchAll])

  const create = useCallback(
    async (body: string) => {
      if (!channelId) return
      const { data } = await api.post(`/internal-chat/channels/${channelId}/messages`, { body, new_thread: true })
      const msg = data.message as TeamChatMessage
      await fetchAll()
      setComposing(false)
      if (msg?.thread_id) setSelectedId(msg.thread_id)
    },
    [channelId, fetchAll],
  )

  const onLiveMessage = useCallback(
    (m: TeamChatMessage) => {
      if (!m.thread_id) return false
      const viewing = selectedRef.current === m.thread_id
      const known = tickets.some((t) => t.id === m.thread_id)
      if (!known) {
        void fetchAll()
        return viewing
      }
      const state = isSupportClientState(m.ticket?.state) ? m.ticket!.state : undefined
      setTickets((prev) =>
        prev.map((t) =>
          t.id === m.thread_id
            ? {
                ...t,
                state: state ?? t.state,
                unread: viewing ? 0 : (t.unread ?? 0) + 1,
                lastMessage: { body: m.body, at: m.created_at },
                updatedAt: m.created_at,
              }
            : t,
        ),
      )
      // A state change moves the ticket between groups, so the grouped counts are refetched.
      if (state) void fetchAll()
      return viewing
    },
    [tickets, fetchAll],
  )

  const setSelectedState = useCallback((s: SupportClientState) => {
    setTickets((prev) => prev.map((t) => (t.id === selectedRef.current ? { ...t, state: s } : t)))
  }, [])

  const openTicket = useMemo(
    () => tickets.find((t) => t.state === 'waiting') ?? tickets.find((t) => t.state === 'new' || t.state === 'in_progress' || t.state === 'reopened') ?? null,
    [tickets],
  )
  const others = useMemo(
    () =>
      tickets
        .filter((t) => t.id !== selectedId && (t.state === 'waiting' || t.state === 'new' || t.state === 'in_progress' || t.state === 'reopened'))
        .slice(0, 8),
    [tickets, selectedId],
  )
  const unread = useMemo(() => tickets.reduce((n, t) => n + (t.unread ?? 0), 0), [tickets])

  return {
    enabled,
    tickets,
    groups,
    loading,
    error,
    loadingMore,
    selected,
    composing,
    openTicket,
    others,
    unread,
    select,
    back,
    startNew: () => setComposing(true),
    cancelNew: () => setComposing(false),
    loadMore,
    refresh: fetchAll,
    create,
    onLiveMessage,
    setSelectedState,
  }
}
