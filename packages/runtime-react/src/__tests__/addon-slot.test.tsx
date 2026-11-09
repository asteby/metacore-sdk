// @vitest-environment happy-dom
//
// AddonSlot: orden (order, luego priority), aislamiento de fallos entre
// hermanos y del shell, timeout de un remoto colgado, requireIntegrity,
// rango frontend.sdk y unificación con el slot store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { __resetRemoteIntegrityCache, slotStore } from '@asteby/metacore-sdk'



const mf = vi.hoisted(() => ({ registerRemotes: vi.fn(), loadRemote: vi.fn() }))
vi.mock('@module-federation/runtime', () => mf)

import {
    AddonSlot,
    AddonSlotProvider,
    satisfiesSdkRange,
    sortSlotItems,
    resolveSlotTimeout,
    type AddonSlotManifest,
    type AddonSlotFailure,
} from '../slots'

const remote = (text: string) => ({
    default: ({ context, props }: any) => (
        <span data-testid={`remote-${text}`}>
            {text}:{String(context.invoiceId)}:{String(props.tone ?? '')}
        </span>
    ),
})

function manifest(key: string, over: Partial<AddonSlotManifest> = {}, order?: number): AddonSlotManifest {
    return {
        key,
        frontend: { entry: `/api/addons/${key}/remoteEntry.js`},
        contributions: { slots: [{ slot_kind: 'invoice.footer', entry: `./slots/${key}`, order, props: { tone: 'info' } }] },
        ...over,
    }
}

let quiet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
    mf.registerRemotes.mockReset()
    mf.registerRemotes.mockResolvedValue(undefined)
    mf.loadRemote.mockReset()
    __resetRemoteIntegrityCache()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x')))
    quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
    cleanup()
    quiet.mockRestore()
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

function Shell({ manifests, onEvent, ...rest }: { manifests: AddonSlotManifest[]; onEvent?: any } & Record<string, any>) {
    return (
        <AddonSlotProvider manifests={manifests} onEvent={onEvent} {...rest}>
            <nav data-testid="shell">shell</nav>
            <AddonSlot kind="invoice.footer" context={{ invoiceId: 7 }} fallback={(f) => <i data-testid={`fb-${f.addon}`}>{f.reason}</i>} />
        </AddonSlotProvider>
    )
}

