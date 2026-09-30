// @vitest-environment happy-dom
//
// requiresAddon: an action gated by a missing optional addon stays visible but
// locked. A click must NOT reach the dispatcher / federated modal / backend; it
// opens the "requires addon" dialog whose "Instalar" hands the key to the host
// handler, or routes to /marketplace/<key> through the SDK router.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'

const I18N_T = (_k: string, opts?: { defaultValue?: string; [k: string]: unknown }) =>
    (opts?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => String(opts?.[v] ?? ''))
const USE_TRANSLATION = { t: I18N_T, i18n: { language: 'es' } }
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigate,
}))

// The dispatcher must never mount for a gated action.
const dispatcherSpy = vi.fn()
vi.mock('../action-modal-dispatcher', () => ({
    ActionModalDispatcher: (props: unknown) => {
        dispatcherSpy(props)
        return <div data-testid="dispatcher" />
    },
}))

import { useDynamicRowActions } from '../dynamic-row-actions'
import { ModelActionToolbar } from '../model-action-toolbar'
import { RowActionMenuItem } from '../dynamic-columns'
import { ApiProvider } from '../api-context'
import { resolveRequiresAddon, setAddonInstallHandler } from '../requires-addon'
import type { ActionDefinition, TableMetadata } from '../types'
import { DropdownMenu, DropdownMenuContent } from '@asteby/metacore-ui/primitives'

const post = vi.fn(async () => ({ data: { success: true } }))
const api = {
    get: async () => ({ data: { data: {} } }),
    post,
    put: async () => ({ data: { success: true } }),
    delete: async () => ({ data: { success: true } }),
} as never

const WIRE_REQUIREMENT = {
    key: 'connector_whatsapp',
    name: 'Conector WhatsApp',
    reason: 'Necesitas el conector para vincular un número.',
}

// Exactly as ops serves it: snake_case, plus a federated modal + executable so
// that, without the gate, the click would open the dispatcher.
const gatedRowAction = {
    key: 'connect_device',
    name: 'connect_device',
    label: 'Conectar WhatsApp',
    icon: 'QrCode',
    class: '',
    type: 'custom',
    modal: 'link_inbox.connect_device',
    executable: true,
    requires_addon: WIRE_REQUIREMENT,
} as unknown as ActionDefinition

const metadata = { title: 'Devices', actions: [gatedRowAction] } as unknown as TableMetadata

function Wrapper({ children }: { children: React.ReactNode }) {
    return <ApiProvider client={api}>{children}</ApiProvider>
}

beforeEach(() => {
    post.mockClear()
    navigate.mockClear()
    dispatcherSpy.mockClear()
    setAddonInstallHandler(null)
})
afterEach(cleanup)

describe('resolveRequiresAddon', () => {
    it('normalizes the snake_case requires_addon served by the host', () => {
        expect(resolveRequiresAddon({ requires_addon: WIRE_REQUIREMENT })).toEqual(WIRE_REQUIREMENT)
    })
    it('reads camelCase requiresAddon', () => {
        expect(resolveRequiresAddon({ requiresAddon: { key: 'x' } })).toEqual({ key: 'x' })
    })
    it('treats absent / keyless requirements as runnable', () => {
        expect(resolveRequiresAddon({ key: 'a' })).toBeNull()
        expect(resolveRequiresAddon({ requires_addon: { name: 'Sin key' } })).toBeNull()
        expect(resolveRequiresAddon(undefined)).toBeNull()
    })
})

function RowHarness() {
    const { handleInternalAction, dialogs } = useDynamicRowActions({
        model: 'Device',
        metadata,
        onRefresh: () => {},
    })
    return (
        <>
            <button onClick={() => handleInternalAction('connect_device', { id: 'r1' })}>run</button>
            {dialogs}
        </>
    )
}

