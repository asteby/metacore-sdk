/**
 * Channel-agnostic data model. Email, WhatsApp, team chat... all map their
 * payloads onto these shapes in an adapter; no component knows the channel.
 */

export type InboxTime = string | number | Date

export interface InboxParticipant {
  id?: string
  name?: string
  /** Channel address: email, phone, handle. Shown when there is no name. */
  address?: string
  avatarUrl?: string
}

export interface InboxAttachment {
  id: string
  name: string
  size?: number
  mimeType?: string
  /** Direct (already authorised/signed) URL. */
  url?: string
}

export interface InboxTag {
  id: string
  label: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export interface ConversationSummary {
  id: string
  /** Subject / title. Falls back to the localized "no subject". */
  title?: string
  /** Who the conversation is with, already formatted. */
  participants: string
  preview?: string
  lastAt: InboxTime
  unread?: boolean | number
  starred?: boolean
  hasAttachments?: boolean
  avatarUrl?: string
  tags?: InboxTag[]
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed'

export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  sender: InboxParticipant
  sentAt: InboxTime
  /** Plain-text body. Used when there is no `html`. */
  text?: string
  /** Untrusted HTML body, rendered only inside HtmlSandboxFrame. */
  html?: string
  attachments?: InboxAttachment[]
  status?: MessageStatus
  /** Resolves `cid:` references of the HTML body to loadable URLs. */
  inlineResources?: Record<string, string>
}

export interface InboxIdentity {
  id: string
  label: string
  /** Secondary text, e.g. the address. */
  description?: string
}

export type InboxLocale = 'es' | 'en'
