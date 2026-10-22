// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const dict: Record<string, string> = { 'pay.public_key': 'Llave pública', 'pay.token': 'Token', 'pay.serie_a': 'Serie A', 'pay.serie_b': 'Serie B' }
    const t = (k: string, o?: { defaultValue?: string }) => dict[k] ?? o?.defaultValue ?? k
    return { useTranslation: () => ({ t, i18n: { language: 'es', exists: () => true } }) }
})

import { ApiProvider } from '../api-context'
import { AddonConfigSurface, clearConnectorLookupCache, type ConnectorEntry } from '../setup/addon-config-surface'
import { shapeMismatch, missingRequired, credentialShape } from '../setup/connector-form-model'

afterEach(cleanup)

const addon = { addon_key: 'pay', manifest: { name: 'pay', display_name: 'Pagos', settings_defs: [] as any[] } }
const PUB = 'APP_USR-12345678-1234-1234-1234-123456789012'

function makeApi(routes: Record<string, any> = {}) {
    const calls: { m: string; url: string; body?: any }[] = []
    const handle = (m: string) => async (url: string, body?: any) => {
        calls.push({ m, url, body })
        const key = `${m} ${url}`
        const r = routes[key]
        if (r instanceof Error) throw r
        return { data: typeof r === 'function' ? r(body) : (r ?? { data: {} }) }
    }
    return { client: { get: handle('GET'), post: handle('POST'), put: handle('PUT'), delete: handle('DELETE') }, calls }
}

function setup(props: Partial<React.ComponentProps<typeof AddonConfigSurface>>, routes: Record<string, any> = {}) {
    const api = makeApi(routes)
    const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } })
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    render(
        <QueryClientProvider client={qc}>
            <ApiProvider client={api.client as any} batch={false}>
                <AddonConfigSurface
                    addon={addon}
                    connector={null}
                    open
                    onOpenChange={onOpenChange}
                    onSaved={onSaved}
                    notify={notify}
                    {...props}
                />
            </ApiProvider>
        </QueryClientProvider>,
    )
    return { ...api, notify, onOpenChange, onSaved }
}

const connector: ConnectorEntry = {
    addon_key: 'pay',
    provider: 'mp',
    connected: true,
    test_export: 'ping',
    credentials: [
        { key: 'public_key', label: 'pay.public_key', required: true },
        { key: 'access_token', label: 'pay.token', secret: true, required: true },
        { key: 'env', type: 'select', options: [{ value: 'sandbox', label: 'Pruebas' }, { value: 'prod', label: 'Producción' }], default: 'sandbox' },
    ],
}

describe('connector-form-model', () => {
    it('detects pasted key shapes and mismatches against sibling fields', () => {
        expect(credentialShape(PUB)).toBe('public_key')
        expect(shapeMismatch(connector.credentials![1], PUB, connector.credentials!)).toEqual({ shape: 'public_key', suggestedKey: 'public_key' })
        expect(shapeMismatch(connector.credentials![0], PUB, connector.credentials!)).toBeNull()
    })
    it('a stored secret counts as filled', () => {
        expect(missingRequired(connector.credentials!, {}, true)).toEqual(['public_key'])
        expect(missingRequired(connector.credentials!, {}, false)).toEqual(['public_key', 'access_token'])
    })
})

