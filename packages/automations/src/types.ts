/** Mirrors the kernel package automation (spec automation/v1 and its views). */
export const AUTOMATION_SPEC_VERSION = 'automation/v1' as const

export type AutomationStatus = 'proposed' | 'active' | 'paused' | 'error' | 'completed' | 'archived'
export type AutomationKind = 'automation' | 'tool'
export type TriggerType = 'cron' | 'interval' | 'once' | 'event'
export type StepType = 'tool' | 'filter' | 'condition' | 'template' | 'summarize' | 'deliver'
export type Channel = 'in_app' | 'push' | 'email' | 'whatsapp'
export type ConditionOp = 'eq' | 'ne' | 'contains' | 'not_contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is_empty' | 'is_not_empty'
export type ArgValue = string | number | boolean | null | Array<string | number | boolean>

export interface Condition {
  field: string
  op: ConditionOp
  value?: ArgValue
}

export interface Trigger {
  type: TriggerType
  cron?: string
  timezone?: string
  every?: string
  at?: string
  event?: string
  where?: Condition[]
  cooldown?: string
}

export interface InputParam {
  name: string
  type: 'string' | 'integer' | 'number' | 'boolean'
  description?: string
  required?: boolean
  enum?: string[]
  default?: string | number | boolean
}

export interface Step {
  id: string
  type: StepType
  tool?: string
  args?: Record<string, ArgValue>
  from?: string
  where?: Condition[]
  unseen?: boolean
  limit?: number
  if?: Condition
  template?: string
  mode?: 'template' | 'llm'
  instructions?: string
  max_tokens?: number
  channels?: Channel[]
  title?: string
  body?: string
  link?: string
  items_from?: string
}

export interface AutomationSpec {
  schema_version: typeof AUTOMATION_SPEC_VERSION
  name: string
  description?: string
  trigger?: Trigger
  inputs?: InputParam[]
  steps: Step[]
  limits?: { max_tokens_per_run?: number; max_cost_usd_per_run?: number; max_runs_per_day?: number }
}

export interface Automation {
  id: string
  organization_id: string
  kind: AutomationKind
  tool_name?: string
  name: string
  description: string
  status: AutomationStatus
  status_reason?: string
  spec: AutomationSpec
  spec_version: string
  trigger_type: string
  event_name?: string
  next_run_at?: string
  last_run_at?: string
  last_status?: string
  consecutive_failures: number
  created_by: string
  assisted_by?: string
  origin: 'chat' | 'ui' | 'api'
  authorized_by?: string
  authorized_at?: string
  runs_count: number
  tokens_total: number
  cost_usd_total: number
  version: number
  created_at: string
  updated_at: string
  trigger_label: string
  /** "Ana Pérez con el asistente" | "Ana Pérez" */
  authorship: string
  creator_name?: string
  authorized_by_name?: string
  uses_llm: boolean
  channels?: Channel[]
  tools?: string[]
}

export interface DeliveryItem {
  key: string
  title: string
  url?: string
  date?: string
  text?: string
}

export interface RunOutput {
  title?: string
  text?: string
  items?: DeliveryItem[]
  channels?: Channel[]
  delivered_steps?: string[]
  notes?: string[]
}

export interface StepTrace {
  id: string
  type: string
  status: string
  duration_ms: number
  count?: number
  error?: string
}

export interface AutomationRun {
  id: string
  automation_id: string
  slot_key: string
  trigger: string
  status: 'running' | 'completed' | 'skipped' | 'failed'
  dry_run: boolean
  attempt: number
  started_at: string
  finished_at?: string
  duration_ms: number
  error?: string
  llm_used: boolean
  cache_hit: boolean
  input_tokens: number
  output_tokens: number
  cost_usd: number
  deliveries: number
  steps?: StepTrace[]
  output?: RunOutput
}

export interface CatalogParam {
  type?: 'string' | 'integer' | 'number' | 'boolean'
  description?: string
  required?: boolean
  enum?: string[]
}

export interface CatalogTool {
  name: string
  title: string
  description: string
  parameters: Record<string, CatalogParam>
  items_path?: string
}

export interface AutomationCatalog {
  tools: CatalogTool[]
  /** The automation/v1 JSON Schema the editor form is generated from. */
  schema: JSONSchema
  channels: Channel[]
  timezone: string
  min_interval: string
  max_per_user: number
  llm_available: boolean
}

/** Subset of JSON Schema the editor reads. */
export interface JSONSchema {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  $defs?: Record<string, JSONSchema>
  $ref?: string
  maxLength?: number
  minimum?: number
  maximum?: number
  description?: string
  allOf?: Array<{ if?: JSONSchema; then?: JSONSchema }>
}

export interface RunNowResult {
  run: AutomationRun
  output?: RunOutput
  error?: string
}

/** Minimal HTTP client (axios-compatible): responses carry `{ data }`. */
export interface AutomationsHttpClient {
  get(url: string): Promise<{ data?: unknown }>
  post(url: string, body?: unknown): Promise<{ data?: unknown }>
  patch(url: string, body?: unknown): Promise<{ data?: unknown }>
  delete(url: string): Promise<{ data?: unknown }>
}

export type TranslateFn = (key: string, fallback: string) => string