describe('row actions (table / kanban shared handler)', () => {
    it('does not dispatch nor post; opens the requires-addon dialog', async () => {
        const onAction = vi.fn()
        const { result } = renderHook(
            () => useDynamicRowActions({ model: 'Device', metadata, onAction, onRefresh: () => {} }),
            { wrapper: Wrapper },
        )
        await act(() => result.current.handleInternalAction('connect_device', { id: 'r1' }))
        expect(onAction).not.toHaveBeenCalled()

        render(<RowHarness />, { wrapper: Wrapper })
        await act(async () => fireEvent.click(screen.getByText('run')))

        expect(screen.getByText('Esta acción requiere «Conector WhatsApp»')).toBeTruthy()
        expect(screen.getByText(WIRE_REQUIREMENT.reason)).toBeTruthy()
        expect(screen.queryByTestId('dispatcher')).toBeNull()
        expect(dispatcherSpy).not.toHaveBeenCalled()
        expect(post).not.toHaveBeenCalled()
    })

    it('Instalar invokes the host handler with the addon key', async () => {
        const handler = vi.fn()
        setAddonInstallHandler(handler)
        render(<RowHarness />, { wrapper: Wrapper })
        await act(async () => fireEvent.click(screen.getByText('run')))
        await act(async () => fireEvent.click(screen.getByText('Instalar «Conector WhatsApp»')))
        expect(handler).toHaveBeenCalledWith('connector_whatsapp')
        expect(navigate).not.toHaveBeenCalled()
    })

    it('without a handler navigates through the router to /marketplace/<key>', async () => {
        render(<RowHarness />, { wrapper: Wrapper })
        await act(async () => fireEvent.click(screen.getByText('run')))
        await act(async () => fireEvent.click(screen.getByText('Instalar «Conector WhatsApp»')))
        expect(navigate).toHaveBeenCalledWith({ to: '/marketplace/connector_whatsapp' })
    })

    it('menu entry stays visible with a lock and the addon name as tooltip', () => {
        render(
            <DropdownMenu open>
                <DropdownMenuContent>
                    <RowActionMenuItem action={gatedRowAction} label="Conectar WhatsApp" onSelect={() => {}} />
                </DropdownMenuContent>
            </DropdownMenu>,
        )
        const item = screen.getByText('Conectar WhatsApp').closest('[data-requires-addon]')
        expect(item?.getAttribute('data-requires-addon')).toBe('connector_whatsapp')
        expect(item?.getAttribute('title')).toBe('Requiere «Conector WhatsApp»')
    })
})

describe('ModelActionToolbar', () => {
    const toolbarAction = {
        ...gatedRowAction,
        placement: 'table',
        requires_addon: undefined,
        requiresAddon: { key: 'connector_whatsapp', name: 'Conector WhatsApp' },
    } as unknown as ActionDefinition

    it('renders the action locked and opens the dialog instead of the dispatcher', async () => {
        const intent = vi.fn()
        render(
            <Wrapper>
                <ModelActionToolbar model="Device" actions={[toolbarAction]} onActionIntent={intent} />
            </Wrapper>,
        )
        const button = screen.getByText('Conectar WhatsApp').closest('button')!
        expect(button.getAttribute('title')).toBe('Requiere «Conector WhatsApp»')
        expect(button.querySelector('[data-requires-addon="connector_whatsapp"]')).toBeTruthy()

        await act(async () => fireEvent.click(button))
        expect(screen.getByText('Esta acción requiere «Conector WhatsApp»')).toBeTruthy()
        // No reason from the host → generic copy.
        expect(screen.getByText('Instala «Conector WhatsApp» para habilitar esta acción.')).toBeTruthy()
        expect(dispatcherSpy).not.toHaveBeenCalled()
        expect(intent).not.toHaveBeenCalled()
        expect(post).not.toHaveBeenCalled()

        await act(async () => fireEvent.click(screen.getByText('Instalar «Conector WhatsApp»')))
        expect(navigate).toHaveBeenCalledWith({ to: '/marketplace/connector_whatsapp' })
    })

    it('an ungated action still opens the dispatcher', async () => {
        const plain = { ...toolbarAction, key: 'other', label: 'Otra', requiresAddon: undefined } as ActionDefinition
        render(
            <Wrapper>
                <ModelActionToolbar model="Device" actions={[plain]} />
            </Wrapper>,
        )
        await act(async () => fireEvent.click(screen.getByText('Otra')))
        expect(dispatcherSpy).toHaveBeenCalled()
    })
})
