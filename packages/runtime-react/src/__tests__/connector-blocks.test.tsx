// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const dict: Record<string, string> = {
        'mp.section.connection': 'Conexión',
        'mp.section.advanced': 'Avanzado',
        'mp.section.advanced_help': 'Webhooks y modo de pruebas.',
        'mp.field.token': 'Access token',
        'mp.field.secret': 'Secreto del webhook',
        'mp.block.webhook.title': 'URL de notificaciones',
        'mp.block.webhook.panel': 'Abrir panel de Mercado Pago',
        'mp.block.order.label': 'Crear orden de prueba',
        'mp.block.order.title': 'Prueba de cobro',
    }
    const t = (k: string, o?: { defaultValue?: string }) => dict[k] ?? o?.defaultValue ?? k
    return { useTranslation: () => ({ t, i18n: { language: 'es', exists: () => true } }) }
})

import { ApiProvider } from '../api-context'
import { AddonConfigSurface, type ConnectorEntry } from '../setup/addon-config-surface'
import {
    buildWizardSteps,
    hasExplicitTest,
    normalizeBlockResult,
    safeHttpsUrl,
    stepStatus,
} from '../setup/connector-blocks-model'

afterEach(cleanup)

const WEBHOOK = 'https://panel.example.com/api/webhooks/0b6f/mercadopago/notifications'

describe('connector-blocks-model', () => {
    it('normalizes envelopes without inventing success', () => {
        expect(normalizeBlockResult({ success: true, data: { ok: true, message: 'Listo' } })).toEqual({
            status: 'ok',
            message: 'Listo',
            details: [],
        })
        expect(normalizeBlockResult({ success: false, error: { message: 'sin token' } }).status).toBe('error')
        expect(normalizeBlockResult({ success: true, data: {} }, 'falló')).toEqual({ status: 'error', message: 'falló', details: [] })
        // explicit ok:false beats a status that claims success
        expect(normalizeBlockResult({ data: { ok: false, status: 'ok' } }).status).toBe('error')
        const r = normalizeBlockResult({
            success: true,
            data: { ok: true, status: 'pending', details: [{ key: 'id', label: 'ID', value: 123, kind: 'id' }, { value: {} }] },
        })
        expect(r.status).toBe('pending')
        expect(r.details).toEqual([{ key: 'id', label: 'ID', value: '123', kind: 'id' }])
    })

    it('only https URLs become links', () => {
        expect(safeHttpsUrl('https://x.example/a')).toBe('https://x.example/a')
        expect(safeHttpsUrl('http://x.example')).toBeNull()
        expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
        expect(safeHttpsUrl('https://user:pw@x.example')).toBeNull()
    })

    it('a section with only blocks is a step; settings append a last step', () => {
        const steps = buildWizardSteps(
            [{ key: 'a' }, { key: 'b', blocks: [{ key: 'w', kind: 'webhook_url' }] }, { key: 'c' }],
            ['a'],
            true,
        )
        expect(steps.map((s) => s.key)).toEqual(['a', 'b', '__settings'])
        expect(hasExplicitTest([{ key: 'a', blocks: [{ key: 't', kind: 'action', export: 'ping' }] }], 'ping')).toBe(true)
        expect(hasExplicitTest([{ key: 'a' }], 'ping')).toBe(false)
    })

    it('step status: errors win, then verification, then visited', () => {
        const base = { index: 0, current: 1, fieldKeys: ['a'], fieldErrors: {}, blockKeys: ['t'], results: {} }
        expect(stepStatus(base)).toBe('ok')
        expect(stepStatus({ ...base, fieldErrors: { a: 'x' } })).toBe('error')
        expect(stepStatus({ ...base, results: { t: { status: 'error', message: '', details: [] } } })).toBe('error')
        expect(stepStatus({ ...base, index: 1, results: { t: { status: 'ok', message: '', details: [] } } })).toBe('ok')
        expect(stepStatus({ ...base, index: 2 })).toBe('pending')
    })
})

function makeApi(routes: Record<string, any> = {}) {
    const calls: { m: string; url: string; body?: any }[] = []
    const handle = (m: string) => async (url: string, body?: any) => {
        calls.push({ m, url, body })
        const r = routes[`${m} ${url}`]
        if (r instanceof Error) throw r
        return { data: typeof r === 'function' ? r(body) : (r ?? { data: {} }) }
    }
    return { client: { get: handle('GET'), post: handle('POST'), put: handle('PUT'), delete: handle('DELETE') }, calls }
}

const addon = { addon_key: 'mercadopago', manifest: { name: 'Mercado Pago', settings_defs: [] as any[] } }

