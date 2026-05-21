import { describe, expect, it, vi } from 'vitest'
import { HubClient } from '../src/client/hub-client'
import { OpsClient } from '../src/client/ops-client'
import { toQueryString, unwrapEnvelope } from '../src/client/fetcher'
import type {
  AddonDetail,
  CatalogPage,
  Installation,
  InstallToken,
  MarketplaceFetcher,
} from '../src/client/types'
import type { QueryParams } from '../src/client/fetcher'

function makeFetcher(): MarketplaceFetcher & {
  calls: Array<{ method: string; path: string; body?: unknown; params?: QueryParams }>
  responses: Map<string, unknown>
} {
  const calls: Array<{
    method: string
    path: string
    body?: unknown
    params?: QueryParams
  }> = []
  const responses = new Map<string, unknown>()
  const respond = <T>(key: string): T => {
    if (!responses.has(key)) {
      throw new Error(`mock fetcher: no response queued for ${key}`)
    }
    return responses.get(key) as T
  }
  return {
    calls,
    responses,
    get: <T>(path: string, params?: QueryParams) => {
      calls.push({ method: 'GET', path, params })
      return Promise.resolve(respond<T>(`GET ${path}`))
    },
    post: <T>(path: string, body?: unknown) => {
      calls.push({ method: 'POST', path, body })
      return Promise.resolve(respond<T>(`POST ${path}`))
    },
    del: <T>(path: string) => {
      calls.push({ method: 'DELETE', path })
      return Promise.resolve(respond<T>(`DELETE ${path}`))
    },
  }
}

describe('toQueryString', () => {
  it('returns an empty string when params is undefined or empty', () => {
    expect(toQueryString()).toBe('')
    expect(toQueryString({})).toBe('')
  })

  it('skips null/undefined values', () => {
    expect(toQueryString({ a: undefined, b: null, c: 1 })).toBe('?c=1')
  })

  it('joins arrays with comma', () => {
    expect(toQueryString({ tags: ['a', 'b'] })).toBe('?tags=a%2Cb')
  })
})

describe('unwrapEnvelope', () => {
  it('returns bare payload untouched', () => {
    expect(unwrapEnvelope({ id: 1 })).toEqual({ id: 1 })
  })

  it('unwraps `data` from a kernel envelope', () => {
    expect(unwrapEnvelope({ success: true, data: { id: 1 } })).toEqual({ id: 1 })
  })

  it('throws on `success: false` envelopes', () => {
    expect(() =>
      unwrapEnvelope({ success: false, message: 'boom' } as unknown as {
        success: boolean
        message: string
      }),
    ).toThrow(/boom/)
  })
})

describe('HubClient', () => {
  it('listCatalog forwards filters as query params', async () => {
    const fetcher = makeFetcher()
    const page: CatalogPage = { items: [], total: 0, page: 1, page_size: 20 }
    fetcher.responses.set('GET /marketplace/addons', page)

    const hub = new HubClient({ fetcher })
    const res = await hub.listCatalog({ search: 'fiscal', tags: ['mx'], page: 2 })
    expect(res).toEqual(page)
    expect(fetcher.calls[0]?.params).toMatchObject({
      search: 'fiscal',
      tags: ['mx'],
      page: 2,
    })
  })

  it('getAddon encodes the key in the URL', async () => {
    const fetcher = makeFetcher()
    const detail = { key: 'a/b', name: 'A/B', latest_version: '1', versions: [] } as unknown as AddonDetail
    fetcher.responses.set('GET /marketplace/addons/a%2Fb', detail)

    const hub = new HubClient({ fetcher })
    const res = await hub.getAddon('a/b')
    expect(res).toBe(detail)
    expect(fetcher.calls[0]?.path).toBe('/marketplace/addons/a%2Fb')
  })

  it('initiateInstall posts the org id + version', async () => {
    const fetcher = makeFetcher()
    const token: InstallToken = {
      token: 't0',
      expires_at: '2026-01-01T00:00:00Z',
      addon_key: 'fiscal',
      version: '1.0.0',
    }
    fetcher.responses.set('POST /marketplace/addons/fiscal/install', token)

    const hub = new HubClient({ fetcher })
    const res = await hub.initiateInstall('fiscal', {
      organization_id: 'org_1',
      version: '1.0.0',
    })
    expect(res).toBe(token)
    expect(fetcher.calls[0]?.body).toMatchObject({
      organization_id: 'org_1',
      version: '1.0.0',
    })
  })

  it('unwraps enveloped responses transparently', async () => {
    const fetcher = makeFetcher()
    const page: CatalogPage = { items: [], total: 0, page: 1, page_size: 20 }
    fetcher.responses.set('GET /marketplace/addons', {
      success: true,
      data: page,
    })
    const hub = new HubClient({ fetcher })
    expect(await hub.listCatalog()).toEqual(page)
  })

  it('basePath override is honored', async () => {
    const fetcher = makeFetcher()
    fetcher.responses.set('GET /hub/v2/addons', { items: [], total: 0, page: 1, page_size: 20 })
    const hub = new HubClient({ fetcher, basePath: '/hub/v2' })
    await hub.listCatalog()
    expect(fetcher.calls[0]?.path).toBe('/hub/v2/addons')
  })
})

