// @vitest-environment happy-dom
//
// When an action declares `modal: "<slug>"` and no federated component is
// registered, ActionModalDispatcher must surface an error — never the generic
// ConfirmActionDialog (even if confirm/confirmMessage are also set).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    }),
}))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { ApiProvider, type ApiClient } from '../api-context'
import {
    registerActionComponent,
    unregisterActionComponent,
    type ActionMetadata,
} from '@asteby/metacore-sdk'

afterEach(() => {
    cleanup()
    unregisterActionComponent('SalesOrder', 'authorize_credit')
})

const noopApi: ApiClient = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
} as unknown as ApiClient

const creditAction: ActionMetadata = {
    key: 'authorize_credit',
    label: 'Autorizar a crédito',
    icon: 'Landmark',
    modal: 'credit_approval.authorize_credit',
    confirm: true,
    confirmMessage: 'customers.action.authorize_credit_confirm_message',
    executable: true,
}

function renderDispatcher(action: ActionMetadata = creditAction) {
    return render(
        <ApiProvider client={noopApi}>
            <ActionModalDispatcher
                open
                onOpenChange={() => {}}
                action={action}
                model="SalesOrder"
                record={{ id: '1', folio: 'SO-1' } as any}
                endpoint="/data/SalesOrder"
                onSuccess={() => {}}
            />
        </ApiProvider>,
    )
}

describe('ActionModalDispatcher custom modal contract', () => {
    it('errors when modal is declared but no component is registered (no generic confirm)', () => {
        renderDispatcher()
        expect(screen.getByText('No se pudo cargar el formulario')).toBeTruthy()
        expect(screen.queryByText('customers.action.authorize_credit_confirm_message')).toBeNull()
        expect(screen.queryByRole('button', { name: /autorizar a crédito/i })).toBeNull()
    })

    it('renders the registered custom component when present', () => {
        function CustomModal() {
            return <div data-testid="credit-dossier">dossier</div>
        }
        registerActionComponent('SalesOrder', 'authorize_credit', CustomModal as never)
        renderDispatcher()
        expect(screen.getByTestId('credit-dossier')).toBeTruthy()
        expect(screen.queryByText('No se pudo cargar el formulario')).toBeNull()
    })
})
