/** Bridges so any module can open Equipo / Aby (widget or inbox). */

import type { ChatAttachment } from '../team-chat/data/types'
import {
  readLastAbySession,
  readLastTeamChannelId,
  rememberAbySession,
  rememberTeamChannel,
} from './chat-context'

/** Virtual channel id for Aby inside the team-chat inbox (not a backend channel). */
export const ABY_CHANNEL_ID = '__aby__'

export type AbyOpenDraft = {
  /** Prefill composer text — user can edit before send. */
  message?: string
  /** Record/view embeds or file attachments to stage (not sent until user sends). */
  attachments?: ChatAttachment[]
  /** Optional: open an existing Aby session instead of forcing a new one. */
  sessionId?: string
  sessionTitle?: string
  /**
   * Envía `message` en una conversación nueva en cuanto se abre el panel, en vez
   * de dejarlo en el compositor. Para preguntas hechas fuera del chat (buscador,
   * tablero, voz). Se ignora si viene `sessionId`.
   */
  send?: boolean
}

export type TeamOpenOpts = {
  channelId?: string
  /** Prefill composer — staged, not sent. */
  message?: string
  /** Embeds/files staged in composer until user sends. */
  attachments?: ChatAttachment[]
}

type AbyHandler = (draft?: AbyOpenDraft) => void
type TeamHandler = (opts?: TeamOpenOpts) => void

let abyHandler: AbyHandler | null = null
/** When /team-chat is mounted, Aby opens as an inbox channel instead of the float. */
let abyInboxHandler: AbyHandler | null = null
let teamHandler: TeamHandler | null = null
/** When /team-chat is mounted, focus a channel there instead of the float. */
let teamInboxHandler: TeamHandler | null = null
let pendingDraft: AbyOpenDraft | null = null
let pendingTeamDraft: TeamOpenOpts | null = null

export function registerAbyWidgetOpener(fn: AbyHandler): () => void {
  abyHandler = fn
  return () => {
    if (abyHandler === fn) abyHandler = null
  }
}

/** Prefer selecting Aby in the full inbox when that page is active. */
export function registerAbyInboxOpener(fn: AbyHandler): () => void {
  abyInboxHandler = fn
  return () => {
    if (abyInboxHandler === fn) abyInboxHandler = null
  }
}

function withRememberedAby(draft?: AbyOpenDraft): AbyOpenDraft | undefined {
  if (!draft) return draft
  if (draft.sessionId) {
    rememberAbySession(draft.sessionId, draft.sessionTitle)
    return draft
  }
  // Resume last Aby thread when sharing embeds (avoid dumping to conversation picker).
  if (draft.attachments?.length || draft.message) {
    const last = readLastAbySession()
    if (last?.id) {
      return {
        ...draft,
        sessionId: last.id,
        sessionTitle: draft.sessionTitle || last.title,
      }
    }
  }
  return draft
}

/** Open Aby as a team-chat channel (inbox or floating list) — never a separate "Aby tab". */
export function openAbyWidget(draft?: AbyOpenDraft): void {
  const resolved = withRememberedAby(draft)
  if (
    resolved &&
    (resolved.message ||
      resolved.sessionId ||
      (resolved.attachments && resolved.attachments.length))
  ) {
    pendingDraft = resolved
  }
  if (abyInboxHandler) {
    abyInboxHandler(resolved)
    return
  }
  if (abyHandler) {
    abyHandler(resolved)
    return
  }
  if (typeof window !== 'undefined') {
    window.location.assign('/app/team-chat')
  }
}

/** Pull staged Aby draft once (composer consumes it). */
export function consumeAbyDraft(): AbyOpenDraft | null {
  const d = pendingDraft
  pendingDraft = null
  return d
}

export function registerTeamChatWidgetOpener(fn: TeamHandler): () => void {
  teamHandler = fn
  return () => {
    if (teamHandler === fn) teamHandler = null
  }
}

export function registerTeamChatInboxOpener(fn: TeamHandler): () => void {
  teamInboxHandler = fn
  return () => {
    if (teamInboxHandler === fn) teamInboxHandler = null
  }
}

type MinimizeHandler = () => void
let minimizeHandler: MinimizeHandler | null = null

/** Soft-minimize the floating chat (keep live/mic alive under Document PiP / in-page orb). */
export function registerChatWidgetMinimizer(fn: MinimizeHandler): () => void {
  minimizeHandler = fn
  return () => {
    if (minimizeHandler === fn) minimizeHandler = null
  }
}

/** Call when navigating away from an Aby embed so the user can see the page. */
export function requestChatWidgetMinimize(): void {
  minimizeHandler?.()
}


function withRememberedTeam(opts?: TeamOpenOpts): TeamOpenOpts | undefined {
  if (!opts) return opts
  if (opts.channelId) {
    rememberTeamChannel(opts.channelId)
    return opts
  }
  if (opts.attachments?.length || opts.message) {
    const last = readLastTeamChannelId()
    if (last) return { ...opts, channelId: last }
  }
  return opts
}

/** Open Equipo (widget or inbox). Draft is staged — never auto-sent. */
export function openTeamChatWidget(opts?: TeamOpenOpts): void {
  const resolved = withRememberedTeam(opts)
  if (
    resolved &&
    (resolved.message ||
      (resolved.attachments && resolved.attachments.length) ||
      resolved.channelId)
  ) {
    pendingTeamDraft = { ...resolved }
  }
  if (teamInboxHandler) {
    teamInboxHandler(resolved)
    return
  }
  if (teamHandler) {
    teamHandler(resolved)
    return
  }
  if (typeof window !== 'undefined') {
    window.location.assign('/app/team-chat')
  }
}

/** Pull staged team-chat draft once. */
export function consumeTeamDraft(): TeamOpenOpts | null {
  const d = pendingTeamDraft
  pendingTeamDraft = null
  return d
}

export { rememberAbySession, rememberTeamChannel, readLastAbySession, readLastTeamChannelId }
