// @vitest-environment happy-dom
//
// Editar un registro con un select que YA tiene valor y guardar sin tocarlo debe
// conservar ese valor en el payload. Antes los `values` del DynamicForm se
// sembraban en un efecto (primer render con '') y el Select de Radix emitía
// `onValueChange('')`, que pisaba el valor real y viajaba en el PATCH (p.ej. un
// renglón «Refacción» quedaba en «-»). Cubre también: `readonly` de columna en
// `deriveRelationFormFields`, selects vacíos no tocados fuera del PATCH, y el
// modal de renglón con cuerpo con scroll y footer fijo.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k, i18n: { language: 'es' } }),
}))

import { DynamicForm, guardEmptySelect } from '../dynamic-form'
import { DynamicRelation } from '../dynamic-relation'
import { deriveRelationFormFields } from '../dynamic-relation-helpers'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionFieldDef } from '../types'

afterEach(cleanup)

const kindField: ActionFieldDef = {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    options: [
        { value: 'service', label: 'Servicio' },
        { value: 'part', label: 'Refacción' },
    ],
}

describe('DynamicForm — edición con select', () => {
    it('guardar sin tocar el select conserva su valor en el payload', async () => {
        const onSubmit = vi.fn()
        render(
            <DynamicForm
                fields={[{ key: 'description', label: 'Descripción', type: 'text' }, kindField]}
                initialValues={{ id: 'r1', description: 'Balata', kind: 'part' }}
                onSubmit={onSubmit}
            />,
        )
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit).toHaveBeenCalledTimes(1)
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ description: 'Balata', kind: 'part' })
    })

    it('en edición no manda un select vacío que el usuario no tocó', async () => {
        const onSubmit = vi.fn()
        render(
            <DynamicForm
                fields={[{ key: 'description', label: 'Descripción', type: 'text' }, kindField]}
                initialValues={{ id: 'r1', description: 'Balata' }}
                onSubmit={onSubmit}
            />,
        )
        await act(async () => {
            screen.getByText('Guardar').click()
        })
        expect(onSubmit).toHaveBeenCalledTimes(1)
        expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('kind')
    })
})

describe('guardEmptySelect', () => {
    it("ignora '' cuando ya hay valor y '' no es opción", () => {
        const onChange = vi.fn()
        guardEmptySelect('part', onChange, ['service', 'part'])('')
        expect(onChange).not.toHaveBeenCalled()
    })
    it("deja pasar '' si no había valor o si '' es opción válida, y cualquier otro valor", () => {
        const onChange = vi.fn()
        guardEmptySelect('', onChange, ['service', 'part'])('')
        guardEmptySelect('part', onChange, ['', 'part'])('')
        guardEmptySelect('part', onChange, ['service', 'part'])('service')
        expect(onChange.mock.calls).toEqual([[''], [''], ['service']])
    })
})

const META = {
    name: 'work_order_item',
    columns: [
        { key: 'id', label: 'ID', type: 'text', sortable: true, filterable: false, hidden: true },
        { key: 'work_order_id', label: 'OT', type: 'text', sortable: false, filterable: false },
        { key: 'description', label: 'Descripción', type: 'text', sortable: true, filterable: true },
        {
            key: 'kind',
            label: 'Tipo',
            type: 'select',
            sortable: true,
            filterable: true,
            options: [
                { value: 'service', label: 'Servicio' },
                { value: 'part', label: 'Refacción' },
            ],
        },
        { key: 'line_total', label: 'Importe', type: 'number', sortable: false, filterable: false, readonly: true },
    ],
    actions: [],
    hasActions: false,
    enableCRUDActions: false,
}

const DATA = [{ id: 'woi_1', work_order_id: 'wo_1', description: 'Balata', kind: 'part', line_total: 450 }]

function mockApi(): ApiClient {
    return {
        get: vi.fn((url: string) => {
            if (url.startsWith('/metadata/table/')) {
                return Promise.resolve({ data: { success: true, data: META } })
            }
            return Promise.resolve({ data: { success: true, data: DATA } })
        }),
        post: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        put: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
        delete: vi.fn(() => Promise.resolve({ data: { success: true, data: {} } })),
    }
}

describe('DynamicRelation — editar renglón con select', () => {
    it('deriveRelationFormFields copia readonly de la columna', () => {
        const fields = deriveRelationFormFields(META as any, 'work_order_id')
        expect(fields.find((f) => f.key === 'line_total')?.readonly).toBe(true)
        expect(fields.find((f) => f.key === 'kind')?.readonly).toBeUndefined()
    })

    it('el PATCH conserva el tipo y no manda columnas readonly; el modal hace scroll con footer fijo', async () => {
        const api = mockApi()
        render(
            <ApiProvider client={api}>
                <DynamicRelation kind="one_to_many" model="work_order_item" foreignKey="work_order_id" parentId="wo_1" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByText('Balata')).toBeTruthy())
        await act(async () => {
            screen.getByLabelText('Editar').click()
        })
        const dialog = await screen.findByRole('dialog')
        expect(dialog.className).toContain('max-h-[90dvh]')
        expect(dialog.querySelector('.overflow-y-auto')).toBeTruthy()

        await act(async () => {
            screen.getByText('Guardar').click()
        })
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
        const [url, payload] = (api.put as any).mock.calls[0]
        expect(url).toContain('woi_1')
        expect(payload).toMatchObject({ description: 'Balata', kind: 'part' })
        expect(payload).not.toHaveProperty('line_total')
    })
})
