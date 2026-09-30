// @vitest-environment happy-dom
//
// DocumentPage: dos badges independientes con texto explícito, 1 primaria +
// secundarias visibles, destructiva separada y bloqueada con motivo, botones
// inteligentes con contador y pestaña «records» desde una fuente.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k }),
}))
vi.mock('../../dynamic-icon', () => ({ DynamicIcon: () => null }))

import { DocumentPage } from '../document-page'
import { ApiProvider, type ApiClient } from '../../api-context'
import type { DocumentPageRegistration } from '../registry'

afterEach(cleanup)

const registration: DocumentPageRegistration = {
    spec: {
        model: 'invoices',
        title: '{{number}}',
        statuses: [
            {
                id: 'fiscal',
                label: 'Estado fiscal',
                field: '$.fiscal',
                states: [{ value: 'stamped', label: 'Timbrada', tone: 'success' }],
            },
            {
                id: 'billing',
                label: 'Estado de cobro',
                field: '$.billing',
                states: [{ value: 'partial', label: 'Parcial', tone: 'caution' }],
            },
        ],
        metrics: [{ label: 'Total', path: 'total', format: 'money' }],
        actions: [
            { key: 'pay', label: 'Registrar pago' },
            { key: 'send', label: 'Enviar' },
            { key: 'pdf', label: 'Descargar PDF', openUrl: '{{$.pdf}}' },
            {
                key: 'cancel',
                label: 'Solicitar cancelación',
                destructive: true,
                blockedWhen: { when: { field: 'sources.reps.length', op: 'gt', value: 0 }, reason: 'Cancela primero los REP' },
            },
        ],
        layouts: [{ when: { field: '$.fiscal', op: 'eq', value: 'stamped' }, layout: { primary: 'pay', secondary: ['send', 'pdf'], destructive: ['cancel'] } }],
        smartButtons: [{ key: 'reps', label: 'REP', source: 'reps', tab: 'reps' }],
        sources: [{ key: 'reps', model: 'fiscal_documents', foreignKey: 'source_id' }],
        tabs: [
            { key: 'reps', label: 'Pagos y REP', kind: 'records', source: 'reps', columns: [{ label: 'UUID', path: 'fiscal_uuid' }] },
        ],
    },
    derive: () => ({ fiscal: 'stamped', billing: 'partial', pdf: 'https://x/y.pdf' }),
}

function setup(onAction = vi.fn()) {
    const api = {
        get: vi.fn().mockResolvedValue({ data: { success: true, data: [{ id: 'r1', fiscal_uuid: 'REP-UUID-1' }] } }),
    } as unknown as ApiClient
    render(
        <ApiProvider client={api}>
            <DocumentPage registration={registration} record={{ id: 'i1', number: 'A-42', total: 1500 }} onAction={onAction} currency='MXN' />
        </ApiProvider>,
    )
    return { api, onAction }
}

describe('DocumentPage', () => {
    it('muestra cabecera con dos badges de texto explícito y el total en la moneda de la org', async () => {
        setup()
        expect(screen.getByRole('heading', { name: 'A-42' })).toBeTruthy()
        expect(screen.getByText('Timbrada')).toBeTruthy()
        expect(screen.getByText('Parcial')).toBeTruthy()
        expect(screen.getByText(/1,500\.00/)).toBeTruthy()
    })

    it('una primaria, secundarias visibles y la destructiva bloqueada con el contador de REP', async () => {
        const { onAction } = setup()
        await waitFor(() => expect(screen.getAllByText('1').length).toBeGreaterThan(0)) // contador del botón inteligente
        fireEvent.click(screen.getByText('Registrar pago'))
        await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1))
        expect(onAction.mock.calls[0][0].def.key).toBe('pay')
        const cancel = screen.getByRole('button', { name: /Solicitar cancelación/ }) as HTMLButtonElement
        expect(cancel.disabled).toBe(true)
        fireEvent.click(cancel)
        expect(onAction).toHaveBeenCalledTimes(1)
    })

    it('el botón inteligente abre la pestaña con las filas de la fuente', async () => {
        setup()
        await waitFor(() => expect(screen.getAllByText('1').length).toBeGreaterThan(0))
        fireEvent.click(screen.getByRole('button', { name: /REP/ }))
        await waitFor(() => expect(screen.getByText('REP-UUID-1')).toBeTruthy())
    })

    it('openUrl abre el archivo sin pasar por onAction', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        const { onAction } = setup()
        fireEvent.click(screen.getByText('Descargar PDF'))
        await waitFor(() => expect(open).toHaveBeenCalledWith('https://x/y.pdf', '_blank', 'noopener,noreferrer'))
        expect(onAction).not.toHaveBeenCalled()
    })

    it('el contador usa meta.total del servidor, no el tamaño de la página traída', async () => {
        const api = {
            get: vi.fn().mockResolvedValue({
                data: { success: true, data: [{ id: 'r1', fiscal_uuid: 'REP-UUID-1' }], meta: { total: 312 } },
            }),
        } as unknown as ApiClient
        render(
            <ApiProvider client={api}>
                <DocumentPage registration={registration} record={{ id: 'i1', number: 'A-42', total: 1500 }} onAction={vi.fn()} currency='MXN' />
            </ApiProvider>,
        )
        // 312 en el botón inteligente y en la pestaña; nunca «1» (una fila traída).
        await waitFor(() => expect(screen.getAllByText('312').length).toBeGreaterThan(0))
        expect(screen.queryAllByText('1')).toHaveLength(0)
    })
})
