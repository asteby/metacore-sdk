// @vitest-environment happy-dom
//
// ApprovalGate: inline PIN grants + parked-request approval, and the capability
// bypass that lets a supervisor skip their own prompt.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    }),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { info: vi.fn(), success: vi.fn(), error: vi.fn() }) }))

import { ApiProvider, type ApiClient } from '../api-context'
import { PermissionsProvider } from '../permissions-context'
import {
    ApprovalGateProvider,
    useApprovalGate,
    approvalRequiredInfo,
    APPROVAL_PARKED_EVENT,
    type ApprovalGrant,
} from '../approval-gate'
import { toastServerError } from '../server-error'
import { toast } from 'sonner'

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

function makeApi(post: ApiClient['post']): ApiClient {
    return { get: vi.fn(), post, put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
}

let lastGrant: ApprovalGrant | null | undefined
function Probe({ policy }: { policy: string }) {
    const gate = useApprovalGate()
    return (
        <button
            onClick={async () => {
                lastGrant = await gate.requestApproval({ policy, label: 'Venta sin existencias', context: { qty: 3 } })
            }}
        >
            ask
        </button>
    )
}

function mount(post: ApiClient['post'], caps: string[] = [], isAdmin = false) {
    lastGrant = undefined
    return render(
        <ApiProvider client={makeApi(post)}>
            <PermissionsProvider permissions={caps} isAdmin={isAdmin}>
                <ApprovalGateProvider>
                    <Probe policy="oversell" />
                </ApprovalGateProvider>
            </PermissionsProvider>
        </ApiProvider>,
    )
}

function fill(reason: string, pin: string) {
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: reason } })
    fireEvent.change(screen.getByLabelText('PIN del supervisor'), { target: { value: pin } })
}

describe('ApprovalGate', () => {
    it('a holder of general.approve_<policy> passes without a prompt', async () => {
        const post = vi.fn()
        mount(post, ['general.approve_oversell'])
        await act(async () => fireEvent.click(screen.getByText('ask')))
        expect(lastGrant).toEqual({ id: null, policy: 'oversell', bypassed: true })
        expect(post).not.toHaveBeenCalled()
        expect(screen.queryByLabelText('PIN del supervisor')).toBeNull()
    })

    it('posts pin-grant with reason + context and resolves the audit id', async () => {
        const post = vi.fn().mockResolvedValue({ data: { success: true, data: { id: 'audit-1' } } })
        mount(post)
        await act(async () => fireEvent.click(screen.getByText('ask')))
        const submit = screen.getByText('Autorizar').closest('button')!
        expect(submit.hasAttribute('disabled')).toBe(true) // reason + PIN required
        fill('cliente esperando', '4321')
        await act(async () => fireEvent.click(submit))
        await waitFor(() => expect(lastGrant).toBeDefined())
        expect(post).toHaveBeenCalledWith(
            '/approvals/pin-grant',
            expect.objectContaining({ policy: 'oversell', pin: '4321', reason: 'cliente esperando', context: { qty: 3 } }),
        )
        expect(lastGrant).toMatchObject({ id: 'audit-1', bypassed: false })
    })

    it('a wrong PIN keeps the dialog open with an inline message and nothing resolves', async () => {
        const post = vi.fn().mockRejectedValue({ response: { data: { error: { code: 'approval_pin_invalid' } } } })
        mount(post)
        await act(async () => fireEvent.click(screen.getByText('ask')))
        fill('r', '0000')
        await act(async () => fireEvent.click(screen.getByText('Autorizar').closest('button')!))
        expect(await screen.findByRole('alert')).toBeTruthy()
        expect(lastGrant).toBeUndefined()
    })

    it('cancelling resolves null (fail closed)', async () => {
        mount(vi.fn())
        await act(async () => fireEvent.click(screen.getByText('ask')))
        await act(async () => fireEvent.click(screen.getByText('Cancelar')))
        await waitFor(() => expect(lastGrant).toBeNull())
    })

    it('a parked approval_required toast offers the PIN and approves through approve-pin', async () => {
        const post = vi.fn().mockResolvedValue({ data: { success: true } })
        mount(post)
        const err = {
            response: {
                data: { success: false, error: { code: 'approval_required' }, meta: { approval_request_id: 'req-9', approval_label: 'Precio bajo el piso', approval_roles: ['gerente'] } },
            },
        }
        expect(approvalRequiredInfo(err)).toMatchObject({ requestId: 'req-9', roles: ['gerente'] })
        toastServerError(err)
        const opts = (toast.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
        expect(toast.error).not.toHaveBeenCalled()
        await act(async () => opts.action.onClick())
        fill('autorizado', '1234')
        await act(async () => fireEvent.click(screen.getByText('Autorizar').closest('button')!))
        await waitFor(() => expect(post).toHaveBeenCalledWith('/approvals/req-9/approve-pin', { pin: '1234', reason: 'autorizado' }))
    })

    it('without a gate mounted the parked toast has no PIN action and the event is inert', () => {
        toastServerError({ response: { data: { error: { code: 'approval_required' }, meta: { approval_request_id: 'x' } } } })
        expect((toast.info as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].action).toBeUndefined()
        window.dispatchEvent(new CustomEvent(APPROVAL_PARKED_EVENT, { detail: { requestId: 'x', roles: [] } }))
    })
})
