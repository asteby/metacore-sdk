/**
 * Types mirroring the kernel `dataload` package JSON (profile.go, plan.go,
 * ledger.go, media.go). Nothing here knows a niche or a source platform: those
 * live in declarative profiles (data) that the host registers.
 */

/** Stable cleaning rule names (profile.go `knownClean`), plus the parameterized `drop_lines:<regex>`. */
export const CLEAN_RULES = [
  'trim',
  'collapse_spaces',
  'unescape_newlines',
  'strip_html',
  'trim_quotes',
  'null_if_emptyish',
  'lower',
  'upper',
  'sanitize_html',
  'collapse_blank_lines',
  'auto_paragraphs',
] as const

export type CleanRule = (typeof CLEAN_RULES)[number] | `drop_lines:${string}`

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
  /** Rules that always run last (after `clean` and an override's `cleanAdd`). */
  finish?: CleanRule[]
  /** Splits the cleaned cell into a list of non-empty texts. */
  split?: string
  /** Computed from other columns (kernel `Derive`); a derived field has no `from`. Opaque here. */
  derive?: Record<string, unknown>
}

export interface OrderRule {
  field: string
  rank: string[]
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
  applyOrder?: OrderRule[]
}

/** Per-organization adjustments over a base profile. */
export interface DataloadOverrides {
  org?: string
  ignoreHeaders?: string[]
  rename?: Record<string, string[]>
  fields?: DataloadField[]
  drop?: string[]
  defaults?: Record<string, unknown>
  /** Replaces the profile's global clean rules when present. */
  clean?: CleanRule[]
  /** target -> rules appended to that field's `clean`. */
  cleanAdd?: Record<string, CleanRule[]>
  /** target -> extra value translations (they win over the profile's). */
  valuesAdd?: Record<string, Record<string, string>>
}

export type SourceFormat = 'csv' | 'json' | 'bundle'

/** The data to load, sent as text. `path` is only used by `bundle` (dotted path to the rows array). */
export interface InlineSourceInput {
  format: SourceFormat
  name: string
  content: string
  path?: string
}

/** A file already uploaded in parts (`uploadSourceFile`): the server reads it by id. */
export interface UploadedSourceInput {
  format: SourceFormat
  name: string
  uploadId: string
  path?: string
}

export type DataloadSourceInput = InlineSourceInput | UploadedSourceInput

export const isUploadedSource = (s: DataloadSourceInput | undefined): s is UploadedSourceInput => !!s && 'uploadId' in s

export type PlanAction = 'create' | 'update' | 'unchanged' | 'invalid' | 'duplicate' | 'review'

/** `revisar` blocks the automatic load of the row; `info` only informs. */
export type ReviewSeverity = 'revisar' | 'info'

/** A reason why a row needs (or deserves) a person's look (extract.go `ReviewItem`). */
export interface ReviewItem {
  code: string
  field?: string
  severity: ReviewSeverity
  detail?: string
  /** Stable code and parameters of `detail`, to translate it. */
  detailCode?: string
  detailParams?: Record<string, unknown>
}

export interface RowIssue {
  row: number
  column?: string
  message: string
  /** Stable code (`importer.*` / `dataload.*`) and parameters of `message`, to translate it. */
  code?: string
  params?: Record<string, unknown>
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
  /** Reasons from the extract stage (`revisar` and `info`). */
  review: ReviewItem[]
  /** Only on `review` rows: what applying it would do (create, update or unchanged). */
  outcome?: PlanAction
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
  extractHash?: string
  rows: RowPlan[]
  counts: Partial<Record<PlanAction, number>>
  ignoredColumns: number
  mediaUrls: number
}

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
/** `apply_reviewed` writes the rows a person approved in the review queue. */
export type RunMode = 'dry_run' | 'apply' | 'apply_reviewed'

export interface RunProgress {
  total: number
  done: number
  created: number
  updated: number
  unchanged: number
  invalid: number
  duplicates: number
  mediaQueued: number
  /** Valid rows waiting for a decision; they are never written on their own. */
  review?: number
}

/** A row waiting for a decision, as listed in its run (up to 200; the full count is `progress.review`). */
export interface ReviewNote {
  row: number
  key: string
  outcome?: PlanAction
  items: ReviewItem[]
}

/** Durable per-batch resume point of a large run. */
export interface RunCheckpoint {
  batches: number
  rows: number
  lastKey?: string
  resumes?: number
  /** Rows a resume recovered from apply marks written after the last checkpoint. */
  recovered?: number
  updatedAt: string
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
  extractHash?: string
  progress: RunProgress
  issues: RowIssue[]
  review: ReviewNote[]
  checkpoint?: RunCheckpoint
  error?: string
  /** Stable code and parameters of `error` (kernel catalog), to translate it. */
  errorCode?: string
  errorParams?: Record<string, unknown>
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
  /** Stable code of `lastError` when it comes from the engine (absent for network or origin errors). */
  lastErrorCode?: string
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

export type ReviewState = 'pending' | 'approved' | 'rejected' | 'applied' | 'superseded'

/** States in which a person can still decide (approved can be flipped until it is applied). */
export const OPEN_REVIEW_STATES: readonly ReviewState[] = ['pending', 'approved', 'rejected']

/** A row held for a later decision (review.go `ReviewEntry`). */
export interface ReviewEntry {
  org: string
  entity: string
  key: string
  profile: string
  profileVersion: string
  profileHash: string
  /** Run that planned the row; its stored plan has the field diff. */
  runId: string
  row: number
  /** Fingerprint of the row; a decision must carry the one the person saw. */
  hash: string
  record: Record<string, unknown>
  media?: Record<string, string[]>
  items: ReviewItem[]
  outcome?: PlanAction
  state: ReviewState
  decidedBy?: string
  decidedAt?: string
  note?: string
  appliedRun?: string
  createdAt: string
  updatedAt: string
}

export interface ReviewFilter {
  entity?: string
  state?: ReviewState
  runId?: string
  /** Only entries carrying that review code. */
  code?: string
  limit?: number
}

/** An explicit decision on one row. `hash` must be the `ReviewEntry.hash` the person saw. */
export interface ReviewDecision {
  entity: string
  key: string
  hash: string
  approve: boolean
  note?: string
}

/** Server-side state of a chunked upload. */
export interface UploadSession {
  id: string
  name: string
  size: number
  /** Bytes per part chosen by the server (the last part may be shorter). */
  chunkSize: number
  /** 0-based indexes of the parts the server already has (for resume). */
  received: number[]
  /** Set once completed: sha256 of the whole file as the server assembled it. */
  sha256?: string
  expiresAt?: string
}

export interface HttpRequestConfig {
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** Minimal HTTP client (axios-compatible): responses carry `{ data }`. */
export interface DataloadHttpClient {
  get(url: string, config?: HttpRequestConfig): Promise<{ data?: unknown }>
  post(url: string, body?: unknown, config?: HttpRequestConfig): Promise<{ data?: unknown }>
}

export type TranslateFn = (key: string, fallback: string) => string
