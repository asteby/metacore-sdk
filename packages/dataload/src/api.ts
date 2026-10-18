import { parseTime } from './utils'
import type {
  DataloadHttpClient,
  DataloadPlan,
  DataloadRequest,
  DataloadRun,
  DryRunResult,
  ExecuteRequest,
  MediaBackupStatus,
  ManifestEntry,
  PlanPage,
  PlanPageQuery,
  ProfileKey,
  ProfileSummary,
  PublishVersionRequest,
  ReviewDecision,
  ReviewEntry,
  ReviewFilter,
  ReviewPage,
  StoredProfileVersion,
  UploadSession,
  VerifyReport,
} from './types'

type Envelope<T> = { success?: boolean; data: T; message?: string }
const unwrap = <T>(res: { data?: unknown }): T => (res.data as Envelope<T>).data

/** Reference to send as `profile` in a request: `base/name@version` for the host's shared catalog. */
export function profileRef(p: { name: string; version: string; shared?: boolean; org?: string }): string {
  return `${p.shared || p.org === '' ? 'base/' : ''}${p.name}@${p.version}`
}

export interface DataloadApi {
  /** Every published version: the host's shared base catalog (`shared`) and the organization's own. */
  listProfiles(): Promise<ProfileSummary[]>
  /**
   * Publishes a new immutable version (full profile, or base + overrides).
   * Same content again is a no-op; the same name+version with other content is 409.
   */
  publishVersion(body: PublishVersionRequest): Promise<StoredProfileVersion>
  /** One full published version (`base/` for the host's shared catalog). */
  profileVersion(key: ProfileKey & { shared?: boolean }): Promise<StoredProfileVersion>
  /** Dry-run: reads, maps and diffs against the destination. Writes and downloads nothing. */
  dryRun(body: DataloadRequest): Promise<DryRunResult>
  /** Starts an async apply and returns immediately; poll `run(id)` for progress. */
  execute(body: ExecuteRequest): Promise<DataloadRun>
  run(id: string): Promise<DataloadRun>
  /** One page of the plan stored with a run (dry-run or apply); paginated on the server. */
  runPlan(id: string, query?: PlanPageQuery): Promise<PlanPage>
  /** History, newest first. */
  runs(limit?: number): Promise<DataloadRun[]>
  cancel(id: string): Promise<DataloadRun>
  mediaStatus(runId?: string): Promise<MediaBackupStatus>
  /** Exports the manifest (source url, sha256, bytes, type, dates, status). */
  mediaManifest(): Promise<ManifestEntry[]>
  /** Re-reads every backed-up original and compares sha256. */
  mediaVerify(): Promise<VerifyReport>
  /** Requeues dead media jobs ("retry media"). Returns how many. */
  mediaRetry(runId?: string): Promise<number>

  /** One page of the rows held for a decision, by row order, with the counts by state. */
  reviews(filter?: ReviewFilter): Promise<ReviewPage>
  /** Records decisions without writing to the destination. All or nothing (`Runner.Decide`). */
  decideReviews(decisions: ReviewDecision[]): Promise<ReviewEntry[]>
  /** Writes the approved rows of an entity (`Runner.ApplyApproved`); returns its `apply_reviewed` run. */
  applyApproved(entity: string): Promise<DataloadRun>

  /** Opens a chunked upload. The server picks (or caps) `chunkSize`. */
  createUpload(body: { name: string; size: number; contentType?: string; chunkSize?: number }): Promise<UploadSession>
  /** Current state of an upload (which parts the server has), to resume. */
  upload(id: string): Promise<UploadSession>
  /** Sends one part as raw bytes. `sha256` (hex) lets the server reject a corrupted part. */
  uploadPart(id: string, index: number, chunk: Blob, opts?: { sha256?: string; signal?: AbortSignal }): Promise<void>
  /** Assembles the parts; the server checks `sha256` when given. */
  completeUpload(id: string, opts?: { sha256?: string }): Promise<UploadSession>
  /** Discards an unfinished upload. */
  abortUpload(id: string): Promise<void>
}

const nz = <T>(v: T[] | null | undefined): T[] => v ?? []

/** The kernel serializes nil slices as null; the UI wants arrays. */
export function normalizePlan<P extends DataloadPlan | PlanPage>(p: P): P {
  return {
    ...p,
    counts: p.counts ?? {},
    rows: nz(p.rows).map((r) => ({ ...r, diffs: nz(r.diffs), issues: nz(r.issues), review: nz(r.review) })),
  }
}

