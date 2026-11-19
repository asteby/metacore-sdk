import { unwrapResponse } from '@asteby/metacore-lib/envelope'
import type {
  Automation,
  AutomationCatalog,
  AutomationKind,
  AutomationRun,
  AutomationSpec,
  AutomationStatus,
  AutomationsHttpClient,
  RunNowResult,
} from './types'


export interface AutomationsApi {
  list(filter?: { status?: AutomationStatus; kind?: AutomationKind; all?: boolean }): Promise<Automation[]>
  get(id: string): Promise<Automation>
  runs(id: string, limit?: number): Promise<AutomationRun[]>
  catalog(): Promise<AutomationCatalog>
  create(body: { kind?: AutomationKind; spec: AutomationSpec; propose?: boolean }): Promise<Automation>
  update(id: string, body: { spec: AutomationSpec; version?: number }): Promise<Automation>
  confirm(id: string): Promise<Automation>
  pause(id: string): Promise<Automation>
  resume(id: string): Promise<Automation>
  archive(id: string): Promise<Automation>
  run(id: string, dryRun?: boolean): Promise<RunNowResult>
}

/** REST client for the kernel automation.Handler mounted at basePath. */
export function createAutomationsApi(http: AutomationsHttpClient, opts: { basePath?: string } = {}): AutomationsApi {
  const base = (opts.basePath ?? '/automations').replace(/\/$/, '')
  const qs = (f?: Record<string, unknown>) => {
    const p = Object.entries(f ?? {})
      .filter(([, v]) => v !== undefined && v !== '' && v !== false)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === true ? '1' : String(v))}`)
    return p.length ? `?${p.join('&')}` : ''
  }
  const id = (v: string) => encodeURIComponent(v)
  return {
    list: async (f) => unwrapResponse<Automation[]>(await http.get(base + qs(f))) ?? [],
    get: async (v) => unwrapResponse<Automation>(await http.get(`${base}/${id(v)}`)),
    runs: async (v, limit = 30) => unwrapResponse<AutomationRun[]>(await http.get(`${base}/${id(v)}/runs?limit=${limit}`)) ?? [],
    catalog: async () => unwrapResponse<AutomationCatalog>(await http.get(`${base}/catalog`)),
    create: async (body) => unwrapResponse<Automation>(await http.post(base, body)),
    update: async (v, body) => unwrapResponse<Automation>(await http.patch(`${base}/${id(v)}`, body)),
    confirm: async (v) => unwrapResponse<Automation>(await http.post(`${base}/${id(v)}/confirm`)),
    pause: async (v) => unwrapResponse<Automation>(await http.post(`${base}/${id(v)}/pause`)),
    resume: async (v) => unwrapResponse<Automation>(await http.post(`${base}/${id(v)}/resume`)),
    archive: async (v) => unwrapResponse<Automation>(await http.delete(`${base}/${id(v)}`)),
    run: async (v, dryRun = true) => unwrapResponse<RunNowResult>(await http.post(`${base}/${id(v)}/run`, { dry_run: dryRun })),
  }
}

/** Extracts the server message from an axios-like error. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e?.response?.data?.message || fallback
}
