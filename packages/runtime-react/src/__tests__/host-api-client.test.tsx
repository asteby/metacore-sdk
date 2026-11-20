// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HostApiError } from '@asteby/metacore-sdk'
import type { HostApi } from '@asteby/metacore-sdk'
import { ApiError, isAbortError } from '@asteby/metacore-lib/envelope'
import { createHostApiClient } from '../host-api-client'
import { HostApiProvider } from '../host-api-context'
import { useHostApiClient } from '../use-host-api-client'
import { createMockHostApi } from '../testing'

const stub = (over: Partial<HostApi>): HostApi => ({ ...createMockHostApi(), ...over }) as HostApi

describe('createHostApiClient', () => {
    it('unwraps the envelope and keeps bare bodies', async () => {
        const c = createHostApiClient(
            stub({
                get: (async (p: string) =>
                    p === '/a' ? { success: true, data: { id: 1 }, meta: { total: 9 } } : { x: 1 }) as never,
            }),
        )
        expect(await c.get('/a')).toEqual({ id: 1 })
        expect(await c.get('/b')).toEqual({ x: 1 })
        const l = await c.list('/a')
        expect(l.items).toEqual([])
    })

    it('list returns items and meta.total', async () => {
        const c = createHostApiClient(
            stub({ get: (async () => ({ success: true, data: [1, 2], meta: { total: 9 } })) as never }),
        )
        const l = await c.list<number>('/x')
        expect(l.items).toEqual([1, 2])
        expect(l.total).toBe(9)
    })

    it('throws ApiError on success:false envelope', async () => {
        const c = createHostApiClient(stub({ post: (async () => ({ success: false, message: 'nope' })) as never }))
        await expect(c.post('/x', {})).rejects.toMatchObject({ name: 'ApiError', message: 'nope' })
    })

    it('maps HostApiError (401) to ApiError with status and code', async () => {
        const c = createHostApiClient(
            stub({ get: (async () => { throw new HostApiError('Unauthorized', 401, { code: 'token_expired' }) }) as never }),
        )
        const e = await c.get('/x').catch((x) => x)
        expect(e).toBeInstanceOf(ApiError)
        expect(e.status).toBe(401)
        expect(e.code).toBe('token_expired')
    })

    it('forwards params and signal, and keeps abort as AbortError', async () => {
        const ctrl = new AbortController()
        const get = vi.fn(async (_p: string, o?: { signal?: AbortSignal }) => {
            ctrl.abort()
            throw new HostApiError('Network error', 0)
            void o
        })
        const c = createHostApiClient(stub({ get: get as never }))
        const e = await c.get('/x', { params: { q: 'a' }, signal: ctrl.signal }).catch((x) => x)
        expect(get).toHaveBeenCalledWith('/x', { params: { q: 'a' }, signal: ctrl.signal })
        expect(isAbortError(e)).toBe(true)
    })

    it('passes through a native abort error from the transport', async () => {
        const abort = Object.assign(new Error('x'), { name: 'AbortError' })
        const c = createHostApiClient(stub({ get: (async () => { throw abort }) as never }))
        expect(await c.get('/x').catch((x) => x)).toBe(abort)
    })

    it('upload sends multipart FormData with file and fields', async () => {
        const post = vi.fn(async () => ({ success: true, data: { url: '/storage/a.png' } }))
        const c = createHostApiClient(stub({ post: post as never }))
        const out = await c.upload<{ url: string }>('/upload', new File(['x'], 'a.png'), { folder: 'f' })
        expect(out.url).toBe('/storage/a.png')
        const form = (post.mock.calls[0] as unknown[])[1] as FormData
        expect(form).toBeInstanceOf(FormData)
        expect((form.get('file') as File).name).toBe('a.png')
        expect(form.get('folder')).toBe('f')
        const own = new FormData()
        await c.upload('/upload', own)
        expect((post.mock.calls[1] as unknown[])[1]).toBe(own)
    })

    it('blob requests responseType blob', async () => {
        const get = vi.fn(async () => new Blob(['pdf']))
        const c = createHostApiClient(stub({ get: get as never }))
        expect(await c.blob('/d.pdf')).toBeInstanceOf(Blob)
        expect(get).toHaveBeenCalledWith('/d.pdf', { responseType: 'blob' })
    })

    it('axiosLike keeps the envelope in data', async () => {
        const env = { success: true, data: [1] }
        const c = createHostApiClient(stub({ get: (async () => env) as never }))
        expect(await c.axiosLike().get('/x')).toEqual({ data: env })
    })
})

import { afterEach } from 'vitest'
afterEach(cleanup)
describe('useHostApiClient', () => {
    function Probe() {
        const c = useHostApiClient()
        return <span>{typeof c.get}</span>
    }
    it('resolves from HostApiProvider', () => {
        render(
            <HostApiProvider api={createMockHostApi()}>
                <Probe />
            </HostApiProvider>,
        )
        expect(screen.getByText('function')).toBeTruthy()
    })
    it('throws a clear error without a host (no localStorage fallback)', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Probe />)).toThrow(/HostApiProvider/)
        spy.mockRestore()
    })
})

describe('request headers', () => {
    it('merges defaultHeaders with per-call headers (per-call wins) and passes them to the HostApi', async () => {
        const get = vi.fn(async () => ({ ok: 1 }))
        const c = createHostApiClient(stub({ get: get as never }), { defaultHeaders: { 'X-A': '1', 'X-B': '1' } })
        await c.get('/x', { headers: { 'X-B': '2', 'X-Correlation-ID': 'cid' } })
        expect(get).toHaveBeenCalledWith('/x', { headers: { 'X-A': '1', 'X-B': '2', 'X-Correlation-ID': 'cid' } })
    })

    it('is additive: no headers means the config is untouched', async () => {
        const post = vi.fn(async () => ({}))
        const c = createHostApiClient(stub({ post: post as never }))
        await c.post('/x', { a: 1 })
        expect(post).toHaveBeenCalledWith('/x', { a: 1 }, undefined)
    })
})
