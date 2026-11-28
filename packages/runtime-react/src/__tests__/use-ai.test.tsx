// @vitest-environment happy-dom
// useAI: ai.complete from a federated page. No Pulse is a result the page
// renders; only caller bugs throw.
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { HostApiError, type AIResult } from '@asteby/metacore-sdk'
import { AddonPageHost } from '../addon-page-host'
import { createMockHostApi } from '../testing'
import { useAI } from '../use-ai'

const host = {
    org: { id: 'org_test' },
    user: { id: 'u', name: 'Operador' },
    locale: 'es-MX',
    installedAddons: [],
}

function wrap(api: ReturnType<typeof createMockHostApi>) {
    return ({ children }: { children: ReactNode }) => (
        <AddonPageHost host={host} api={api} basePath="/a/tickets" location={{ pathname: '/a/tickets', search: '' }} navigate={() => {}}>
            {children}
        </AddonPageHost>
    )
}

const ok: AIResult<{ priority: string }> = {
    status: 'ok',
    content: '{"priority":"high"}',
    json: { priority: 'high' },
    usage: { input_tokens: 3, output_tokens: 2 },
    cost_sparks: 2,
}

describe('useAI', () => {
    it('runs a completion through the host and keeps the result', async () => {
        const api = createMockHostApi({ post: { '/ai/complete': ok } })
        const { result } = renderHook(() => useAI<{ priority: string }>('tickets'), { wrapper: wrap(api) })
        expect(result.current.loading).toBe(false)
        let res: AIResult<{ priority: string }> | undefined
        await act(async () => {
            res = await result.current.complete({ feature: 'ticket_triage', prompt: 'cliente molesto', response_format: { type: 'json_object' } })
        })
        expect(res?.json?.priority).toBe('high')
        expect(result.current.status).toBe('ok')
        expect(result.current.message).toBeNull()
        expect(result.current.loading).toBe(false)
        const [method, path, body] = api.calls[0]
        expect([method, path]).toEqual(['post', '/ai/complete'])
        expect(body).toMatchObject({ addon: 'tickets', feature: 'ticket_triage' })
        expect((body as { idempotency_key?: string }).idempotency_key).toBeTruthy()
    })

    it('exposes insufficient_pulse as a status, not an error', async () => {
        const api = createMockHostApi({
            post: { '/ai/complete': { status: 'insufficient_pulse', message: 'Pulse agotado este mes', usage: { input_tokens: 0, output_tokens: 0 }, cost_sparks: 0 } },
        })
        const { result } = renderHook(() => useAI('tickets'), { wrapper: wrap(api) })
        await act(async () => {
            await result.current.complete({ feature: 'ticket_triage', prompt: 'x' })
        })
        expect(result.current.status).toBe('insufficient_pulse')
        expect(result.current.message).toBe('Pulse agotado este mes')
        expect(result.current.error).toBeNull()
    })

    it('throws and records a caller bug', async () => {
        const api = createMockHostApi({
            post: {
                '/ai/complete': () => {
                    throw new HostApiError('addon "tickets" does not declare ai:complete "crm"', 403, { code: 'forbidden' })
                },
            },
        })
        const { result } = renderHook(() => useAI('tickets'), { wrapper: wrap(api) })
        await act(async () => {
            await expect(result.current.complete({ feature: 'crm', prompt: 'x' })).rejects.toMatchObject({ name: 'AICompleteError', code: 'forbidden' })
        })
        expect(result.current.error?.name).toBe('AICompleteError')
        act(() => result.current.reset())
        expect(result.current.error).toBeNull()
        expect(result.current.result).toBeNull()
    })
})
