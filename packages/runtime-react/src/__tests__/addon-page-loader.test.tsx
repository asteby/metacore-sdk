// @vitest-environment happy-dom
//
// AddonPageLoader + FederatedErrorBoundary: the page's expose is loaded through
// the MF runtime (mocked), SRI mismatches fail without retries, render crashes
// stay inside the boundary and the shell around them keeps rendering.
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { __resetRemoteIntegrityCache, definePage, type FrontendPage } from '@asteby/metacore-sdk'

const mf = vi.hoisted(() => ({
    registerRemotes: vi.fn(),
    loadRemote: vi.fn(),
}))
vi.mock('@module-federation/runtime', () => mf)

import { AddonPageLoader } from '../addon-page-loader'
import { FederatedErrorBoundary } from '../federated-error-boundary'
import { useHostApi, usePageChrome } from '../addon-page-host'
import { createMockHostApi } from '../testing'

const page: FrontendPage = {
    key: 'control_tower',
    path: 'control-tower',
    expose: './pages/control-tower',
    title: 'shipping.pages.control_tower',
}

let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
    mf.registerRemotes.mockReset()
    mf.loadRemote.mockReset()
    __resetRemoteIntegrityCache()
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
    cleanup()
    quiet.mockRestore()
    vi.unstubAllGlobals()
})

let n = 0
function mount(extra: Partial<React.ComponentProps<typeof AddonPageLoader>> = {}) {
    n += 1
    const onError = vi.fn()
    const utils = render(
        <div>
            <nav data-testid="shell-sidebar">sidebar</nav>
            <AddonPageLoader
                scope={`metacore_shipping_${n}`}
                url={`/api/metacore/addons/shipping/frontend/remoteEntry.js?v=${n}`}
                addonKey="shipping"
                page={page}
                basePath="/a/shipping/control-tower"
                host={{ locale: 'es-MX' }}
                api={createMockHostApi()}
                location={{ pathname: '/a/shipping/control-tower/shipments/42', search: '' }}
                navigate={() => {}}
                onError={onError}
                {...extra}
            />
        </div>,
    )
    return { ...utils, onError }
}

