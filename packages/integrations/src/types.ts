/**
 * Abstract API of the integrations panel (RFC 0003 §4). The panel never talks
 * HTTP: the host (Ops) implements `IntegrationsApi` and passes it in. Every
 * method is async and may reject; the panel shows the error and keeps state.
 */

export type Sensitivity = 'public' | 'internal' | 'personal'

/** JSON Schema subset the catalog ships (bounded by the kernel validator). */
export interface JSONSchemaLite {
  type?: string | string[]
  title?: string
  description?: string
  properties?: Record<string, JSONSchemaLite>
  items?: JSONSchemaLite
  required?: string[]
  enum?: unknown[]
  format?: string
  example?: unknown
  examples?: unknown[]
  default?: unknown
  [k: string]: unknown
}

/** One row of the kernel catalog (`v3.Catalog`), grouped by addon in the UI. */
export interface CatalogEvent {
  addon: string
  addon_name?: string
  /** `<domain>.<entity>.<action>` */
  name: string
  /** i18n key (or already resolved text if the host resolves it). */
  description?: string
  aggregate?: string
  payload_schema?: JSONSchemaLite
  sensitivity: Sensitivity
  since?: string
}

/** One destination-body field: `target` is a dotted path in the sent body. */
export interface MappingRow {
  target: string
  /** `field`: copy `payload.<value>`; `literal`: fixed text. */
  kind: 'field' | 'literal'
  value: string
}

export type SigningProfile = string

export interface Subscription {
  id?: string
  name: string
  events: string[]
  url: string
  /** Closed list of signing profiles offered by the host (RFC 0003 §2.2). */
  profile: SigningProfile
  /** Optional filter: only deliver when `payload.<path>` equals `value`. */
  filter?: { path: string; eq: string } | null
  mapping: MappingRow[]
  enabled: boolean
  /** True when a destination credential is stored. Never the credential. */
  has_credential?: boolean
}

/** Write-only: the destination credential travels only on save. */
export interface SubscriptionDraft extends Subscription {
  credential?: string
}

/** Scalar a `when` condition compares against (kernel `inbound.Condition`). */
export type ConditionScalar = string | number | boolean

/**
 * Declarative `when` of a block (kernel `inbound.Condition`): EXACTLY one of
 * `eq | ne | in | exists`. With the path missing, `eq`/`in` are false and `ne`
 * is true. `in` takes 1..50 scalars. NOTE: the OPS backend (`BlockWhen`)
 * accepts `eq|ne|in` today; `exists` is kernel-only until OPS adds it.
 */
export interface Condition {
  path: string
  eq?: ConditionScalar
  ne?: ConditionScalar
  in?: ConditionScalar[]
  exists?: boolean
}

/** Max values of `Condition.in` (kernel `MaxConditionIn`). */
export const MAX_CONDITION_IN = 50

/**
 * Order guard of a `record.create|update|upsert|delete` block (kernel
 * `inbound.Guard`): the event applies only when `payload[path] op row[field]`.
 * `path` is a `payload.*` reference holding an RFC 3339 instant or an integer.
 */
export interface BlockGuard {
  field: string
  path: string
  op: 'gte' | 'gt'
}

/** Fields every block may carry. */
interface BlockBase {
  when?: Condition
}

/** Fields of the `record.*` blocks that write or select rows of `model`. */
interface RecordBlockBase extends BlockBase {
  model: string
  /** Column names that identify the row. */
  match: string[]
  /** Target column -> template. For select-only blocks, only match fields. */
  mapping: Record<string, string>
}

