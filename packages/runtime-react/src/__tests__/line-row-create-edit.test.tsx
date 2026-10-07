// @vitest-environment happy-dom
//
// Renglón del DocumentEditor «como las apps top»:
//   - crear el producto desde la celda («Crear producto «texto»» / «+»): el
//     producto nuevo entra en ESE renglón y lo llena igual que al elegirlo;
//   - editar el producto del renglón (lápiz en la celda): el renglón toma los
//     valores nuevos salvo lo que el usuario sobrescribió, con aviso «aplicar»;
//   - la tarjeta de la contraparte con etiquetas y catálogos legibles;
//   - placeholder corto y unidad con su etiqueta (nunca la clave cruda).
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }))
vi.mock('react-i18next', () => {
    const t = (k: string, o?: Record<string, any>) => {
        let s: string = o?.defaultValue ?? k
        for (const [key, v] of Object.entries(o ?? {})) s = s.replace(`{{${key}}}`, String(v))
        return s
    }
    const value = { t, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { DocumentLinesGrid } from '../business/line-items-editor'
import { DocumentEditor } from '../business/document-editor'
import { makeLine, serializeLineItems, type LineItem } from '../business/line-items'
import { applyCatalogPending, applyProductToLine, lineOverrides, refreshLineFromProduct } from '../business/document-lines'
import { fieldDisplayMeta, formatOptionValue, linesFromSource, partySummaryRows } from '../business/document-editor-model'
import type { ProductResult } from '../business/product-search'
import { ApiProvider, type ApiClient } from '../api-context'
import type { DocumentFormType } from '../types'

afterEach(cleanup)

const tire: ProductResult = { id: 'p1', name: 'Llanta 205/55R16', sku: 'LL-205', price: 1500, tax_rate: 0.16, unit: 'unit' }

function Grid(props: { initial?: LineItem[]; onCreateProduct?: any; onEditProduct?: any; unitLabel?: (u: string) => string | undefined }) {
    const [lines, setLines] = useState(props.initial ?? [])
    return (
        <>
            <DocumentLinesGrid
                value={lines}
                onChange={setLines}
                search={vi.fn(async () => [])}
                columns={['discount', 'tax']}
                currency="MXN"
                onCreateProduct={props.onCreateProduct}
                onEditProduct={props.onEditProduct}
                unitLabel={props.unitLabel}
            />
            <output data-testid="state">{JSON.stringify(lines)}</output>
        </>
    )
}
const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '[]') as LineItem[]

async function typeAndCreate(input: HTMLElement, text: string) {
    input.focus()
    fireEvent.change(input, { target: { value: text } })
    const create = await waitFor(() => {
        const el = document.querySelector('[data-slot="picker-create"]') as HTMLElement | null
        if (!el) throw new Error('sin pie «Crear»')
        return el
    }, { timeout: 2000 })
    expect(create.textContent).toContain('Crear producto')
    expect(create.textContent).toContain(`«${text}»`)
    fireEvent.click(create)
}

describe('renglón — crear producto desde la celda', () => {
    it('el renglón vacío del final: «Crear producto «texto»» abre el alta prellenada y el producto nuevo llena el renglón', async () => {
        let resolve!: (p: ProductResult) => void
        const onCreate = vi.fn(() => new Promise<ProductResult>((r) => (resolve = r)))
        render(<Grid onCreateProduct={onCreate} unitLabel={(u) => (u === 'unit' ? 'pza' : undefined)} />)
        await typeAndCreate(screen.getByRole('combobox', { name: 'Buscar producto' }), 'Llanta nueva')
        expect(onCreate).toHaveBeenCalledWith('Llanta nueva')
        // Mientras el modal está abierto no se agrega nada.
        expect(state()).toHaveLength(0)
        await act(async () => resolve({ ...tire, id: 'p9', name: 'Llanta nueva', sku: 'LL-NEW', price: 2450 }))
        await waitFor(() => expect(state()).toHaveLength(1))
        expect(state()[0]).toMatchObject({ product_id: 'p9', description: 'Llanta nueva', sku: 'LL-NEW', unit_price: 2450, catalog_price: 2450, tax_rate: 0.16, unit: 'unit', quantity: 1 })
        // La unidad con su etiqueta, nunca la clave cruda.
        const row = document.querySelector(`[data-line-key="${state()[0].key}"]`)!
        expect(row.textContent).toContain('LL-NEW · pza')
        expect(row.textContent).not.toContain('· unit')
        await waitFor(() => expect((document.activeElement as HTMLElement | null)?.getAttribute('data-cell')).toBe('quantity'))
    })

    it('un renglón libre (sin producto): el producto creado queda en ESE renglón, no en uno nuevo', async () => {
        const free = makeLine({ description: '', quantity: 3 })
        const onCreate = vi.fn(async () => ({ ...tire, id: 'p7', name: 'Rin 16' }))
        render(<Grid initial={[free]} onCreateProduct={onCreate} />)
        const cell = screen.getAllByRole('combobox', { name: 'Descripción' })[0]
        await typeAndCreate(cell, 'Rin 16')
        await waitFor(() => expect(state()[0].product_id).toBe('p7'))
        expect(state()).toHaveLength(1)
        expect(state()[0]).toMatchObject({ key: free.key, description: 'Rin 16', quantity: 3, unit_price: 1500 })
    })

    it('el «+» unido al buscador también abre el alta', async () => {
        const onCreate = vi.fn(() => new Promise<ProductResult>(() => {}))
        render(<Grid onCreateProduct={onCreate} />)
        const draft = document.querySelector('[data-slot="line-draft-row"]') as HTMLElement
        fireEvent.click(within(draft).getByRole('button', { name: 'Crear producto' }))
        expect(onCreate).toHaveBeenCalledWith('')
    })

    it('sin `onCreateProduct` no hay pie ni «+» (otros usos del grid quedan igual)', () => {
        render(<Grid />)
        const draft = document.querySelector('[data-slot="line-draft-row"]') as HTMLElement
        expect(within(draft).queryByRole('button', { name: 'Crear producto' })).toBeNull()
    })
})

describe('renglón — editar el producto desde la celda', () => {
    it('lápiz accesible por teclado; al guardar actualiza lo que sigue igual al catálogo y respeta el precio capturado con aviso «aplicar»', async () => {
        const picked = applyProductToLine(makeLine({ quantity: 2 }), tire)
        let resolve!: (p: ProductResult) => void
        const onEdit = vi.fn(() => new Promise<ProductResult>((r) => (resolve = r)))
        render(<Grid initial={[picked]} onEditProduct={onEdit} />)
        // El usuario cambia el precio a mano (override).
        const price = screen.getByRole('textbox', { name: 'Precio' })
        fireEvent.change(price, { target: { value: '1400' } })
        const pencil = screen.getByRole('button', { name: 'Editar producto' })
        expect(pencil.tagName).toBe('BUTTON')
        expect(pencil.getAttribute('tabindex')).not.toBe('-1')
        fireEvent.click(pencil)
        expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'p1' }))
        await act(async () => resolve({ ...tire, name: 'Llanta 205/55R16 XL', sku: 'LL-205XL', price: 1650, tax_rate: 0.08, unit: 'set' }))
        await waitFor(() => expect(state()[0].description).toBe('Llanta 205/55R16 XL'))
        const l = state()[0]
        expect(l).toMatchObject({ sku: 'LL-205XL', tax_rate: 0.08, unit: 'set', catalog_price: 1650, quantity: 2 })
        // Override respetado.
        expect(l.unit_price).toBe(1400)
        const notice = document.querySelector('[data-slot="catalog-pending"]') as HTMLElement
        expect(notice.textContent).toMatch(/Precio de catálogo cambió a .*1,650\.00/)
        fireEvent.click(within(notice).getByRole('button', { name: 'aplicar' }))
        await waitFor(() => expect(state()[0].unit_price).toBe(1650))
        expect(document.querySelector('[data-slot="catalog-pending"]')).toBeNull()
    })

    it('sin overrides no hay aviso: todo el renglón toma el catálogo nuevo', async () => {
        const picked = applyProductToLine(makeLine(), tire)
        render(<Grid initial={[picked]} onEditProduct={vi.fn(async () => ({ ...tire, price: 1800 }))} />)
        fireEvent.click(screen.getByRole('button', { name: 'Editar producto' }))
        await waitFor(() => expect(state()[0].unit_price).toBe(1800))
        expect(document.querySelector('[data-slot="catalog-pending"]')).toBeNull()
    })

    it('sin `onEditProduct` no hay lápiz', () => {
        render(<Grid initial={[applyProductToLine(makeLine(), tire)]} />)
        expect(screen.queryByRole('button', { name: 'Editar producto' })).toBeNull()
    })
})