describe('AddonPageLoader', () => {
    it('loads the page expose and renders it with AddonPageProps + host hooks', async () => {
        const Tower = definePage(({ basePath, params, page: p }) => {
            const api = useHostApi()
            usePageChrome({ title: 'Torre' })
            return (
                <p data-testid="page">
                    {basePath}|{params['*']}|{p.key}|{typeof api.capability}
                </p>
            )
        })
        mf.loadRemote.mockResolvedValue({ default: Tower })
        mount()
        expect(screen.getByTestId('addon-page-skeleton')).toBeTruthy()
        await waitFor(() => expect(screen.getByTestId('page')).toBeTruthy())
        expect(screen.getByTestId('page').textContent).toBe(
            '/a/shipping/control-tower|shipments/42|control_tower|function',
        )
        expect(mf.registerRemotes).toHaveBeenCalledTimes(1)
        expect(mf.loadRemote.mock.calls[0][0]).toMatch(/^metacore_shipping_\d+\/pages\/control-tower$/)
    })

    it('contains a crashing page: the shell stays, the incident is reported, retry re-renders', async () => {
        let crash = true
        const Boom = definePage(() => {
            if (crash) throw new Error('kaboom')
            return <p data-testid="recovered">ok</p>
        })
        mf.loadRemote.mockResolvedValue({ default: Boom })
        const { onError } = mount()
        await waitFor(() => expect(screen.getByTestId('federated-error')).toBeTruthy())
        expect(screen.getByTestId('shell-sidebar')).toBeTruthy()
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'kaboom' }),
            expect.objectContaining({ addonKey: 'shipping', expose: './pages/control-tower', phase: 'render' }),
        )
        crash = false
        fireEvent.click(screen.getByText('Reintentar'))
        await waitFor(() => expect(screen.getByTestId('recovered')).toBeTruthy())
    })

    it('a module without a default page shows the load error and retry reloads', async () => {
        mf.loadRemote.mockResolvedValueOnce({ notAPage: 1 })
        const { onError } = mount()
        await waitFor(() => expect(screen.getByTestId('federated-error')).toBeTruthy())
        expect(onError.mock.calls[0][1]).toMatchObject({ phase: 'load' })
        mf.loadRemote.mockResolvedValueOnce({ default: definePage(() => <p data-testid="page">ok</p>) })
        fireEvent.click(screen.getByText('Reintentar'))
        await waitFor(() => expect(screen.getByTestId('page')).toBeTruthy())
    })

    it('refuses a remote whose bytes do not match frontend.integrity (no MF import, no retries)', async () => {
        const genuine = 'export const init = () => {}'
        const integrity = `sha384-${createHash('sha384').update(genuine).digest('base64')}`
        const fetchMock = vi.fn(async () => new Response('alert("tampered")'))
        vi.stubGlobal('fetch', fetchMock)
        // The browser would reject the modulepreload on the hash mismatch.
        const append = document.head.appendChild.bind(document.head)
        const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
            const out = append(node)
            if (node instanceof HTMLLinkElement && node.rel === 'modulepreload') {
                expect(node.integrity).toBe(integrity)
                setTimeout(() => node.onerror?.(new Event('error')), 0)
            }
            return out
        })
        mf.loadRemote.mockResolvedValue({ default: definePage(() => <p>never</p>) })
        const { onError } = mount({ integrity })
        await waitFor(() => expect(onError).toHaveBeenCalled())
        expect(onError.mock.calls[0][0].name).toBe('RemoteIntegrityError')
        expect(mf.registerRemotes).not.toHaveBeenCalled()
        expect(mf.loadRemote).not.toHaveBeenCalled()
        // modulepreload is attempted first; on its failure one diagnostic fetch.
        expect(fetchMock).toHaveBeenCalledTimes(1)
        spy.mockRestore()
    })

    it('mounts a remote whose modulepreload passed the integrity check', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const append = document.head.appendChild.bind(document.head)
        const spy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
            const out = append(node)
            if (node instanceof HTMLLinkElement && node.rel === 'modulepreload') {
                setTimeout(() => node.onload?.(new Event('load')), 0)
            }
            return out
        })
        mf.loadRemote.mockResolvedValue({ default: definePage(() => <p data-testid="page">ok</p>) })
        mount({ integrity: 'sha384-AAAA' })
        await waitFor(() => expect(screen.getByTestId('page')).toBeTruthy())
        expect(fetchMock).not.toHaveBeenCalled()
        spy.mockRestore()
    })

    it('times out a hung remote', async () => {
        mf.loadRemote.mockReturnValue(new Promise(() => {}))
        const { onError } = mount({ timeoutMs: 30 })
        await waitFor(() => expect(onError).toHaveBeenCalled())
        expect(onError.mock.calls[0][0].message).toMatch(/did not load within 30 ms/)
    })
})

describe('FederatedErrorBoundary', () => {
    it('resets when resetKeys change and survives a throwing reporter', () => {
        const Boom = ({ fail }: { fail: boolean }) => {
            if (fail) throw new Error('x')
            return <p data-testid="fine">fine</p>
        }
        const { rerender } = render(
            <FederatedErrorBoundary resetKeys={['v1']} onError={() => { throw new Error('reporter down') }}>
                <Boom fail />
            </FederatedErrorBoundary>,
        )
        expect(screen.getByRole('alert')).toBeTruthy()
        rerender(
            <FederatedErrorBoundary resetKeys={['v2']}>
                <Boom fail={false} />
            </FederatedErrorBoundary>,
        )
        expect(screen.getByTestId('fine')).toBeTruthy()
    })

    it('accepts a custom fallback', () => {
        const Boom = () => {
            throw new Error('bad')
        }
        render(
            <FederatedErrorBoundary fallback={({ error }) => <span data-testid="custom">{error.message}</span>}>
                <Boom />
            </FederatedErrorBoundary>,
        )
        expect(screen.getByTestId('custom').textContent).toBe('bad')
    })
})
