// @vitest-environment happy-dom
//
// RecordPicker — el ÚNICO selector de registro del runtime. Matriz del
// primitivo (simple/múltiple, crear con el texto buscado, editar solo con
// valor, portal fuera de overflow-hidden, teclado, estados async) y un test
// por migración clave (DynamicSelectField, EntitySelect, Customer/Product/
// Vehicle pickers, multi-select de `ref`, campo `search` legado del modal).
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const t = (k: string, o?: Record<string, any>) => {
        let s: string = o?.defaultValue ?? k
        for (const [key, v] of Object.entries(o ?? {})) s = s.replace(`{{${key}}}`, String(v))
        return s
    }
    const value = { t, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { RecordPicker, RECORD_PICKER_Z_INDEX, useRecordSearch } from '../record-picker'
import { DynamicSelectField } from '../dynamic-select-field'
import { DynamicMultiSelectField } from '../dynamic-multi-select-field'
import { EntitySelect } from '../entity-select'
import { CustomerPicker, type CustomerResult } from '../business/customer-picker'
import { ProductPicker } from '../business/product-picker'
import { EditField } from '../dialogs/dynamic-record'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionFieldDef } from '../types'
import * as runtime from '../index'

afterEach(cleanup)

interface Row {
    id: string
    name: string
    sku?: string
}
const rows: Row[] = [
    { id: 'r1', name: 'Llantera Norte', sku: 'LN' },
    { id: 'r2', name: 'Llantera Sur', sku: 'LS' },
    { id: 'r3', name: 'Refacciones Bajío', sku: 'RB' },
]
const base = { getKey: (r: Row) => r.id, getLabel: (r: Row) => r.name, getDescription: (r: Row) => r.sku }

function Single(props: Partial<React.ComponentProps<typeof RecordPicker<Row>>> & { initial?: string | null }) {
    const { initial = null, ...rest } = props
    const [value, setValue] = useState<string | null>(initial)
    return (
        <>
            <RecordPicker<Row>
                {...base}
                items={rows}
                entityLabel="Proveedor"
                value={value}
                selected={rows.find((r) => r.id === value) ?? null}
                onSelect={(r) => setValue(r.id)}
                onClear={() => setValue(null)}
                {...rest}
            />
            <output data-testid="value">{value ?? ''}</output>
        </>
    )
}
const valueOf = () => screen.getByTestId('value').textContent
const trigger = () => screen.getAllByRole('combobox')[0]!
const openList = async () => {
    await act(async () => {
        trigger().click()
    })
    return screen.getByRole('listbox')
}
const searchBox = () => screen.getByPlaceholderText('Buscar…') as HTMLInputElement

describe('RecordPicker — selección simple', () => {
    it('abre la lista, elige y cierra; el trigger muestra la etiqueta', async () => {
        render(<Single />)
        expect(trigger().getAttribute('aria-expanded')).toBe('false')
        const list = await openList()
        expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Llantera NorteLN', 'Llantera SurLS', 'Refacciones BajíoRB'])
        fireEvent.click(within(list).getByRole('option', { name: /Llantera Sur/ }))
        expect(valueOf()).toBe('r2')
        expect(screen.queryByRole('listbox')).toBeNull()
        expect(trigger().textContent).toContain('Llantera Sur')
    })

    it('al reabrir resalta el valor actual y el × limpia', async () => {
        render(<Single initial="r3" />)
        const list = await openList()
        const active = within(list).getAllByRole('option').find((o) => o.getAttribute('data-active') != null)!
        expect(active.textContent).toContain('Refacciones')
        expect(active.getAttribute('data-selected')).not.toBeNull()
        fireEvent.keyDown(searchBox(), { key: 'Escape' })
        fireEvent.click(screen.getByRole('button', { name: 'Quitar selección' }))
        expect(valueOf()).toBe('')
    })
})

