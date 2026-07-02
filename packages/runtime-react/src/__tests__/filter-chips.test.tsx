// @vitest-environment happy-dom
//
// FilterChipsRow — the removable active-filter chip row shared by DynamicTable
// and DynamicKanban: one chip per active field (label + summarized value + a
// value-color dot when the option carries a color), an X that clears that field,
// and a trailing "Limpiar todo".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _k,
    }),
}))

import {
    FilterChipsRow,
    summarizeFilterValues,
    chipValueColor,
    type FilterChipField,
} from '../filter-chips'

afterEach(cleanup)

function field(over: Partial<FilterChipField> & { key: string }): FilterChipField {
    return {
        label: over.key,
        config: {
            selectedValues: [],
            options: [],
            filterKey: over.key,
            onFilterChange: vi.fn(),
            ...(over.config as any),
        },
        ...over,
    }
}

describe('summarizeFilterValues / chipValueColor', () => {
    const opts = [
        { value: 'backlog', label: 'Pendiente', color: 'slate' },
        { value: 'done', label: 'Hecho', color: 'green' },
    ]
    it('summarizes a single value to its (translated) option label', () => {
        expect(summarizeFilterValues(['done'], opts)).toBe('Hecho')
    })
    it('resolves the option color for the chip dot', () => {
        expect(chipValueColor({ selectedValues: ['done'], options: opts })).toBeTruthy()
    })
    it('has no dot for a free-text (ILIKE) value', () => {
        expect(
            chipValueColor({ selectedValues: ['ILIKE:foo'], options: opts }),
        ).toBeUndefined()
    })
})

describe('FilterChipsRow', () => {
    const stageOptions = [
        { value: 'backlog', label: 'Pendiente', color: 'slate' },
        { value: 'done', label: 'Hecho', color: 'green' },
    ]

    it('renders nothing when there are no active fields', () => {
        const { container } = render(
            <FilterChipsRow fields={[]} onClearAll={() => {}} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders a chip per active field with its translated value summary', () => {
        render(
            <FilterChipsRow
                fields={[
                    field({
                        key: 'stage',
                        label: 'Etapa',
                        config: {
                            selectedValues: ['done'],
                            options: stageOptions,
                            filterKey: 'stage',
                            onFilterChange: vi.fn(),
                        },
                    }),
                ]}
                onClearAll={() => {}}
                data-testid="chips"
            />,
        )
        expect(screen.getByText('Etapa:')).toBeTruthy()
        // the value shows the TRANSLATED option label, not the raw key
        expect(screen.getByText('Hecho')).toBeTruthy()
    })

    it('clears one field via its X and everything via "Limpiar todo"', () => {
        const onFilterChange = vi.fn()
        const onClearAll = vi.fn()
        render(
            <FilterChipsRow
                fields={[
                    field({
                        key: 'stage',
                        label: 'Etapa',
                        config: {
                            selectedValues: ['done'],
                            options: stageOptions,
                            filterKey: 'stage',
                            onFilterChange,
                        },
                    }),
                ]}
                onClearAll={onClearAll}
            />,
        )
        fireEvent.click(screen.getByLabelText('Quitar filtro'))
        expect(onFilterChange).toHaveBeenCalledWith('stage', [])
        fireEvent.click(screen.getByText('Limpiar todo'))
        expect(onClearAll).toHaveBeenCalled()
    })
})
