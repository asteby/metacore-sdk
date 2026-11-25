import type { TeamChatCapabilities, TeamChatChannel } from './types'

/** Everything supported: the behaviour of a channel that declares no capabilities. */
export const DEFAULT_CHANNEL_CAPABILITIES: Readonly<TeamChatCapabilities> = Object.freeze({
  calls: true,
  reactions: true,
  replies: true,
  attachments: true,
})

/**
 * Merges the server-declared capabilities over the defaults. Only an explicit boolean
 * `false` disables a feature: a missing channel/field, `null`, unknown keys or non-boolean
 * values leave the default (`true`), so old servers and clients keep working unchanged.
 */
export function resolveChannelCapabilities(
  channel?: Pick<TeamChatChannel, 'capabilities'> | null,
): TeamChatCapabilities {
  const declared = channel?.capabilities
  const out: TeamChatCapabilities = { ...DEFAULT_CHANNEL_CAPABILITIES }
  if (!declared || typeof declared !== 'object') return out
  for (const key of Object.keys(out) as Array<keyof TeamChatCapabilities>) {
    if (declared[key] === false) out[key] = false
  }
  return out
}
