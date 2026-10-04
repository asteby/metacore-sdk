// @vitest-environment happy-dom
//
// Action dialogs (PIT-046 #1023, FAC-3/PIT-051 #1024):
//  - a failed submit (422 with `errors`, or 500) paints a banner INSIDE the
//    dialog and keeps it open;
//  - a stamp result ({fiscal_uuid, pdf_url, xml_url}) renders as a panel with
//    PDF/XML links, never as raw JSON; other payloads invent nothing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: any) => o?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { ActionModalDispatcher } from '../action-modal-dispatcher'
import { extractStampResult } from '../cfdi-stamp-panel'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionMetadata } from '@asteby/metacore-sdk'

afterEach(cleanup)

const action = {
    key: 'rebill',
    label: 'Refacturar',
    icon: 'file',
    fields: [{ key: 'reason', label: 'Motivo', type: 'text' }],
} as unknown as ActionMetadata

function setup(postImpl: () => Promise<any>) {
    const post = vi.fn(postImpl)
    const api = { get: vi.fn().mockResolvedValue({ data: {} }), post } as unknown as ApiClient
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    render(
        <ApiProvider client={api}>
            <ActionModalDispatcher
                open
                onOpenChange={onOpenChange}
                action={action}
                model="invoice"
                record={{ id: '7' } as any}
                endpoint="/data/invoice"
                onSuccess={onSuccess}
            />
        </ApiProvider>,
    )
    return { post, onOpenChange, onSuccess }
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Refacturar' }))

describe('action dialog error banner', () => {
    it('shows the 422 field errors in the dialog and stays open', async () => {
        const { onOpenChange, onSuccess } = setup(() =>
            Promise.reject({
                response: {
                    status: 422,
                    data: { success: false, message: 'validation failed', errors: { reason: ['Motivo inválido para SAT'] } },
                },
            }),
        )
        submit()
        const banner = await screen.findByRole('alert')
        expect(banner.textContent).toContain('Motivo inválido para SAT')
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
        expect(onSuccess).not.toHaveBeenCalled()
    })

    it('shows the server message of a 500 in the dialog', async () => {
        const { onOpenChange } = setup(() =>
            Promise.reject({ response: { status: 500, data: { success: false, message: 'PAC no disponible', details: 'timeout 30s' } } }),
        )
        submit()
        const banner = await screen.findByRole('alert')
        expect(banner.textContent).toContain('PAC no disponible')
        expect(banner.textContent).toContain('timeout 30s')
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })
})

describe('stamp result panel', () => {
    it('renders UUID + PDF/XML links instead of JSON', async () => {
        const { onSuccess } = setup(() =>
            Promise.resolve({
                data: {
                    success: true,
                    data: {
                        document_id: 'd1',
                        fiscal_uuid: '6B1C0E7E-0000-4000-8000-ABCDEF123456',
                        pdf_url: 'https://files.example/f.pdf',
                        xml_url: 'https://files.example/f.xml',
                    },
                },
            }),
        )
        submit()
        const uuid = await screen.findByText('6B1C0E7E-0000-4000-8000-ABCDEF123456')
        expect(uuid).toBeTruthy()
        expect((screen.getByText('Descargar PDF').closest('a') as HTMLAnchorElement).href).toBe('https://files.example/f.pdf')
        expect((screen.getByText('Descargar XML').closest('a') as HTMLAnchorElement).href).toBe('https://files.example/f.xml')
        expect(document.body.textContent).not.toContain('document_id')
        expect(onSuccess).not.toHaveBeenCalled()
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    })

    it('does not invent a fiscal result without the keys', () => {
        expect(extractStampResult({ success: true, data: { id: 1, name: 'x' } })).toBeUndefined()
        expect(extractStampResult({ success: true })).toBeUndefined()
        expect(extractStampResult({ data: { uuid: 'abc' } })).toBeUndefined()
        expect(extractStampResult({ data: { fiscal_uuid: 'U' } })).toMatchObject({ fiscalUuid: 'U' })
    })
})