describe('AddonSlot', () => {
    it('pinta los remotos con context y props, ordenados por order', async () => {
        mf.loadRemote.mockImplementation(async (id: string) => remote(id.split('/').pop()!))
        const { container } = render(<Shell manifests={[manifest('b', {}, 20), manifest('a', {}, 10)]} />)
        await screen.findByTestId('remote-a')
        await screen.findByTestId('remote-b')
        const order = [...container.querySelectorAll('[data-addon-slot-item]')].map((n) => n.getAttribute('data-addon-slot-item'))
        expect(order).toEqual(['a', 'b'])
        expect(screen.getByTestId('remote-a').textContent).toBe('a:7:info')
    })

    it('un remoto que lanza al renderizar no desmonta a sus hermanos ni al shell', async () => {
        mf.loadRemote.mockImplementation(async (id: string) =>
            id.endsWith('bad')
                ? {
                      default: () => {
                          throw new Error('boom')
                      },
                  }
                : remote('ok'),
        )
        const events: AddonSlotFailure[] = []
        render(
            <Shell
                manifests={[manifest('bad', {}, 1), manifest('ok', {}, 2)]}
                onEvent={(e: string, d: AddonSlotFailure) => {
                    expect(e).toBe('addon_slot_failed')
                    events.push(d)
                }}
            />,
        )
        await screen.findByTestId('remote-ok')
        await screen.findByTestId('fb-bad')
        expect(screen.getByTestId('shell')).toBeTruthy()
        expect(screen.getByTestId('remote-ok')).toBeTruthy()
        expect(events).toEqual([{ addon: 'bad', kind: 'invoice.footer', reason: 'render', message: 'boom' }])
    })

    it('un remoto cuya carga falla emite telemetría y no afecta a los hermanos', async () => {
        mf.loadRemote.mockImplementation(async (id: string) => {
            if (id.endsWith('bad')) throw new Error('404 expose')
            return remote('ok')
        })
        const onEvent = vi.fn()
        render(<Shell manifests={[manifest('bad'), manifest('ok')]} onEvent={onEvent} />)
        await screen.findByTestId('remote-ok')
        await screen.findByTestId('fb-bad')
        expect(onEvent).toHaveBeenCalledWith('addon_slot_failed', expect.objectContaining({ addon: 'bad', reason: 'load' }))
    })

    it('un remoto colgado muestra el fallback tras timeoutMs y el hermano sí pinta', async () => {
        vi.useFakeTimers()
        mf.loadRemote.mockImplementation((id: string) =>
            id.endsWith('slow') ? new Promise(() => {}) : Promise.resolve(remote('ok')),
        )
        const onEvent = vi.fn()
        render(<Shell manifests={[manifest('slow'), manifest('ok')]} onEvent={onEvent} timeoutMs={1500} />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000)
        })
        expect(screen.queryByTestId('fb-slow')).toBeNull()
        expect(screen.getByTestId('remote-ok')).toBeTruthy()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(600)
        })
        expect(screen.getByTestId('fb-slow').textContent).toBe('timeout')
        expect(onEvent).toHaveBeenCalledWith('addon_slot_failed', expect.objectContaining({ addon: 'slow', reason: 'timeout' }))
    })

    it('timeout_ms del manifest manda sobre el del host', async () => {
        vi.useFakeTimers()
        mf.loadRemote.mockImplementation(() => new Promise(() => {}))
        const m = manifest('slow')
        m.contributions!.slots![0].timeout_ms = 1000
        render(<Shell manifests={[m]} timeoutMs={60000} />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1050)
        })
        expect(screen.getByTestId('fb-slow').textContent).toBe('timeout')
    })

    it('requireIntegrity rechaza un remoto sin integrity sin bajarlo; por omisión carga como hoy', async () => {
        mf.loadRemote.mockImplementation(async () => remote('x'))
        const noInt = manifest('x', { frontend: { entry: '/x.js' } })
        const onEvent = vi.fn()
        const { unmount } = render(<Shell manifests={[noInt]} onEvent={onEvent} requireIntegrity />)
        await screen.findByTestId('fb-x')
        expect(screen.getByTestId('fb-x').textContent).toBe('integrity_required')
        expect(mf.loadRemote).not.toHaveBeenCalled()
        unmount()
        render(<Shell manifests={[noInt]} />)
        await screen.findByTestId('remote-x')
    })

    it('integrity real: el hash correcto carga y el incorrecto falla sin montar el remoto', async () => {
        const bytes = new TextEncoder().encode('export default {}')
        const digest = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-384', bytes))))
        vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)))
        vi.spyOn(Object.getPrototypeOf(document.createElement('link').relList), 'supports').mockReturnValue(false) // fuerza la ruta fetch+hash
        mf.loadRemote.mockImplementation(async () => remote('p'))
        const good = manifest('p', { frontend: { entry: '/p.js', integrity: `sha384-${digest}` } })
        const { unmount } = render(<Shell manifests={[good]} requireIntegrity />)
        await screen.findByTestId('remote-p')
        unmount()
        __resetRemoteIntegrityCache()
        mf.loadRemote.mockClear()
        const badHash = btoa(String.fromCharCode(...new Uint8Array(48)))
        const bad = manifest('q', { frontend: { entry: '/q.js', integrity: `sha384-${badHash}` } })
        const onEvent = vi.fn()
        render(<Shell manifests={[bad]} requireIntegrity onEvent={onEvent} />)
        await screen.findByTestId('fb-q')
        expect(mf.loadRemote).not.toHaveBeenCalled()
        expect(onEvent).toHaveBeenCalledWith('addon_slot_failed', expect.objectContaining({ addon: 'q', reason: 'load' }))
    })

    it('timeout_ms 0 o negativo del manifest no anula el timeout del host', async () => {
        vi.useFakeTimers()
        mf.loadRemote.mockImplementation(() => new Promise(() => {}))
        const m = manifest('slow')
        m.contributions!.slots![0].timeout_ms = 0
        render(<Shell manifests={[m]} timeoutMs={2000} />)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2100)
        })
        expect(screen.getByTestId('fb-slow').textContent).toBe('timeout')
    })

    it('frontend.sdk incompatible con el SDK del host: fallback y telemetría, sin cargar', async () => {
        const onEvent = vi.fn()
        const m = manifest('old', { frontend: { entry: '/o.js', sdk: '^3.0.0' } })
        render(<Shell manifests={[m]} onEvent={onEvent} sdkVersion="4.1.0" />)
        await screen.findByTestId('fb-old')
        expect(screen.getByTestId('fb-old').textContent).toBe('sdk_incompatible')
        expect(mf.loadRemote).not.toHaveBeenCalled()
        expect(onEvent).toHaveBeenCalledWith('addon_slot_failed', expect.objectContaining({ reason: 'sdk_incompatible' }))
    })

    it('unifica con el slot store: contribución en proceso ordenada por priority y aislada', async () => {
        mf.loadRemote.mockImplementation(async () => remote('r'))
        const off1 = slotStore.register('invoice.footer', () => <b data-testid="local-hi">hi</b>, { priority: 10, owner: 'localhi' })
        const off2 = slotStore.register(
            'invoice.footer',
            () => {
                throw new Error('local boom')
            },
            { priority: 1, owner: 'localbad' },
        )
        const onEvent = vi.fn()
        const { container } = render(<Shell manifests={[manifest('r', {}, 0)]} onEvent={onEvent} />)
        await screen.findByTestId('remote-r')
        // order 0 empata: priority desc => localhi(10), r(0 en remoto), localbad(1)... remoto tiene priority 0
        const order = [...container.querySelectorAll('[data-addon-slot-item]')].map((n) => n.getAttribute('data-addon-slot-item'))
        expect(order).toEqual(['localhi', 'localbad', 'r'])
        expect(screen.getByTestId('local-hi')).toBeTruthy()
        expect(screen.getByTestId('fb-localbad')).toBeTruthy()
        expect(screen.getByTestId('shell')).toBeTruthy()
        off1()
        off2()
    })

    it('sin manifests ni store no pinta nada', () => {
        const { container } = render(<AddonSlot kind="nada" />)
        expect(container.innerHTML).toBe('')
    })
})

