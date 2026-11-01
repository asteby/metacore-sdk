import { describe, expect, it } from 'vitest'
import {
    deriveRelationFormFields,
    isManagedRelationColumn,
    nextRelationPosition,
    relationColumnUi,
    relationDerivedValues,
    relationGalleryColumn,
    relationInitialValues,
    relationMediaKind,
    relationPositionKey,
    relationPositionSortable,
    sortRelationRows,
} from '../dynamic-relation-helpers'
import { resolveWidget } from '../dynamic-form-schema'
import type { ColumnDefinition, TableMetadata } from '../types'

const col = (c: Partial<ColumnDefinition> & { key: string }): ColumnDefinition =>
    ({ label: c.key, type: 'text', sortable: false, filterable: false, ...c }) as ColumnDefinition

// What /metadata/table serves for ProductImage (products 0.23.2) — the manifest
// `widget: image` does not travel to the table endpoint, `display: image_stack`
// does (as cellStyle), plus the creator avatar column every table gets.
const productImagesToday: Pick<TableMetadata, 'columns'> = {
    columns: [
        col({ key: 'product_id', ref: 'products' }),
        col({ key: 'variant_id', ref: 'product_variants' }),
        col({ key: 'url', cellStyle: 'image_stack' }),
        col({ key: 'alt' }),
        col({ key: 'width', type: 'number' }),
        col({ key: 'height', type: 'number' }),
        col({ key: 'position', type: 'number' }),
        col({ key: 'created_by.avatar', type: 'avatar', cellStyle: 'creator' }),
    ],
}

const productImagesDeclared: Pick<TableMetadata, 'columns'> = {
    columns: [
        col({ key: 'product_id', ref: 'products' }),
        col({ key: 'variant_id', ref: 'product_variants', styleConfig: { empty_label: 'Para todas las variantes' } }),
        col({ key: 'url', cellStyle: 'image_stack', styleConfig: { gallery: true, max_size: 5242880 } }),
        col({ key: 'alt', styleConfig: { default_from_parent: 'name' } }),
        col({ key: 'width', type: 'number', styleConfig: { derive: 'image_width' } }),
        col({ key: 'height', type: 'number', styleConfig: { derive: 'image_height' } }),
        col({ key: 'position', type: 'number', styleConfig: { derive: 'next_position' } }),
        col({ key: 'created_by.avatar', type: 'avatar', cellStyle: 'creator' }),
    ],
}

describe('deriveRelationFormFields: galería de producto', () => {
    // Protek 01/11: «Imagen» salía como input de texto y «Creado por» editable.
    it('la columna de imagen es el widget de subida y la auditoría no aparece', () => {
        const fields = deriveRelationFormFields(productImagesToday, 'product_id')
        const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))
        expect(byKey.url?.type).toBe('image')
        expect(byKey.url?.accept).toBe('image/*')
        expect(resolveWidget(byKey.url!)).toBe('upload')
        expect(byKey['created_by.avatar']).toBeUndefined()
        expect(byKey.variant_id && resolveWidget(byKey.variant_id)).toBe('dynamic_select')
    })

    it('sin display_config los campos numéricos siguen visibles (retrocompat)', () => {
        const keys = deriveRelationFormFields(productImagesToday, 'product_id').map((f) => f.key)
        expect(keys).toEqual(['variant_id', 'url', 'alt', 'width', 'height', 'position'])
    })

    it('derived/hidden fuera del formulario; empty_label como placeholder', () => {
        const fields = deriveRelationFormFields(productImagesDeclared, 'product_id')
        expect(fields.map((f) => f.key)).toEqual(['variant_id', 'url', 'alt'])
        expect(fields[0].placeholder).toBe('Para todas las variantes')
    })

    it('una FK con display image_stack (logo de marca) sigue siendo picker, no subida', () => {
        expect(relationMediaKind(col({ key: 'brand_id', ref: 'brands', cellStyle: 'image_stack' }))).toBeUndefined()
        expect(relationMediaKind(col({ key: 'doc', widget: 'file' } as any))).toBe('file')
        expect(relationMediaKind(col({ key: 'photo', type: 'image' }))).toBe('image')
        expect(relationMediaKind(col({ key: 'sku' }))).toBeUndefined()
    })

    it('auditoría y proyecciones con punto nunca son editables', () => {
        for (const k of ['created_by', 'created_by.avatar', 'updated_by_id', 'deleted_by', 'organization_id', 'product.name']) {
            expect(isManagedRelationColumn(k)).toBe(true)
        }
        expect(isManagedRelationColumn('alt')).toBe(false)
    })
})

