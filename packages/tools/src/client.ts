import type { ToolDef, ToolExecutionRequest, ToolExecutionResponse } from './types'

/**
 * Transport-agnostic contract que un host implementa para que el frontend
 * ejecute tools a través de su propio backend. El host se encarga del
 * HMAC + dispatch al endpoint del addon usando kernel/tool.HTTPDispatcher.
 */
export interface ToolClient {
  /** Ejecuta una tool instalada con los params ya validados. */
  execute(req: ToolExecutionRequest): Promise<ToolExecutionResponse>
  /** Lista las tools instaladas para un addon (opcionalmente filtradas). */
  list(filter?: { addon_key?: string }): Promise<ToolDef[]>
}

/**
 * Implementación HTTP que asume la convención de rutas del kernel:
 *
 *   POST   {baseURL}/tools/execute
 *   GET    {baseURL}/tools[?addon_key=...]
 *
 * El host monta esas rutas y traduce a `tool.Registry.ByID(...)` +
 * `tool.Tool.Execute(...)` internamente. Si tu host usa otras rutas,
 * implementá tu propio `ToolClient` a mano y exportálo.
 */
export class HTTPToolClient implements ToolClient {
  constructor(
    private readonly opts: {
      /** URL base del backend (sin trailing slash). Ej: "https://ops.test/api/metacore" */
      baseURL: string
      /** Fetch compatible. Default: globalThis.fetch. */
      fetch?: typeof fetch
      /** Headers estáticos (Authorization, X-Tenant-ID, etc.) o función dinámica. */
      headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
    }
  ) {}

  async execute(req: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const res = await this.doFetch('/tools/execute', {
      method: 'POST',
      body: JSON.stringify(req),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        success: false,
        error: `host returned ${res.status}: ${text}`,
      }
    }
    return (await res.json()) as ToolExecutionResponse
  }

  async list(filter?: { addon_key?: string }): Promise<ToolDef[]> {
    const qs = filter?.addon_key ? `?addon_key=${encodeURIComponent(filter.addon_key)}` : ''
    const res = await this.doFetch(`/tools${qs}`, { method: 'GET' })
    if (!res.ok) {
      throw new Error(`tool list failed: ${res.status} ${await res.text().catch(() => '')}`)
    }
    return (await res.json()) as ToolDef[]
  }

  private async doFetch(path: string, init: RequestInit): Promise<Response> {
    const fetchImpl = this.opts.fetch ?? globalThis.fetch
    if (!fetchImpl) {
      throw new Error('HTTPToolClient: no fetch available; pass opts.fetch')
    }
    const headers = await this.resolveHeaders()
    return fetchImpl(this.opts.baseURL.replace(/\/$/, '') + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(new Headers(headers).entries()),
        ...Object.fromEntries(new Headers(init.headers ?? {}).entries()),
      },
    })
  }

  private async resolveHeaders(): Promise<HeadersInit> {
    const h = this.opts.headers
    if (!h) return {}
    if (typeof h === 'function') return await h()
    return h
  }
}
