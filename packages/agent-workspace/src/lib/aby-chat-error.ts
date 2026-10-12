/**
 * A failed Aby turn as the server classified it (POST /chat/send → `error`).
 * The chat shows the specific cause and the actions that recover from it;
 * the user's message is already saved, so "retry" resumes the same thread.
 */
export type AbyTurnErrorAction = 'retry' | 'reconnect' | 'switch_provider' | 'new_thread'

export type AbyTurnError = {
  code: string
  message: string
  provider?: string
  provider_label?: string
  tool?: string
  reset_at?: string
  reset_hint?: string
  detail?: string
  actions: AbyTurnErrorAction[]
}

const KNOWN_ACTIONS: AbyTurnErrorAction[] = ['retry', 'reconnect', 'switch_provider', 'new_thread']

/** The classified error in an axios failure, or null when the server sent none. */
export function abyTurnErrorOf(err: unknown): AbyTurnError | null {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response
    ?.data
  const e = data?.error as Partial<AbyTurnError> | undefined
  if (!e || typeof e !== 'object' || typeof e.code !== 'string') return null
  const message =
    (typeof e.message === 'string' && e.message) ||
    (typeof data?.message === 'string' && data.message) ||
    ''
  if (!message) return null
  const actions = (Array.isArray(e.actions) ? e.actions : []).filter(
    (a): a is AbyTurnErrorAction => KNOWN_ACTIONS.includes(a as AbyTurnErrorAction),
  )
  return {
    ...e,
    code: e.code,
    message: withResetTime(message, e.reset_at),
    actions: actions.length ? actions : ['retry'],
  } as AbyTurnError
}

/** The server sends the reset as an instant; the time is shown in the viewer's zone. */
function withResetTime(message: string, resetAt?: string): string {
  if (!resetAt) return message
  const at = new Date(resetAt)
  if (Number.isNaN(at.getTime())) return message
  const sameDay = at.toDateString() === new Date().toDateString()
  const when = at.toLocaleString(undefined, sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${message} Se restablece: ${when}.`
}

/** Button label for an action; the provider is named where it helps. */
export function abyErrorActionLabel(action: AbyTurnErrorAction, err?: AbyTurnError): string {
  switch (action) {
    case 'reconnect':
      return isClaudeProvider(err?.provider)
        ? 'Reconectar Claude'
        : err?.provider_label && err.provider !== 'hub'
          ? `Reconectar ${capitalize(err.provider_label)}`
          : 'Revisar conexión'
    case 'switch_provider':
      return 'Cambiar de proveedor'
    case 'new_thread':
      return 'Nueva conversación'
    default:
      return 'Reintentar'
  }
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Claude Code seat (current or legacy proxy id): reconnect opens the device-code dialog. */
export function isClaudeProvider(provider?: string): boolean {
  return provider === 'claude_code' || provider === 'claude_code_proxy'
}
