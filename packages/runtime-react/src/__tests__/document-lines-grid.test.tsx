// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k,
        i18n: { language: 'es' },
    }),
}))

import { DocumentLinesGrid, LineItemsEditor } from '../business/line-items-editor'
import { makeLine, type LineItem } from '../business/line-items'
import type { ProductResult } from '../business/product-search'

afterEach(cleanup)

function Harness({
    initial = [],
    search,
    priceSource,
    mode,
}: {
    initial?: LineItem[]
    search?: (q: any, signal: AbortSignal) => Promise<ProductResult[]>
    priceSource?: 'sale' | 'cost' | 'origin'
    mode?: 'free' | 'from_source'
}) {
    const [lines, setLines] = useState(initial)
    return (
        <>
            <DocumentLinesGrid value={lines} onChange={setLines} search={search} priceSource={priceSource} mode={mode} currency="MXN" />
            <output data-testid="state">{JSON.stringify(lines)}</output>
        </>
    )
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '[]') as LineItem[]

const tire: ProductResult = { id: 'p1', name: 'Llanta X', sku: 'LX', price: 1200, cost: 800, tax_rate: 0.16 }

describe('DocumentLinesGrid', () => {
    it('es el mismo componente que LineItemsEditor', () => {
        expect(LineItemsEditor).toBe(DocumentLinesGrid)
    })

    it('al elegir un producto carga cantidad 1 y el stepper actualiza el importe', async () => {
        const search = vi.fn(async () => [tire])
        render(<Harness search={search} priceSource="cost" />)
        fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'llan' } })
        // RecordPicker: la opción del producto es role="option" clicable (sin <button> anidado).
        const option = await waitFor(() => screen.getByRole('option', { name: /Llanta X/ }), { timeout: 2000 })
        fireEvent.click(option)
        expect(state()[0]).toMatchObject({ description: 'Llanta X', sku: 'LX', quantity: 1, unit_price: 800, catalog_price: 800 })
        expect(screen.getByText(/Catálogo/)).toBeTruthy()
        expect(document.querySelector('[data-slot="line-amount"]')?.textContent).toMatch(/800/)
        fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }))
        expect(state()[0]!.quantity).toBe(2)
        expect(document.querySelector('[data-slot="line-amount"]')?.textContent).toMatch(/1,600/)
        expect(document.querySelector('[data-slot="tax-total"]')?.textContent).toMatch(/256/)
        expect(document.querySelector('[data-slot="grand-total"]')?.textContent).toMatch(/1,856/)
    })

    it('Supr en una descripción vacía borra y se puede deshacer', () => {
        render(<Harness initial={[makeLine({ description: '' })]} />)
        fireEvent.keyDown(screen.getByLabelText('Descripción'), { key: 'Backspace' })
        expect(state()).toHaveLength(0)
        fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
        expect(state()).toHaveLength(1)
    })

    it('desde origen no ofrece alta ni borrado', () => {
        const search = vi.fn(async () => [tire])
        render(<Harness initial={[makeLine({ description: 'Llanta', quantity: 2, max_quantity: 2 })]} search={search} mode="from_source" />)
        expect(screen.queryByLabelText('Buscar producto')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Renglón libre' })).toBeNull()
    })
})
