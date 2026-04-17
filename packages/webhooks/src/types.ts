/**
 * Common webhook types shared across scopes (device / organization).
 *
 * The types are intentionally permissive — backend payloads may carry
 * additional fields that callers are free to keep on the objects without
 * losing typing.
 */

/** Status lifecycle reported by the API. */
export type WebhookStatus = 'active' | 'paused' | 'failed' | (string & {})

/** Device reference optionally attached to device-scoped webhooks. */
export interface WebhookDeviceRef {
  id: string
  name: string
  type: string
}

/** A webhook registration row. */
export interface Webhook {
  id: string
  name: string
  url: string
  /** Masked signing secret (first / last chars). Null for just-created rows. */
  secret_masked?: string
  /** Only present on device-scoped webhooks. */
  device_id?: string
  device?: WebhookDeviceRef
  status: WebhookStatus
  /** Comma-separated list of event types. */
  events: string
  max_retries: number
  timeout_secs: number
  success_count: number
  failure_count: number
  consecutive_failures: number
  last_delivered_at: string | null
  last_failed_at: string | null
  last_http_status: number
  last_error: string
  auto_disable_threshold: number
  created_at: string
}

/** A single delivery attempt recorded in the backend logs. */
export interface WebhookLog {
  id: string
  event_type: string
  event_id: string
  request_url: string
  request_body: string
  response_status: number
  response_body: string
  response_time_msec: number
  status: string
  attempt_num: number
  error: string
  created_at: string
}

/** Stats bar payload. */
export interface WebhookStats {
  total_webhooks: number
  active_webhooks: number
  paused_webhooks: number
  failed_webhooks: number
  total_deliveries: number
  total_failures: number
}

/** Item used to render the event picker in the create dialog. */
export interface WebhookEventOption {
  value: string
  /** Optional i18n key; if omitted `label` is used. */
  labelKey?: string
  /** Fallback label when i18n is not available or the key is missing. */
  label: string
  /** Short emoji / glyph displayed next to the option. */
  icon?: string
}

/** Payload accepted by the create mutation. */
export interface CreateWebhookPayload {
  name: string
  url: string
  events: string
  max_retries: number
  timeout_secs: number
  auto_disable_threshold: number
  /** Only set when `scope === 'device'`. */
  device_id?: string
}

/** Shape of the `{ data: { secret } }` envelope returned on create. */
export interface CreateWebhookResponse {
  success: boolean
  data: {
    secret: string
    [key: string]: unknown
  }
}

/**
 * Minimal axios-compatible client surface used by the hooks. Consumers pass
 * their own axios instance (from `@asteby/metacore-auth` or anywhere else).
 */
export interface WebhooksApiClient {
  get: <T = unknown>(url: string, config?: unknown) => Promise<{ data: T }>
  post: <T = unknown>(url: string, body?: unknown, config?: unknown) => Promise<{ data: T }>
  put: <T = unknown>(url: string, body?: unknown, config?: unknown) => Promise<{ data: T }>
  delete: <T = unknown>(url: string, config?: unknown) => Promise<{ data: T }>
}

/** Configuration shared by the hook + the top-level manager component. */
export interface WebhooksConfig {
  apiClient: WebhooksApiClient
  /** `"device"` scopes requests with `device_id`; `"organization"` is org-wide. */
  scope: 'device' | 'organization'
  /** Required when `scope === 'device'`. */
  deviceId?: string
  /**
   * Base path on the backend (no trailing slash). Defaults to `"/webhooks"`
   * for device scope and `"/org-webhooks"` for organization scope.
   */
  apiBasePath?: string
  /** Devices available in the create dialog (device scope only). */
  devices?: WebhookDeviceRef[]
  /** Event presets for the create dialog. */
  eventPresets?: WebhookEventOption[]
  /** Show the "Test" button on each row. Default: true. */
  enableTest?: boolean
  /**
   * Show the "Replay" button on logs (device scope feature). When true the
   * log row renders a replay action that POSTs to `{base}/{id}/logs/{logId}/replay`.
   */
  enableReplay?: boolean
  /** Disable automatic query polling. Default: false. */
  disablePolling?: boolean
}
