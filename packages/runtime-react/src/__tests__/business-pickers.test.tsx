// @vitest-environment happy-dom
// #1025 VehiclePicker, #1026 RelateDocuments, #1027 PrintSendDialog.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k, i18n: { language: 'es' } }),
}))

import { VehiclePicker, type VehicleResult } from '../business/vehicle-picker'
import { RelateDocuments, serializeRelatedDocuments, type RelatedDocument } from '../business/relate-documents'
import { PrintSendDialog } from '../business/print-send-dialog'
import { PermissionsProvider } from '../permissions-context'
import { ApiProvider, type ApiClient } from '../api-context'
import { BUSINESS_COMPONENTS } from '../business/catalog'
import * as runtime from '../index'

afterEach(cleanup)

const apiStub = (): ApiClient =>
    ({
        get: vi.fn().mockResolvedValue({ data: {} }),
        post: vi.fn().mockResolvedValue({ data: { data: { id: 'v9', plate: 'NEW-001', vin: 'VIN9' } } }),
        put: vi.fn(),
        delete: vi.fn(),
    }) as unknown as ApiClient

describe('exports', () => {
    it('se exportan desde el runtime y están en el catálogo', () => {
        expect(runtime.VehiclePicker).toBeTypeOf('function')
        expect(runtime.RelateDocuments).toBeTypeOf('function')
        expect(runtime.PrintSendDialog).toBeTypeOf('function')
        const names = BUSINESS_COMPONENTS.map((c) => c.name)
        expect(names).toEqual(expect.arrayContaining(['VehiclePicker', 'RelateDocuments', 'PrintSendDialog']))
    })
})

describe('VehiclePicker', () => {
    const veh: VehicleResult = { id: 'v1', plate: 'ABC-123', vin: '1HGCM82633A004352', make: 'Nissan', model: 'Versa', year: 2019 }

    it('busca por placa o VIN y elige el resultado', async () => {
        const search = vi.fn().mockResolvedValue([veh])
        const onChange = vi.fn()
        render(
            <ApiProvider client={apiStub()}>
                <VehiclePicker value={null} onChange={onChange} search={search} />
            </ApiProvider>,
        )
        fireEvent.change(screen.getByPlaceholderText('Placa o VIN'), { target: { value: 'ABC' } })
        const opt = await screen.findByRole('option')
        expect(search.mock.calls[0][0]).toBe('ABC')
        fireEvent.click(opt.querySelector('button')!)
        expect(onChange).toHaveBeenCalledWith(veh)
    })

    it('muestra el vehículo elegido y permite quitarlo', () => {
        const onChange = vi.fn()
        render(
            <ApiProvider client={apiStub()}>
                <VehiclePicker value={veh} onChange={onChange} search={vi.fn()} />
            </ApiProvider>,
        )
        expect(screen.getByText('ABC-123')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Quitar vehículo' }))
        expect(onChange).toHaveBeenCalledWith(null)
    })

    it('alta rápida: sin PermissionsProvider ofrece crear; con permiso denegado, no', () => {
        const { unmount } = render(
            <ApiProvider client={apiStub()}>
                <VehiclePicker value={null} onChange={vi.fn()} search={vi.fn()} />
            </ApiProvider>,
        )
        expect(screen.getByRole('button', { name: 'Nuevo vehículo' })).toBeTruthy()
        unmount()
        render(
            <ApiProvider client={apiStub()}>
                <PermissionsProvider permissions={[]} isAdmin={false}>
                    <VehiclePicker value={null} onChange={vi.fn()} search={vi.fn()} />
                </PermissionsProvider>
            </ApiProvider>,
        )
        expect(screen.queryByRole('button', { name: 'Nuevo vehículo' })).toBeNull()
    })
})

describe('RelateDocuments', () => {
    const types = [
        { value: '01', label: 'Nota de crédito' },
        { value: '04', label: 'Sustitución' },
    ]

    it('agrega varios documentos con tipo de relación y serializa solo datos', async () => {
        const search = vi.fn().mockResolvedValue([
            { id: 'd1', uuid: 'UUID-1', folio: 'A-1' },
            { id: 'd2', uuid: 'UUID-2', folio: 'A-2' },
        ])
        let value: RelatedDocument[] = []
        const onChange = vi.fn((v: RelatedDocument[]) => {
            value = v
        })
        const { rerender } = render(<RelateDocuments value={value} onChange={onChange} relationTypes={types} search={search} />)
        fireEvent.change(screen.getByPlaceholderText('Buscar por folio o UUID'), { target: { value: 'A-' } })
        const list = await screen.findByRole('listbox')
        fireEvent.click(list.querySelectorAll('button')[0])
        expect(onChange).toHaveBeenLastCalledWith([
            expect.objectContaining({ related_document_id: 'd1', relation_type: '01', uuid: 'UUID-1', folio: 'A-1' }),
        ])
        rerender(<RelateDocuments value={value} onChange={onChange} relationTypes={types} search={search} />)
        expect(screen.getAllByText('UUID-1').length).toBeGreaterThan(0)
        // Cambiar el tipo de la relación existente.
        fireEvent.change(screen.getByLabelText('Tipo de relación'), { target: { value: '04' } })
        expect(onChange.mock.lastCall![0][0].relation_type).toBe('04')
        expect(serializeRelatedDocuments(value)).toEqual([{ related_document_id: 'd1', relation_type: '04' }])
    })

    it('respeta max y no duplica', () => {
        const value: RelatedDocument[] = [{ related_document_id: 'd1', relation_type: '01' }]
        render(<RelateDocuments value={value} onChange={vi.fn()} relationTypes={types} search={vi.fn()} max={1} />)
        expect(screen.queryByPlaceholderText('Buscar por folio o UUID')).toBeNull()
    })
})

describe('PrintSendDialog', () => {
    const doc = { folio: 'COT-0004', title: 'Cotización', pdfUrl: 'https://files.example/c.pdf', email: 'a@b.mx', phone: '5550001' }

    it('imprimir abre la URL de PDF del host', () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        render(<PrintSendDialog open onOpenChange={vi.fn()} document={doc} />)
        fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
        expect(open).toHaveBeenCalledWith('https://files.example/c.pdf', '_blank', 'noopener,noreferrer')
        open.mockRestore()
    })

    it('enviar llama onSend con canal y destino; no hay integración propia', async () => {
        const onSend = vi.fn().mockResolvedValue(undefined)
        render(<PrintSendDialog open onOpenChange={vi.fn()} document={doc} onSend={onSend} />)
        expect((screen.getByLabelText('Destino') as HTMLInputElement).value).toBe('a@b.mx')
        fireEvent.click(screen.getByRole('button', { name: /WhatsApp/ }))
        await waitFor(() => expect((screen.getByLabelText('Destino') as HTMLInputElement).value).toBe('5550001'))
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
        await waitFor(() => expect(onSend).toHaveBeenCalledWith('whatsapp', '5550001', doc))
        expect(await screen.findByText('Enviado.')).toBeTruthy()
    })

    it('un fallo de onSend se muestra en el diálogo', async () => {
        const onSend = vi.fn().mockRejectedValue(new Error('Proveedor caído'))
        render(<PrintSendDialog open onOpenChange={vi.fn()} document={doc} onSend={onSend} />)
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
        expect((await screen.findByRole('alert')).textContent).toContain('Proveedor caído')
    })

    it('sin onSend solo ofrece imprimir', () => {
        render(<PrintSendDialog open onOpenChange={vi.fn()} document={doc} />)
        expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull()
    })
})
