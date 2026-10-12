/** Minimal HTTP surface. An axios instance satisfies it. */
export interface OrgAIHttpClient {
  get(url: string): Promise<{ data?: unknown }>
  post(url: string, body?: unknown): Promise<{ data?: unknown }>
  put(url: string, body?: unknown): Promise<{ data?: unknown }>
  delete(url: string): Promise<{ data?: unknown }>
}

export type LocalAgentSeat = { ready: boolean; account?: string }

/** Per-organization AI configuration. Secrets are never returned, only `has_api_key`. */
export type OrgAIConfig = {
  /** Provider preset id (`anthropic`, `openai`, ...). */
  mode: string
  proxy_base_url: string
  proxy_model: string
  has_api_key: boolean
  /** Endpoint the backend resolved when none is stored. */
  effective_proxy_url?: string
  /** Optional: per-user choice between the org's AI and a local seat. */
  user_ai_source?: 'inherit' | 'local'
  /** Optional local agent seats keyed by seat id (e.g. `claude_code`). */
  seats?: Record<string, LocalAgentSeat>
}

export type OrgAIUpdate = {
  mode: string
  base_url?: string
  model?: string
  api_key?: string
}

/** Injected data layer; build with `createOrgAIApi` or supply your own. */
export interface OrgAIApi {
  getConfig(): Promise<OrgAIConfig>
  updateConfig(body: OrgAIUpdate): Promise<OrgAIConfig>
  /** Optional - enables the "use my local AI" toggle. */
  updateUserSource?(source: 'inherit' | 'local'): Promise<'inherit' | 'local'>
}

export type ClaudeConnectSession = { session_id: string; url: string; expires_at: string }
export type ClaudeBinaryStatus = { installed: boolean; version?: string; runner?: 'proxy' | 'direct' }

export interface ClaudeConnectApi {
  getBinary(): Promise<ClaudeBinaryStatus>
  install(): Promise<ClaudeBinaryStatus>
  start(): Promise<ClaudeConnectSession>
  submitCode(sessionId: string, code: string): Promise<boolean>
  submitToken(token: string): Promise<boolean>
  cancel(sessionId: string): Promise<void>
}

/** i18next-compatible translate function; optional everywhere. */
export type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export interface Notifier {
  success(message: string): void
  error(message: string): void
}