describe('RecordPicker — selección múltiple', () => {
    function Multi() {
        const [ids, setIds] = useState<string[]>(['r1'])
        const toggle = (r: Row) => setIds((v) => (v.includes(r.id) ? v.filter((x) => x !== r.id) : [...v, r.id]))
        return (
            <>
                <RecordPicker<Row>
                    {...base}
                    multiple
                    items={rows}
                    value={ids}
                    selected={rows.filter((r) => ids.includes(r.id))}
                    onSelect={toggle}
                    onRemove={toggle}
                />
                <output data-testid="value">{ids.join(',')}</output>
            </>
        )
    }

    it('alterna sin cerrar, muestra chips y quita desde el chip', async () => {
        render(<Multi />)
        expect(document.querySelectorAll('[data-slot="record-picker-chip"]')).toHaveLength(1)
        const list = await openList()
        expect(list.getAttribute('aria-multiselectable')).toBe('true')
        fireEvent.click(within(list).getByRole('option', { name: /Refacciones/ }))
        expect(valueOf()).toBe('r1,r3')
        // Sigue abierta para elegir más.
        expect(screen.getByRole('listbox')).toBeTruthy()
        expect(within(list).getByRole('option', { name: /Refacciones/ }).getAttribute('aria-selected')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Llantera Norte' }))
        expect(valueOf()).toBe('r3')
    })
})

describe('RecordPicker — crear / editar', () => {
    it('«Crear …» al pie prellena con el texto buscado; el «+» unido abre el alta sin valor', async () => {
        const onCreate = vi.fn()
        render(<Single onCreate={onCreate} onEdit={vi.fn()} />)
        // Sin valor: «+» unido al trigger, sin lápiz.
        expect(screen.queryByRole('button', { name: 'Editar Proveedor' })).toBeNull()
        expect(trigger().className).toContain('rounded-r-none')
        await openList()
        fireEvent.change(searchBox(), { target: { value: 'Acme Llantas' } })
        const footer = document.querySelector('[data-slot="picker-create"]') as HTMLElement
        expect(footer.textContent).toContain('Crear Proveedor')
        expect(footer.textContent).toContain('«Acme Llantas»')
        fireEvent.click(footer)
        expect(onCreate).toHaveBeenCalledWith('Acme Llantas')
        fireEvent.click(screen.getByRole('button', { name: 'Crear Proveedor' }))
        expect(onCreate).toHaveBeenLastCalledWith('')
    })

    it('el lápiz solo existe con valor y abre la edición', () => {
        const onEdit = vi.fn()
        const { unmount } = render(<Single onEdit={onEdit} />)
        expect(screen.queryByRole('button', { name: 'Editar Proveedor' })).toBeNull()
        unmount()
        render(<Single initial="r1" onEdit={onEdit} onCreate={vi.fn()} />)
        expect(screen.queryByRole('button', { name: 'Crear Proveedor' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Editar Proveedor' }))
        expect(onEdit).toHaveBeenCalledTimes(1)
    })
})

describe('RecordPicker — portal y capas', () => {
    it('la lista sale fuera de un contenedor overflow-hidden y por encima de los diálogos', async () => {
        render(
            <div data-testid="clip" style={{ overflow: 'hidden', height: 40 }}>
                <Single />
            </div>,
        )
        const list = await openList()
        expect(screen.getByTestId('clip').contains(list)).toBe(false)
        const content = list.closest('[data-slot="record-picker-content"]') as HTMLElement
        expect(content).toBeTruthy()
        expect(content.style.zIndex).toBe(String(RECORD_PICKER_Z_INDEX))
        expect(RECORD_PICKER_Z_INDEX).toBeGreaterThan(50)
    })
})

describe('RecordPicker — teclado y ARIA', () => {
    it('↓/↑/Home/End mueven, Enter elige; aria-activedescendant sigue al resaltado', async () => {
        render(<Single />)
        await openList()
        const box = searchBox()
        expect(box.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
        fireEvent.keyDown(box, { key: 'ArrowDown' })
        expect(document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent).toContain('Llantera Sur')
        fireEvent.keyDown(box, { key: 'End' })
        expect(document.getElementById(box.getAttribute('aria-activedescendant')!)!.textContent).toContain('Refacciones')
        fireEvent.keyDown(box, { key: 'Home' })
        fireEvent.keyDown(box, { key: 'ArrowDown' })
        fireEvent.keyDown(box, { key: 'ArrowUp' })
        fireEvent.keyDown(box, { key: 'ArrowDown' })
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(valueOf()).toBe('r2')
    })

    it('Esc cierra sin elegir; ↓ en el trigger abre; teclear en el trigger busca', async () => {
        render(<Single />)
        await openList()
        fireEvent.keyDown(searchBox(), { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
        expect(valueOf()).toBe('')
        fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
        expect(screen.getByRole('listbox')).toBeTruthy()
        fireEvent.keyDown(searchBox(), { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
        fireEvent.keyDown(trigger(), { key: 'r' })
        expect(searchBox().value).toBe('r')
    })

    it('Tab cierra la lista y pasa al siguiente campo', async () => {
        render(
            <>
                <Single />
                <input aria-label="siguiente" />
            </>,
        )
        await openList()
        fireEvent.keyDown(searchBox(), { key: 'Tab' })
        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('siguiente')))
    })

    it('modo input con texto libre: Enter sin coincidencias pasa al host; Esc no burbujea al diálogo', async () => {
        const unhandled = vi.fn()
        const outer = vi.fn()
        function Free() {
            const [text, setText] = useState('')
            const [open, setOpen] = useState(false)
            return (
                <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
                    <RecordPicker<Row>
                        {...base}
                        trigger="input"
                        freeText
                        items={[]}
                        query={text}
                        onQueryChange={setText}
                        open={open}
                        onOpenChange={setOpen}
                        onSelect={() => {}}
                        onUnhandledKeyDown={unhandled}
                        ariaLabel="Descripción"
                        emptyText="Sin coincidencias"
                    />
                </div>
            )
        }
        render(<Free />)
        const box = screen.getByRole('combobox', { name: 'Descripción' })
        fireEvent.change(box, { target: { value: 'Mano de obra' } })
        expect(screen.getByText('Sin coincidencias')).toBeTruthy()
        fireEvent.keyDown(box, { key: 'Escape' })
        expect(outer).not.toHaveBeenCalled()
        expect(box.getAttribute('aria-expanded')).toBe('false')
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(unhandled).toHaveBeenCalledTimes(1)
        expect((box as HTMLInputElement).value).toBe('Mano de obra')
    })
})

describe('RecordPicker — búsqueda async', () => {
    it('debounce, «Buscando…», vacío con crear al pie y error', async () => {
        const search = vi.fn(async (q: string) => {
            if (q === 'falla') throw new Error('500')
            return rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()))
        })
        render(<Single items={undefined} search={search} minChars={2} onCreate={vi.fn()} createFooter="empty" />)
        await openList()
        expect(document.querySelector('[data-slot="picker-min-chars"]')).toBeTruthy()
        fireEvent.change(searchBox(), { target: { value: 'll' } })
        expect(screen.getByText('Buscando…')).toBeTruthy()
        await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
        expect(search).toHaveBeenCalledTimes(1)
        expect(search.mock.calls[0]![0]).toBe('ll')
        // Con resultados no hay «Crear» al pie (modo `empty`).
        expect(document.querySelector('[data-slot="picker-create"]')).toBeNull()
        fireEvent.change(searchBox(), { target: { value: 'zzz' } })
        await waitFor(() => expect(document.querySelector('[data-slot="picker-empty"]')).toBeTruthy())
        expect(document.querySelector('[data-slot="picker-create"]')).toBeTruthy()
        fireEvent.change(searchBox(), { target: { value: 'falla' } })
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    })

    it('useRecordSearch no consulta deshabilitado ni por debajo del mínimo', async () => {
        const search = vi.fn(async () => rows)
        function Probe({ q, enabled }: { q: string; enabled: boolean }) {
            const r = useRecordSearch(q, search, { minChars: 2, delay: 0, enabled })
            return <output data-testid="n">{r.results.length}</output>
        }
        const { rerender } = render(<Probe q="l" enabled />)
        rerender(<Probe q="ll" enabled={false} />)
        await new Promise((r) => setTimeout(r, 20))
        expect(search).not.toHaveBeenCalled()
        rerender(<Probe q="ll" enabled />)
        await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('3'))
    })
})

// ---------------------------------------------------------------------------
// Migraciones
// ---------------------------------------------------------------------------

const capture = (name: string) => {
    const seen: any[] = []
    const fn = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener(name, fn)
    return { seen, off: () => window.removeEventListener(name, fn) }
}

describe('migración: DynamicSelectField', () => {
    it('es un RecordPicker: crear desde la búsqueda manda el texto como nombre al modal del host', async () => {
        const api = {
            get: vi.fn(async () => ({ data: { success: true, data: [{ id: 'b1', label: 'Michelin' }] } })),
            post: vi.fn(),
        } as unknown as ApiClient
        const field: ActionFieldDef = { key: 'brand_id', label: 'Marca', type: 'dynamic_select', ref: 'Brand' }
        const create = capture('metacore:create-record')
        const onChange = vi.fn()
        render(
            <ApiProvider client={api}>
                <DynamicSelectField field={field} value="" onChange={onChange} createDefaults={{ active: true }} />
            </ApiProvider>,
        )
        await act(async () => {
            screen.getByRole('combobox').click()
        })
        await waitFor(() => expect(screen.getByRole('option', { name: /Michelin/ })).toBeTruthy())
        fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'Pirelli' } })
        fireEvent.click(document.querySelector('[data-slot="picker-create"]') as HTMLElement)
        expect(create.seen[0]).toMatchObject({ model: 'Brand', defaults: { name: 'Pirelli', active: true } })
        // El registro creado queda elegido.
        act(() => create.seen[0].onCreated({ id: 'b9', name: 'Pirelli' }))
        expect(onChange).toHaveBeenCalledWith('b9')
        create.off()
    })
})

describe('migración: EntitySelect', () => {
    it('busca con el fetcher, elige, limpia y conserva el slot', async () => {
        const fetcher = vi.fn(async () => [{ value: 's1', label: 'Llantera Norte', description: 'RFC LNO' }])
        const onSelect = vi.fn()
        render(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <EntitySelect model="Supplier" value={null} label={null} onSelect={onSelect} fetcher={fetcher} preload canCreate={false} />
            </ApiProvider>,
        )
        expect(document.querySelector('[data-slot="entity-select"]')).toBeTruthy()
        await act(async () => {
            screen.getByRole('combobox').click()
        })
        fireEvent.click(await screen.findByRole('option', { name: /Llantera Norte/ }))
        expect(onSelect).toHaveBeenCalledWith('s1', 'Llantera Norte')
        cleanup()
        render(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <EntitySelect model="Supplier" value="s1" label="Llantera Norte" onSelect={onSelect} fetcher={fetcher} canCreate={false} canEdit={false} />
            </ApiProvider>,
        )
        expect(screen.getByRole('combobox').textContent).toContain('Llantera Norte')
        fireEvent.click(screen.getByRole('button', { name: 'Quitar selección' }))
        expect(onSelect).toHaveBeenLastCalledWith(null, null)
    })
})

describe('migración: CustomerPicker', () => {
    const c: CustomerResult = { id: 'c1', name: 'Transportes del Bajío', tax_id: 'TBA850312KJ9', balance: 1500, credit_limit: 1000 }

    it('busca en el propio campo, elige, y el elegido muestra saldo y lápiz de edición', async () => {
        const search = vi.fn(async () => [c])
        const onChange = vi.fn()
        render(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <CustomerPicker value={null} onChange={onChange} search={search} currency="MXN" />
            </ApiProvider>,
        )
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'trans' } })
        fireEvent.click(await screen.findByRole('option', { name: /Transportes/ }))
        expect(onChange).toHaveBeenCalledWith(c)
        cleanup()
        render(
            <ApiProvider client={{ get: vi.fn(), post: vi.fn() } as unknown as ApiClient}>
                <CustomerPicker value={c} onChange={onChange} search={search} currency="MXN" />
            </ApiProvider>,
        )
        expect(screen.getByText('TBA850312KJ9')).toBeTruthy()
        expect(screen.getByText(/Adeudo/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Editar cliente' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Quitar cliente' }))
        expect(onChange).toHaveBeenLastCalledWith(null)
    })
})

