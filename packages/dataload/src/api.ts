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
}

const nz = <T>(v: T[] | null | undefined): T[] => v ?? []

/** The kernel serializes nil slices as null; the UI wants arrays. */
export function normalizePlan(p: DataloadPlan): DataloadPlan {
  return {
    ...p,
    counts: p.counts ?? {},
    rows: nz(p.rows).map((r) => ({ ...r, diffs: nz(r.diffs), issues: nz(r.issues) })),
  }
}

export function normalizeRun(r: DataloadRun): DataloadRun {
  return { ...r, issues: nz(r.issues) }
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
  }
}

/** Extracts the server message from an axios-like error. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || fallback
}
