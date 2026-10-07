// @vitest-environment happy-dom
//
// Declarative option display (kernel `option_display`): the picker paints the
// row the server resolved — avatar, title, subtitle, toned metrics (price,
// stock «Agotado»), badges — and keeps the plain row when there is none.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

vi.mock('react-i18next', () => {
    const value = { t: (k: string, o?: Record<string, any>) => o?.defaultValue ?? k, i18n: { language: 'es' } }
    return { useTranslation: () => value }
})

import { DynamicSelectField } from '../dynamic-select-field'
import { ApiProvider, type ApiClient } from '../api-context'
import { CurrencyContext } from '../org-runtime-context'
import { invalidateOptionsCache, projectOption, optionsRequestKey } from '../use-options-resolver'
import { optionsBatchToken } from '../query-batch'
import {
    OptionDisplayRow,
    formatRelativeDate,
    formatTrailingValue,
    getOptionDisplay,
    toneVariant,
    type OptionDisplayData,
} from '../option-display'
import { createFormatter } from '../business/format'
import { withOptionDisplays } from '../business/product-display'
import { ProductHitRow } from '../business/product-options'
import type { ActionFieldDef } from '../types'

afterEach(() => {
    cleanup()
    invalidateOptionsCache()
})

const tire: OptionDisplayData = {
    title: 'Llanta Michelin Primacy 4 205/55R16 91V',
    subtitle: 'MIC-2055516 · 205/55R16',
    image: null,
    trailing: [
        { key: 'price', label: 'Precio', value: 1899.5, format: 'money' },
        { key: 'stock', label: 'Disp.', value: 8, format: 'number', tone: 'success' },
    ],
    badges: [],
    tone: 'success',
}
const oil: OptionDisplayData = {
    title: 'Aceite 5W30',
    subtitle: 'ACE-530',
    trailing: [
        { key: 'price', label: 'Precio', value: 250, format: 'money' },
        { key: 'stock', label: 'Disp.', value: 0, format: 'number', tone: 'danger', text: 'Agotado' },
    ],
    badges: [{ text: 'Servicio', tone: 'info' }],
    tone: 'danger',
    dimmed: true,
}

describe('formatTrailingValue', () => {
    const fmt = createFormatter({ currency: 'MXN' })
    it('money with the org currency (or the item own)', () => {
        expect(formatTrailingValue({ key: 'p', value: 1899.5, format: 'money' }, fmt)).toBe('$1,899.50')
        expect(formatTrailingValue({ key: 'p', value: 10, format: 'money', currency: 'USD' }, fmt)).toBe('$10.00')
    })
    it('number, integer, percent, text', () => {
        expect(formatTrailingValue({ key: 'n', value: 1234.5, format: 'number' }, fmt)).toBe('1,234.5')
        expect(formatTrailingValue({ key: 'n', value: '7.6', format: 'integer' }, fmt)).toBe('8')
        expect(formatTrailingValue({ key: 'n', value: 0.16, format: 'percent' }, fmt)).toBe('16%')
        expect(formatTrailingValue({ key: 'n', value: 16, format: 'percent' }, fmt)).toBe('16%')
        expect(formatTrailingValue({ key: 'n', value: 'ACEPTADA', format: 'text' }, fmt)).toBe('ACEPTADA')
        expect(formatTrailingValue({ key: 'n', value: null, format: 'money' }, fmt)).toBe('')
    })
    it('relative dates', () => {
        const now = new Date('2026-10-07T12:00:00Z')
        expect(formatRelativeDate('2026-10-04T12:00:00Z', 'es-MX', now)).toBe('hace 3 días')
        expect(formatRelativeDate('2026-10-21T12:00:00Z', 'es-MX', now)).toBe('dentro de 2 semanas')
    })
    it('tone → badge variant', () => {
        expect(toneVariant('danger')).toBe('danger')
        expect(toneVariant('neutral')).toBe('muted')
        expect(toneVariant(undefined)).toBe('muted')
    })
})

