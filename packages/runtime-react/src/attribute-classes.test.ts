import { describe, expect, it, vi } from 'vitest'
import { resolveAttributeClasses, resetAttributeClassCache } from './attribute-classes'
import { ATTRIBUTE_CLASSES_KEY, evaluateVisibleWhen, getVisibleWhen } from './dynamic-form-schema'
import { filterVisibleFields } from './dialogs/dynamic-record'

describe('visible_when.class', () => {
    it('shows a class field only when the record carries the class', () => {
        const cond = getVisibleWhen({ visible_when: { class: 'tire' } })
        expect(cond).toEqual({ class: 'tire' })
        expect(evaluateVisibleWhen(cond, { [ATTRIBUTE_CLASSES_KEY]: ['tire'] })).toBe(true)
        expect(evaluateVisibleWhen(cond, { [ATTRIBUTE_CLASSES_KEY]: ['battery'] })).toBe(false)
        expect(evaluateVisibleWhen(cond, {})).toBe(false)
    })

    it('filters dialog fields by the resolved classes and keeps the rest', () => {
        const fields = [
            { key: 'name', label: 'Nombre', type: 'text' },
            { key: 'TireSpec.rim_diameter_in', label: 'Rin', type: 'number', visible_when: { class: 'tire' } },
        ] as never
        const values = { name: 'x' }
        expect(filterVisibleFields(fields, 'create', values, []).map((f) => f.key)).toEqual(['name'])
        expect(filterVisibleFields(fields, 'create', values, ['tire']).map((f) => f.key)).toEqual([
            'name',
            'TireSpec.rim_diameter_in',
        ])
    })
})

describe('resolveAttributeClasses', () => {
    it('walks the category parents and caches each node', async () => {
        resetAttributeClassCache()
        const rows: Record<string, unknown> = {
            c1: { attribute_classes: [], parent_id: 'c0' },
            c0: { attribute_classes: ['tire'], parent_id: null },
        }
        const get = vi.fn(async (url: string) => ({ data: { data: rows[url.split('/').pop() as string] } }))
        const api = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
        expect(await resolveAttributeClasses(api as never, 'Category', 'c1')).toEqual(['tire'])
        await resolveAttributeClasses(api as never, 'Category', 'c1')
        expect(get).toHaveBeenCalledTimes(2)
        expect(get).toHaveBeenCalledWith('/data/Category/c1')
    })
})