const mp: ConnectorEntry = {
    addon_key: 'mercadopago',
    provider: 'mercadopago',
    auth: 'token',
    connected: true,
    test_export: 'handle_connector_test',
    form_layout: {
        mode: 'steps',
        sections: [
            { key: 'connection', title: 'mp.section.connection' },
            {
                key: 'advanced',
                title: 'mp.section.advanced',
                description: 'mp.section.advanced_help',
                blocks: [
                    {
                        key: 'webhook_url',
                        kind: 'webhook_url',
                        webhook: 'notifications',
                        title: 'mp.block.webhook.title',
                        value: WEBHOOK,
                        links: [{ label: 'mp.block.webhook.panel', url: 'https://www.mercadopago.com.mx/developers/panel/app' }],
                    },
                    { key: 'test_order', kind: 'action', export: 'handle_setup_test_order', label: 'mp.block.order.label', title: 'mp.block.order.title' },
                ],
            },
        ],
    },
    credentials: [
        { key: 'access_token', label: 'mp.field.token', type: 'secret', secret: true, required: true, section: 'connection' },
        { key: 'webhook_secret', label: 'mp.field.secret', type: 'secret', secret: true, section: 'advanced' },
    ],
}

function setup(connector: ConnectorEntry | null, routes: Record<string, any> = {}, extra: Record<string, any> = {}) {
    const api = makeApi(routes)
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    const onOpenChange = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <ApiProvider client={api.client as any} batch={false}>
                <AddonConfigSurface addon={addon} connector={connector} open onOpenChange={onOpenChange} notify={notify} {...extra} />
            </ApiProvider>
        </QueryClientProvider>,
    )
    return { ...api, notify, onOpenChange }
}

const footer = () => document.querySelector('[data-wizard-footer]') as HTMLElement

