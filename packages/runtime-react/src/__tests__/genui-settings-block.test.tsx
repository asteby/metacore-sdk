// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: { defaultValue?: string }) => (k.includes(' ') ? k : (o?.defaultValue ?? k))
    return { useTranslation: () => ({ t, i18n: { language: 'es', exists: () => false } }) }
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GenUI } from '@asteby/metacore-genui'
import { ApiProvider } from '../api-context'
import { coerceSettings, registerGenUISettingsBlock, settingsToFields } from '../genui'

let undo: (() => void) | undefined
afterEach(() => {
    cleanup()
    undo?.()
    undo = undefined
})

const defs = [
    { key: 'max_lines', label: 'Líneas máximas', type: 'integer', default_value: 5 },
    { key: 'note', label: 'Nota', type: 'string' },
    { key: 'strict', label: 'Estricto', type: 'boolean' },
    { key: 'token', label: 'Token', type: 'string', write_only: true },
    { key: 'branch_only', label: 'Por sucursal', type: 'string', scope: 'branch' },
]

describe('settingsToFields / coerceSettings (FromSettings)', () => {
    it('drops secrets and branch-scoped keys and types numbers', () => {
        const f = settingsToFields(defs)
        expect(f.map((x) => `${x.key}:${x.type}`)).toEqual(['max_lines:number', 'note:text', 'strict:boolean'])
        expect(settingsToFields(defs, ['strict', 'max_lines']).map((x) => x.key)).toEqual(['strict', 'max_lines'])
    })

    it('sends integers as integers and drops empty numbers', () => {
        expect(coerceSettings({ max_lines: '7', note: 'x', strict: true }, defs)).toEqual({ max_lines: 7, note: 'x', strict: true })
        expect(coerceSettings({ max_lines: '' , note: 'x' }, defs)).toEqual({ note: 'x' })
    })
})

describe('genui settings block (pilot)', () => {
    it('loads the definitions, edits and saves through PUT /addons/:key/settings with typed integers', async () => {
        undo = registerGenUISettingsBlock()
        const puts: Array<{ url: string; body: unknown }> = []
        const client = {
            get: vi.fn(async () => ({ data: { data: { max_lines: 5, note: 'hola', strict: false }, definitions: defs } })),
            post: vi.fn(),
            put: vi.fn(async (url: string, body: unknown) => (puts.push({ url, body }), { data: { success: true } })),
            delete: vi.fn(),
        }
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <ApiProvider client={client as never}>
                    <GenUI spec={{ version: 'genui/v2', blocks: [{ type: 'settings', addon: 'inventory', scope: 'org' }] }} />
                </ApiProvider>
            </QueryClientProvider>,
        )
        const lines = await screen.findByRole('spinbutton')
        expect(screen.queryByText(/Token/)).toBeNull()
        expect(screen.getByText(/Líneas máximas/)).toBeTruthy()
        fireEvent.change(lines, { target: { value: '9' } })
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
        await waitFor(() => expect(puts).toHaveLength(1))
        expect(puts[0]!.url).toBe('/addons/inventory/settings')
        expect((puts[0]!.body as Record<string, unknown>).max_lines).toBe(9)
        expect((puts[0]!.body as Record<string, unknown>).note).toBe('hola')
        expect(await screen.findByText('Guardado.')).toBeTruthy()
    })

    it('without a registered renderer the block shows its fallback text', () => {
        render(<GenUI spec={{ version: 'genui/v2', blocks: [{ type: 'settings', addon: 'inventory', scope: 'org', fallback: 'Abre Ajustes' }] }} />)
        expect(screen.getByText('Abre Ajustes')).toBeTruthy()
    })
})
