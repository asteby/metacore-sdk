// @vitest-environment happy-dom
//
// Dependent (cascading) options contract:
//   - resolveDependsValue (pure): a cell `dependsOn` resolves from the row
//     (sibling) first, then the header form values; empty/unset → ''.
//   - useOptionsResolver: a `filterValue` is forwarded as `&filter_value=` and
//     re-fetches when it changes; an empty value omits the param.
//   - DynamicLineItems → cell with `dependsOn`: the picker is disabled while the
//     header field is empty, and once the header field has a value the options
//     request carries that value as `filter_value` and re-fetches on change.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'

// Identity translator so any raw i18n keys surface verbatim.
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}))

import {
    resolveDependsValue,
    getDependsOn,
    getOptionsConfig,
    resolveOptionsSource,
} from '../dynamic-form-schema'
import { useOptionsResolver } from '../use-options-resolver'
import { DynamicLineItems } from '../dynamic-line-items'
import { ApiProvider, type ApiClient } from '../api-context'
import type { ActionFieldDef } from '../types'
import { useState } from 'react'

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Pure resolution
// ---------------------------------------------------------------------------
describe('getDependsOn / resolveDependsValue', () => {
    const field = (over: Partial<ActionFieldDef>): ActionFieldDef =>
        ({ key: 'product_id', label: 'Producto', type: 'dynamic_select', ...over })

    it('reads camelCase dependsOn and snake_case depends_on', () => {
        expect(getDependsOn(field({ dependsOn: 'wh' }))).toBe('wh')
        expect(getDependsOn(field({ depends_on: 'wh' }))).toBe('wh')
        expect(getDependsOn(field({}))).toBeUndefined()
    })

    it('resolves from header form values', () => {
        const f = field({ depends_on: 'source_warehouse_id' })
        expect(resolveDependsValue(f, { source_warehouse_id: 'W1' })).toBe('W1')
    })

    it('prefers a sibling row value over the header', () => {
        const f = field({ dependsOn: 'warehouse_id' })
        const out = resolveDependsValue(f, { warehouse_id: 'HEADER' }, { warehouse_id: 'ROW' })
        expect(out).toBe('ROW')
    })

    it('falls back to header when the row value is blank', () => {
        const f = field({ dependsOn: 'warehouse_id' })
        const out = resolveDependsValue(f, { warehouse_id: 'HEADER' }, { warehouse_id: '' })
        expect(out).toBe('HEADER')
    })

    it('returns empty string when the dependency is unset', () => {
        const f = field({ dependsOn: 'warehouse_id' })
        expect(resolveDependsValue(f, {})).toBe('')
        expect(resolveDependsValue(field({}), { a: 1 })).toBe('')
    })
})

describe('getOptionsConfig / resolveOptionsSource', () => {
    const field = (over: Partial<ActionFieldDef>): ActionFieldDef =>
        ({ key: 'product_id', label: 'Producto', type: 'dynamic_select', ...over })

    it('reads camelCase optionsConfig and snake_case options_config', () => {
        expect(getOptionsConfig(field({ optionsConfig: { source: 'stock' } }))?.source).toBe('stock')
        expect(getOptionsConfig(field({ options_config: { source: 'stock' } }))?.source).toBe('stock')
        expect(getOptionsConfig(field({}))).toBeUndefined()
    })

    it('routes to the source model with field=value when optionsConfig.source is present', () => {
        const f = field({
            ref: 'products.Product',
            options_config: { source: 'stock', filter_by: 'warehouse_id', value: 'product_id', description: 'quantity' },
        })
        const out = resolveOptionsSource(f)
        expect(out.endpoint).toBe('/options/stock')
        expect(out.fieldKey).toBe('product_id')
        // source wins over ref — the ref pointer is not used for routing.
        expect(out.ref).toBeUndefined()
    })

    it('falls back to the field key when optionsConfig.value is absent', () => {
        const f = field({ key: 'item_id', options_config: { source: 'stock' } })
        const out = resolveOptionsSource(f)
        expect(out.endpoint).toBe('/options/stock')
        expect(out.fieldKey).toBe('item_id')
    })

    it('keeps ref-based resolution when there is no optionsConfig.source', () => {
        const f = field({ ref: 'products.Product' })
        const out = resolveOptionsSource(f)
        expect(out.endpoint).toBeUndefined()
        expect(out.ref).toBe('products.Product')
        expect(out.fieldKey).toBe('id')
    })
})

