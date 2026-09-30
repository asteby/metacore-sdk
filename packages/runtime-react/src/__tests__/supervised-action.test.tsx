// @vitest-environment happy-dom
//
// useSupervisor: an action with supervisorPolicy asks for the supervisor PIN
// (ApprovalGate) and yields the grant id to send as approval_id; a capability
// holder passes without a prompt; cancelling yields null (do not dispatch).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    }),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn() }) }))

import { ApiProvider, type ApiClient } from '../api-context'
import { PermissionsProvider } from '../permissions-context'
import { ApprovalGateProvider } from '../approval-gate'
import { useSupervisor, withApproval, type SupervisorAuthorization } from '../supervised-action'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

let result: SupervisorAuthorization | null | 'unset'
function Probe({ policy }: { policy?: string }) {
    const { authorize } = useSupervisor()
    return (
        <button
            onClick={async () => {
                result = await authorize({ label: 'Cancelar CFDI', supervisorPolicy: policy }, { model: 'Invoice', recordId: 'inv-1' })
            }}
        >
            go
        </button>
    )
}

function mount(post: ApiClient['post'], caps: string[], policy?: string) {
    result = 'unset'
    const api = { get: vi.fn(), post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
    return render(
        <ApiProvider client={api}>
            <PermissionsProvider permissions={caps} isAdmin={false}>
                <ApprovalGateProvider>
                    <Probe policy={policy} />
                </ApprovalGateProvider>
            </PermissionsProvider>
        </ApiProvider>,
    )
}

describe('useSupervisor', () => {
    it('needs nothing when the action declares no policy', async () => {
        const post = vi.fn()
        mount(post, [])
        fireEvent.click(screen.getByText('go'))
        await waitFor(() => expect(result).toEqual({}))
        expect(post).not.toHaveBeenCalled()
    })

    it('a holder of general.approve_<policy> passes without a prompt or a grant id', async () => {
        const post = vi.fn()
        mount(post, ['general.approve_cancel_cfdi'], 'cancel_cfdi')
        fireEvent.click(screen.getByText('go'))
        await waitFor(() => expect(result).toEqual({}))
        expect(post).not.toHaveBeenCalled()
    })

    it('anyone else types a supervisor PIN and gets the grant id, anchored to the record', async () => {
        const post = vi.fn().mockResolvedValue({ data: { data: { id: 'grant-9' } } })
        mount(post, [], 'cancel_cfdi')
        fireEvent.click(screen.getByText('go'))
        fireEvent.change(await screen.findByLabelText('Motivo'), { target: { value: 'error de captura' } })
        fireEvent.change(screen.getByLabelText('PIN del supervisor'), { target: { value: '4321' } })
        fireEvent.click(screen.getByText('Autorizar'))
        await waitFor(() => expect(result).toEqual({ approvalId: 'grant-9' }))
        expect(post).toHaveBeenCalledWith(
            '/approvals/pin-grant',
            expect.objectContaining({ policy: 'cancel_cfdi', model: 'Invoice', record_id: 'inv-1', pin: '4321' }),
        )
    })

    it('cancelling the prompt yields null', async () => {
        mount(vi.fn(), [], 'cancel_cfdi')
        fireEvent.click(screen.getByText('go'))
        await screen.findByLabelText('Motivo')
        fireEvent.click(screen.getByText('Cancelar'))
        await waitFor(() => expect(result).toBeNull())
    })
})

describe('withApproval', () => {
    it('adds approval_id only when a grant was collected', () => {
        expect(withApproval({ a: 1 }, { approvalId: 'g' })).toEqual({ a: 1, approval_id: 'g' })
        expect(withApproval({ a: 1 }, {})).toEqual({ a: 1 })
        expect(withApproval({ a: 1 }, null)).toEqual({ a: 1 })
    })
})
