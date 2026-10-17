// Test helpers for federated pages and panels (`@asteby/metacore-runtime-react/testing`).
//
//   import { renderWithHost, createMockHostApi } from '@asteby/metacore-runtime-react/testing'
//
//   const api = createMockHostApi({ get: { '/data/Shipment': { success: true, data: [] } } })
//   const { navigate, chrome } = renderWithHost(<ControlTower {...props} />, {
//       api,
//       basePath: '/a/shipping/control-tower',
//   })
//   expect(chrome.get().title).toBe('Torre de envíos')
//
// Never imported by the package index (it pulls @testing-library/react).
import type { ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import type { AddonHostContext, HostApi } from '@asteby/metacore-sdk'
import { HostApiError } from '@asteby/metacore-sdk'
import {
    AddonPageHost,
    createPageChromeStore,
    type AddonNavigateOptions,
    type PageChromeStore,
} from './addon-page-host'

type Responder = unknown | ((path: string, body?: unknown) => unknown)

export interface MockHostApiRoutes {
    get?: Record<string, Responder>
    post?: Record<string, Responder>
    put?: Record<string, Responder>
    patch?: Record<string, Responder>
    delete?: Record<string, Responder>
    capability?: Record<string, Responder>
}

export interface MockHostApi extends HostApi {
    /** Every call, in order: `[method, path, body?]`. */
    calls: Array<[string, string, unknown?]>
}

/**
 * In-memory {@link HostApi}. Unknown routes reject with a 404
 * {@link HostApiError}, like a real host would.
 */
export function createMockHostApi(routes: MockHostApiRoutes = {}): MockHostApi {
    const calls: MockHostApi['calls'] = []
    const answer = async (method: keyof MockHostApiRoutes, path: string, body?: unknown) => {
        calls.push([method, path, body])
        const table = routes[method] ?? {}
        const key = path.split('?')[0]
        if (!(key in table)) throw new HostApiError(`No mock for ${method.toUpperCase()} ${key}`, 404)
        const r = table[key]
        return typeof r === 'function' ? (r as (p: string, b?: unknown) => unknown)(path, body) : r
    }
    const api: MockHostApi = {
        calls,
        get: (p) => answer('get', p) as Promise<never>,
        post: (p, b) => answer('post', p, b) as Promise<never>,
        put: (p, b) => answer('put', p, b) as Promise<never>,
        patch: (p, b) => answer('patch', p, b) as Promise<never>,
        delete: (p) => answer('delete', p) as Promise<never>,
        q: async (p) => {
            const body = (await answer('get', p)) as { success?: boolean; data?: unknown; meta?: unknown }
            return { success: body?.success !== false, data: body?.data as never, meta: body?.meta }
        },
        capability: (key, input) => answer('capability', key, input) as Promise<never>,
    }
    return api
}

export interface RenderWithHostOptions {
    host?: AddonHostContext
    api?: HostApi
    basePath?: string
    /** Initial path (absolute) and search of the simulated router. */
    pathname?: string
    search?: string
}

export interface RenderWithHostResult extends RenderResult {
    api: HostApi
    chrome: PageChromeStore
    /** Spy of host navigations: `[to, opts]`. */
    navigate: { calls: Array<[string, AddonNavigateOptions | undefined]> }
}

/** Render `ui` inside an `<AddonPageHost>` with a simulated host. */
export function renderWithHost(ui: ReactElement, opts: RenderWithHostOptions = {}): RenderWithHostResult {
    const basePath = opts.basePath ?? '/a/test/page'
    const api = opts.api ?? createMockHostApi()
    const chrome = createPageChromeStore()
    const navCalls: Array<[string, AddonNavigateOptions | undefined]> = []
    const host: AddonHostContext = opts.host ?? {
        org: { id: 'org_test', name: 'Org de prueba', currency: 'MXN', timezone: 'America/Mexico_City', taxLabel: 'IVA' },
        user: { id: 'user_test', name: 'Operador' },
        locale: 'es-MX',
        installedAddons: [],
    }
    const location = { pathname: opts.pathname ?? basePath, search: opts.search ?? '' }
    const navigate = (to: string, o?: AddonNavigateOptions) => {
        navCalls.push([to, o])
    }
    const result = render(
        <AddonPageHost host={host} api={api} basePath={basePath} location={location} navigate={navigate} chrome={chrome}>
            {ui}
        </AddonPageHost>,
    )
    return Object.assign(result, { api, chrome, navigate: { calls: navCalls } })
}