// ---------------------------------------------------------------------------
// useOptionsResolver — filter_value forwarding + re-fetch
// ---------------------------------------------------------------------------
function Harness({ filterValue }: { filterValue?: string }) {
    const { options } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref: 'products.Product',
        filterValue,
    })
    return <div data-testid="count">{options.length}</div>
}

describe('useOptionsResolver filter_value', () => {
    it('forwards a non-empty filter_value and re-fetches on change', async () => {
        const get = vi.fn(async () => ({
            data: { success: true, data: [{ id: '1', label: 'One' }], meta: { type: 'dynamic', count: 1 } },
        }))
        const client = { get } as unknown as ApiClient

        const { rerender } = render(
            <ApiProvider client={client}>
                <Harness filterValue="W1" />
            </ApiProvider>,
        )
        await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'))

        // First call carried filter_value=W1.
        const firstParams = get.mock.calls[0][1]?.params
        expect(firstParams.filter_value).toBe('W1')

        // Change the parent value → a fresh request with the new filter_value.
        rerender(
            <ApiProvider client={client}>
                <Harness filterValue="W2" />
            </ApiProvider>,
        )
        await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
        const lastParams = get.mock.calls[get.mock.calls.length - 1][1]?.params
        expect(lastParams.filter_value).toBe('W2')
    })

    it('omits filter_value when empty', async () => {
        const get = vi.fn(async () => ({
            data: { success: true, data: [], meta: { type: 'dynamic', count: 0 } },
        }))
        const client = { get } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <Harness filterValue="" />
            </ApiProvider>,
        )
        await waitFor(() => expect(get).toHaveBeenCalled())
        expect(get.mock.calls[0][1]?.params.filter_value).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// DynamicLineItems — a cell that dependsOn a HEADER field
// ---------------------------------------------------------------------------
const lineItemsField: ActionFieldDef = {
    key: 'items',
    label: 'Renglones',
    type: 'array',
    itemFields: [
        {
            key: 'product_id',
            label: 'Producto',
            type: 'dynamic_select',
            ref: 'products.Product',
            // depends on the HEADER field, not a sibling row cell.
            depends_on: 'source_warehouse_id',
        },
    ],
}

// Drives DynamicLineItems with one pre-existing row + a switchable header value.
function LineItemsHost({ headerValue }: { headerValue: string }) {
    const [rows, setRows] = useState<any[]>([{ product_id: '' }])
    return (
        <DynamicLineItems
            field={lineItemsField}
            value={rows}
            onChange={setRows}
            formValues={{ source_warehouse_id: headerValue }}
        />
    )
}

describe('DynamicLineItems cascading cell', () => {
    it('disables the picker while the header field is empty', () => {
        const get = vi.fn(async () => ({
            data: { success: true, data: [], meta: { type: 'dynamic', count: 0 } },
        }))
        const client = { get } as unknown as ApiClient
        render(
            <ApiProvider client={client}>
                <LineItemsHost headerValue="" />
            </ApiProvider>,
        )
        // The combobox trigger is disabled and shows the dependency hint.
        const trigger = screen.getByRole('combobox')
        expect((trigger as HTMLButtonElement).disabled).toBe(true)
        expect(trigger.getAttribute('data-depends-blocked')).toBe('')
        // No options request fires while blocked.
        expect(get).not.toHaveBeenCalled()
    })

    it('sends filter_value from the header field and re-fetches when it changes', async () => {
        const get = vi.fn(async () => ({
            data: {
                success: true,
                data: [{ id: 'p1', label: 'Tornillo', description: 'disp. 12' }],
                meta: { type: 'dynamic', count: 1 },
            },
        }))
        const client = { get } as unknown as ApiClient

        const { rerender } = render(
            <ApiProvider client={client}>
                <LineItemsHost headerValue="W1" />
            </ApiProvider>,
        )

        // Open the popover so the typeahead fetches.
        const trigger = screen.getByRole('combobox')
        expect((trigger as HTMLButtonElement).disabled).toBe(false)
        await act(async () => {
            trigger.click()
        })
        await waitFor(() => expect(get).toHaveBeenCalled())
        const firstParams = get.mock.calls[0][1]?.params
        expect(firstParams.filter_value).toBe('W1')

        // Switch the header warehouse → the cell picker re-fetches scoped to W2.
        rerender(
            <ApiProvider client={client}>
                <LineItemsHost headerValue="W2" />
            </ApiProvider>,
        )
        await waitFor(() => {
            const last = get.mock.calls[get.mock.calls.length - 1][1]?.params
            expect(last.filter_value).toBe('W2')
        })
    })
})

// ---------------------------------------------------------------------------
// optionsConfig.source routing — the picker queries the SOURCE model, not `ref`
// ---------------------------------------------------------------------------
const sourceLineItemsField: ActionFieldDef = {
    key: 'items',
    label: 'Renglones',
    type: 'array',
    itemFields: [
        {
            key: 'product_id',
            label: 'Producto',
            type: 'dynamic_select',
            // A `ref` is present but optionsConfig.source MUST win for routing.
            ref: 'products.Product',
            depends_on: 'source_warehouse_id',
            options_config: {
                type: 'dynamic',
                source: 'stock',
                filter_by: 'warehouse_id',
                value: 'product_id',
                label_ref: 'products.Product',
                description: 'quantity',
            },
        },
    ],
}

function SourceLineItemsHost({ headerValue }: { headerValue: string }) {
    const [rows, setRows] = useState<any[]>([{ product_id: '' }])
    return (
        <DynamicLineItems
            field={sourceLineItemsField}
            value={rows}
            onChange={setRows}
            formValues={{ source_warehouse_id: headerValue }}
        />
    )
}

describe('DynamicLineItems cell with optionsConfig.source', () => {
    it('queries /options/<source>?field=<value>&filter_value=<dependsOn> and re-fetches on parent change', async () => {
        const get = vi.fn(async () => ({
            data: {
                success: true,
                data: [{ id: 'p1', label: 'Tornillo', description: 'disp. 12' }],
                meta: { type: 'dynamic', count: 1 },
            },
        }))
        const client = { get } as unknown as ApiClient

        const { rerender } = render(
            <ApiProvider client={client}>
                <SourceLineItemsHost headerValue="W1" />
            </ApiProvider>,
        )

        const trigger = screen.getByRole('combobox')
        expect((trigger as HTMLButtonElement).disabled).toBe(false)
        await act(async () => {
            trigger.click()
        })
        await waitFor(() => expect(get).toHaveBeenCalled())

        // URL hits the SOURCE model, not the `ref`.
        const [firstUrl, firstCfg] = get.mock.calls[0]
        expect(firstUrl).toBe('/options/stock')
        expect(firstCfg?.params.field).toBe('product_id')
        expect(firstCfg?.params.filter_value).toBe('W1')

        // Parent change → re-fetch, still routed to the source, new filter_value.
        rerender(
            <ApiProvider client={client}>
                <SourceLineItemsHost headerValue="W2" />
            </ApiProvider>,
        )
        await waitFor(() => {
            const [url, cfg] = get.mock.calls[get.mock.calls.length - 1]
            expect(url).toBe('/options/stock')
            expect(cfg?.params.field).toBe('product_id')
            expect(cfg?.params.filter_value).toBe('W2')
        })
    })
})
