/**
 * Cache coherence in the marketplace package: the fetcher reports the server's
 * cache epoch and retries a stale prepared plan once; install / upgrade /
 * uninstall invalidate everything the addon touches, not just the marketplace
 * slice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type PropsWithChildren } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MarketplaceProvider } from '../src/providers/MarketplaceProvider'
import { createFetchFetcher } from '../src/client/fetcher'
import { invalidateAddon, queryKeyMentionsAddon } from '../src/hooks/invalidate'
import { useInstallAddon } from '../src/hooks/useInstallAddon'
import { useUpgradeAddon } from '../src/hooks/useUpgradeAddon'
import { useUninstallAddon } from '../src/hooks/useUninstallAddon'

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

describe('fetcher', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports X-Cache-Epoch on the window protocol and revalidates GETs', async () => {
    const events: string[] = []
    const target = new EventTarget()
    vi.stubGlobal('window', Object.assign(target, { dispatchEvent: target.dispatchEvent.bind(target) }))
    target.addEventListener('metacore:cache-epoch-observed', (e) => events.push((e as CustomEvent).detail.epoch))
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true }, { 'X-Cache-Epoch': 'tok.1.2' })))
    const fetcher = createFetchFetcher({ baseUrl: 'https://ops.example.com/api', fetchImpl: fetchSpy as unknown as typeof fetch })
    await fetcher.get('/installations')
    await fetcher.post('/installations/crm', {})
    expect(events).toEqual(['tok.1.2', 'tok.1.2'])
    expect(fetchSpy.mock.calls[0][1].cache).toBe('no-cache')
    expect(fetchSpy.mock.calls[1][1].cache).toBeUndefined()
  })

  it('retries ONCE when the server answers with a stale prepared plan', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('ERROR: cached plan must not change result type (SQLSTATE 0A000)', { status: 500, statusText: 'Internal' }))
      .mockResolvedValueOnce(json({ items: [] }))
    const fetcher = createFetchFetcher({ baseUrl: 'https://ops.example.com', fetchImpl: fetchSpy as unknown as typeof fetch })
    const p = fetcher.get('/catalog')
    await vi.advanceTimersByTimeAsync(300)
    await expect(p).resolves.toEqual({ items: [] })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('does not loop on a persistent stale error, nor retry ordinary failures', async () => {
    vi.useFakeTimers()
    const stale = () => new Response('cached plan must not change result type', { status: 500 })
    const spy = vi.fn().mockImplementation(() => Promise.resolve(stale()))
    const fetcher = createFetchFetcher({ baseUrl: 'https://x', fetchImpl: spy as unknown as typeof fetch })
    const p = fetcher.get('/a').catch((e) => e)
    await vi.advanceTimersByTimeAsync(300)
    expect(await p).toBeInstanceOf(Error)
    expect(spy).toHaveBeenCalledTimes(2)

    const forbidden = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }))
    const f2 = createFetchFetcher({ baseUrl: 'https://x', fetchImpl: forbidden as unknown as typeof fetch })
    await expect(f2.get('/a')).rejects.toThrow(/403/)
    expect(forbidden).toHaveBeenCalledTimes(1)
  })
})

describe('invalidateAddon', () => {
  it('matches keys that mention the addon', () => {
    expect(queryKeyMentionsAddon(['crm'], 'crm')).toBe(true)
    expect(queryKeyMentionsAddon(['data', 'crm.Lead'], 'crm')).toBe(true)
    expect(queryKeyMentionsAddon(['x', { url: '/addons/crm/settings' }], 'crm')).toBe(true)
    expect(queryKeyMentionsAddon(['data', 'crmx.Lead'], 'crm')).toBe(false)
    expect(queryKeyMentionsAddon(['data'], '')).toBe(false)
  })

  it('invalidates the addon, the marketplace namespace and the shell roots only', async () => {
    const qc = new QueryClient()
    for (const k of [['crm', 'leads'], ['data', 'crm.Lead'], ['marketplace', 'installed'], ['navigation'], ['permissions', 'me'], ['data', 'pos.Order'], ['customers']]) {
      qc.setQueryData(k, 1)
    }
    await invalidateAddon(qc, 'crm')
    const inv = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated
    expect([inv(['crm', 'leads']), inv(['data', 'crm.Lead']), inv(['marketplace', 'installed']), inv(['navigation']), inv(['permissions', 'me'])]).toEqual([true, true, true, true, true])
    expect(inv(['data', 'pos.Order'])).toBeFalsy()
    expect(inv(['customers'])).toBeFalsy()
  })
})

describe('mutations refresh the whole app, not just the marketplace slice', () => {
  let qc: QueryClient
  const hub = { initiateInstall: vi.fn().mockResolvedValue({ token: 't' }) }
  const ops = {
    claimInstall: vi.fn().mockResolvedValue({ addon_key: 'crm' }),
    upgrade: vi.fn().mockResolvedValue({ addon_key: 'crm' }),
    uninstall: vi.fn().mockResolvedValue(undefined),
  }
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    for (const k of [['navigation'], ['data', 'crm.Lead'], ['data', 'pos.Order']]) qc.setQueryData(k, 1)
  })

  function run<T>(useHook: () => { mutateAsync: (v: any) => Promise<unknown> }, input: unknown) {
    let hook!: { mutateAsync: (v: any) => Promise<unknown> }
    function Probe() {
      hook = useHook()
      return null
    }
    renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(MarketplaceProvider as any, { hub, ops } as any, createElement(Probe)),
      ),
    )
    return hook.mutateAsync(input) as Promise<T>
  }

  const inv = (k: unknown[]) => qc.getQueryState(k)?.isInvalidated

  it('install', async () => {
    await run(useInstallAddon, { key: 'crm' })
    expect(inv(['navigation'])).toBe(true)
    expect(inv(['data', 'crm.Lead'])).toBe(true)
    expect(inv(['data', 'pos.Order'])).toBeFalsy()
  })
  it('upgrade', async () => {
    await run(useUpgradeAddon, { key: 'crm', target_version: '2.0.0', accepted_capabilities: [] })
    expect(inv(['navigation'])).toBe(true)
    expect(inv(['data', 'crm.Lead'])).toBe(true)
  })
  it('uninstall', async () => {
    await run(useUninstallAddon, { key: 'crm' })
    expect(inv(['navigation'])).toBe(true)
    expect(inv(['data', 'crm.Lead'])).toBe(true)
    expect(inv(['data', 'pos.Order'])).toBeFalsy()
  })
})