describe('OptionDisplayRow', () => {
    it('paints title, subtitle, metrics aligned with tabular numbers and the toned chip', () => {
        render(
            <CurrencyContext.Provider value="MXN">
                <OptionDisplayRow display={oil} />
            </CurrencyContext.Provider>,
        )
        expect(screen.getByText('Aceite 5W30')).toBeTruthy()
        expect(screen.getByText('ACE-530')).toBeTruthy()
        expect(screen.getByText('$250.00').className).toContain('tabular-nums')
        const chip = screen.getByText('Agotado')
        expect(chip.getAttribute('data-tone')).toBe('danger')
        expect(screen.getByText('Servicio')).toBeTruthy()
        const row = document.querySelector('[data-slot="option-display"]')!
        expect(row.getAttribute('data-dimmed')).toBe('true')
        expect(document.querySelectorAll('[data-slot="option-metric"]')).toHaveLength(2)
        // Title clamps to two lines instead of truncating to one.
        expect(document.querySelector('[data-slot="option-display-title"]')!.className).toContain('line-clamp-2')
    })
})

describe('options wire: display + context', () => {
    it('projectOption keeps display and leaves it out of meta', () => {
        const o = projectOption({ id: 'p1', label: 'Llanta', display: tire, sku: 'X' })
        expect(getOptionDisplay(o)).toEqual(tire)
        expect(o.meta).toEqual({ sku: 'X' })
        expect(getOptionDisplay(projectOption({ id: 'p2', label: 'Plain' }))).toBeNull()
    })
    it('context is part of the cache key and the batch token', () => {
        const a = optionsRequestKey('s', '/options/p', 'id', '', 20, undefined, { warehouse_id: 'W1' })
        const b = optionsRequestKey('s', '/options/p', 'id', '', 20, undefined, { warehouse_id: 'W2' })
        expect(a).not.toBe(b)
        expect(optionsRequestKey('s', '/options/p', 'id', '', 20, undefined)).toBe(['s', '/options/p', 'id', '', '20', ''].join('\n'))
        expect(optionsBatchToken('products.Product', 'id', 'll', 20, undefined, { warehouse_id: 'W1' })).toBe(
            'o:products.Product?field=id&q=ll&limit=20&ctx.warehouse_id=W1',
        )
    })
})

function host(rows: unknown[]) {
    const get = vi.fn(async (_url: string, config?: { params?: Record<string, unknown> }) => {
        const ids = config?.params?.ids
        const data = typeof ids === 'string' ? rows.filter((r: any) => ids.split(',').includes(r.id)) : rows
        return { data: { success: true, data, meta: { type: 'dynamic' } } }
    })
    const api = { get, post: vi.fn(async () => ({ data: {} })), put: vi.fn(), delete: vi.fn() } as unknown as ApiClient
    return { api, get }
}

const product: ActionFieldDef = { key: 'product_id', label: 'Producto', type: 'dynamic_select', ref: 'products.Product' }

