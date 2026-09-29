// @vitest-environment happy-dom
//
// Federated action modals are deterministic: an action that declares
// `modal: "<addon>.<action>"` shows a loading state while the remote loads,
// swaps to the registered component when it lands, and errors after the
// timeout — it never renders the generic ConfirmActionDialog.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

// Stable identities: a fresh `t` per render spins the record dialog's effects
// into an infinite render loop (same as dynamic-kanban.test).
const USE_TRANSLATION = {
    t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    i18n: { language: 'es' },
}
vi.mock('react-i18next', () => ({
    useTranslation: () => USE_TRANSLATION,
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => () => {},
}))

import { ActionModalDispatcher, FEDERATED_ACTION_MODAL_TIMEOUT_MS } from '../action-modal-dispatcher'
import { setFederatedActionLoader } from '../federated-action-loader'
import { useDynamicRowActions } from '../dynamic-row-actions'
import { ApiProvider, type ApiClient } from '../api-context'
import type { TableMetadata } from '../types'
import {
    registerActionComponent,
    unregisterActionComponent,
    type ActionMetadata,
    type ActionModalProps,
} from '@asteby/metacore-sdk'

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    setFederatedActionLoader(null)
    unregisterActionComponent('Order', 'return')
})

const noopApi: ApiClient = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
} as unknown as ApiClient

const returnAction: ActionMetadata = {
    key: 'return',
    label: 'Devolver',
    icon: 'Undo2',
    modal: 'returns.return',
    confirm: true,
    confirmMessage: 'Devolver?',
    executable: true,
}

function ReturnModal({ action }: ActionModalProps) {
    return <div data-testid="return-modal">{action.modal}</div>
}

function renderDispatcher(action: ActionMetadata = returnAction) {
    return render(
        <ApiProvider client={noopApi}>
            <ActionModalDispatcher
                open
                onOpenChange={() => {}}
                action={action}
                model="Order"
                record={{ id: '1' } as any}
                endpoint="/data/Order"
                onSuccess={() => {}}
            />
        </ApiProvider>,
    )
}

describe('ActionModalDispatcher with a declared federated modal', () => {
    it('shows loading, then the component once it registers late — never the confirm', () => {
        renderDispatcher()
        expect(screen.getByTestId('federated-action-loading')).toBeTruthy()
        expect(screen.queryByText('Devolver?')).toBeNull()

        act(() => {
            registerActionComponent('Order', 'return', ReturnModal as never)
        })
        expect(screen.getByTestId('return-modal').textContent).toBe('returns.return')
        expect(screen.queryByTestId('federated-action-loading')).toBeNull()
        expect(screen.queryByText('Devolver?')).toBeNull()
    })

    it('shows MissingCustomActionModal after the timeout when nothing registers', () => {
        vi.useFakeTimers()
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        renderDispatcher()
        act(() => {
            vi.advanceTimersByTime(FEDERATED_ACTION_MODAL_TIMEOUT_MS - 1)
        })
        expect(screen.getByTestId('federated-action-loading')).toBeTruthy()
        expect(screen.queryByText('No se pudo cargar el formulario')).toBeNull()

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(screen.getByText('No se pudo cargar el formulario')).toBeTruthy()
        expect(screen.queryByText('Devolver?')).toBeNull()
        expect(err).toHaveBeenCalledWith(
            expect.stringContaining('did not register in time'),
            expect.objectContaining({ model: 'Order', action: 'return', modal: 'returns.return' }),
        )
    })

    it('errors immediately (and logs) on an invalid modal slug', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        renderDispatcher({ ...returnAction, modal: 'not a slug' })
        expect(screen.getByText('No se pudo cargar el formulario')).toBeTruthy()
        expect(err).toHaveBeenCalledWith(
            expect.stringContaining('slug is invalid'),
            expect.objectContaining({ model: 'Order', action: 'return', modal: 'not a slug' }),
        )
    })

    it('asks the host loader for the remote and re-asks while waiting', () => {
        vi.useFakeTimers()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const loader = vi.fn()
        setFederatedActionLoader(loader)
        renderDispatcher()
        expect(loader).toHaveBeenCalledTimes(1)
        expect(loader).toHaveBeenCalledWith({ model: 'Order', actionKey: 'return', modal: 'returns.return' })

        act(() => {
            vi.advanceTimersByTime(4_000)
        })
        expect(loader.mock.calls.length).toBeGreaterThan(1)

        // Registration stops the retries.
        act(() => {
            registerActionComponent('Order', 'return', ReturnModal as never)
        })
        const calls = loader.mock.calls.length
        act(() => {
            vi.advanceTimersByTime(10_000)
        })
        expect(loader.mock.calls.length).toBe(calls)
        expect(screen.getByTestId('return-modal')).toBeTruthy()
    })
})

describe('useDynamicRowActions', () => {
    function Harness({ metadata, actionKey }: { metadata: TableMetadata; actionKey: string }) {
        const { handleInternalAction, dialogs } = useDynamicRowActions({
            model: 'Order',
            metadata,
            onRefresh: () => {},
        })
        return (
            <>
                <button onClick={() => handleInternalAction(actionKey, { id: '1' })}>run</button>
                {dialogs}
            </>
        )
    }

    function renderHarness(action: Record<string, unknown>) {
        const metadata = { actions: [action] } as unknown as TableMetadata
        render(
            <ApiProvider client={noopApi}>
                <Harness metadata={metadata} actionKey={action.key as string} />
            </ApiProvider>,
        )
        act(() => {
            screen.getByText('run').click()
        })
    }

    it('keeps `modal` on the action it hands the dispatcher', () => {
        registerActionComponent('Order', 'return', ReturnModal as never)
        renderHarness({ ...returnAction, name: 'return', class: '', type: 'custom' })
        expect(screen.getByTestId('return-modal').textContent).toBe('returns.return')
        expect(screen.queryByText('Devolver?')).toBeNull()
    })

    it('opens the dispatcher for a modal-only action (no fields/confirm/executable)', () => {
        renderHarness({ key: 'return', label: 'Devolver', icon: 'Undo2', modal: 'returns.return', type: 'custom' })
        expect(screen.getByTestId('federated-action-loading')).toBeTruthy()
    })
})