describe('refreshLineFromProduct (puro)', () => {
    it('dirty por campo: solo pisa lo que sigue igual a la foto del catálogo', () => {
        const line = { ...applyProductToLine(makeLine(), tire), description: 'Llanta con nombre del cliente' }
        expect([...lineOverrides(line)]).toEqual(['description'])
        const next = refreshLineFromProduct(line, { ...tire, name: 'Llanta nueva', price: 1600 })
        expect(next.description).toBe('Llanta con nombre del cliente')
        expect(next.unit_price).toBe(1600)
        expect(next.catalog_pending).toEqual({ description: 'Llanta nueva' })
        // La foto avanza: el override sigue siéndolo, lo demás queda limpio.
        expect([...lineOverrides(next)]).toEqual(['description'])
        expect(applyCatalogPending(next).description).toBe('Llanta nueva')
    })

    it('renglón de un documento origen: no cambia cantidad, tope ni vínculo, ni pisa los precios del origen', () => {
        const [src] = linesFromSource([{ id: 'sol-1', product_id: 'p1', product_name: 'Llanta', quantity: 4, remaining_quantity: 2, unit_price: 1300, tax_rate: 0.16 }])
        const next = refreshLineFromProduct(src, { ...tire, price: 1700 })
        expect(next).toMatchObject({ quantity: 2, max_quantity: 2, source_line_id: 'sol-1', unit_price: 1300, description: 'Llanta', product_id: 'p1' })
        expect(next.catalog_pending?.unit_price).toBe(1700)
    })

    it('la foto y el aviso no viajan al backend', () => {
        const next = refreshLineFromProduct({ ...applyProductToLine(makeLine(), tire), unit_price: 1 }, { ...tire, price: 2 })
        const [row] = serializeLineItems([next])
        expect(row).not.toHaveProperty('catalog')
        expect(row).not.toHaveProperty('catalog_pending')
    })
})

