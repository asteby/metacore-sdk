// @vitest-environment happy-dom
//
// DocumentEditor — selects «pro» (feedback del dueño 2026-10-06):
//   1. El buscador de producto vive DENTRO de la celda «Descripción» del
//      renglón (no una barra a todo lo ancho) y siempre queda un renglón vacío
//      al final; Enter elige y pasa el foco a «Cant.».
//   2. La lista de resultados se monta en un portal: fuera del contenedor con
//      overflow de la tabla, así no la recorta ni la tapa nada.
//   3. Los dynamic_select con `ref` llevan crear/editar integrados al trigger:
//      sin valor «+» abre el alta; con valor el lápiz abre la edición de ESE
//      registro (y solo entonces). «Crear …» también al pie de la lista.
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: any) => o?.defaultValue ?? k, i18n: { language: 'es' } }),
}))

import { DocumentLinesGrid } from '../business/line-items-editor'
import { makeLine, type LineItem } from '../business/line-items'
import type { ProductResult } from '../business/product-search'
import { DynamicSelectField } from '../dynamic-select-field'
import { EntitySelect } from '../entity-select'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionFieldDef } from '../types'

afterEach(cleanup)

const tire: ProductResult = { id: 'p1', name: 'Llanta 205/55R16', sku: 'LL-205', price: 1500, tax_rate: 0.16 }
const valve: ProductResult = { id: 'p2', name: 'Válvula', sku: 'VAL', price: 40, tax_rate: 0.16 }

function Grid({ initial = [], search }: { initial?: LineItem[]; search: (q: any, s: AbortSignal) => Promise<ProductResult[]> }) {
    const [lines, setLines] = useState(initial)
    return (
        <>
            <DocumentLinesGrid value={lines} onChange={setLines} search={search} columns={['discount', 'tax']} currency="MXN" />
            <output data-testid="state">{JSON.stringify(lines)}</output>
        </>
    )
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '[]') as LineItem[]

describe('DocumentLinesGrid — select de producto en la celda', () => {
    it('el buscador vive en la celda «Descripción» del renglón vacío, no en una fila a todo lo ancho', () => {
        render(<Grid search={vi.fn(async () => [tire])} />)
        const input = screen.getByRole('combobox', { name: 'Buscar producto' })
        const td = input.closest('td')!
        expect(td).toBeTruthy()
        // Ocupa solo su celda: no hay colSpan sobre toda la fila.
        expect(td.colSpan).toBe(1)
        expect(td.closest('tr')!.getAttribute('data-slot')).toBe('line-draft-row')
        expect(td.closest('tr')!.children.length).toBeGreaterThan(1)
    })

    it('la lista sale en un portal fuera del contenedor con overflow y Enter elige y pasa a «Cant.»', async () => {
        render(<Grid search={vi.fn(async () => [tire, valve])} />)
        const input = screen.getByRole('combobox', { name: 'Buscar producto' })
        input.focus()
        fireEvent.change(input, { target: { value: 'llan' } })
        const listbox = await waitFor(() => screen.getByRole('listbox'), { timeout: 2000 })
        await waitFor(() => expect(within(listbox).getAllByRole('option')).toHaveLength(2))

        const scroller = document.querySelector('[data-slot="line-items-editor"] .overflow-x-auto')!
        expect(scroller.contains(listbox)).toBe(false)
        expect(document.querySelector('[data-slot="line-items-editor"]')!.contains(listbox)).toBe(false)
        expect(listbox.closest('[data-slot="line-product-results"]')).toBeTruthy()

        fireEvent.keyDown(input, { key: 'ArrowDown' })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(state()).toHaveLength(1)
        expect(state()[0]).toMatchObject({ product_id: 'p2', description: 'Válvula', unit_price: 40, tax_rate: 0.16, quantity: 1 })
        await waitFor(() => expect((document.activeElement as HTMLElement | null)?.getAttribute('data-cell')).toBe('quantity'))
        const row = (document.activeElement as HTMLElement).closest('tr')!
        expect(row.getAttribute('data-line-key')).toBe(state()[0]!.key)
        // Sigue habiendo un renglón vacío al final, listo para el siguiente.
        expect((screen.getByRole('combobox', { name: 'Buscar producto' }) as HTMLInputElement).value).toBe('')
    })

    it('Enter con texto sin coincidencias agrega un renglón libre con esa descripción', async () => {
        render(<Grid search={vi.fn(async () => [])} />)
        const input = screen.getByRole('combobox', { name: 'Buscar producto' })
        fireEvent.change(input, { target: { value: 'Mano de obra' } })
        await waitFor(() => screen.getByText(/Sin coincidencias/), { timeout: 2000 })
        fireEvent.keyDown(input, { key: 'Enter' })
        expect(state()).toHaveLength(1)
        expect(state()[0]!.description).toBe('Mano de obra')
        expect(state()[0]!.product_id).toBeUndefined()
    })

    it('en un renglón libre, elegir un producto llena ESE renglón (misma clave)', async () => {
        const free = makeLine({ description: '' })
        render(<Grid initial={[free]} search={vi.fn(async () => [tire])} />)
        const cell = screen.getByRole('combobox', { name: 'Descripción' })
        expect(cell.closest('tr')!.getAttribute('data-line-key')).toBe(free.key)
        fireEvent.change(cell, { target: { value: '205' } })
        const option = await waitFor(() => screen.getByRole('option', { name: /Llanta 205/ }), { timeout: 2000 })
        // La opción (role=option) es el elemento interactivo del RecordPicker.
        fireEvent.click(option)
        expect(state()).toHaveLength(1)
        expect(state()[0]).toMatchObject({ key: free.key, product_id: 'p1', unit_price: 1500, sku: 'LL-205' })
    })
})

