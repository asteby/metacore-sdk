// @vitest-environment happy-dom
//
// CollectionCell contract: the generic jsonb / array / object cell renderer.
//   - array of objects → count badge + popover mini-table (title carries rows)
//   - array of scalars → inline preview + "+N" overflow
//   - plain object → inline key: value pairs
//   - null / empty → "-"
//   - JSON-string value is defensively parsed
//   - locale-aware: count noun + header keys render in the org language; the
//     host `t` overrides; unknown keys fall back to snake→Title prettify.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// Sin `globals: true` en vitest, RTL no auto-limpia entre tests.
afterEach(cleanup)

import {
    CollectionCell,
    countLabel,
    formatScalar,
    prettifyKey,
} from '../collection-cell'

describe('formatScalar', () => {
    it('truncates uuid-like / long strings to first 8 chars + ellipsis', () => {
        expect(formatScalar('550e8400-e29b-41d4-a716-446655440000')).toBe(
            '550e8400…'
        )
        expect(formatScalar('x'.repeat(40))).toBe(`${'x'.repeat(8)}…`)
    })

    it('passes numbers through and renders booleans as check/cross', () => {
        expect(formatScalar(42)).toBe('42')
        expect(formatScalar(true)).toBe('✓')
        expect(formatScalar(false)).toBe('✗')
    })

    it('summarizes nested object / array and empties as dash', () => {
        expect(formatScalar({ a: 1 })).toBe('{…}')
        expect(formatScalar([1, 2, 3])).toBe('[3]')
        expect(formatScalar(null)).toBe('-')
        expect(formatScalar('')).toBe('-')
    })
})

describe('prettifyKey', () => {
    it('localizes common data/commerce keys to Spanish', () => {
        expect(prettifyKey('product_id', 'es')).toBe('Producto')
        expect(prettifyKey('quantity', 'es')).toBe('Cantidad')
    })

    it('localizes common keys to English (default locale)', () => {
        expect(prettifyKey('product_id')).toBe('Product')
        expect(prettifyKey('product_id', 'en')).toBe('Product')
        expect(prettifyKey('quantity', 'en')).toBe('Quantity')
    })

    it('accepts a regional tag and normalizes to base language', () => {
        expect(prettifyKey('quantity', 'es-MX')).toBe('Cantidad')
    })

    it('prefers a host `t` translation over the built-in dictionary', () => {
        const t = (k: string) => (k === 'quantity' ? 'Piezas' : k)
        expect(prettifyKey('quantity', 'es', t)).toBe('Piezas')
    })

    it('falls back to snake→Title prettify for unknown keys', () => {
        expect(prettifyKey('shelf_position', 'es')).toBe('Shelf Position')
        expect(prettifyKey('warehouse_bin', 'en')).toBe('Warehouse Bin')
    })
})

describe('countLabel', () => {
    it('pluralizes the count noun per locale', () => {
        expect(countLabel(1, 'es')).toBe('1 ítem')
        expect(countLabel(2, 'es')).toBe('2 ítems')
        expect(countLabel(1, 'en')).toBe('1 item')
        expect(countLabel(3, 'en')).toBe('3 items')
        expect(countLabel(1)).toBe('1 item') // default → en
    })

    it('prefers a host `t` count plural', () => {
        const t = (_k: string, o?: any) =>
            o?.count === 1 ? '1 renglón' : `${o?.count} renglones`
        expect(countLabel(2, 'es', t)).toBe('2 renglones')
    })
})