describe('valores derivados de la fila', () => {
    const rows = [{ position: 0 }, { position: 3 }, { position: null }]

    it('posición siguiente solo al crear; tamaño solo si se midió', () => {
        expect(relationDerivedValues(productImagesDeclared, { isCreate: true, rows, image: { width: 1200.4, height: 800 } }))
            .toEqual({ width: 1200, height: 800, position: 4 })
        expect(relationDerivedValues(productImagesDeclared, { isCreate: false, rows, image: null })).toEqual({})
        expect(relationDerivedValues(productImagesToday, { isCreate: true, rows, image: { width: 1, height: 1 } })).toEqual({})
    })

    it('nextRelationPosition: 0 sin filas', () => {
        expect(nextRelationPosition([])).toBe(0)
        expect(nextRelationPosition([{ position: '2' }, { position: 'x' }])).toBe(3)
    })

    it('texto alternativo sugerido con el nombre del padre', () => {
        expect(relationInitialValues(productImagesDeclared, { name: 'BALATA DISCO' })).toEqual({ alt: 'BALATA DISCO' })
        expect(relationInitialValues(productImagesDeclared, null)).toEqual({})
        expect(relationInitialValues(productImagesToday, { name: 'X' })).toEqual({})
    })
})

describe('orden y modo galería', () => {
    it('ordena por position, estable, sin posición al final', () => {
        const rows = [{ id: 'a', position: 2 }, { id: 'b' }, { id: 'c', position: 0 }, { id: 'd', position: 2 }]
        expect(sortRelationRows(rows, 'position').map((r) => r.id)).toEqual(['c', 'a', 'd', 'b'])
        expect(sortRelationRows(rows, undefined)).toBe(rows)
        expect(relationPositionKey(productImagesToday)).toBe('position')
        expect(relationPositionSortable(productImagesToday)).toBe(false)
        expect(relationPositionSortable({ columns: [col({ key: 'position', sortable: true })] })).toBe(true)
    })

    it('la galería es opt-in por display_config.gallery', () => {
        expect(relationGalleryColumn(productImagesToday)).toBeUndefined()
        expect(relationGalleryColumn(productImagesDeclared)?.key).toBe('url')
        expect(relationColumnUi(col({ key: 'x', styleConfig: { derive: 'otra' } }))).toEqual({})
    })
})

import { contiguousPositionUpdates } from '../dynamic-relation-helpers'

describe('contiguousPositionUpdates', () => {
    it('caso U390556L: 0, 0, 1 pasa a 0, 1, 2 con la original (más vieja) primero', () => {
        const rows = [
            { id: 'n2', position: 1, created_at: '2026-11-01T12:00:00Z' },
            { id: 'n1', position: 0, created_at: '2026-11-01T11:00:00Z' },
            { id: 'orig', position: 0, created_at: '2026-10-22T10:00:00Z' },
        ]
        const { ordered, updates } = contiguousPositionUpdates(rows)
        expect(ordered.map((r) => r.id)).toEqual(['orig', 'n1', 'n2'])
        expect(updates).toEqual([{ id: 'n1', position: 1 }, { id: 'n2', position: 2 }])
    })
    it('cierra huecos y manda las sin posición al final', () => {
        const { ordered, updates } = contiguousPositionUpdates([
            { id: 'a', position: 3 }, { id: 'b', position: null }, { id: 'c', position: 7 },
        ])
        expect(ordered.map((r) => r.id)).toEqual(['a', 'c', 'b'])
        expect(updates).toEqual([{ id: 'a', position: 0 }, { id: 'c', position: 1 }, { id: 'b', position: 2 }])
    })
    it('ya contiguo = sin cambios', () => {
        expect(contiguousPositionUpdates([{ id: 'a', position: 0 }, { id: 'b', position: 1 }]).updates).toEqual([])
    })
})
