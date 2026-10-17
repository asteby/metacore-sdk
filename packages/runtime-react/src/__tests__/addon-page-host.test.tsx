// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
    addonSubpath,
    createPageChromeStore,
    resolveAddonPath,
    useAddonLocation,
    useAddonNavigate,
    useAddonSearchParams,
    useBreadcrumbs,
    useHostApi,
    useHostContext,
    usePageChrome,
} from '../addon-page-host'
import { createMockHostApi, renderWithHost } from '../testing'

afterEach(cleanup)

describe('resolveAddonPath', () => {
    const base = '/a/shipping/control-tower'
    it('plain paths are base-relative and cannot escape the base', () => {
        expect(resolveAddonPath(base, 'shipments/1', 'shipments/42')).toBe(`${base}/shipments/42`)
        expect(resolveAddonPath(base, 'x', '/shipments/42')).toBe(`${base}/shipments/42`)
        expect(resolveAddonPath(base, 'x', '../../../admin')).toBe(`${base}/admin`)
    })
    it('./ and ../ resolve against the current sub-path', () => {
        expect(resolveAddonPath(base, 'shipments/1', './2')).toBe(`${base}/shipments/2`)
        expect(resolveAddonPath(base, 'shipments/1/events', '../edit')).toBe(`${base}/shipments/edit`)
    })
    it('keeps query/hash and the current path for "?…"', () => {
        expect(resolveAddonPath(base, 'shipments', '?carrier=dhl')).toBe(`${base}/shipments?carrier=dhl`)
        expect(resolveAddonPath(base, '', '')).toBe(base)
        expect(resolveAddonPath('/', '', 'x')).toBe('/x')
    })
    it('addonSubpath strips the base', () => {
        expect(addonSubpath(base, `${base}/shipments/42`)).toBe('shipments/42')
        expect(addonSubpath(base, base)).toBe('')
        expect(addonSubpath(base, '/other')).toBe('')
    })
})

function Probe() {
    const api = useHostApi()
    const ctx = useHostContext()
    const navigate = useAddonNavigate()
    const loc = useAddonLocation()
    const [params, setParams] = useAddonSearchParams()
    useBreadcrumbs([{ title: 'Envíos', url: '/m/Shipment' }])
    usePageChrome({
        title: 'Torre de envíos',
        focus: true,
        actions: [{ key: 'refresh', label: 'Actualizar', onSelect: () => navigate('?refreshed=1') }],
    })
    return (
        <div>
            <span data-testid="org">{ctx.org?.name}</span>
            <span data-testid="path">{loc.path}</span>
            <span data-testid="carrier">{params.get('carrier')}</span>
            <span data-testid="has-get">{typeof api.get}</span>
            <button onClick={() => navigate('shipments/42')}>go</button>
            <button onClick={() => setParams({ carrier: 'fedex' })}>filter</button>
        </div>
    )
}

describe('AddonPageHost hooks', () => {
    it('expose host context, location and navigation through the host router', () => {
        const r = renderWithHost(<Probe />, {
            basePath: '/a/shipping/control-tower',
            pathname: '/a/shipping/control-tower/shipments',
            search: '?carrier=dhl',
        })
        expect(screen.getByTestId('org').textContent).toBe('Org de prueba')
        expect(screen.getByTestId('path').textContent).toBe('shipments')
        expect(screen.getByTestId('carrier').textContent).toBe('dhl')
        expect(screen.getByTestId('has-get').textContent).toBe('function')
        fireEvent.click(screen.getByText('go'))
        fireEvent.click(screen.getByText('filter'))
        expect(r.navigate.calls).toEqual([
            ['/a/shipping/control-tower/shipments/42', undefined],
            ['/a/shipping/control-tower/shipments?carrier=fedex', { replace: true }],
        ])
    })

    it('publishes chrome and breadcrumbs, with stable action handlers, and clears them on unmount', () => {
        const r = renderWithHost(<Probe />)
        const state = r.chrome.get()
        expect(state.title).toBe('Torre de envíos')
        expect(state.focus).toBe(true)
        expect(state.breadcrumbs).toEqual([{ title: 'Envíos', url: '/m/Shipment' }])
        act(() => state.actions![0].onSelect())
        expect(r.navigate.calls.at(-1)?.[0]).toBe('/a/test/page?refreshed=1')
        r.unmount()
        expect(r.chrome.get().title).toBeUndefined()
        expect(r.chrome.get().breadcrumbs).toEqual([])
    })

    it('hooks fail loudly outside a host', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Probe />)).toThrow(/inside <AddonPageHost>/)
        spy.mockRestore()
    })

    it('mock host api records calls and 404s unknown routes', async () => {
        const api = createMockHostApi({ get: { '/data/Shipment': { success: true, data: [] } } })
        await expect(api.get('/data/Shipment?f_x=1')).resolves.toEqual({ success: true, data: [] })
        await expect(api.get('/nope')).rejects.toMatchObject({ status: 404 })
        expect(api.calls[0]).toEqual(['get', '/data/Shipment?f_x=1', undefined])
    })

    it('chrome store notifies subscribers', () => {
        const store = createPageChromeStore()
        let n = 0
        const off = store.subscribe(() => n++)
        store.set({ title: 'x' })
        off()
        store.set({ title: 'y' })
        expect(n).toBe(1)
    })
})