describe('CollectionCell', () => {
    it('renders an English count badge by default for an array of objects', () => {
        render(
            <CollectionCell
                value={[
                    { product_id: 'abc', quantity: 2 },
                    { product_id: 'def', quantity: 5 },
                ]}
            />
        )
        // Default locale → English plural.
        expect(screen.getByText('2 items')).toBeTruthy()
        // The trigger's title carries the localized rows for the no-JS fallback.
        const badge = screen.getByText('2 items').closest('[title]')
        expect(badge).toBeTruthy()
        const title = badge!.getAttribute('title') ?? ''
        expect(title).toContain('Quantity: 2')
        expect(title).toContain('Quantity: 5')
        expect(title).toContain('Product:') // product_id → "Product" (en)
    })

    it('renders Spanish count + headers when locale is es', () => {
        render(
            <CollectionCell
                locale="es"
                value={[
                    { product_id: 'abc', quantity: 2 },
                    { product_id: 'def', quantity: 5 },
                ]}
            />
        )
        expect(screen.getByText('2 ítems')).toBeTruthy()
        const title =
            screen.getByText('2 ítems').closest('[title]')!.getAttribute('title') ??
            ''
        expect(title).toContain('Producto:')
        expect(title).toContain('Cantidad: 2')
    })

    it('renders the singular Spanish noun for a single-item array', () => {
        render(<CollectionCell locale="es" value={[{ sku: 'A1' }]} />)
        expect(screen.getByText('1 ítem')).toBeTruthy()
    })

    it('renders the singular English noun for a single-item array', () => {
        render(<CollectionCell value={[{ sku: 'A1' }]} />)
        expect(screen.getByText('1 item')).toBeTruthy()
    })

    it('previews the first scalars with overflow for a scalar array', () => {
        render(<CollectionCell value={['a', 'b', 'c', 'd', 'e']} />)
        expect(screen.getByText('a, b, c +2')).toBeTruthy()
    })

    it('renders inline key: value pairs (localized) for a plain object', () => {
        render(
            <CollectionCell locale="es" value={{ price: 10, quantity: 20 }} />
        )
        expect(screen.getByText(/Precio: 10, Cantidad: 20/)).toBeTruthy()
    })

    it('renders a dash for null / empty values', () => {
        const { container } = render(<CollectionCell value={null} />)
        expect(container.textContent).toBe('-')
    })

    it('renders a dash for an empty array', () => {
        const { container } = render(<CollectionCell value={[]} />)
        expect(container.textContent).toBe('-')
    })

    it('parses a JSON-string value into a collection', () => {
        render(
            <CollectionCell
                locale="es"
                value={'[{"product_id":"abc","quantity":1}]'}
            />
        )
        expect(screen.getByText('1 ítem')).toBeTruthy()
        const badge = screen.getByText('1 ítem').closest('[title]')
        expect(badge!.getAttribute('title')).toContain('Cantidad: 1')
    })

    it('truncates an unparseable string instead of crashing', () => {
        const { container } = render(
            <CollectionCell value={'{not valid json'} />
        )
        expect(container.textContent).toContain('{not valid json')
    })
})

describe('CollectionCell with itemFields schema', () => {
    const itemFields = [
        { key: 'product_id', label: 'Producto', ref: 'Product' },
        { key: 'quantity', label: 'Cantidad' },
    ]

    // The popover mini-table mounts lazily — open it by clicking the count
    // badge (Radix opens on pointerDown + click under happy-dom).
    const openPopover = (badgeText: string) => {
        const badge = screen.getByText(badgeText)
        fireEvent.pointerDown(badge)
        fireEvent.click(badge)
        return badge
    }

    it('uses the schema labels verbatim as headers (no prettify/dict)', () => {
        render(
            <CollectionCell
                locale="es"
                itemFields={itemFields}
                value={[
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440000',
                        product: { value: '550e8400-e29b-41d4-a716-446655440000', label: 'Llanta 195/65' },
                        quantity: 2,
                    },
                ]}
            />
        )
        openPopover('1 ítem')
        // Headers come from the schema `label` verbatim.
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(screen.getByRole('columnheader', { name: 'Cantidad' })).toBeTruthy()
    })

    it('resolves a ref field to the injected sibling label, not the uuid', () => {
        render(
            <CollectionCell
                itemFields={itemFields}
                value={[
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440000',
                        product: { value: '550e8400-e29b-41d4-a716-446655440000', label: 'Llanta 195/65' },
                        quantity: 2,
                    },
                ]}
            />
        )
        openPopover('1 item')
        expect(screen.getByRole('cell', { name: 'Llanta 195/65' })).toBeTruthy()
        // The raw uuid (truncated form) must NOT appear in any cell.
        expect(screen.queryByText('550e8400…')).toBeNull()
    })

    it('resolves a ref field from a `<key>_label` sibling when key has no _id suffix', () => {
        render(
            <CollectionCell
                itemFields={[{ key: 'product', label: 'Producto', ref: 'Product' }]}
                value={[
                    {
                        product: '550e8400-e29b-41d4-a716-446655440000',
                        product_label: { value: '550e8400-e29b-41d4-a716-446655440000', label: 'Balanceo' },
                    },
                ]}
            />
        )
        openPopover('1 item')
        expect(screen.getByRole('cell', { name: 'Balanceo' })).toBeTruthy()
    })

    it('accepts a bare string sibling for a ref field', () => {
        render(
            <CollectionCell
                itemFields={[{ key: 'product_id', label: 'Producto', ref: 'Product' }]}
                value={[{ product_id: 'x', product: 'Aceite 5W30' }]}
            />
        )
        openPopover('1 item')
        expect(screen.getByRole('cell', { name: 'Aceite 5W30' })).toBeTruthy()
    })

    it('falls back to a truncated uuid when the ref sibling is missing', () => {
        render(
            <CollectionCell
                itemFields={[{ key: 'product_id', label: 'Producto', ref: 'Product' }]}
                value={[{ product_id: '550e8400-e29b-41d4-a716-446655440000' }]}
            />
        )
        openPopover('1 item')
        expect(screen.getByRole('cell', { name: '550e8400…' })).toBeTruthy()
    })

    it('keeps the locale-aware count noun on the badge', () => {
        render(
            <CollectionCell
                locale="es"
                itemFields={itemFields}
                value={[
                    { product_id: 'a', product: { value: 'a', label: 'A' }, quantity: 1 },
                    { product_id: 'b', product: { value: 'b', label: 'B' }, quantity: 2 },
                ]}
            />
        )
        expect(screen.getByText('2 ítems')).toBeTruthy()
    })

    it('renders non-ref fields via formatScalar under the schema header', () => {
        render(
            <CollectionCell
                itemFields={itemFields}
                value={[{ product_id: 'a', product: { value: 'a', label: 'A' }, quantity: 7 }]}
            />
        )
        openPopover('1 item')
        expect(screen.getByRole('cell', { name: '7' })).toBeTruthy()
    })

    it('mirrors the schema labels + resolved ref values in the badge title', () => {
        render(
            <CollectionCell
                itemFields={itemFields}
                value={[
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440000',
                        product: { value: 'x', label: 'Llanta 195/65' },
                        quantity: 2,
                    },
                ]}
            />
        )
        const title =
            screen.getByText('1 item').closest('[title]')!.getAttribute('title') ?? ''
        expect(title).toContain('Producto: Llanta 195/65')
        expect(title).toContain('Cantidad: 2')
        expect(title).not.toContain('550e8400')
    })

    it('is unchanged (generic prettify) when no itemFields are provided', () => {
        render(
            <CollectionCell
                locale="es"
                value={[{ product_id: 'abc', quantity: 2 }]}
            />
        )
        // Generic dict path: the badge title carries the prettified headers and
        // the raw (unresolved) values, exactly as before.
        const title =
            screen.getByText('1 ítem').closest('[title]')!.getAttribute('title') ?? ''
        expect(title).toContain('Producto:')
        expect(title).toContain('Cantidad: 2')
    })
})

