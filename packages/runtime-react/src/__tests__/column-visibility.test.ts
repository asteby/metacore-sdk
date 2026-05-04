import { describe, it, expect } from 'vitest'

import {
    isColumnVisibleInTable,
    getSearchableColumnKeys,
} from '../column-visibility'
import type { ColumnDefinition, TableMetadata } from '../types'

const baseCol = (overrides: Partial<ColumnDefinition> = {}): ColumnDefinition => ({
    key: 'name',
    label: 'Name',
    type: 'text',
    sortable: true,
    filterable: false,
    ...overrides,
})

const baseMeta = (columns: ColumnDefinition[]): TableMetadata => ({
    title: 'Mock',
    endpoint: '/data/mock',
    columns,
    actions: [],
    perPageOptions: [10],
    defaultPerPage: 10,
    searchPlaceholder: 'Search…',
    enableCRUDActions: true,
    hasActions: false,
})

describe('isColumnVisibleInTable', () => {
    it('keeps columns with no visibility flag (legacy zero-value)', () => {
        expect(isColumnVisibleInTable(baseCol())).toBe(true)
    })

    it('keeps columns with visibility="all"', () => {
        expect(isColumnVisibleInTable(baseCol({ visibility: 'all' }))).toBe(true)
    })

    it('keeps columns with visibility="table"', () => {
        expect(isColumnVisibleInTable(baseCol({ visibility: 'table' }))).toBe(true)
    })

    it('hides columns with visibility="modal"', () => {
        expect(isColumnVisibleInTable(baseCol({ visibility: 'modal' }))).toBe(false)
    })

    it('hides columns with visibility="list"', () => {
        expect(isColumnVisibleInTable(baseCol({ visibility: 'list' }))).toBe(false)
    })

    it('hides columns with the legacy hidden boolean even if visibility="all"', () => {
        expect(isColumnVisibleInTable(baseCol({ hidden: true, visibility: 'all' }))).toBe(false)
    })

    it('hides columns with an unknown visibility value (fail-closed)', () => {
        expect(isColumnVisibleInTable(baseCol({ visibility: 'detail' as any }))).toBe(false)
    })
})

describe('getSearchableColumnKeys', () => {
    it('returns null when no column declares searchable (legacy metadata)', () => {
        const meta = baseMeta([
            baseCol({ key: 'name' }),
            baseCol({ key: 'email' }),
        ])
        expect(getSearchableColumnKeys(meta)).toBe(null)
    })

    it('returns only the searchable keys when at least one column declares it', () => {
        const meta = baseMeta([
            baseCol({ key: 'name', searchable: true }),
            baseCol({ key: 'email', searchable: true }),
            baseCol({ key: 'phone', searchable: false }),
            baseCol({ key: 'created_at' }), // undefined → not searchable
        ])
        expect(getSearchableColumnKeys(meta)).toEqual(['name', 'email'])
    })

    it('returns an empty array when every column is explicitly opted out', () => {
        const meta = baseMeta([
            baseCol({ key: 'name', searchable: false }),
            baseCol({ key: 'email', searchable: false }),
        ])
        expect(getSearchableColumnKeys(meta)).toEqual([])
    })

    it('treats searchable=true on a single column as the explicit allowlist', () => {
        const meta = baseMeta([
            baseCol({ key: 'name', searchable: true }),
            baseCol({ key: 'internal_notes' }),
        ])
        expect(getSearchableColumnKeys(meta)).toEqual(['name'])
    })

    it('handles missing columns array defensively', () => {
        const meta = { columns: undefined as unknown as ColumnDefinition[] }
        expect(getSearchableColumnKeys(meta as any)).toBe(null)
    })
})

describe('column-visibility integration with mock metadata', () => {
    it('filtering and search keys can be derived from a single mock', () => {
        const meta = baseMeta([
            baseCol({ key: 'id', visibility: 'list', searchable: false }),
            baseCol({ key: 'name', visibility: 'all', searchable: true }),
            baseCol({ key: 'email', visibility: 'table', searchable: true }),
            baseCol({ key: 'password_hash', visibility: 'modal', searchable: false }),
            baseCol({ key: 'profile', visibility: 'modal', searchable: false }),
        ])

        const tableColumns = meta.columns.filter(isColumnVisibleInTable).map(c => c.key)
        expect(tableColumns).toEqual(['name', 'email'])

        expect(getSearchableColumnKeys(meta)).toEqual(['name', 'email'])
    })
})
