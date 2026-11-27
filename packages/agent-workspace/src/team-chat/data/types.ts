import {
  isSupportCaseStatus,
  isSupportClientState,
  isSupportEvent,
  type SupportCardAction,
  type SupportCaseCardProps,
  type SupportClientAction,
  type SupportClientState,
  type SupportEvent,
} from '@asteby/metacore-support-ui'
import { stripMarkdownLite } from '../../lib/plain-text'

export type ChannelKind = 'team' | 'branch' | 'dm' | 'topic' | 'broadcast'

export interface ChatAttachment {
  url?: string
  name?: string
  mime_type?: string
  size?: number
  /** Normalized 0..1 bar heights for WhatsApp-style voice notes. */
  waveform?: number[]
  /** Duration in seconds (voice notes). */
  duration?: number
  /** Inline call event (missed / ended) — not a file. */
  type?: 'call' | 'record' | 'view' | 'chart' | 'image' | string
  kind?: 'audio' | 'video' | 'screen' | string
  status?: 'missed' | 'ended' | string
  /** Shared record / filtered view embed. */
  model?: string
  /** Human table title (e.g. Existencias) — prefer over raw model key. */
  model_title?: string
  id?: string
  title?: string
  subtitle?: string
  filter_summary?: string
  search?: string
  /** Live Recharts spec when type=chart. */
  chart?: ChartSpec
  /** Matching rows when type=count (an agent query that found N, often 0). */
  count?: number
  /** Inline data URL ("data:image/png;base64,…") when type=image (Aby's generate_image tool). */
  image_data_url?: string
  /**
   * type=support_case (a case state card the server drops into a thread): `status` is
   * open | resolved | closed, plus these. `title` is NOT reused so the shape stays explicit.
   */
  folio?: string
  subject?: string
  solution?: string
  /**
   * Additive fields of a lifecycle event card (type=support_case): which transition it announces
   * (opened | resolved | reopened | closed), the ticket's CURRENT client state, when it happened and the
   * actions available now (texts come from the SDK by id; the server only declares ids, hrefs and requests).
   */
  event?: string
  state?: string
  at?: string
  actions?: Array<{ id?: string; href?: string; request?: { method?: string; path?: string } }>
}

export type ChartKind =
  | 'bar'
  | 'stacked_bar'
  | 'horizontal_bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'scatter'
  | 'radar'
  | 'composed'
  | 'choropleth'

export interface ChartSeries {
  key: string
  label?: string
}

export interface ChartSpec {
  kind: ChartKind | string
  title?: string
  x_key: string
  x_label?: string
  unit?: string
  series: ChartSeries[]
  rows: Record<string, unknown>[]
  note?: string
  /** ISO country for choropleth maps */
  country_code?: string
  region_key?: string
  value_key?: string
}

export interface TeamChatMessage {
  id: string
  channel_id: string
  sender_id: string
  sender_name: string
  sender_avatar?: string
  body: string
  attachments?: string | ChatAttachment[] | null
  reply_to_id?: string | null
  reply_to?: MessageReplyPreview | null
  reactions?: MessageReaction[] | null
  created_at: string
  edited_at?: string | null
  /** Support contact only: the ticket sub-thread (channel id) this message belongs to. */
  thread_id?: string
  /** Support contact only: ticket summary riding on live messages so lists update without a refetch. */
  ticket?: { folio?: string; state?: string; group?: string } | null
}

export interface MessageReplyPreview {
  id: string
  sender_id: string
  sender_name: string
  body: string
}

export interface MessageReaction {
  emoji: string
  count: number
  me: boolean
  user_ids?: string[]
}

// DMUser is the other participant of a kind=dm channel (the backend resolves it
// so we never persist a per-viewer name on the channel row).
export interface TeamChatDMUser {
  id: string
  name: string
  avatar?: string
  email?: string
  online?: boolean
  last_seen_at?: string | null
}

/**
 * What a channel supports. The server declares it per channel (`TeamChatChannel.capabilities`);
 * every flag defaults to `true`, so a channel without the field behaves exactly as before.
 * Only an explicit `false` turns something off (see `resolveChannelCapabilities`).
 */
export interface TeamChatCapabilities {
  /** Audio / video / screen-share buttons and joining an active call. */
  calls: boolean
  /** Reaction menu and chips on messages. */
  reactions: boolean
  /** Reply-to (swipe / context-menu "Responder") and quoted replies. */
  replies: boolean
  /** Attach button, paste-to-attach and voice notes (anything uploaded from the composer). */
  attachments: boolean
}

/** An action in a section header. `href` navigates; otherwise the host's `onSectionAction` runs. */
export interface TeamChatSectionAction {
  id: string
  label: string
  /** lucide icon name (any casing/separator). */
  icon?: string
  href?: string
}

/**
 * A pinned, titled group of conversations above the regular list (generic: support, billing,
 * announcements...). Declared by the server in `GET /internal-chat/channels` as `sections`;
 * channels join one through `channel.section === section.key`. All text is server-provided.
 */
export interface TeamChatSection {
  key: string
  title: string
  hint?: string
  actions?: TeamChatSectionAction[]
}