describe('OpsClient', () => {
  it('listInstalled hits the kernel route', async () => {
    const fetcher = makeFetcher()
    const list: Installation[] = []
    fetcher.responses.set('GET /kernel/addons', list)
    const ops = new OpsClient({ fetcher })
    expect(await ops.listInstalled()).toBe(list)
    expect(fetcher.calls[0]?.path).toBe('/kernel/addons')
  })

  it('claimInstall posts the token', async () => {
    const fetcher = makeFetcher()
    const inst = { addon_key: 'fiscal', version: '1.0.0' } as unknown as Installation
    fetcher.responses.set('POST /kernel/addons/claim', inst)
    const ops = new OpsClient({ fetcher })
    expect(await ops.claimInstall({ token: 'tok' })).toBe(inst)
    expect(fetcher.calls[0]?.body).toEqual({ token: 'tok' })
  })

  it('upgrade posts target_version + accepted_capabilities', async () => {
    const fetcher = makeFetcher()
    const inst = { addon_key: 'fiscal', version: '2.0.0' } as unknown as Installation
    fetcher.responses.set('POST /kernel/addons/fiscal/upgrade', inst)
    const ops = new OpsClient({ fetcher })
    const res = await ops.upgrade('fiscal', {
      target_version: '2.0.0',
      accepted_capabilities: [{ kind: 'http:fetch', target: 'api.x' }],
    })
    expect(res).toBe(inst)
    expect(fetcher.calls[0]?.body).toMatchObject({
      target_version: '2.0.0',
      accepted_capabilities: [{ kind: 'http:fetch', target: 'api.x' }],
    })
  })

  it('uninstall issues DELETE', async () => {
    const fetcher = makeFetcher()
    fetcher.responses.set('DELETE /kernel/addons/fiscal', null)
    const ops = new OpsClient({ fetcher })
    await ops.uninstall('fiscal')
    expect(fetcher.calls[0]).toMatchObject({
      method: 'DELETE',
      path: '/kernel/addons/fiscal',
    })
  })
})

describe('createFetchFetcher', () => {
  it('builds URLs relative to baseUrl and JSON-encodes bodies', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { createFetchFetcher } = await import('../src/client/fetcher')
    const fetcher = createFetchFetcher({
      baseUrl: 'https://hub.example.com/api/',
      headers: () => ({ authorization: 'Bearer x' }),
      fetchImpl: fetchSpy as unknown as typeof fetch,
    })
    const res = await fetcher.post<{ ok: boolean }>('/addons/fiscal/install', {
      organization_id: 'org_1',
    })
    expect(res).toEqual({ ok: true })
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('https://hub.example.com/api/addons/fiscal/install')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers).toMatchObject({ authorization: 'Bearer x' })
    expect(call[1].body).toBe('{"organization_id":"org_1"}')
  })

  it('throws with status + body excerpt on non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
    )
    const { createFetchFetcher } = await import('../src/client/fetcher')
    const fetcher = createFetchFetcher({
      baseUrl: 'https://hub.example.com',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    })
    await expect(fetcher.get('/x')).rejects.toThrow(/403/)
  })
})
