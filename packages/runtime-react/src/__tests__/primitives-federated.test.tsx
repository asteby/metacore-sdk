// @vitest-environment happy-dom
//
// Primitivos federados en React: el dispatcher pinta un modal de
// registerFederatedModal sin esperar al host, usa el formulario genérico de
// inmediato si el addon del slug no está instalado, y useDocumentContributions
// re-pinta al registrar/desmontar un remote.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

const USE_TRANSLATION = {
    t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    i18n: { language: 'es' },
}
vi.mock('react-i18next', () => ({ useTranslation: () => USE_TRANSLATION }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { setFederatedActionLoader } from '../federated-action-loader'
import { ApiProvider, type ApiClient } from '../api-context'
import { InstalledAddonsProvider } from '../installed-addons-context'
import {
    __resetContributions,
    registerDocumentContribution,
    registerFederatedModal,
    type DocumentEditorContext,
} from '../primitives/contributions'
import { useDocumentContributions } from '../primitives/use-contributions'
import type { ActionMetadata, ActionModalProps } from '@asteby/metacore-sdk'

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    setFederatedActionLoader(null)
    __resetContributions()
})

const noopApi = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
} as unknown as ApiClient

const importAction: ActionMetadata = {
    key: 'import_cfdi',
    label: 'Importar CFDI',
    modal: 'fiscal_mexico.import_cfdi',
    confirm: true,
    confirmMessage: '¿Importar?',
    executable: true,
}

function ImportModal({ action }: ActionModalProps) {
    return <div data-testid="import-modal">{action.modal}</div>
}

function renderDispatcher(addons?: string[]) {
    const tree = (
        <ActionModalDispatcher
            open
            onOpenChange={() => {}}
            action={importAction}
            model="Invoice"
            record={{ id: '1' } as any}
            endpoint="/data/Invoice"
            onSuccess={() => {}}
        />
    )
    return render(
        <ApiProvider client={noopApi}>
            {addons ? <InstalledAddonsProvider addons={addons}>{tree}</InstalledAddonsProvider> : tree}
        </ApiProvider>,
    )
}

describe('ActionModalDispatcher + registerFederatedModal', () => {
    it('pinta el modal registrado (lazy) sin pedir el remote al host', async () => {
        const loader = vi.fn()
        setFederatedActionLoader(loader)
        registerFederatedModal({ key: 'fiscal_mexico.import_cfdi', addon: 'fiscal_mexico', load: async () => ({ default: ImportModal }) })
        renderDispatcher(['fiscal_mexico'])
        expect((await screen.findByTestId('import-modal')).textContent).toBe('fiscal_mexico.import_cfdi')
        expect(loader).not.toHaveBeenCalled()
        expect(screen.queryByText('¿Importar?')).toBeNull()
    })

    it('addon del slug no instalado → formulario genérico de inmediato, sin esperar ni pedir el remote', () => {
        const loader = vi.fn()
        setFederatedActionLoader(loader)
        registerFederatedModal({ key: 'fiscal_mexico.import_cfdi', addon: 'fiscal_mexico', load: async () => ({ default: ImportModal }) })
        renderDispatcher(['customers'])
        expect(screen.getByText('¿Importar?')).toBeTruthy()
        expect(screen.queryByTestId('federated-action-loading')).toBeNull()
        expect(loader).not.toHaveBeenCalled()
    })

    it('addon instalado pero modal aún sin registrar → espera al remote (no cae al genérico)', async () => {
        renderDispatcher(['fiscal_mexico'])
        expect(screen.getByTestId('federated-action-loading')).toBeTruthy()
        expect(screen.queryByText('¿Importar?')).toBeNull()
        act(() => {
            registerFederatedModal({ key: 'fiscal_mexico.import_cfdi', addon: 'fiscal_mexico', load: async () => ({ default: ImportModal }) })
        })
        expect(await screen.findByTestId('import-modal')).toBeTruthy()
    })

    it('sin InstalledAddonsProvider se conserva la espera de siempre', () => {
        renderDispatcher()
        expect(screen.getByTestId('federated-action-loading')).toBeTruthy()
        expect(screen.queryByText('¿Importar?')).toBeNull()
    })
})

describe('useDocumentContributions', () => {
    const ctx: DocumentEditorContext = { kind: 'invoice', model: 'customers.Invoice', values: {}, mode: 'create' }

    function Region() {
        const items = useDocumentContributions(ctx, 'header.fields')
        return (
            <div data-testid="region">
                {items.map(({ id, component: C }) => (
                    <C key={id} ctx={ctx} setValue={() => {}} issues={{ report: () => {} }} />
                ))}
            </div>
        )
    }

    it('re-pinta al registrar y al desmontar el remote; filtra por addon instalado', async () => {
        render(
            <InstalledAddonsProvider addons={['fiscal_mexico']}>
                <Region />
            </InstalledAddonsProvider>,
        )
        expect(screen.getByTestId('region').textContent).toBe('')
        let off = () => {}
        act(() => {
            off = registerDocumentContribution({
                id: 'fiscal_mexico.header.cfdi',
                kinds: ['invoice'],
                region: 'header.fields',
                requiresAddon: 'fiscal_mexico',
                load: async () => ({ default: () => <span>Uso del CFDI</span> }),
            })
            registerDocumentContribution({
                id: 'inventory.header.warehouse',
                kinds: '*',
                region: 'header.fields',
                requiresAddon: 'inventory',
                component: () => <span>Almacén</span>,
            })
        })
        expect(await screen.findByText('Uso del CFDI')).toBeTruthy()
        expect(screen.queryByText('Almacén')).toBeNull()
        act(() => off())
        expect(screen.queryByText('Uso del CFDI')).toBeNull()
    })
})