describe('DynamicSelectField — crear/editar integrados', () => {
    const field: ActionFieldDef = { key: 'customer_id', label: 'Cliente', type: 'dynamic_select', ref: 'customers.Customer' }
    const api = () =>
        ({
            get: vi.fn(async () => ({ data: { success: true, data: [{ id: 'c1', label: 'Transportes del Bajío' }] } })),
            post: vi.fn(),
        }) as unknown as ApiClient

    const capture = (name: string) => {
        const seen: any[] = []
        const fn = (e: Event) => seen.push((e as CustomEvent).detail)
        window.addEventListener(name, fn)
        return { seen, off: () => window.removeEventListener(name, fn) }
    }

    it('sin valor: «+» unido al trigger abre el alta del modelo ref; no hay lápiz', () => {
        const create = capture('metacore:create-record')
        render(
            <ApiProvider client={api()}>
                <DynamicSelectField field={field} value="" onChange={() => {}} />
            </ApiProvider>,
        )
        expect(screen.queryByRole('button', { name: 'Editar Cliente' })).toBeNull()
        const btn = screen.getByRole('button', { name: 'Crear Cliente' })
        expect(btn.getAttribute('data-action')).toBe('create')
        // Unido: comparte borde con el trigger (sin hueco entre ambos).
        expect(screen.getByRole('combobox').className).toContain('rounded-r-none')
        fireEvent.click(btn)
        expect(create.seen).toHaveLength(1)
        expect(create.seen[0].model).toBe('customers.Customer')
        create.off()
    })

    it('con valor: el lápiz abre la edición de ESE registro; no hay «+»', () => {
        const edit = capture('metacore:edit-record')
        const onChange = vi.fn()
        render(
            <ApiProvider client={api()}>
                <DynamicSelectField field={field} value="c1" onChange={onChange} seedOption={{ id: 'c1', value: 'c1', label: 'Transportes del Bajío' }} />
            </ApiProvider>,
        )
        expect(screen.queryByRole('button', { name: 'Crear Cliente' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Editar Cliente' }))
        expect(edit.seen).toHaveLength(1)
        expect(edit.seen[0]).toMatchObject({ model: 'customers.Customer', recordId: 'c1' })
        // Al guardar la edición, el trigger refresca la etiqueta.
        act(() => edit.seen[0].onSaved({ id: 'c1', name: 'Transportes del Bajío SA' }))
        expect(screen.getByRole('combobox').textContent).toContain('Transportes del Bajío SA')
        edit.off()
    })

    it('«Crear …» al pie de la lista, y la lista se monta en un portal', async () => {
        const create = capture('metacore:create-record')
        const { container } = render(
            <ApiProvider client={api()}>
                <DynamicSelectField field={field} value="" onChange={() => {}} />
            </ApiProvider>,
        )
        await act(async () => {
            screen.getByRole('combobox').click()
        })
        await waitFor(() => expect(screen.getByText('Transportes del Bajío')).toBeTruthy())
        const footer = document.querySelector('[data-slot="picker-create"]') as HTMLElement
        expect(footer).toBeTruthy()
        expect(container.contains(footer)).toBe(false)
        fireEvent.click(footer)
        expect(create.seen).toHaveLength(1)
        create.off()
    })

    it('hideCreate quita las dos acciones', () => {
        render(
            <ApiProvider client={api()}>
                <DynamicSelectField field={field} value="c1" onChange={() => {}} hideCreate />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="record-picker-action"]')).toBeNull()
        expect(screen.getByRole('combobox').className).not.toContain('rounded-r-none')
    })
})

describe('EntitySelect — mismo primitivo de acciones', () => {
    const base = { model: 'Supplier', fetcher: async () => [], onSelect: () => {}, canCreate: true, canEdit: true }

    it('sin valor ofrece crear; con valor, editar', () => {
        const { rerender } = render(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <EntitySelect {...base} value={null} label={null} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="record-picker-action"]')!.getAttribute('data-action')).toBe('create')
        rerender(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <EntitySelect {...base} value="s1" label="Llantera Norte" />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="record-picker-action"]')!.getAttribute('data-action')).toBe('edit')
    })
})