describe('migración: ProductPicker', () => {
    it('código de barras exacto + Enter elige la variante; sin existencia queda deshabilitado', async () => {
        const product = {
            id: 'p1',
            name: 'Llanta 205/55R16',
            price: 1500,
            variants: [
                { id: 'v1', label: 'Rin 16 · 91V', barcode: '7501234567890', price: 1600 },
                { id: 'v2', label: 'Rin 16 · 94W', barcode: '7501234567891', stock: [{ warehouse_id: 'w1', available: 0 }] },
            ],
        }
        const search = vi.fn(async () => [product])
        const onSelect = vi.fn()
        render(<ProductPicker search={search} onSelect={onSelect} allowOutOfStock={false} warehouseId="w1" />)
        const box = screen.getByRole('combobox')
        fireEvent.change(box, { target: { value: '7501234567890' } })
        const options = await screen.findAllByRole('option')
        expect(options).toHaveLength(2)
        expect(options[1]!.getAttribute('aria-disabled')).toBe('true')
        fireEvent.keyDown(box, { key: 'Enter' })
        expect(onSelect).toHaveBeenCalledWith(product, product.variants[0])
    })
})

describe('migración: multi-select de `ref` y campo `search` legado', () => {
    it('DynamicMultiSelectField guarda un arreglo de ids con chips', async () => {
        const api = {
            get: vi.fn(async () => ({ data: { success: true, data: [{ id: 'g1', label: 'Mayoreo' }, { id: 'g2', label: 'Flotillas' }] } })),
            post: vi.fn(async () => ({ data: { success: false } })),
        } as unknown as ApiClient
        const onChange = vi.fn()
        render(
            <ApiProvider client={api}>
                <DynamicMultiSelectField field={{ key: 'segments', label: 'Segmentos', ref: 'Segment', multiple: true }} value={['g1']} onChange={onChange} />
            </ApiProvider>,
        )
        await waitFor(() => expect(document.querySelector('[data-slot="record-picker-chip"]')?.textContent).toContain('Mayoreo'))
        await act(async () => {
            screen.getByRole('combobox').click()
        })
        fireEvent.click(screen.getByRole('option', { name: /Flotillas/ }))
        expect(onChange).toHaveBeenCalledWith(['g1', 'g2'])
    })

    it('EditField `type: search` usa el RecordPicker contra su searchEndpoint', async () => {
        const api = {
            get: vi.fn(async () => ({ data: { data: [{ id: 'u1', name: 'Ana López' }, { id: 'u2', name: 'Beto Ruiz' }] } })),
        } as unknown as ApiClient
        const onChange = vi.fn()
        render(
            <ApiProvider client={api}>
                <EditField field={{ key: 'user_id', label: 'Usuario', type: 'search', searchEndpoint: '/users/search' }} value="" onChange={onChange} />
            </ApiProvider>,
        )
        await act(async () => {
            screen.getByRole('combobox').click()
        })
        fireEvent.click(await screen.findByRole('option', { name: /Beto Ruiz/ }))
        expect(onChange).toHaveBeenCalledWith('u2')
        expect(screen.getByRole('combobox').textContent).toContain('Beto Ruiz')
    })
})

describe('exports', () => {
    it('RecordPicker y sus piezas son públicas; los wrappers siguen exportados', () => {
        expect(runtime.RecordPicker).toBeTypeOf('function')
        expect(runtime.useRecordSearch).toBeTypeOf('function')
        expect(runtime.useRecordPickerDialog).toBeTypeOf('function')
        expect(runtime.requestRecordCreate).toBeTypeOf('function')
        for (const name of ['DynamicSelectField', 'EntitySelect', 'CustomerPicker', 'ProductPicker', 'VehiclePicker', 'LineProductCell', 'OptionLead', 'PickerCreateItem', 'RecordPickerAction'] as const) {
            expect((runtime as Record<string, unknown>)[name]).toBeTruthy()
        }
    })
})
