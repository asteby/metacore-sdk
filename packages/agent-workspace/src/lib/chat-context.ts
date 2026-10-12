/** Persist last Equipo / Aby conversation so share & reopen resume the thread. */

import { storageKey } from '../host'

const TEAM_KEY = () => storageKey('lastTeamChannelId')
const ABY_KEY = () => storageKey('lastAbySession')
const FOCUS_KEY = () => storageKey('lastChatFocus')

export type LastAbySession = { id: string; title?: string }
export type LastChatFocus = { kind: 'aby' } | { kind: 'team'; channelId: string }

export function rememberTeamChannel(channelId: string | null | undefined) {
  if (!channelId || typeof window === 'undefined') return
  try {
    localStorage.setItem(TEAM_KEY(), channelId)
    localStorage.setItem(
      FOCUS_KEY(),
      JSON.stringify({ kind: 'team', channelId } satisfies LastChatFocus),
    )
  } catch {
    /* ignore */
  }
}

export function rememberAbyFocus() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FOCUS_KEY(), JSON.stringify({ kind: 'aby' } satisfies LastChatFocus))
  } catch {
    /* ignore */
  }
}

export function readLastChatFocus(): LastChatFocus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FOCUS_KEY())
    if (!raw) {
      const team = localStorage.getItem(TEAM_KEY())
      return team ? { kind: 'team', channelId: team } : null
    }
    const parsed = JSON.parse(raw) as LastChatFocus
    if (parsed?.kind === 'aby') return parsed
    if (parsed?.kind === 'team' && parsed.channelId) return parsed
    return null
  } catch {
    return null
  }
}

export function readLastTeamChannelId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(TEAM_KEY())
  } catch {
    return null
  }
}

export function rememberAbySession(sessionId: string | null | undefined, title?: string) {
  if (!sessionId || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      ABY_KEY(),
      JSON.stringify({ id: sessionId, title: title || '' } satisfies LastAbySession),
    )
    rememberAbyFocus()
  } catch {
    /* ignore */
  }
}

export function readLastAbySession(): LastAbySession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ABY_KEY())
    if (!raw) return null
    const parsed = JSON.parse(raw) as LastAbySession
    if (!parsed?.id) return null
    return parsed
  } catch {
    return null
  }
}
