// @vitest-environment happy-dom
//
// WizardActionModal contract (the third render-path of ActionModalDispatcher):
// when an action declares `steps: [{title, fields[]}]`, the dispatcher renders a
// multi-step wizard instead of the single-page GenericActionModal. It:
//   - shows only the current step's fields,
//   - gates advancing on the current step's required fields,
//   - accumulates every step's values and POSTs all of them, once, on submit.
//
// happy-dom gotcha: Radix Select resets its value in this environment, so these
// tests gate on visible text/behavior (which fields render, what POST body is
// sent), never on a Select's value.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k }),
}))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionMetadata } from '@asteby/metacore-sdk'

afterEach(cleanup)

function makeApi() {
    const post = vi.fn().mockResolvedValue({ data: { success: true } })
    const api = {
        get: vi.fn().mockResolvedValue({ data: {} }),
        post,
    } as unknown as ApiClient
    return { api, post }
}

const action: ActionMetadata = {
    key: 'workshop_checklist',
    label: 'Checklist de taller',
    icon: 'wrench',
    steps: [
        {
            title: 'Recepción',
            fields: [
                { key: 'plate', label: 'Placa', type: 'text', required: true },
                { key: 'mileage', label: 'Kilometraje', type: 'number' },
            ],
        },
        {
            title: 'Diagnóstico',
            fields: [{ key: 'notes', label: 'Notas', type: 'textarea', required: true }],
        },
    ],
} as unknown as ActionMetadata

function renderModal(api: ApiClient) {
    return render(
        <ApiProvider client={api}>
            <ActionModalDispatcher
                open
                onOpenChange={() => {}}
                action={action}
                model="service_order"
                record={{ id: '42' } as any}
                endpoint="/data/service_order"
                onSuccess={() => {}}
            />
        </ApiProvider>,
    )
}

describe('WizardActionModal', () => {
    it('renders only the first step initially and shows a progress indicator', () => {
        const { api } = makeApi()
        renderModal(api)
        // First step fields present, later step field absent.
        expect(screen.getByText('Placa')).toBeTruthy()
        expect(screen.queryByText('Notas')).toBeNull()
        // Progress label "Paso 1/2".
        expect(screen.getByText(/1\/2/)).toBeTruthy()
    })

    it('blocks advancing when the current step has an unmet required field', () => {
        const { api } = makeApi()
        renderModal(api)
        fireEvent.click(screen.getByText('Siguiente'))
        // Still on step 1 (Notas not shown) because Placa is empty+required.
        expect(screen.queryByText('Notas')).toBeNull()
    })

    it('advances to the next step once required fields pass', () => {
        const { api } = makeApi()
        renderModal(api)
        fireEvent.change(document.getElementById('plate') as HTMLInputElement, {
            target: { value: 'ABC-123' },
        })
        fireEvent.click(screen.getByText('Siguiente'))
        expect(screen.getByText('Notas')).toBeTruthy()
        // Back returns to step 1 with the value retained.
        fireEvent.click(screen.getByText('Atrás'))
        expect((document.getElementById('plate') as HTMLInputElement).value).toBe('ABC-123')
    })

    it('submits ALL accumulated fields once, to the record action endpoint', async () => {
        const { api, post } = makeApi()
        renderModal(api)
        fireEvent.change(document.getElementById('plate') as HTMLInputElement, {
            target: { value: 'ABC-123' },
        })
        fireEvent.click(screen.getByText('Siguiente'))
        fireEvent.change(document.getElementById('notes') as HTMLTextAreaElement, {
            target: { value: 'frenos' },
        })
        // Final step shows the action label as the submit button (the label also
        // appears in the dialog title, so click the last match — the button).
        const labels = screen.getAllByText('Checklist de taller')
        fireEvent.click(labels[labels.length - 1])
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
        const [url, body] = post.mock.calls[0]
        expect(url).toBe('/data/service_order/42/action/workshop_checklist')
        expect(body).toMatchObject({ plate: 'ABC-123', notes: 'frenos' })
    })
})
