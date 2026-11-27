import { CheckCircle2, CircleDashed, CircleDot, Hourglass, Lock, RotateCcw, type LucideIcon } from 'lucide-react'
import type { SupportCaseStatus, SupportLifecycle } from '@asteby/metacore-sdk/support'

/**
 * The ONE vocabulary of ticket states the customer sees. The team chat, the support embed and the
 * `soporte` addon ticket view all read their label, one-line explanation, colour and allowed
 * actions from here; the texts live in `supportThread.state.*` (es/en) of `@asteby/metacore-i18n`.
 */
export const SUPPORT_CLIENT_STATES = ['new', 'in_progress', 'waiting', 'resolved', 'reopened', 'closed'] as const
export type SupportClientState = (typeof SUPPORT_CLIENT_STATES)[number]

/** Lists group tickets by these keys (in this order). */
export const SUPPORT_TICKET_GROUPS = ['waiting', 'open', 'resolved', 'closed'] as const
export type SupportTicketGroup = (typeof SUPPORT_TICKET_GROUPS)[number]

/** What the customer can do. `reply` writes in the thread; the rest are buttons. */
export type SupportClientAction = 'reply' | 'reopen' | 'finalize' | 'open_another' | 'view'

export type SupportStateTone = 'info' | 'warning' | 'success' | 'muted'

export interface SupportStateMeta {
  /** Soft badge variant of `@asteby/metacore-ui` (never colour alone: the badge also has icon + text). */
  tone: SupportStateTone
  icon: LucideIcon
  group: SupportTicketGroup
  /** Whether the thread accepts new messages from the customer. */
  writable: boolean
  /** Actions the customer may take in this state (the server still has the last word). */
  actions: readonly SupportClientAction[]
}

export const SUPPORT_STATE_META: Record<SupportClientState, SupportStateMeta> = {
  new: { tone: 'info', icon: CircleDashed, group: 'open', writable: true, actions: ['reply', 'finalize'] },
  in_progress: { tone: 'info', icon: CircleDot, group: 'open', writable: true, actions: ['reply', 'finalize'] },
  waiting: { tone: 'warning', icon: Hourglass, group: 'waiting', writable: true, actions: ['reply', 'finalize'] },
  resolved: { tone: 'success', icon: CheckCircle2, group: 'resolved', writable: false, actions: ['reopen', 'finalize', 'open_another'] },
  reopened: { tone: 'info', icon: RotateCcw, group: 'open', writable: true, actions: ['reply', 'finalize'] },
  closed: { tone: 'muted', icon: Lock, group: 'closed', writable: false, actions: ['open_another'] },
}

export const isSupportClientState = (s: unknown): s is SupportClientState =>
  typeof s === 'string' && (SUPPORT_CLIENT_STATES as readonly string[]).includes(s)

export interface ClientStateInput {
  /** Case status (open | resolved | closed). */
  status: SupportCaseStatus
  /** Server-computed state (OPS `lifecycle.state`); wins when valid. */
  state?: string
  lifecycle?: SupportLifecycle
  /** Author of the last real message, when known (Hub widget has no lifecycle). */
  lastAuthor?: 'reporter' | 'agent' | 'ai' | 'system' | string
  /** The desk or the assistant already answered at least once. */
  replied?: boolean
  /** The case was reopened (a reopened case stays `reopened` until the desk answers). */
  reopened?: boolean
}

/**
 * State the customer sees. Prefers the server's `lifecycle.state`; otherwise it is derived from the
 * case status and who wrote last, so a Hub widget (no lifecycle) reads the same as OPS.
 */
export function clientStateOf(c: ClientStateInput): SupportClientState {
  const declared = c.state ?? c.lifecycle?.state
  if (isSupportClientState(declared)) return declared
  if (c.status === 'closed') return 'closed'
  if (c.status === 'resolved') return 'resolved'
  const answered = c.lastAuthor === 'agent' || c.lastAuthor === 'ai'
  if (answered) return 'waiting'
  if (c.reopened || c.lifecycle?.phase === 'reopened') return 'reopened'
  return c.replied ? 'in_progress' : 'new'
}

export const groupOfState = (s: SupportClientState): SupportTicketGroup => SUPPORT_STATE_META[s].group

/** Lifecycle event the thread shows as a system card. */
export const SUPPORT_EVENTS = ['opened', 'resolved', 'reopened', 'closed'] as const
export type SupportEvent = (typeof SUPPORT_EVENTS)[number]
export const isSupportEvent = (e: unknown): e is SupportEvent => typeof e === 'string' && (SUPPORT_EVENTS as readonly string[]).includes(e)

/** State each event leaves the ticket in (drives the colour and icon of its card). */
export const EVENT_STATE: Record<SupportEvent, SupportClientState> = {
  opened: 'new',
  resolved: 'resolved',
  reopened: 'reopened',
  closed: 'closed',
}