describe('CollectionCell variant="inline" (detail view)', () => {
    const itemFields = [
        { key: 'product_id', label: 'Producto', ref: 'Product' },
        { key: 'quantity', label: 'Cantidad' },
    ]

    it('renders the mini-table DIRECTLY with no popover trigger / badge', () => {
        render(
            <CollectionCell
                variant="inline"
                value={[{ product_id: 'a', quantity: 2 }]}
            />
        )
        // The table is in the DOM immediately — no click needed.
        expect(screen.getByRole('table')).toBeTruthy()
        // No count-badge trigger ("1 item") is rendered in inline mode.
        expect(screen.queryByText('1 item')).toBeNull()
    })

    it('uses localized schema headers + resolved ref labels (no raw uuid/JSON)', () => {
        const { container } = render(
            <CollectionCell
                variant="inline"
                locale="es"
                itemFields={itemFields}
                value={[
                    {
                        product_id: '550e8400-e29b-41d4-a716-446655440000',
                        product: { value: 'x', label: 'Test' },
                        quantity: 10,
                    },
                ]}
            />
        )
        // "Producto | Cantidad / Test | 10"
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(screen.getByRole('columnheader', { name: 'Cantidad' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: 'Test' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: '10' })).toBeTruthy()
        // The raw uuid must not leak, and there is no JSON.stringify <pre> block.
        expect(screen.queryByText('550e8400…')).toBeNull()
        expect(container.querySelector('pre')).toBeNull()
        expect(container.textContent).not.toContain('550e8400-e29b')
    })

    it('falls back to a generic localized mini-table when no itemFields (no raw JSON)', () => {
        const { container } = render(
            <CollectionCell
                variant="inline"
                locale="es"
                value={[{ product_id: 'abc', quantity: 2 }]}
            />
        )
        // Generic dict path still drives the header; no JSON dump.
        expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeTruthy()
        expect(screen.getByRole('cell', { name: '2' })).toBeTruthy()
        expect(container.querySelector('pre')).toBeNull()
    })

    it('renders a plain object as an inline localized pair list (no popover)', () => {
        render(
            <CollectionCell
                variant="inline"
                locale="es"
                value={{ price: 10, quantity: 20 }}
            />
        )
        // Pair list is rendered directly; the badge "+N" preview is not used.
        expect(screen.getByText('Precio:')).toBeTruthy()
        expect(screen.getByText('Cantidad:')).toBeTruthy()
        expect(screen.queryByRole('table')).toBeNull()
    })

    it('renders a scalar array as an inline list directly', () => {
        render(
            <CollectionCell variant="inline" value={['a', 'b', 'c', 'd', 'e']} />
        )
        // Full list, no "+2" overflow badge.
        expect(screen.getByText('e')).toBeTruthy()
        expect(screen.queryByText('a, b, c +2')).toBeNull()
    })

    it('keeps the muted dash for empty / null values', () => {
        const { container: empty } = render(
            <CollectionCell variant="inline" value={[]} />
        )
        expect(empty.textContent).toBe('-')
        const { container: nul } = render(
            <CollectionCell variant="inline" value={null} />
        )
        expect(nul.textContent).toBe('-')
    })
})