export function planQuery(q: PlanPageQuery = {}): string {
  const p = new URLSearchParams()
  if (q.action) p.set('action', q.action)
  if (q.offset) p.set('offset', String(q.offset))
  if (q.limit) p.set('limit', String(q.limit))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Go serializes an unset `time.Time` as 0001-01-01T00:00:00Z even with omitempty: drop those fields. */
function dropUnsetTimes<T extends object>(o: T, keys: (keyof T)[]): T {
  const out = { ...o }
  for (const k of keys) {
    const v = out[k]
    if (v == null || (typeof v === 'string' && !parseTime(v))) delete out[k]
  }
  return out
}

export function normalizeRun(r: DataloadRun): DataloadRun {
  return dropUnsetTimes({ ...r, issues: nz(r.issues), review: nz(r.review).map((n) => ({ ...n, items: nz(n.items) })) }, ['startedAt', 'finishedAt'])
}

export function normalizeReview(e: ReviewEntry): ReviewEntry {
  return dropUnsetTimes({ ...e, items: nz(e.items), record: e.record ?? {} }, ['decidedAt'])
}

function normalizeUpload(u: UploadSession): UploadSession {
  return { ...u, received: nz(u.received) }
}

/** Query string for a review filter (snake_case like the rest of the contract). */
export function reviewQuery(f: ReviewFilter = {}): string {
  const p = new URLSearchParams()
  if (f.entity) p.set('entity', f.entity)
  if (f.state) p.set('state', f.state)
  if (f.runId) p.set('run_id', f.runId)
  if (f.code) p.set('code', f.code)
  if (f.limit) p.set('limit', String(f.limit))
  if (f.cursor) p.set('cursor', f.cursor)
  const s = p.toString()
  return s ? `?${s}` : ''
}

function normalizeStatus(s: MediaBackupStatus): MediaBackupStatus {
  return { ...s, dead: nz(s.dead) }
}

/** REST client for the dataload handler that the host mounts at `basePath` (default `/dataload`). */
export function createDataloadApi(http: DataloadHttpClient, opts: { basePath?: string } = {}): DataloadApi {
  const base = (opts.basePath ?? '/dataload').replace(/\/$/, '')
  const id = (v: string) => encodeURIComponent(v)
  const q = (runId?: string) => (runId ? `?run_id=${encodeURIComponent(runId)}` : '')
  return {
    listProfiles: async () => nz(unwrap<ProfileSummary[]>(await http.get(`${base}/profiles`))),
    publishVersion: async (body) => unwrap<StoredProfileVersion>(await http.post(`${base}/profiles`, body)),
    profileVersion: async (k) =>
      unwrap<StoredProfileVersion>(await http.get(`${base}/profiles/${id(k.name)}/versions/${id(k.version)}${k.shared || k.org === '' ? '?base=1' : ''}`)),
    dryRun: async (body) => {
      const r = unwrap<DryRunResult>(await http.post(`${base}/dry-run`, body))
      return { plan: normalizePlan(r.plan), run: normalizeRun(r.run), ...(r.source ? { source: r.source } : {}) }
    },
    execute: async (body) => normalizeRun(unwrap<DataloadRun>(await http.post(`${base}/runs`, body))),
    run: async (v) => normalizeRun(unwrap<DataloadRun>(await http.get(`${base}/runs/${id(v)}`))),
    runPlan: async (v, query) => normalizePlan(unwrap<PlanPage>(await http.get(`${base}/runs/${id(v)}/plan${planQuery(query)}`))),
    runs: async (limit = 30) => nz(unwrap<DataloadRun[]>(await http.get(`${base}/runs?limit=${limit}`))).map(normalizeRun),
    cancel: async (v) => normalizeRun(unwrap<DataloadRun>(await http.post(`${base}/runs/${id(v)}/cancel`))),
    mediaStatus: async (runId) => normalizeStatus(unwrap<MediaBackupStatus>(await http.get(`${base}/media/status${q(runId)}`))),
    mediaManifest: async () => nz(unwrap<ManifestEntry[]>(await http.get(`${base}/media/manifest`))),
    mediaVerify: async () => {
      const r = unwrap<VerifyReport>(await http.post(`${base}/media/verify`))
      return { ...r, missing: nz(r.missing), corrupt: nz(r.corrupt) }
    },
    mediaRetry: async (runId) => unwrap<{ requeued: number }>(await http.post(`${base}/media/retry`, runId ? { run_id: runId } : {})).requeued,
    reviews: async (f) => {
      const page = unwrap<ReviewPage>(await http.get(`${base}/reviews${reviewQuery(f)}`))
      return { items: nz(page?.items).map(normalizeReview), counts: page?.counts ?? {}, ...(page?.next ? { next: page.next } : {}) }
    },
    decideReviews: async (decisions) => nz(unwrap<ReviewEntry[]>(await http.post(`${base}/reviews/decide`, { decisions }))).map(normalizeReview),
    applyApproved: async (entity) => normalizeRun(unwrap<DataloadRun>(await http.post(`${base}/reviews/apply`, { entity }))),
    createUpload: async (body) => normalizeUpload(unwrap<UploadSession>(await http.post(`${base}/uploads`, body))),
    upload: async (v) => normalizeUpload(unwrap<UploadSession>(await http.get(`${base}/uploads/${id(v)}`))),
    uploadPart: async (v, index, chunk, o = {}) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
      if (o.sha256) headers['X-Content-Sha256'] = o.sha256
      await http.post(`${base}/uploads/${id(v)}/parts/${index}`, chunk, { headers, ...(o.signal ? { signal: o.signal } : {}) })
    },
    completeUpload: async (v, o = {}) => normalizeUpload(unwrap<UploadSession>(await http.post(`${base}/uploads/${id(v)}/complete`, o.sha256 ? { sha256: o.sha256 } : {}))),
    abortUpload: async (v) => {
      await http.post(`${base}/uploads/${id(v)}/abort`)
    },
  }
}

/** Extracts the server message from an axios-like error. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || fallback
}

/** HTTP status of an axios-like error, if any. */
export function apiErrorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/**
 * The plan the person reviewed is no longer the one the server would apply (409 on
 * execute with `expectPlanHash`): simulate again before applying.
 */
export function isPlanChanged(err: unknown): boolean {
  return apiErrorStatus(err) === 409 && /plan/i.test(apiErrorMessage(err, ''))
}

/** Every page of the review queue (follows `next`), up to `max` rows. */
export async function listAllReviews(api: DataloadApi, filter: ReviewFilter = {}, max = 5000): Promise<ReviewPage> {
  const items: ReviewEntry[] = []
  let page = await api.reviews({ limit: 500, ...filter })
  const counts = page.counts
  for (;;) {
    items.push(...page.items)
    if (!page.next || items.length >= max) break
    page = await api.reviews({ limit: 500, ...filter, cursor: page.next })
  }
  return { items: items.slice(0, max), counts, ...(page.next && items.length >= max ? { next: page.next } : {}) }
}