export interface TeamChatChannel {
  id: string
  name: string
  kind: ChannelKind
  icon?: string
  description?: string
  branch_id?: string | null
  is_default: boolean
  unread: number
  muted: boolean
  last_message?: TeamChatMessage | null
  dm_user?: TeamChatDMUser | null
  active_call?: { id: string; kind: string; status: string } | null
  /** Server-declared capabilities; omitted = everything supported (legacy behaviour). */
  capabilities?: Partial<TeamChatCapabilities> | null
  /** Key of a `TeamChatSection` (from the channels response) this conversation is grouped under. */
  section?: string
  /** Virtual system contact key (e.g. "support"); informational, the SDK does not branch on it. */
  thread?: string
  /**
   * The contact has one sub-thread per ticket: opening it shows the ticket list (`GET /internal-chat/channels/:id/threads`)
   * and each ticket is its own channel id for messages / send / read. Omitted = a single thread, as always.
   */
  sub_threads?: boolean
}

// OrgUser is a member of the organization, used by the "Nuevo mensaje"
// people-picker to start a DM.
export interface OrgUser {
  id: string
  name: string
  email?: string
  avatar?: string
  online?: boolean
}

export function parseAttachments(
  raw: TeamChatMessage['attachments'],
): ChatAttachment[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** A `support_case` attachment with a valid status and folio, as card props; else null. */
export function supportCaseFromAttachment(
  a: ChatAttachment,
): Pick<SupportCaseCardProps, 'status' | 'folio' | 'subject' | 'solution'> | null {
  if (a.type !== 'support_case' || !isSupportCaseStatus(a.status) || !a.folio?.trim()) return null
  return { status: a.status, folio: a.folio, subject: a.subject?.trim() || undefined, solution: a.solution?.trim() || undefined }
}

/** A lifecycle event card (opened / resolved / reopened / closed) as props; null for a plain case card or other attachments. */
export function supportEventFromAttachment(a: ChatAttachment): {
  event: SupportEvent
  folio: string
  subject?: string
  solution?: string
  state?: SupportClientState
  at?: string
  actions: SupportCardAction[]
} | null {
  if (a.type !== 'support_case' || !isSupportEvent(a.event) || !a.folio?.trim()) return null
  const actions: SupportCardAction[] = []
  for (const x of a.actions ?? []) {
    if (!x?.id || !['view', 'reopen', 'finalize', 'open_another', 'reply'].includes(x.id)) continue
    const href = typeof x.href === 'string' && x.href.startsWith('/') && !x.href.startsWith('//') ? x.href : undefined
    const request = x.request?.path && x.request.method ? { method: x.request.method, path: x.request.path } : undefined
    actions.push({ id: x.id as SupportClientAction, href, request })
  }
  return {
    event: a.event,
    folio: a.folio,
    subject: a.subject?.trim() || undefined,
    solution: a.solution?.trim() || undefined,
    state: isSupportClientState(a.state) ? a.state : undefined,
    at: a.at,
    actions,
  }
}

export function callEventFromMessage(
  msg: TeamChatMessage | null | undefined,
): ChatAttachment | null {
  if (!msg) return null
  const atts = parseAttachments(msg.attachments)
  const call = atts.find((a) => a.type === 'call')
  return call || null
}

/** Inbox / list preview: body text, or a label for attachment-only messages. */
export function messagePreviewText(msg: TeamChatMessage | null | undefined): string {
  if (!msg) return ''
  const call = callEventFromMessage(msg)
  if (call) {
    const body = stripMarkdownLite((msg.body || '').trim())
    if (body) return body
    if (call.status === 'missed') {
      if (call.kind === 'video') return 'Videollamada perdida'
      if (call.kind === 'screen') return 'Compartir pantalla perdido'
      return 'Llamada perdida'
    }
    return 'Llamada'
  }
  const body = stripMarkdownLite((msg.body || '').trim())
  if (body) return body
  const atts = parseAttachments(msg.attachments)
  if (!atts.length) return ''
  const a = atts[0]
  if (a.type === 'record') {
    const t = a.title?.trim()
    const model = a.model_title?.trim() || a.subtitle?.trim()
    if (t && model && t !== model) return `${t} · ${model}`
    return t || model || 'Registro compartido'
  }
  if (a.type === 'view') {
    const t = a.title?.trim() || a.model_title?.trim() || 'Vista'
    const filters = a.filter_summary?.trim()
    if (filters && filters !== t) return `Vista · ${t} · ${filters}`
    return `Vista · ${t}`
  }
  if (a.type === 'chart') {
    return a.title?.trim() ? `Gráfico · ${a.title.trim()}` : 'Gráfico'
  }
  const mime = (a.mime_type || '').toLowerCase()
  if (isAudioAttachment(a)) return 'Nota de voz'
  if (mime.startsWith('image/')) return 'Imagen'
  if (mime.startsWith('video/')) return 'Video'
  return a.name?.trim() || 'Archivo'
}

export function isAudioAttachment(a: { mime_type?: string; url?: string; name?: string }): boolean {
  const mime = (a.mime_type || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  const path = `${a.url || ''} ${a.name || ''}`.toLowerCase()
  return /\.(webm|ogg|opus|mp3|m4a|wav|aac)(\?|$)/i.test(path)
}
