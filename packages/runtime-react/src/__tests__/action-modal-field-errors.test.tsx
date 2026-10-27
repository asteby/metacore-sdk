// @vitest-environment happy-dom
//
// ProtekAuto, «Configurar origen de envío» (warehouse 0.18.0): a failed submit
//  - must NOT wipe what was typed, even when the list re-renders the dialog with
//    a new `record={{}}` / `action` identity (it did: contact, company, phone…
//    came back empty on the second attempt);
//  - must light up the input the server named — through the `errors` map
//    (host contract, OPS WasmActionError.Fields) or a single `error.field` —
//    with aria-invalid, the message under the input, and focus on it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: any) => o?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionMetadata } from '@asteby/metacore-sdk'

afterEach(cleanup)

const fields = [
    { key: 'contact_name', label: 'Contacto', type: 'text' },
    { key: 'street', label: 'Calle', type: 'text', required: true },
    { key: 'neighborhood', label: 'Colonia', type: 'text' },
    { key: 'postal_code', label: 'Código postal', type: 'text', required: true },
]

const makeAction = () =>
    ({ key: 'save_shipping_origin', label: 'Guardar origen', icon: 'map-pin', placement: 'table', fields: fields.map((f) => ({ ...f })) }) as unknown as ActionMetadata

function Harness({ api, tick }: { api: ApiClient; tick: number }) {
    // Every render hands a NEW record object and a NEW action object, like the
    // list toolbar / a refetched metadata cache do.
    return (
        <ApiProvider client={api}>
            <span data-tick={tick} />
            <ActionModalDispatcher
                open
                onOpenChange={() => {}}
                action={makeAction()}
                model="ShippingOrigin"
                record={{}}
                endpoint="/data/ShippingOrigin/me"
                onSuccess={() => {}}
            />
        </ApiProvider>
    )
}

function setup(postImpl: () => Promise<any>) {
    const post = vi.fn(postImpl)
    const api = { get: vi.fn().mockResolvedValue({ data: {} }), post } as unknown as ApiClient
    const view = render(<Harness api={api} tick={0} />)
    return { post, api, view }
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement
const type = (id: string, v: string) => fireEvent.change(input(id), { target: { value: v } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar origen' }))

describe('action dialog keeps the values and lights up the field', () => {
    it('server `errors` map: values survive a failure and a parent re-render; the field is invalid and focused', async () => {
        const { post, api, view } = setup(() =>
            Promise.reject({
                response: {
                    status: 422,
                    data: {
                        success: false,
                        code: 'invalid_input',
                        message: 'Falta un dato del origen de envío: Colonia.',
                        errors: { neighborhood: 'Falta un dato del origen de envío: Colonia.' },
                    },
                },
            }),
        )
        type('contact_name', 'Ana')
        type('street', 'Calle Huitzilopochtli')
        type('postal_code', '16030')
        submit()
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(input('neighborhood').getAttribute('aria-invalid')).toBe('true'))
        expect(document.querySelector('[data-field-error="neighborhood"]')?.textContent).toContain('Colonia')
        await waitFor(() => expect(document.activeElement).toBe(input('neighborhood')))

        // The list re-renders (new record / action identity): nothing is wiped.
        view.rerender(<Harness api={api} tick={1} />)
        expect(input('contact_name').value).toBe('Ana')
        expect(input('street').value).toBe('Calle Huitzilopochtli')
        expect(input('postal_code').value).toBe('16030')
        expect(input('neighborhood').getAttribute('aria-invalid')).toBe('true')

        // Typing in the field clears its error.
        type('neighborhood', 'Barrio 18')
        expect(input('neighborhood').getAttribute('aria-invalid')).toBeNull()
    })

    it('single `error.field` naming a dialog field lights it up', async () => {
        setup(() =>
            Promise.resolve({
                data: {
                    success: false,
                    error: { code: 'invalid_input', message: 'El código postal no es válido.', field: 'postal_code' },
                },
            }),
        )
        type('street', 'Calle 1')
        type('postal_code', '1')
        submit()
        await waitFor(() => expect(input('postal_code').getAttribute('aria-invalid')).toBe('true'))
        expect(document.querySelector('[data-field-error="postal_code"]')?.textContent).toContain('código postal')
        expect(input('street').value).toBe('Calle 1')
    })

    it('a human label in params.field is not taken for a field key', async () => {
        setup(() =>
            Promise.resolve({
                data: { success: false, error: { code: 'invalid_input', message: 'x', params: { field: 'Colonia / Neighborhood' } } },
            }),
        )
        type('street', 'Calle 1')
        type('postal_code', '16030')
        submit()
        await screen.findByRole('alert')
        expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
        expect(input('street').value).toBe('Calle 1')
    })

    it('client-side required check focuses the first missing field', async () => {
        const { post } = setup(() => Promise.resolve({ data: { success: true } }))
        type('contact_name', 'Ana')
        submit()
        await waitFor(() => expect(input('street').getAttribute('aria-invalid')).toBe('true'))
        await waitFor(() => expect(document.activeElement).toBe(input('street')))
        expect(post).not.toHaveBeenCalled()
        expect(input('contact_name').value).toBe('Ana')
    })
})