describe('DynamicSelectField with option_display', () => {
    it('lists rich rows, sends the picker context and summarizes the selection in the trigger', async () => {
        const h = host([
            { id: 'p1', value: 'p1', label: 'Llanta', display: tire },
            { id: 'p2', value: 'p2', label: 'Aceite', display: oil },
        ])
        const onChange = vi.fn()
        render(
            <ApiProvider client={h.api}>
                <DynamicSelectField field={product} value="" onChange={onChange} optionsContext={{ warehouse_id: 'W1', branch_id: '' }} />
            </ApiProvider>,
        )
        await act(async () => {
            ;(screen.getByRole('combobox') as HTMLButtonElement).click()
        })
        await screen.findByText('Llanta Michelin Primacy 4 205/55R16 91V')
        const params = h.get.mock.calls[0][1]?.params as Record<string, unknown>
        expect(params['ctx.warehouse_id']).toBe('W1')
        expect('ctx.branch_id' in params).toBe(false)
        expect(screen.getByText('Agotado')).toBeTruthy()
        // «Agotado» is dimmed but still selectable (not blocked).
        const options = screen.getAllByRole('option')
        expect(options[1].getAttribute('aria-disabled')).toBeNull()
        await act(async () => {
            options[1].click()
        })
        expect(onChange).toHaveBeenCalledWith('p2')
    })

    it('a blocked option cannot be picked', async () => {
        const h = host([{ id: 'p3', value: 'p3', label: 'Bloqueado', display: { ...oil, title: 'Bloqueado', blocked: true } }])
        const onChange = vi.fn()
        render(
            <ApiProvider client={h.api}>
                <DynamicSelectField field={product} value="" onChange={onChange} />
            </ApiProvider>,
        )
        await act(async () => {
            ;(screen.getByRole('combobox') as HTMLButtonElement).click()
        })
        const opt = (await screen.findByText('Bloqueado')).closest('[role="option"]') as HTMLElement
        expect(opt.getAttribute('aria-disabled')).toBe('true')
        await act(async () => {
            opt.click()
        })
        expect(onChange).not.toHaveBeenCalled()
    })

    it('a held value shows the compact summary (title + toned metric)', async () => {
        const h = host([{ id: 'p2', value: 'p2', label: 'Aceite', display: oil }])
        render(
            <ApiProvider client={h.api}>
                <DynamicSelectField field={product} value="p2" onChange={vi.fn()} />
            </ApiProvider>,
        )
        await waitFor(() => expect(document.querySelector('[data-slot="option-display-value"]')).toBeTruthy())
        expect(screen.getByText('Aceite 5W30')).toBeTruthy()
        expect(screen.getByText('Agotado')).toBeTruthy()
    })

    it('without display the plain row stays', async () => {
        const h = host([{ id: 'b1', value: 'b1', label: 'Michelin' }])
        render(
            <ApiProvider client={h.api}>
                <DynamicSelectField field={{ ...product, ref: 'Brand' }} value="" onChange={vi.fn()} />
            </ApiProvider>,
        )
        await act(async () => {
            ;(screen.getByRole('combobox') as HTMLButtonElement).click()
        })
        await screen.findByText('Michelin')
        expect(document.querySelector('[data-slot="option-display"]')).toBeNull()
    })
})

describe('withOptionDisplays (product line search)', () => {
    const search = vi.fn(async () => [
        { id: 'P1', name: 'Llanta', price: 1899.5 },
        { id: 'p2', name: 'Aceite', price: 250 },
    ])
    it('one ids lookup with the context, displays merged by id (case-insensitive)', async () => {
        const h = host([{ id: 'p1', display: tire }, { id: 'p2', display: oil }])
        const wrapped = withOptionDisplays(search, h.api as any, { model: 'products.Product', context: { warehouse_id: 'W1', branch_id: null } })
        const out = await wrapped({ kind: 'text', raw: 'a', text: 'a' } as any, new AbortController().signal)
        expect(h.get).toHaveBeenCalledTimes(1)
        expect(h.get.mock.calls[0][0]).toBe('/options/products.Product')
        expect(h.get.mock.calls[0][1]?.params).toEqual({ field: 'id', ids: 'P1,p2', 'ctx.warehouse_id': 'W1' })
        expect(out[1].display).toEqual(oil)
        expect(out[0].price).toBe(1899.5)
    })
    it('a failing lookup returns the results untouched', async () => {
        const api = { get: vi.fn(async () => Promise.reject(new Error('501'))) }
        const out = await withOptionDisplays(search, api as any, { model: 'products.Product' })({} as any, new AbortController().signal)
        expect(out.map((r) => r.display)).toEqual([undefined, undefined])
    })
    it('ProductHitRow paints the display when the product carries one', () => {
        render(<ProductHitRow hit={{ product: { id: 'p2', name: 'Aceite', display: oil } }} currency="MXN" />)
        expect(screen.getByText('Agotado')).toBeTruthy()
        cleanup()
        render(<ProductHitRow hit={{ product: { id: 'p2', name: 'Aceite plano', sku: 'ACE' } }} currency="MXN" />)
        expect(screen.getByText('Aceite plano')).toBeTruthy()
        expect(document.querySelector('[data-slot="option-display"]')).toBeNull()
    })
})
