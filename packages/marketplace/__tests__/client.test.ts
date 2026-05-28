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

  it('initiateInstall posts addonKey + optional version/instance_id to /install/initiate', async () => {
    const fetcher = makeFetcher()
    // Hub wire shape — install_token + expires_in + verification_url.
    fetcher.responses.set('POST /install/initiate', {
      install_token: 'itk_abc',
      expires_in: 600,
      verification_url: 'https://hub.example/install?itk=itk_abc',
      addon_key: 'fiscal',
      version: '1.0.0',
    })

    const hub = new HubClient({ fetcher })
    const before = Date.now()
    const res = await hub.initiateInstall('fiscal', {
      version: '1.0.0',
      instance_id: '11111111-1111-1111-1111-111111111111',
    })
    const after = Date.now()

    // URL: the install handshake lives on its own path, addon key is in
    // the body (NOT a URL segment).
    expect(fetcher.calls[0]?.path).toBe('/install/initiate')
    expect(fetcher.calls[0]?.body).toEqual({
      addonKey: 'fiscal',
      version: '1.0.0',
      instance_id: '11111111-1111-1111-1111-111111111111',
    })

    // Response normalisation: install_token → token, expires_in →
    // expires_at (absolute ISO), other fields passed through.
    expect(res.token).toBe('itk_abc')
    expect(res.addon_key).toBe('fiscal')
    expect(res.version).toBe('1.0.0')
    expect(res.verification_url).toBe(
      'https://hub.example/install?itk=itk_abc',
    )
    const expMs = Date.parse(res.expires_at)
    // 600s window, ±a few ms of test clock drift.
    expect(expMs).toBeGreaterThanOrEqual(before + 600 * 1000 - 50)
    expect(expMs).toBeLessThanOrEqual(after + 600 * 1000 + 50)
  })

  it('initiateInstall omits optional fields when not provided', async () => {
    const fetcher = makeFetcher()
    fetcher.responses.set('POST /install/initiate', {
      install_token: 'itk_x',
      expires_in: 600,
      verification_url: 'https://hub.example/install?itk=itk_x',
      addon_key: 'fiscal',
      version: '2.0.0',
    })

    const hub = new HubClient({ fetcher })
    await hub.initiateInstall('fiscal')
    expect(fetcher.calls[0]?.body).toEqual({ addonKey: 'fiscal' })
  })

  it('initiateInstall unwraps an enveloped hub response', async () => {
    const fetcher = makeFetcher()
    fetcher.responses.set('POST /install/initiate', {
      success: true,
      data: {
        install_token: 'itk_env',
        expires_in: 600,
        verification_url: 'https://hub.example/install?itk=itk_env',
        addon_key: 'fiscal',
        version: '1.0.0',
      },
    })
    const hub = new HubClient({ fetcher })
    const res = await hub.initiateInstall('fiscal', { version: '1.0.0' })
    expect(res.token).toBe('itk_env')
    expect(res.addon_key).toBe('fiscal')
  })

  it('installPath override is honored', async () => {
    const fetcher = makeFetcher()
    fetcher.responses.set('POST /custom/handshake', {
      install_token: 'itk_y',
      expires_in: 600,
      verification_url: '',
      addon_key: 'fiscal',
      version: '1.0.0',
    })
    const hub = new HubClient({ fetcher, installPath: '/custom/handshake' })
    await hub.initiateInstall('fiscal')
    expect(fetcher.calls[0]?.path).toBe('/custom/handshake')
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
    const res = await fetcher.post<{ ok: boolean }>('/install/initiate', {
      addonKey: 'fiscal',
    })
    expect(res).toEqual({ ok: true })
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('https://hub.example.com/api/install/initiate')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers).toMatchObject({ authorization: 'Bearer x' })
    expect(call[1].body).toBe('{"addonKey":"fiscal"}')
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
