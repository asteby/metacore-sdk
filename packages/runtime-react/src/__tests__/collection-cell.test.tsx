// @vitest-environment happy-dom
//
// CollectionCell contract: the generic jsonb / array / object cell renderer.
//   - array of objects → count badge + popover mini-table (title carries rows)
//   - array of scalars → inline preview + "+N" overflow
//   - plain object → inline key: value pairs
//   - null / empty → "-"
//   - JSON-string value is defensively parsed
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Sin `globals: true` en vitest, RTL no auto-limpia entre tests.
afterEach(cleanup)

import {
    CollectionCell,
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
    it('snake_case → Title Case with acronyms', () => {
        expect(prettifyKey('product_id')).toBe('Product ID')
        expect(prettifyKey('quantity')).toBe('Quantity')
    })
})

describe('CollectionCell', () => {
    it('renders a count badge for an array of objects', () => {
        render(
            <CollectionCell
                value={[
                    { product_id: 'abc', quantity: 2 },
                    { product_id: 'def', quantity: 5 },
                ]}
            />
        )
        // Count badge (plural).
        expect(screen.getByText('2 ítems')).toBeTruthy()
        // The trigger's title carries the formatted rows for the no-JS fallback.
        const badge = screen.getByText('2 ítems').closest('[title]')
        expect(badge).toBeTruthy()
        const title = badge!.getAttribute('title') ?? ''
        expect(title).toContain('Quantity: 2')
        expect(title).toContain('Quantity: 5')
        expect(title).toContain('Product ID')
    })

    it('renders singular label for a single-item array', () => {
        render(<CollectionCell value={[{ sku: 'A1' }]} />)
        expect(screen.getByText('1 ítem')).toBeTruthy()
    })

    it('previews the first scalars with overflow for a scalar array', () => {
        render(<CollectionCell value={['a', 'b', 'c', 'd', 'e']} />)
        expect(screen.getByText('a, b, c +2')).toBeTruthy()
    })

    it('renders inline key: value pairs for a plain object', () => {
        render(<CollectionCell value={{ width: 10, height: 20 }} />)
        expect(
            screen.getByText(/Width: 10, Height: 20/)
        ).toBeTruthy()
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
                value={'[{"product_id":"abc","quantity":1}]'}
            />
        )
        expect(screen.getByText('1 ítem')).toBeTruthy()
        const badge = screen.getByText('1 ítem').closest('[title]')
        expect(badge!.getAttribute('title')).toContain('Quantity: 1')
    })

    it('truncates an unparseable string instead of crashing', () => {
        const { container } = render(
            <CollectionCell value={'{not valid json'} />
        )
        expect(container.textContent).toContain('{not valid json')
    })
})