export type ActionBlock =
  | (Omit<RecordBlockBase, 'match'> & {
      do: 'record.create'
      /** Optional for create: it never looks a row up by match. */
      match?: string[]
      /** Model column that stores `<receipt>:<action>`; must not be mapped. */
      idempotency_field: string
      /** Constants applied on create. */
      defaults?: Record<string, unknown>
      guard?: BlockGuard
    })
  | (RecordBlockBase & { do: 'record.update'; defaults?: Record<string, unknown>; guard?: BlockGuard })
  | (RecordBlockBase & { do: 'record.upsert'; defaults?: Record<string, unknown>; guard?: BlockGuard })
  | (RecordBlockBase & {
      do: 'record.delete'
      /** Only soft delete exists: OPS forbids `hard` (`hard_delete_disabled`). */
      mode?: 'soft'
      /** Cap of rows one event may remove (1..100, default 1). */
      max_rows?: number
      guard?: BlockGuard
    })
  | (RecordBlockBase & {
      do: 'record.action'
      /** Key of a model action declared `ingest: true` (`IngestTarget.actions_available`). */
      action: string
      params?: Record<string, unknown>
      /** Row whose state the action rejects: `noop` (default) or `fail` (409). */
      on_ineligible?: 'noop' | 'fail'
      max_rows?: number
    })
  | (RecordBlockBase & {
      do: 'record.transition'
      /** State of the model stage machine (`IngestTarget.stage`). */
      to: string
      max_rows?: number
    })
  | (RecordBlockBase & { do: 'record.restore'; max_rows?: number })
  | (BlockBase & { do: 'event.emit'; name: string; payload: Record<string, string> })
  | (BlockBase & { do: 'notify'; template: string })
  | (BlockBase & { do: 'command.run'; command: string; args?: Record<string, string> })

export type ActionKind = ActionBlock['do']
export const ACTION_KINDS: readonly ActionKind[] = [
  'record.create',
  'record.update',
  'record.upsert',
  'record.delete',
  'record.action',
  'record.transition',
  'record.restore',
  'event.emit',
  'notify',
  'command.run',
]
/** Kinds the visual editor can author today; the rest go through the advanced view. */
export const VISUAL_ACTION_KINDS: readonly ActionKind[] = ['record.upsert', 'event.emit', 'notify', 'command.run']

// ---- Ingest targets (kernel `inbound.Target`, OPS GET /api/integrations/targets) ----

export interface IngestTargetOption {
  value: string
  label?: string
}

/** A column an inbound entry may write (kernel `TargetColumn`). */
export interface IngestTargetColumn {
  name: string
  label?: string
  type?: string
  required?: boolean
  unique?: boolean
  /** `<addon>.<model>` this column references. */
  ref?: string
  options?: IngestTargetOption[]
  default?: unknown
}

/** Writes the organization's caller may perform (kernel `TargetPermissions`). */
export interface IngestTargetPermissions {
  create: boolean
  update: boolean
  delete: boolean
}

/** Scope fences the model honours (kernel `TargetScope`). */
export interface IngestTargetScope {
  branch: boolean
  entity: boolean
}

export interface IngestTargetActionParam {
  name: string
  label?: string
  type?: string
  required?: boolean
}

/** Model action a `record.action` may run (kernel `TargetAction`). */
export interface IngestTargetAction {
  key: string
  label?: string
  params: IngestTargetActionParam[]
  requires_state?: string[]
  /** `<model>.action:<key>` */
  permission: string
}

export interface IngestTargetStageItem {
  key: string
  label?: string
}

export interface IngestTargetTransition {
  from: string
  to: string
}

/** Stage machine of a model: the column `record.transition` writes (kernel `TargetStage`). */
export interface IngestTargetStage {
  field: string
  stages: IngestTargetStageItem[]
  transitions: IngestTargetTransition[]
}