describe('sortSlotItems', () => {
    it('order asc, priority desc, inserción estable', () => {
        const r = sortSlotItems([
            { id: 'a', order: 1, priority: 0 },
            { id: 'b', order: 0, priority: 1 },
            { id: 'c', order: 0, priority: 5 },
            { id: 'd', order: 0, priority: 1 },
        ])
        expect(r.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a'])
    })
})

describe('resolveSlotTimeout', () => {
    it('acota a 1000..30000 y cae al host si no es válido', () => {
        expect(resolveSlotTimeout(5, 9000)).toBe(1000)
        expect(resolveSlotTimeout(99999, 9000)).toBe(30000)
        expect(resolveSlotTimeout(8000, 9000)).toBe(8000)
        expect(resolveSlotTimeout(0, 9000)).toBe(9000)
        expect(resolveSlotTimeout(-1, 9000)).toBe(9000)
        expect(resolveSlotTimeout(NaN, 9000)).toBe(9000)
        expect(resolveSlotTimeout('abc', 9000)).toBe(9000)
        expect(resolveSlotTimeout(undefined, 9000)).toBe(9000)
    })
})

describe('satisfiesSdkRange', () => {
    it.each([
        ['4.1.0', '^4.0.0', true],
        ['4.1.0', '^3.0.0', false],
        ['3.18.1', '~3.18', true],
        ['3.19.0', '~3.18.0', false],
        ['3.5.0', '>=3.2 <5', true],
        ['5.0.0', '>=3.2 <5', false],
        ['3.9.9', '3.x', true],
        ['4.0.0', '^3 || ^4', true],
        ['0.2.5', '^0.2.1', true],
        ['0.3.0', '^0.2.1', false],
    ])('%s vs %s => %s', (v, r, want) => {
        expect(satisfiesSdkRange(v, r as string)).toBe(want)
    })
    it('desconocido => null (no bloquea)', () => {
        expect(satisfiesSdkRange(undefined, '^4')).toBeNull()
        expect(satisfiesSdkRange('4.0.0', undefined)).toBeNull()
        expect(satisfiesSdkRange('4.0.0', 'latest')).toBeNull()
        expect(satisfiesSdkRange('4.0.0', '1.0.0 - 2.0.0')).toBeNull()
    })
})