describe('AddonConfigSurface', () => {
    it('keeps the header and footer outside the scrolling body', async () => {
        setup({ connector })
        const title = await screen.findByText('Configurar Pagos')
        expect(title).toBeTruthy()
        const content = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
        expect(content.className).toContain('flex')
        expect(content.className).toContain('flex-col')
        const body = document.querySelector('.overflow-y-auto') as HTMLElement
        expect(body).toBeTruthy()
        expect(body.contains(title)).toBe(false)
        expect(body.contains(screen.getByText('Guardar'))).toBe(false)
    })

    it('secrets are write-only: password input, never prefilled, empty is not sent', async () => {
        const { calls, notify, onSaved } = setup(
            { connector },
            { 'GET /integrations/mp/values': { data: { values: { public_key: 'APP_USR-x', access_token: 'LEAK', env: 'prod' } } } },
        )
        const secret = (await screen.findByLabelText(/Token/)) as HTMLInputElement
        expect(secret.type).toBe('password')
        expect(secret.autocomplete).toBe('new-password')
        expect(secret.placeholder).toBe('••••••••')
        await waitFor(() => expect((screen.getByLabelText(/Llave pública/) as HTMLInputElement).value).toBe('APP_USR-x'))
        fireEvent.click(screen.getByText('Guardar'))
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Configuración guardada'))
        const post = calls.find((c) => c.m === 'POST' && c.url === '/integrations/mp')!
        expect(post.body.public_key).toBe('APP_USR-x')
        expect(post.body.env).toBe('prod')
        expect('access_token' in post.body).toBe(false) // empty secret = keep stored; an echoed value is never prefilled
        expect(secret.value).toBe('')
        expect(onSaved).toHaveBeenCalled()
    })

    it('does not fetch stored values for non-admins and explains why', async () => {
        const { calls } = setup({ connector, canManageIssuer: false })
        expect(await screen.findByText(/Solo un administrador de la organización/)).toBeTruthy()
        expect(calls.some((c) => c.url === '/integrations/mp/values')).toBe(false)
        expect(screen.queryByText('Probar conexión')).toBeNull()
    })

    it('blocks save on missing required fields and names them', async () => {
        const { calls } = setup({ connector: { ...connector, connected: false } })
        await screen.findByLabelText(/Token/)
        fireEvent.click(screen.getByText('Guardar'))
        expect((await screen.findByText(/Faltan campos obligatorios: Llave pública, Token/)).getAttribute('role')).toBe('alert')
        expect(calls.some((c) => c.m === 'POST' && c.url === '/integrations/mp')).toBe(false)
    })

    it('warns when a public key is pasted in the secret field (without blocking)', async () => {
        setup({ connector })
        const secret = await screen.findByLabelText(/Token/)
        fireEvent.change(secret, { target: { value: PUB } })
        await waitFor(() =>
            expect(screen.getAllByRole('status').some((w) => w.textContent?.includes('Llave pública'))).toBe(true),
        )
    })

    it('Probar conexión runs inside the form (not the footer) and shows the result inline', async () => {
        const { calls, notify } = setup(
            { connector },
            { 'POST /integrations/mp/test': { success: true, data: { ok: false, message: 'Credenciales inválidas' } } },
        )
        const btn = await screen.findByText('Probar conexión')
        const footer = document.querySelector('[data-wizard-footer]') as HTMLElement
        expect(footer.contains(btn)).toBe(false)
        fireEvent.click(btn)
        const msg = await screen.findByText('Credenciales inválidas')
        expect(msg.closest('[data-result-status]')?.getAttribute('data-result-status')).toBe('error')
        expect(msg.closest('[aria-live="polite"]')).toBeTruthy()
        expect(calls.some((c) => c.m === 'POST' && c.url === '/integrations/mp/test')).toBe(true)
        expect(notify.error).not.toHaveBeenCalled()
        // The retry keeps the same action reachable.
        expect(screen.getByText(/Reintentar: Probar conexión/)).toBeTruthy()
    })

    it('dynamic_select lists options from the host lookup once per export', async () => {
        const dyn: ConnectorEntry = {
            ...connector,
            credentials: [
                { key: 'serie_a', type: 'dynamic_select', options_source: 'list_series', label: 'pay.serie_a' },
                { key: 'serie_b', type: 'dynamic_select', options_source: 'list_series', label: 'pay.serie_b' },
            ],
        }
        const { calls } = setup({ connector: dyn }, { 'POST /integrations/mp/lookup': { data: { options: [{ value: 'A1', label: 'Serie A1' }] } } })
        await screen.findByText('Serie A')
        await waitFor(() => expect(calls.filter((c) => c.url === '/integrations/mp/lookup').length).toBe(1))
    })

    it('settings: visible_when hides, write_only is not sent unless typed', async () => {
        const defs = [
            { key: 'mode', label: 'Modo', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
            { key: 'extra', label: 'Extra', type: 'text', visible_when: { field: 'mode', equals: 'b' } },
            { key: 'token', label: 'Token de ajustes', type: 'text', write_only: true, stored: true },
        ]
        const { calls, notify } = setup(
            { connector: null },
            { 'GET /addons/pay/settings': { data: { mode: 'a', token: 'SHOULD_NOT_ECHO' }, definitions: defs } },
        )
        await screen.findByText('Modo')
        expect(screen.queryByText('Extra')).toBeNull()
        const tok = screen.getByLabelText('Token de ajustes') as HTMLInputElement
        expect(tok.type).toBe('password')
        expect(tok.value).toBe('')
        fireEvent.click(screen.getByText('Guardar'))
        await waitFor(() => expect(notify.success).toHaveBeenCalled())
        const put = calls.find((c) => c.m === 'PUT')!
        expect('token' in put.body).toBe(false)
        expect(put.body.mode).toBe('a')
    })

    it('per-branch mode only sends what was touched', async () => {
        const defs = [{ key: 'tip', label: 'Propina', type: 'text', scope: 'branch' }, { key: 'org', label: 'Org', type: 'text' }]
        const { calls, notify } = setup(
            { connector: null, activeBranch: { id: 'b1', name: 'Centro' } },
            { 'GET /addons/pay/settings': { data: {}, definitions: defs }, 'GET /addons/pay/settings?branch_id=b1': { data: {}, definitions: defs } },
        )
        fireEvent.click(await screen.findByText('Solo Centro'))
        const input = await screen.findByLabelText('Propina')
        fireEvent.change(input, { target: { value: '10' } })
        fireEvent.click(screen.getByText('Guardar'))
        await waitFor(() => expect(notify.success).toHaveBeenCalled())
        const put = calls.find((c) => c.m === 'PUT')!
        expect(put.url).toBe('/addons/pay/settings?branch_id=b1')
        expect(put.body).toEqual({ tip: '10' })
    })

    it('a write_only setting typed then erased does not send "" over the stored secret', async () => {
        const defs = [
            { key: 'token', label: 'Token de ajustes', type: 'text', write_only: true, stored: true },
            { key: 'limit', label: 'Límite', type: 'number' },
        ]
        const { calls, notify } = setup({ connector: null }, { 'GET /addons/pay/settings': { data: {}, definitions: defs } })
        const tok = (await screen.findByLabelText('Token de ajustes')) as HTMLInputElement
        fireEvent.change(tok, { target: { value: 'abc' } })
        fireEvent.change(tok, { target: { value: '' } })
        const limit = screen.getByLabelText('Límite') as HTMLInputElement
        fireEvent.change(limit, { target: { value: '5' } })
        fireEvent.change(limit, { target: { value: '' } })
        fireEvent.click(screen.getByText('Guardar'))
        await waitFor(() => expect(notify.success).toHaveBeenCalled())
        const put = calls.find((c) => c.m === 'PUT')!
        expect('token' in put.body).toBe(false)
        expect(put.body.limit).toBeUndefined() // empty number is not 0
    })

    it('dynamic_select uses the `client` prop and the injected expectedOptionKinds', async () => {
        const dyn: ConnectorEntry = {
            ...connector,
            credentials: [{ key: 'serie_x', type: 'dynamic_select', options_source: 'list_series', label: 'pay.serie_x' }],
        }
        const opts = [
            { value: 'F1', label: 'Serie F1', tipo: 'factura' },
            { value: 'N1', label: 'Serie N1', tipo: 'nota' },
        ]
        clearConnectorLookupCache()
        const prop = makeApi({ 'POST /integrations/mp/lookup': { data: { options: opts } } })
        const host = makeApi()
        const qc = new QueryClient()
        render(
            <QueryClientProvider client={qc}>
                <ApiProvider client={host.client as any} batch={false}>
                    <AddonConfigSurface
                        addon={addon}
                        connector={dyn}
                        open
                        onOpenChange={() => {}}
                        client={prop.client as any}
                        expectedOptionKinds={{ serie_x: 'factura' }}
                    />
                </ApiProvider>
            </QueryClientProvider>,
        )
        await waitFor(() => expect(prop.calls.some((c) => c.url === '/integrations/mp/lookup')).toBe(true))
        expect(host.calls.some((c) => c.url === '/integrations/mp/lookup')).toBe(false)
        fireEvent.click(await screen.findByRole('combobox', { name: /Serie X/i }))
        expect(await screen.findByText('Serie F1')).toBeTruthy()
        expect(screen.queryByText('Serie N1')).toBeNull()
    })
})