/** Catalogue entry of one model an inbound chain can write (kernel `inbound.Target`). */
export interface IngestTarget {
  addon: string
  addon_name?: string
  /** `<addon>.<entity>` */
  model: string
  label?: string
  columns: IngestTargetColumn[]
  /** Column sets that identify one row (unique columns / unique indexes). */
  match_candidates: string[][]
  soft_delete: boolean
  /** Block kinds the model supports, e.g. `record.create`. */
  actions: string[]
  permissions: IngestTargetPermissions
  scope: IngestTargetScope
  /** Columns usable in a block `guard.field`. */
  guard_candidates?: string[]
  /** v0.272+: ingest actions for `record.action`. Absent on older hosts. */
  actions_available?: IngestTargetAction[]
  /** v0.272+: stage machine for `record.transition`; `null` when none. */
  stage?: IngestTargetStage | null
  /** v0.272+: `record.restore` applies. */
  restorable?: boolean
  /** v0.272+: column that orders the model ingest events. */
  ingest_cursor?: string
}

export interface InboundContract {
  key: string
  name: string
  /** `template` contracts come from the host presets. */
  source?: 'template' | 'custom'
  schema?: JSONSchemaLite
}

export interface InboundEndpoint {
  id?: string
  name: string
  contract_key: string
  /** Generated by the host. Shown as read-only. */
  url?: string
  actions: ActionBlock[]
  on_error: 'stop' | 'continue'
  enabled: boolean
  has_credential?: boolean
}

/**
 * A credential the host generated. Returned ONCE by the save/rotate call that
 * created it; the panel shows it a single time and drops it from memory.
 */
export interface OneTimeCredential {
  value: string
  label?: string
}

export interface SaveResult<T> {
  item: T
  credential?: OneTimeCredential
}

export type LogStatus = 'delivered' | 'failed' | 'pending' | 'duplicate'

export interface LogEntry {
  id: string
  direction: 'out' | 'in'
  event: string
  /** Subscription or endpoint name. */
  endpoint: string
  status: LogStatus
  at: string
  attempts?: number
  http_status?: number
  error?: string
}

export interface LogQuery {
  direction?: 'out' | 'in'
  status?: LogStatus
  event?: string
  cursor?: string
}

export interface LogPage {
  items: LogEntry[]
  next_cursor?: string
}

export interface TestResult {
  ok: boolean
  http_status?: number
  duration_ms?: number
  /** Body the host would send / sent (already mapped). */
  body?: unknown
  error?: string
}

export interface QueueStatus {
  pending: number
  failed: number
  oldest_pending_at?: string
}

export interface IntegrationsApi {
  /** Catalog aggregated from the installed manifests (kernel `v3.Catalog`). */
  listEvents(): Promise<CatalogEvent[]>
  listSubscriptions(): Promise<Subscription[]>
  saveSubscription(draft: SubscriptionDraft): Promise<SaveResult<Subscription>>
  deleteSubscription?(id: string): Promise<void>
  /** Test delivery of a saved subscription or an unsaved draft. */
  test(target: { id: string } | { draft: SubscriptionDraft; event: string; sample: unknown }): Promise<TestResult>

  listInboundContracts(): Promise<InboundContract[]>
  listInbound(): Promise<InboundEndpoint[]>
  saveInbound(draft: InboundEndpoint): Promise<SaveResult<InboundEndpoint>>
  /** Issues a new credential, invalidating the previous one. */
  rotateInboundCredential?(id: string): Promise<OneTimeCredential>
  deleteInbound?(id: string): Promise<void>

  listLog(query: LogQuery): Promise<LogPage>
  replay(id: string): Promise<void>
  queueStatus?(): Promise<QueueStatus>

  /**
   * Catalogue of models an inbound chain may write (OPS
   * `GET /api/integrations/targets`). Optional for backward compatibility:
   * without it the builder falls back to `listModels` / free text.
   */
  listTargets?(): Promise<IngestTarget[]>
  /** @deprecated Use `listTargets`; kept so existing hosts keep working. */
  listModels?(): Promise<string[]>
  /** Optional suggestions for the action blocks; free text when absent. */
  listCommands?(): Promise<string[]>
  listNotifyTemplates?(): Promise<string[]>
  /** Signing profiles offered by the host. Defaults to a single "default". */
  listSigningProfiles?(): Promise<{ key: string; label: string }[]>
}
