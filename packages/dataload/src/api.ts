import type {
  DataloadHttpClient,
  DataloadPlan,
  DataloadProfile,
  DataloadOverrides,
  DataloadRequest,
  DataloadRun,
  DryRunResult,
  ExecuteRequest,
  MediaBackupStatus,
  ManifestEntry,
  ReviewDecision,
  ReviewEntry,
  ReviewFilter,
  UploadSession,
  VerifyReport,
} from './types'

type Envelope<T> = { success?: boolean; data: T; message?: string }
const unwrap = <T>(res: { data?: unknown }): T => (res.data as Envelope<T>).data

/** A registered profile: the declarative mapping plus the org overrides saved with it. */
export interface StoredProfile {
  profile: DataloadProfile
  overrides?: DataloadOverrides
}

export interface DataloadApi {
  listProfiles(): Promise<StoredProfile[]>
  /** Creates or replaces (by name + version) a profile; the server validates it. */
  saveProfile(body: StoredProfile): Promise<StoredProfile>
  /** Dry-run: reads, maps and diffs against the destination. Writes and downloads nothing. */
  dryRun(body: DataloadRequest): Promise<DryRunResult>
  /** Starts an async apply and returns immediately; poll `run(id)` for progress. */
  execute(body: ExecuteRequest): Promise<DataloadRun>
  run(id: string): Promise<DataloadRun>
  /** Plan stored with a run (dry-run or apply), for the diff view of an old run. */
  runPlan(id: string): Promise<DataloadPlan>
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

  /** Rows held for a decision (`ReviewStore.List`), by row order. */
  reviews(filter?: ReviewFilter): Promise<ReviewEntry[]>
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
export function normalizePlan(p: DataloadPlan): DataloadPlan {
  return {
    ...p,
    counts: p.counts ?? {},
    rows: nz(p.rows).map((r) => ({ ...r, diffs: nz(r.diffs), issues: nz(r.issues), review: nz(r.review) })),
  }
}

export function normalizeRun(r: DataloadRun): DataloadRun {
  return { ...r, issues: nz(r.issues), review: nz(r.review).map((n) => ({ ...n, items: nz(n.items) })) }
}

function normalizeReview(e: ReviewEntry): ReviewEntry {
  return { ...e, items: nz(e.items), record: e.record ?? {} }
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
    listProfiles: async () => nz(unwrap<StoredProfile[]>(await http.get(`${base}/profiles`))),
    saveProfile: async (body) => unwrap<StoredProfile>(await http.post(`${base}/profiles`, body)),
    dryRun: async (body) => {
      const r = unwrap<DryRunResult>(await http.post(`${base}/dry-run`, body))
      return { plan: normalizePlan(r.plan), run: normalizeRun(r.run) }
    },
    execute: async (body) => normalizeRun(unwrap<DataloadRun>(await http.post(`${base}/runs`, body))),
    run: async (v) => normalizeRun(unwrap<DataloadRun>(await http.get(`${base}/runs/${id(v)}`))),
    runPlan: async (v) => normalizePlan(unwrap<DataloadPlan>(await http.get(`${base}/runs/${id(v)}/plan`))),
    runs: async (limit = 30) => nz(unwrap<DataloadRun[]>(await http.get(`${base}/runs?limit=${limit}`))).map(normalizeRun),
    cancel: async (v) => normalizeRun(unwrap<DataloadRun>(await http.post(`${base}/runs/${id(v)}/cancel`))),
    mediaStatus: async (runId) => normalizeStatus(unwrap<MediaBackupStatus>(await http.get(`${base}/media/status${q(runId)}`))),
    mediaManifest: async () => nz(unwrap<ManifestEntry[]>(await http.get(`${base}/media/manifest`))),
    mediaVerify: async () => {
      const r = unwrap<VerifyReport>(await http.post(`${base}/media/verify`))
      return { ...r, missing: nz(r.missing), corrupt: nz(r.corrupt) }
    },
    mediaRetry: async (runId) => unwrap<{ requeued: number }>(await http.post(`${base}/media/retry`, runId ? { run_id: runId } : {})).requeued,
    reviews: async (f) => nz(unwrap<ReviewEntry[]>(await http.get(`${base}/reviews${reviewQuery(f)}`))).map(normalizeReview),
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