describe('tarjeta de la contraparte', () => {
    it('etiqueta del campo, valores de catálogo «código · texto» y sin vacíos ni claves crudas', () => {
        const meta = fieldDisplayMeta([
            [{ key: 'tax_id', label: 'customers.field.tax_id' }, { key: 'email', label: 'Correo' }],
            [{ key: 'fiscal_data.uso_cfdi', label: 'Uso del CFDI', options: [{ value: 'G03', label: 'Gastos en general' }] }],
        ], (s) => (s === 'customers.field.tax_id' ? 'RFC' : s))
        const rows = partySummaryRows(
            { tax_id: 'TBA850312KJ9', email: '  ', fiscal_data: { uso_cfdi: 'G03', regimen: '601' } },
            ['tax_id', 'email'],
            {},
            6,
            meta,
        )
        expect(rows).toEqual([
            { key: 'tax_id', label: 'RFC', value: 'TBA850312KJ9' },
            { key: 'fiscal_data.uso_cfdi', label: 'Uso del CFDI', value: 'G03 · Gastos en general' },
            { key: 'fiscal_data.regimen', label: 'Regimen', value: '601' },
        ])
    })

    it('formatOptionValue: la etiqueta que ya trae el código va tal cual; sin opción, el valor', () => {
        expect(formatOptionValue('G03', [{ value: 'G03', label: 'G03 · Gastos en general' }])).toBe('G03 · Gastos en general')
        expect(formatOptionValue('active', [{ value: 'active', label: 'Activo' }])).toBe('Activo')
        expect(formatOptionValue('X', [])).toBe('X')
    })
})

// ---- DocumentEditor: el puente con el host ----------------------------------

const invoice: DocumentFormType = {
    key: 'invoice',
    label: 'Factura',
    value: 'I',
    layout: 'editor',
    party: { field: 'customer_id', model: 'customers.Customer', summary: ['tax_id', 'email'] },
    fields: [{ key: 'customer_id', label: 'Cliente', type: 'text', required: true }],
    lines: { columns: ['tax'] },
    submit_label: 'Guardar factura',
}

