// @vitest-environment happy-dom
//
// Crear un padre con relaciones hijas `create_inline`: tabla de filas borrador,
// `_children` en el cuerpo, `min` que bloquea y errores 422 por fila.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'

import { DynamicRecordDialog } from '../dialogs/dynamic-record'
import { ApiProvider } from '../api-context'

afterEach(cleanup)

function makeI18n() {
    const inst = i18next.createInstance()
    void inst.init({ lng: 'es', fallbackLng: 'es', react: { useSuspense: false }, resources: { es: { translation: {} } } })
    return inst
}

const parentSchema = {
    title: 'Regla de descuento',
    fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
}

const tierModal = {
    fields: [
        { key: 'rule_id', label: 'Regla', type: 'text' },
        { key: 'min_amount', label: 'Monto mínimo', type: 'number', required: true },
        { key: 'discount_type', label: 'Tipo', type: 'text', required: true },
        { key: 'discount_value', label: 'Valor', type: 'number', required: true },
        { key: 'created_at', label: 'Creado', type: 'date' },
    ],
}

function makeApi(relations: any[]) {
    return {
        get: vi.fn(async (url: string) => {
            if (url === '/metadata/table/DiscountRule') return { data: { data: { relations } } }
            if (url === '/metadata/modal/DiscountRuleTier') return { data: { data: tierModal } }
            return { data: { data: {} } }
        }),
        post: vi.fn(async (_url: string, _body: unknown) => ({ data: { success: true, data: { id: '1' } } })),
        put: async () => ({ data: { success: true } }),
        delete: async () => ({ data: { success: true } }),
    }
}

const tiers = {
    name: 'tiers',
    kind: 'one_to_many',
    through: 'DiscountRuleTier',
    foreign_key: 'rule_id',
    label: 'Escalones',
    create_inline: true,
    embed: true,
}

function setup(api: any, onCreate?: any) {
    render(
        <I18nextProvider i18n={makeI18n()}>
            <ApiProvider client={api as never}>
                <DynamicRecordDialog
                    open
                    onOpenChange={() => {}}
                    mode="create"
                    model="DiscountRule"
                    schema={parentSchema as never}
                    onCreate={onCreate}
                />
            </ApiProvider>
        </I18nextProvider>,
    )
}

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const cell = (field: string, row: number) =>
    within(screen.getByRole('group', { name: `${field}, fila ${row}` })).getByRole(
        field === 'Tipo' ? 'textbox' : 'spinbutton',
    )
const fillRow = (row: number, amount: string, kind: string, value: string) => {
    type(cell('Monto mínimo', row), amount)
    type(cell('Tipo', row), kind)
    type(cell('Valor', row), value)
}
const submit = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement)
const fillName = () => type(document.querySelector('[data-aby-field="name"] input') as HTMLElement, 'Mayoreo')

describe('DynamicRecordDialog create — relaciones create_inline', () => {
    it('pinta la sección solo para relaciones create_inline y oculta FK/auditoría', async () => {
        const other = { name: 'notes', kind: 'one_to_many', through: 'Note', foreign_key: 'rule_id', label: 'Notas', embed: true }
        setup(makeApi([tiers, other]))
        await screen.findByRole('heading', { name: 'Escalones' })
        expect(screen.queryByText('Notas')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /Agregar/ }))
        expect(screen.getByRole('columnheader', { name: /Monto mínimo/ })).toBeTruthy()
        expect(screen.queryByRole('columnheader', { name: /Regla/ })).toBeNull()
        expect(screen.queryByRole('columnheader', { name: /Creado/ })).toBeNull()
    })

    it('agrega, quita y envía _children con el padre en una sola llamada', async () => {
        const api = makeApi([tiers])
        const onCreate = vi.fn(async (_body: Record<string, unknown>) => ({ id: '1' }))
        setup(api, onCreate)
        const add = await screen.findByRole('button', { name: /Agregar/ })
        fireEvent.click(add)
        fireEvent.click(add)
        fireEvent.click(add)
        expect(screen.getAllByRole('button', { name: /Quitar fila/ })).toHaveLength(3)
        fireEvent.click(screen.getByRole('button', { name: 'Quitar fila 3' }))
        fillName()
        fillRow(1, '1000', 'percent', '5')
        fillRow(2, '5000', 'percent', '10')
        submit()
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
        expect(onCreate.mock.calls[0][0]).toMatchObject({
            name: 'Mayoreo',
            _children: {
                tiers: [
                    { min_amount: 1000, discount_type: 'percent', discount_value: 5 },
                    { min_amount: 5000, discount_type: 'percent', discount_value: 10 },
                ],
            },
        })
    })

    it('bloquea el envío con requeridos por fila y con min', async () => {
        const api = makeApi([{ ...tiers, min: 2 }])
        const onCreate = vi.fn()
        setup(api, onCreate)
        const add = await screen.findByRole('button', { name: /Agregar/ })
        expect(screen.getByText(/0 de 2 como mínimo/)).toBeTruthy()
        fillName()
        fireEvent.click(add)
        submit()
        const alerts = await screen.findAllByRole('alert')
        expect(alerts.some((a) => /al menos 2/.test(a.textContent ?? ''))).toBe(true)
        expect(screen.getAllByText(/obligatorio/).length).toBeGreaterThan(0)
        expect(onCreate).not.toHaveBeenCalled()
        expect(add.getAttribute('class')).toMatch(/min-h-11/)
    })

    it('sin relaciones inline el cuerpo es idéntico al de hoy (sin _children)', async () => {
        const api = makeApi([{ ...tiers, create_inline: undefined }])
        const onCreate = vi.fn(async (_body: Record<string, unknown>) => ({}))
        setup(api, onCreate)
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('/metadata/table/DiscountRule'))
        fillName()
        submit()
        await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
        expect(onCreate.mock.calls[0][0]).toEqual({ name: 'Mayoreo' })
        expect(screen.queryByRole('heading', { name: 'Escalones' })).toBeNull()
    })

    it('pinta el 422 en la celda de la fila y conserva lo capturado', async () => {
        const api = makeApi([tiers])
        // `/q` (metadata en lote) también viaja por post: solo falla el create.
        const base = api.post.getMockImplementation()!
        api.post.mockImplementation(async (url: string, body: unknown) => {
            if (url !== '/dynamic/DiscountRule') return base(url, body)
            throw {
                response: {
                    status: 422,
                    data: { errors: { '_children.tiers.1.discount_value': [{ code: 'invalid_type' }] } },
                },
            }
        })
        setup(api)
        const add = await screen.findByRole('button', { name: /Agregar/ })
        fireEvent.click(add)
        fireEvent.click(add)
        fillName()
        fillRow(1, '100', 'percent', '1')
        fillRow(2, '200', 'percent', '999')
        submit()
        await waitFor(() => expect(api.post.mock.calls.filter(c => c[0] === '/dynamic/DiscountRule')).toHaveLength(1))
        await waitFor(() =>
            expect(screen.getByRole('group', { name: 'Valor, fila 2' }).parentElement?.textContent).toMatch(/formato inválido/),
        )
        expect((cell('Valor', 2) as HTMLInputElement).value).toBe('999')
        expect((cell('Monto mínimo', 1) as HTMLInputElement).value).toBe('100')
        expect(screen.getByRole('group', { name: 'Valor, fila 1' }).parentElement?.textContent).not.toMatch(/inválido/)
    })
})
