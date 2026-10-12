import type { TranslateFn } from './types'

/** English defaults. Every key can be overridden through the host `t`. */
export const ORG_AI_MESSAGES_EN: Record<string, string> = {
  'org_ai.title': 'AI',
  'org_ai.description': 'Choose the provider, model and key this organization uses for AI features.',
  'org_ai.intro': 'The API key belongs to this organization. It is stored server-side and never shown again.',
  'org_ai.loading': 'Loading AI settings...',
  'org_ai.load_error': 'Could not load AI settings.',
  'org_ai.retry': 'Retry',
  'org_ai.empty': 'No AI providers are available.',
  'org_ai.providers_label': 'AI provider',
  'org_ai.save': 'Save',
  'org_ai.saving': 'Saving...',
  'org_ai.saved': 'AI settings saved',
  'org_ai.save_error': 'Could not save AI settings',
  'org_ai.fields.base_url': 'Base URL',
  'org_ai.fields.model': 'Model',
  'org_ai.fields.api_key': 'API key',
  'org_ai.fields.api_key_kept': 'A key is saved - leave blank to keep it',
  'org_ai.seat.ready': 'Connected',
  'org_ai.seat.not_ready': 'Not connected',
  'org_ai.user_source.title': 'Use my local AI',
  'org_ai.user_source.hint': 'This account only. When a local seat is connected, requests skip the organization provider.',
  'org_ai.providers.anthropic.title': 'Anthropic',
  'org_ai.providers.anthropic.subtitle': 'Claude models with your API key.',
  'org_ai.providers.openai.title': 'OpenAI',
  'org_ai.providers.openai.subtitle': 'GPT models with your API key.',
  'org_ai.providers.deepseek.title': 'DeepSeek',
  'org_ai.providers.deepseek.subtitle': 'DeepSeek models with your API key.',
  'org_ai.providers.custom.title': 'OpenAI-compatible',
  'org_ai.providers.custom.subtitle': 'Any compatible endpoint and key.',
  'org_ai.providers.claude_code.title': 'Claude',
  'org_ai.claude_connect.title': 'Connect Claude',
  'org_ai.claude_connect.connect_cta': 'Connect',
  'org_ai.claude_connect.reconnect': 'Reconnect',
  'org_ai.claude_connect.loading': 'Preparing connection...',
  'org_ai.claude_connect.install_notice': 'The Claude runtime is not installed on the server. Install it to continue.',
  'org_ai.claude_connect.install': 'Install',
  'org_ai.claude_connect.installing': 'Installing...',
  'org_ai.claude_connect.open_link': 'Open sign-in page',
  'org_ai.claude_connect.code_label': 'Authorization code',
  'org_ai.claude_connect.code_placeholder': 'Paste the code here',
  'org_ai.claude_connect.paste': 'Paste from clipboard',
  'org_ai.claude_connect.expires_in': 'Expires in {{time}}',
  'org_ai.claude_connect.token_toggle': 'Use a token instead',
  'org_ai.claude_connect.token_hint': 'Generate one with `claude setup-token` on your own machine and paste it here.',
  'org_ai.claude_connect.token_label': 'Access token',
  'org_ai.claude_connect.token_save': 'Save token',
  'org_ai.claude_connect.connect': 'Connect',
  'org_ai.claude_connect.cancel': 'Cancel',
  'org_ai.claude_connect.retry': 'Try again',
  'org_ai.claude_connect.done': 'Done',
  'org_ai.claude_connect.success': 'Claude connected',
  'org_ai.claude_connect.errors.generic': 'Something went wrong. Try again.',
  'org_ai.claude_connect.errors.binary_missing': 'The Claude runtime is not installed on the server.',
  'org_ai.claude_connect.errors.invalid_code': 'That code is not valid. Check it and try again.',
  'org_ai.claude_connect.errors.timeout': 'The attempt timed out. A new link was generated.',
  'org_ai.claude_connect.errors.expired': 'The link expired. A new link was generated.',
  'org_ai.claude_connect.errors.busy': 'Another connection is in progress. Try again shortly.',
  'org_ai.claude_connect.errors.invalid_token': 'That token is not valid.',
}

/** Spanish translations for hosts that do not ship their own. */
export const ORG_AI_MESSAGES_ES: Record<string, string> = {
  'org_ai.title': 'IA',
  'org_ai.description': 'Elige el proveedor, modelo y llave que usa esta organización para la IA.',
  'org_ai.intro': 'La llave es de esta organización. Se guarda en el servidor y no se vuelve a mostrar.',
  'org_ai.loading': 'Cargando configuración de IA...',
  'org_ai.load_error': 'No se pudo cargar la configuración de IA.',
  'org_ai.retry': 'Reintentar',
  'org_ai.empty': 'No hay proveedores de IA disponibles.',
  'org_ai.providers_label': 'Proveedor de IA',
  'org_ai.save': 'Guardar',
  'org_ai.saving': 'Guardando...',
  'org_ai.saved': 'Configuración de IA guardada',
  'org_ai.save_error': 'No se pudo guardar la configuración de IA',
  'org_ai.fields.base_url': 'URL base',
  'org_ai.fields.model': 'Modelo',
  'org_ai.fields.api_key': 'Llave de API',
  'org_ai.fields.api_key_kept': 'Hay una llave guardada - deja vacio para conservarla',
  'org_ai.seat.ready': 'Conectado',
  'org_ai.seat.not_ready': 'Sin conectar',
  'org_ai.user_source.title': 'Usar mi IA local',
  'org_ai.user_source.hint': 'Solo esta cuenta. Con un seat local conectado, las solicitudes no pasan por el proveedor de la organización.',
  'org_ai.claude_connect.title': 'Conectar Claude',
  'org_ai.claude_connect.connect_cta': 'Conectar',
  'org_ai.claude_connect.reconnect': 'Reconectar',
  'org_ai.claude_connect.cancel': 'Cancelar',
  'org_ai.claude_connect.connect': 'Conectar',
  'org_ai.claude_connect.done': 'Listo',
  'org_ai.claude_connect.retry': 'Intentar de nuevo',
  'org_ai.claude_connect.success': 'Claude conectado',
  'org_ai.claude_connect.expires_in': 'Expira en {{time}}',
}

type Vars = Record<string, string | number>

function interpolate(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/**
 * Wraps an optional host `t` (i18next-compatible). Falls back to the built-in
 * English message when `t` is absent or returns the key untouched.
 */
export function makeTr(t?: TranslateFn, messages: Record<string, string> = ORG_AI_MESSAGES_EN) {
  return (key: string, vars?: Vars, fallback?: string): string => {
    const def = interpolate(messages[key] ?? fallback ?? key, vars)
    if (!t) return def
    const out = t(key, { ...vars, defaultValue: def })
    return !out || out === key ? def : out
  }
}
export type Tr = ReturnType<typeof makeTr>
