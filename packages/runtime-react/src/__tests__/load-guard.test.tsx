// @vitest-environment happy-dom
//
// Loading states must resolve: a request that fails or never answers turns the
// skeleton into an actionable error (message + retry) instead of an eternal
// placeholder. Covers the shared guard in DashboardGrid and DynamicTable.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub

import { ApiProvider, type ApiClient } from '../api-context'
import { DashboardGrid } from '../dashboard-grid'
import { DynamicTable } from '../dynamic-table'

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

const widgets = [{ key: 'k1', kind: 'stat', title: 'Revenue' }] as any

describe('DashboardGrid — loading guard', () => {
    it('shows skeletons with aria-busy while loading', () => {
        render(<DashboardGrid widgets={widgets} loadData={() => new Promise(() => {})} />)
        expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    })

    it('a request that never resolves turns into an error with retry after the timeout', async () => {
        const loadData = vi.fn(() => new Promise<any>(() => {}))
        render(<DashboardGrid widgets={widgets} loadData={loadData} loadTimeoutMs={100} />)
        expect(screen.queryByRole('alert')).toBeNull()
        expect(await screen.findByRole('alert')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
        expect(loadData).toHaveBeenCalledTimes(2)
        // retry restarts the loading state (skeleton again, no stale alert)
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('a rejected batch shows the error and retry recovers', async () => {
        const loadData = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce({ k1: { value: 5 } })
        render(<DashboardGrid widgets={widgets} loadData={loadData} />)
        const retry = await screen.findByRole('button', { name: 'Retry' })
        fireEvent.click(retry)
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
        expect(loadData).toHaveBeenCalledTimes(2)
    })

    it('timeoutMs=0 disables the guard', async () => {
        render(<DashboardGrid widgets={widgets} loadData={() => new Promise(() => {})} loadTimeoutMs={0} />)
        await new Promise((r) => setTimeout(r, 300))
        expect(screen.queryByRole('alert')).toBeNull()
    })
})

describe('DynamicTable — metadata that never resolves', () => {
    it('shows an error with retry (not an endless skeleton) and retry refetches metadata', async () => {
        const get = vi.fn(() => new Promise<any>(() => {}))
        const client = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <DynamicTable model="guard_never" enableUrlSync={false} loadTimeoutMs={150} />
            </ApiProvider>,
        )
        expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
        expect(await screen.findByRole('alert')).toBeTruthy()
        const before = get.mock.calls.length
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
        await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(before))
    })

    it('a failed metadata request shows the error state with retry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const get = vi.fn(async () => {
            throw new Error('down')
        })
        const client = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <DynamicTable model="guard_fail" enableUrlSync={false} />
            </ApiProvider>,
        )
        expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    })
})
