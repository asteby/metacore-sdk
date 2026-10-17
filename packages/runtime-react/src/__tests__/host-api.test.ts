// createHostApi is the boundary between the host transport (axios with the
// bearer token in config.headers) and remote code: bodies only, sanitized errors.
import { describe, expect, it, vi } from 'vitest'
import { HostApiError } from '@asteby/metacore-sdk'
import { createHostApi, toHostApiError } from '../host-api'
import type { ApiClient } from '../api-context'

const TOKEN = 'Bearer secret-jwt'

function axiosLike(): ApiClient & { patch: ApiClient['put'] } {
    const respond = (url: string, data: unknown) =>
        Promise.resolve({
            data,
            headers: { 'x-thing': '1' },
            config: { url, headers: { Authorization: TOKEN } },
        })
    return {
        get: vi.fn((url: string) => respond(url, { success: true, data: [{ id: 1 }] })),
        post: vi.fn((url: string, body?: unknown) => respond(url, { echo: body })),
        put: vi.fn((url: string) => respond(url, { ok: true })),
        patch: vi.fn((url: string) => respond(url, { patched: true })),
        delete: vi.fn((url: string) => respond(url, { deleted: true })),
    }
}

describe('createHostApi', () => {
    it('resolves to the body only (no headers, no config with the token)', async () => {
        const api = createHostApi(axiosLike())
        const body = await api.get('/data/Shipment')
        expect(body).toEqual({ success: true, data: [{ id: 1 }] })
        expect(JSON.stringify(body)).not.toContain('secret-jwt')
        expect(await api.patch('/data/Shipment/1', { a: 1 })).toEqual({ patched: true })
        expect(await api.delete('/data/Shipment/1')).toEqual({ deleted: true })
    })

    it('forwards params and signal, nothing else', async () => {
        const client = axiosLike()
        const api = createHostApi(client)
        const ctrl = new AbortController()
        await api.get('/data/Shipment', { params: { f_status: 'eq:late' }, signal: ctrl.signal })
        expect(client.get).toHaveBeenCalledWith('/data/Shipment', { params: { f_status: 'eq:late' }, signal: ctrl.signal })
        await api.get('/plain')
        expect(client.get).toHaveBeenLastCalledWith('/plain')
    })

    it('posts capability queries to the host endpoint', async () => {
        const client = axiosLike()
        const api = createHostApi(client, { capabilityPath: '/caps' })
        const out = await api.capability('commerce.shipping.track', { tracking_number: 'X1' })
        expect(client.post).toHaveBeenCalledWith('/caps', {
            capability: 'commerce.shipping.track',
            input: { tracking_number: 'X1' },
        })
        expect(out).toEqual({ echo: { capability: 'commerce.shipping.track', input: { tracking_number: 'X1' } } })
    })

    it('is frozen: a remote cannot swap methods for the next remote', () => {
        const api = createHostApi(axiosLike())
        expect(Object.isFrozen(api)).toBe(true)
    })

    it('re-throws transport errors without config/request (no token leak)', async () => {
        const client = axiosLike()
        client.post = vi.fn(() =>
            Promise.reject({
                message: 'Request failed with status code 422',
                config: { headers: { Authorization: TOKEN } },
                request: { _header: `Authorization: ${TOKEN}` },
                response: { status: 422, data: { message: 'Paquetería inválida', code: 'invalid_carrier' } },
            }),
        )
        const api = createHostApi(client)
        const err = await api.post('/data/Shipment', {}).catch((e) => e)
        expect(err).toBeInstanceOf(HostApiError)
        expect(err.status).toBe(422)
        expect(err.code).toBe('invalid_carrier')
        expect(err.message).toBe('Paquetería inválida')
        expect(JSON.stringify({ ...err, message: err.message })).not.toContain('secret-jwt')
        expect('config' in err).toBe(false)
    })

    it('maps network errors to status 0', () => {
        const e = toHostApiError(new TypeError('Failed to fetch'))
        expect(e.status).toBe(0)
        expect(e.message).toBe('Network error')
    })
})