describe('AddonConfigSurface with setup blocks', () => {
    it('step 2 shows the org webhook URL with copy, the panel link and the test-order action', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        setup(mp)
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        expect(await screen.findByText(WEBHOOK)).toBeTruthy()
        const link = screen.getByText('Abrir panel de Mercado Pago').closest('a')!
        expect(link.getAttribute('href')).toBe('https://www.mercadopago.com.mx/developers/panel/app')
        expect(link.getAttribute('rel')).toContain('noopener')
        fireEvent.click(screen.getByRole('button', { name: 'Copiar URL de notificaciones' }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(WEBHOOK))
        // The explicit test is the last credentials step's; the implicit one joins it.
        expect(screen.getByText('Crear orden de prueba')).toBeTruthy()
        expect(screen.getByText('Probar conexión')).toBeTruthy()
        // Focus moved to the new step heading.
        expect(document.activeElement?.textContent).toBe('Avanzado')
        // Reading order: URL to paste, then the secret field, then the verifications.
        const url = screen.getByText(WEBHOOK)
        const secret = screen.getByLabelText(/Secreto del webhook/)
        const action = screen.getByText('Crear orden de prueba')
        expect(url.compareDocumentPosition(secret) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(secret.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('runs the action block through the host route and shows ID + status live', async () => {
        const { calls } = setup(mp, {
            'POST /integrations/mercadopago/blocks/test_order/run': {
                success: true,
                data: {
                    ok: true,
                    status: 'ok',
                    message: 'Preferencia de prueba creada',
                    details: [
                        { key: 'preference_id', label: 'ID de la preferencia', value: '123-abc', kind: 'id' },
                        { key: 'link', label: 'Pagar en sandbox', value: 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=123-abc', kind: 'url' },
                    ],
                },
            },
        })
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        fireEvent.click(await screen.findByText('Crear orden de prueba'))
        const msg = await screen.findByText('Preferencia de prueba creada')
        const live = msg.closest('[aria-live="polite"]') as HTMLElement
        expect(live.getAttribute('role')).toBe('status')
        expect(within(live).getByText('123-abc')).toBeTruthy()
        expect(within(live).getByText('Abrir enlace').closest('a')!.getAttribute('href')).toContain('sandbox.mercadopago.com.mx')
        expect(calls.filter((c) => c.url === '/integrations/mercadopago/blocks/test_order/run')).toHaveLength(1)
        // Stepper marks the verified step.
        expect(document.querySelector('[data-step-status="ok"]')).toBeTruthy()
        // Retry runs it again.
        fireEvent.click(screen.getByText('Reintentar: Crear orden de prueba'))
        await waitFor(() => expect(calls.filter((c) => c.url === '/integrations/mercadopago/blocks/test_order/run')).toHaveLength(2))
    })

    it('saves typed credentials before running an action (the host tests what is stored)', async () => {
        const { calls } = setup(mp, {
            'POST /integrations/mercadopago/blocks/test_order/run': { success: true, data: { ok: true, message: 'ok' } },
        })
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        fireEvent.change(await screen.findByLabelText(/Secreto del webhook/), { target: { value: 'whsec' } })
        expect(screen.getAllByText('Se guardarán tus cambios antes de probar.').length).toBeGreaterThan(0)
        fireEvent.click(screen.getByText('Crear orden de prueba'))
        await screen.findByText('ok')
        const save = calls.findIndex((c) => c.m === 'POST' && c.url === '/integrations/mercadopago')
        const run = calls.findIndex((c) => c.url.endsWith('/blocks/test_order/run'))
        expect(save).toBeGreaterThanOrEqual(0)
        expect(save).toBeLessThan(run)
        expect(calls[save].body).toEqual({ webhook_secret: 'whsec' })
    })

    it('a failed HTTP call is an error result, never success', async () => {
        const err = Object.assign(new Error('x'), { response: { data: { message: 'Guarda las credenciales antes de probar' } } })
        setup(mp, { 'POST /integrations/mercadopago/blocks/test_order/run': err })
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        fireEvent.click(await screen.findByText('Crear orden de prueba'))
        const msg = await screen.findByText('Guarda las credenciales antes de probar')
        expect(msg.closest('[data-result-status]')!.getAttribute('data-result-status')).toBe('error')
        expect(document.querySelector('[data-step-status="error"]')).toBeTruthy()
    })

    it('Siguiente validates the current step before moving on', async () => {
        setup({ ...mp, connected: false })
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        expect((await screen.findByText(/Faltan campos obligatorios: Access token/)).getAttribute('role')).toBe('alert')
        expect(screen.queryByText(WEBHOOK)).toBeNull()
    })

    // Footer since #1287 (Guardar siempre visible): save state on the left;
    // Cerrar/Cancelar, Atrás and the ONE primary Guardar on the right, Guardar
    // stretching to the full row on phones. Verifications live in the steps.
    it('footer: Guardar is the one primary, always there, full width on phones; Cerrar + Atrás beside it', async () => {
        setup(mp)
        await screen.findByText('Access token')
        fireEvent.click(within(footer()).getByText('Siguiente'))
        await screen.findByText(WEBHOOK)
        const buttons = within(footer()).getAllByRole('button')
        expect(buttons.map((b) => b.textContent)).toEqual(['Cerrar', 'Atrás', 'Guardar'])
        const save = within(footer()).getByTestId('config-save')
        expect(save).toBe(buttons[2])
        expect(save.className).toContain('flex-1')
        expect(save.className).toContain('h-11')
        expect(buttons[0].className).not.toContain('flex-1')
        expect(buttons[1].className).not.toContain('flex-1')
        expect(within(footer()).getByRole('status')).toBeTruthy()
        expect(within(footer()).queryByText('Probar conexión')).toBeNull()
    })

    it('an explicit action bound to test_export replaces the implicit test', async () => {
        const explicit: ConnectorEntry = {
            ...mp,
            form_layout: {
                mode: 'steps',
                sections: [
                    { key: 'connection', title: 'mp.section.connection', blocks: [{ key: 'ping', kind: 'action', export: 'handle_connector_test', label: 'Probar ahora' }] },
                    { key: 'advanced', title: 'mp.section.advanced' },
                ],
            },
        }
        setup(explicit)
        expect(await screen.findByText('Probar ahora')).toBeTruthy()
        fireEvent.click(within(footer()).getByText('Siguiente'))
        await screen.findByText('Secreto del webhook')
        expect(screen.queryByText('Probar conexión')).toBeNull()
    })

    it('long help expands instead of being cut', async () => {
        const long = 'Ayuda '.repeat(60).trim()
        setup({ ...mp, form_layout: { mode: 'steps', sections: [{ key: 'connection', title: 'mp.section.connection', description: long }, { key: 'advanced' }] } })
        const p = await screen.findByText(long)
        expect(p.className).toContain('line-clamp-3')
        const more = screen.getByRole('button', { name: 'Ver más' })
        expect(more.getAttribute('aria-expanded')).toBe('false')
        fireEvent.click(more)
        expect(p.className).not.toContain('line-clamp-3')
        expect(screen.getByRole('button', { name: 'Ver menos' }).getAttribute('aria-expanded')).toBe('true')
    })

    it('OAuth connectors show their state and hand "Conectar cuenta" to the host', async () => {
        const onConnectOAuth = vi.fn()
        const gh: ConnectorEntry = { addon_key: 'mercadopago', provider: 'github', auth: 'oauth2', connected: false }
        setup(gh, {}, { onConnectOAuth })
        expect(await screen.findByText('Sin conectar')).toBeTruthy()
        fireEvent.click(screen.getByText('Conectar cuenta'))
        expect(onConnectOAuth).toHaveBeenCalledWith(gh)
    })

    it('an addon with nothing to configure shows a useful empty state and a single Cerrar', async () => {
        const { onOpenChange } = setup(null)
        expect(await screen.findByText('Nada que configurar')).toBeTruthy()
        const buttons = within(footer()).getAllByRole('button')
        expect(buttons.map((b) => b.textContent)).toEqual(['Cerrar'])
        fireEvent.click(buttons[0])
        expect(onOpenChange).toHaveBeenCalledWith(false)
    })
})