function makeApi(routes: Record<string, (url: string, cfg?: any) => unknown>) {
    const get = vi.fn(async (url: string, cfg?: any) => {
        for (const [prefix, fn] of Object.entries(routes)) if (url === prefix || url.startsWith(prefix + '?')) return { data: fn(url, cfg) }
        if (url.startsWith('/metadata')) throw Object.assign(new Error('404'), { response: { status: 404 } })
        return { data: { data: [] } }
    })
    return { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient & { get: typeof get }
}

describe('DocumentEditor — crear/editar el producto del renglón por el host', () => {
    it('crear: dispara metacore:create-record prellenado y llena el renglón con el registro leído del catálogo', async () => {
        const created = { id: 'p9', name: 'Válvula nueva', sku: 'VAL-N', unit_price: 120, unit_of_measure: 'unit', is_active: true }
        const api = makeApi({
            '/data/products.Product': () => ({ data: [created] }),
            '/metadata/modal/products.Product': () => ({ data: { fields: [{ key: 'unit_of_measure', label: 'Unidad', options: [{ value: 'unit', label: 'pza' }] }] } }),
        })
        const events: any[] = []
        const onEvt = (e: Event) => events.push((e as CustomEvent).detail)
        window.addEventListener('metacore:create-record', onEvt)
        render(
            <ApiProvider client={api} batch={false}>
                <DocumentEditor model="customers.Invoice" forms={{ types: [invoice] }} type={invoice} onCancel={() => {}} currency="MXN" defaultTaxRate={0.16} />
            </ApiProvider>,
        )
        await typeAndCreate(screen.getByRole('combobox', { name: 'Buscar producto' }), 'Válvula nueva')
        window.removeEventListener('metacore:create-record', onEvt)
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({ model: 'products.Product', defaults: { name: 'Válvula nueva' } })
        await act(async () => events[0].onCreated({ id: 'p9' }))
        const row = await waitFor(() => {
            const r = document.querySelector('[data-slot="editor-lines"] tr[data-line-key]') as HTMLElement | null
            if (!r) throw new Error('sin renglón')
            return r
        })
        expect((within(row).getByRole('textbox', { name: 'Descripción' }) as HTMLInputElement).value).toBe('Válvula nueva')
        expect((within(row).getByRole('textbox', { name: 'Precio' }) as HTMLInputElement).value).toBe('120')
        await waitFor(() => expect(row.textContent).toContain('VAL-N · pza'))
    })

    it('editar: el lápiz dispara metacore:edit-record con el id del producto del renglón', async () => {
        const rec = { id: 'p1', name: 'Llanta', sku: 'LL', unit_price: 1500, is_active: true }
        const api = makeApi({ '/data/products.Product': () => ({ data: [rec] }) })
        render(
            <ApiProvider client={api} batch={false}>
                <DocumentEditor model="customers.Invoice" forms={{ types: [invoice] }} type={invoice} onCancel={() => {}} currency="MXN" defaultTaxRate={0.16} />
            </ApiProvider>,
        )
        const input = screen.getByRole('combobox', { name: 'Buscar producto' })
        input.focus()
        fireEvent.change(input, { target: { value: 'Llan' } })
        await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0), { timeout: 2000 })
        fireEvent.keyDown(input, { key: 'Enter' })
        const events: any[] = []
        const onEvt = (e: Event) => events.push((e as CustomEvent).detail)
        window.addEventListener('metacore:edit-record', onEvt)
        fireEvent.click(await screen.findByRole('button', { name: 'Editar producto' }))
        window.removeEventListener('metacore:edit-record', onEvt)
        expect(events[0]).toMatchObject({ model: 'products.Product', recordId: 'p1' })
        rec.unit_price = 1999
        rec.name = 'Llanta XL'
        await act(async () => events[0].onSaved(rec))
        await waitFor(() => expect((screen.getByRole('textbox', { name: 'Precio' }) as HTMLInputElement).value).toBe('1999'))
        expect((screen.getByRole('textbox', { name: 'Descripción' }) as HTMLInputElement).value).toBe('Llanta XL')
    })

    it('tarjeta: si la clave con módulo no resuelve, usa la corta; etiquetas y catálogos legibles', async () => {
        const api = makeApi({
            '/data/customers.Customer': () => ({ data: [{ id: 'c1', name: 'ACME', tax_id: 'AAA010101AAA', email: '', fiscal_data: { uso_cfdi: 'G03' } }] }),
            '/metadata/modal/Customer': () => ({ data: { fields: [{ key: 'tax_id', label: 'RFC' }, { key: 'fiscal_data.uso_cfdi', label: 'Uso del CFDI', options: [{ value: 'G03', label: 'Gastos en general' }] }] } }),
        })
        render(
            <ApiProvider client={api} batch={false}>
                <DocumentEditor model="customers.Invoice" forms={{ types: [invoice] }} type={invoice} onCancel={() => {}} currency="MXN" />
            </ApiProvider>,
        )
        fireEvent.change(document.getElementById('customer_id')!, { target: { value: 'c1' } })
        const card = await waitFor(() => {
            const c = document.querySelector('[data-slot="party-card"]') as HTMLElement | null
            if (!c || !c.textContent?.includes('RFC') || !c.textContent.includes('Gastos')) throw new Error('tarjeta sin etiquetas')
            return c
        })
        expect(card.textContent).toContain('G03 · Gastos en general')
        expect(card.textContent).not.toContain('tax_id')
        expect(card.textContent).not.toContain('uso_cfdi')
        // El correo vacío no aparece.
        expect(within(card).queryByText(/email|Correo/i)).toBeNull()
    })
})
