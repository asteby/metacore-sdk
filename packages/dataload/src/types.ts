/**
 * Types mirroring the kernel `dataload` package JSON (profile.go, plan.go,
 * ledger.go, media.go). Nothing here knows a niche or a source platform: those
 * live in declarative profiles (data) that the host registers.
 */

export type CleanRule =
  | 'trim'
  | 'collapse_spaces'
  | 'unescape_newlines'
  | 'strip_html'
  | 'trim_quotes'
  | 'null_if_emptyish'
  | 'lower'
  | 'upper'

export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'email'

export interface DataloadField {
  /** Destination field (dotted path allowed). */
  target: string
  /** Source columns, first match wins. */
  from: string[]
  type?: FieldType
  required?: boolean
  clean?: CleanRule[]
  /** Value translation table (source value -> destination value). */
  values?: Record<string, string>
  transform?: string
  /** Value is a media URL (or a list) to download and back up. */
  media?: boolean
  sep?: string
  default?: unknown
}

export interface DataloadProfile {
  name: string
  version: string
  entity: string
  key: string[]
  fields: DataloadField[]
  defaults?: Record<string, unknown>
  clean?: CleanRule[]
  ignoreHeaders?: string[]
  maxRows?: number
}

/** Per-organization adjustments over a base profile. */
export interface DataloadOverrides {
  org?: string
  ignoreHeaders?: string[]
  rename?: Record<string, string[]>
  fields?: DataloadField[]
  drop?: string[]
  defaults?: Record<string, unknown>
  clean?: CleanRule[]
}

export type SourceFormat = 'csv' | 'json' | 'bundle'

/** The data to load, sent as text. `path` is only used by `bundle` (dotted path to the rows array). */
export interface DataloadSourceInput {
  format: SourceFormat
  name: string
  content: string
  path?: string
}

export type PlanAction = 'create' | 'update' | 'unchanged' | 'invalid' | 'duplicate'

export interface RowIssue {
  row: number
  column?: string
  message: string
}

export interface FieldDiff {
  field: string
  old: unknown
  new: unknown
}

export interface RowPlan {
  /** 1-based over data rows. */
  row: number
  key?: string
  action: PlanAction
  hash?: string
  record?: Record<string, unknown>
  /** field -> source URLs that will be backed up. */
  media?: Record<string, string[]>
  diffs: FieldDiff[]
  issues: RowIssue[]
}

export interface DataloadPlan {
  org: string
  entity: string
  profile: string
  profileVersion: string
  profileHash: string
  source: string
  inputHash: string
  planHash: string
  rows: RowPlan[]
  counts: Partial<Record<PlanAction, number>>
  ignoredColumns: number
  mediaUrls: number
}

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
export type RunMode = 'dry_run' | 'apply'

export interface RunProgress {
  total: number
  done: number
  created: number
  updated: number
  unchanged: number
  invalid: number
  duplicates: number
  mediaQueued: number
}

export interface DataloadRun {
  id: string
  key: string
  org: string
  mode: RunMode
  state: RunState
  actor?: string
  profile: string
  profileVersion: string
  profileHash: string
  overridesHash?: string
  source: string
  inputHash: string
  planHash?: string
  progress: RunProgress
  issues: RowIssue[]
  error?: string
  /** Id of the run that already resolved this very input: this one wrote nothing. */
  replayOf?: string
  createdAt: string
  /** The kernel serializes unset times as 0001-01-01; use `parseTime`. */
  startedAt?: string
  finishedAt?: string
}

export type EntryStatus = 'ok' | 'missing' | 'corrupt'

export interface ManifestEntry {
  org: string
  sourceUrl: string
  sha256: string
  bytes: number
  contentType: string
  storedName: string
  fetchedAt: string
  verifiedAt: string
  status: EntryStatus
}

export interface VerifyReport {
  checked: number
  ok: number
  missing: ManifestEntry[]
  corrupt: ManifestEntry[]
}

export type MediaState = 'pending' | 'running' | 'done' | 'dead'

export interface MediaQueueStats {
  pending: number
  running: number
  done: number
  dead: number
}

export interface MediaJob {
  id: string
  runId?: string
  key: string
  field: string
  index: number
  url: string
  state: MediaState
  attempts: number
  lastError?: string
  nextAttempt: string
  sha256?: string
  deriveError?: string
  updatedAt: string
}

/** Status of the media backup: queue + manifest summary (+ dead jobs to inspect). */
export interface MediaBackupStatus {
  queue: MediaQueueStats
  manifest: { total: number; ok: number; missing: number; corrupt: number; bytes: number }
  /** Jobs that died (definitive failure or exhausted attempts), newest first. */
  dead: MediaJob[]
}

/** Request shared by dry-run and execute. `profile` is a registered profile name or an inline profile. */
export interface DataloadRequest {
  profile: string | DataloadProfile
  overrides?: DataloadOverrides
  source: DataloadSourceInput
}

export interface ExecuteRequest extends DataloadRequest {
  /** Apply even if an identical successful run exists (the diff keeps it safe). */
  force?: boolean
  /** Apply nothing if any row is invalid. */
  failOnInvalid?: boolean
}

export interface DryRunResult {
  plan: DataloadPlan
  run: DataloadRun
}

/** Minimal HTTP client (axios-compatible): responses carry `{ data }`. */
export interface DataloadHttpClient {
  get(url: string): Promise<{ data?: unknown }>
  post(url: string, body?: unknown): Promise<{ data?: unknown }>
}

export type TranslateFn = (key: string, fallback: string) => string
