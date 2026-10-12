import type { ReactNode } from 'react'
import type { ChatAttachment, ChatClient } from './types'

/** Id of the built-in bot channel the inbox injects first. */
export const BOT_CHANNEL_ID = '__bot__'

/**
 * `bot`: the host's copilot (uses the provider `ChatClient`).
 * `agent`: an AI agent; give it its own `client` to get the full AI chat
 * (proposals, history), or let the adapter serve its messages.
 * `team`: people (DMs, groups) served by the adapter.
 */
export type ChannelKind = 'bot' | 'agent' | 'team'

export interface ChatChannel {
  id: string
  kind: ChannelKind
  name: string
  description?: string
  avatarUrl?: string
  /** Custom avatar; wins over `avatarUrl` and the mascot. */
  avatar?: ReactNode
  unread?: number
  lastMessage?: string
  /** ISO timestamp of the last message (list ordering + relative time). */
  lastAt?: string
  online?: boolean
  /** AI-backed channel: renders the full AI chat over this transport. */
  client?: ChatClient
}

export interface ChannelMessage {
  id: string
  channelId: string
  body: string
  /** Sent by the current user (right-aligned). */
  mine: boolean
  senderName?: string
  createdAt?: string
  attachments?: ChatAttachment[]
}

export type ChannelEvent =
  | { type: 'message'; message: ChannelMessage }
  | { type: 'unread'; channelId: string; unread: number }
  | { type: 'presence'; channelId: string; online: boolean }
  /** The channel list changed on the server; refetch it. */
  | { type: 'channels' }

/**
 * Transport for the channel inbox. The host injects it (the package knows no
 * endpoint, socket or store), so any backend — internal chat, agent runs,
 * WhatsApp — plugs into the same widget.
 */
export interface ChannelAdapter {
  listChannels(): Promise<ChatChannel[]>
  loadMessages(channelId: string): Promise<ChannelMessage[]>
  /** Resolve with the stored message when available; it is deduped by id against `subscribe` echoes. */
  send(channelId: string, body: string, attachments?: ChatAttachment[]): Promise<ChannelMessage | void>
  markRead?(channelId: string): Promise<void>
  /** Live events; returns the unsubscribe. */
  subscribe?(handler: (event: ChannelEvent) => void): () => void
}

/** Pure list-state step for live events; exported for tests. */
export function applyChannelEvent(
  channels: readonly ChatChannel[],
  event: ChannelEvent,
  activeId: string | null,
): ChatChannel[] {
  switch (event.type) {
    case 'message': {
      const m = event.message
      const next = channels.map((c) => {
        if (c.id !== m.channelId) return c
        const bump = !m.mine && m.channelId !== activeId ? 1 : 0
        return { ...c, lastMessage: m.body, lastAt: m.createdAt ?? c.lastAt, unread: (c.unread ?? 0) + bump }
      })
      return sortChannels(next)
    }
    case 'unread':
      return channels.map((c) => (c.id === event.channelId ? { ...c, unread: event.unread } : c))
    case 'presence':
      return channels.map((c) => (c.id === event.channelId ? { ...c, online: event.online } : c))
    default:
      return [...channels]
  }
}

/** Most recent first; channels without activity keep their relative order. */
export function sortChannels(channels: readonly ChatChannel[]): ChatChannel[] {
  return channels
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ta = a.c.lastAt ? Date.parse(a.c.lastAt) : NaN
      const tb = b.c.lastAt ? Date.parse(b.c.lastAt) : NaN
      if (Number.isNaN(ta) && Number.isNaN(tb)) return a.i - b.i
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return tb - ta || a.i - b.i
    })
    .map((x) => x.c)
}

/** "hace 5 min" style label; empty for missing/invalid input. */
export function formatRelativeTime(iso: string | undefined, locale = 'es', now = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Math.round((t - now) / 1000)
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}
