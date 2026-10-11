// Starter prompts for the copilot chat's empty state. They come from the
// tenant branding (`PlatformBranding.agent_suggestions`) so a new vertical
// gets its own prompts without a code change; an install that has none
// configured gets a short, neutral set instead of an empty state.
import { usePlatformConfig, type PlatformBranding } from './platform-config-provider'

export const DEFAULT_AGENT_SUGGESTIONS: readonly string[] = [
  '¿Qué puedes hacer aquí?',
  'Muéstrame un resumen de hoy',
  'Busca un registro',
  'Crea un nuevo registro',
]

/**
 * Picks the branding's suggestions, ignoring blanks and non-strings; falls
 * back to `fallback` when nothing usable is configured.
 */
export function resolveAgentSuggestions(
  branding: Pick<PlatformBranding, 'agent_suggestions'> | undefined,
  fallback: readonly string[] = DEFAULT_AGENT_SUGGESTIONS,
): string[] {
  const list = branding?.agent_suggestions
  const cleaned = Array.isArray(list)
    ? list
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  return cleaned.length > 0 ? cleaned : [...fallback]
}

/** Suggestions for the current tenant (see `resolveAgentSuggestions`). */
export function useAgentSuggestions(
  fallback: readonly string[] = DEFAULT_AGENT_SUGGESTIONS,
): string[] {
  return resolveAgentSuggestions(usePlatformConfig(), fallback)
}
