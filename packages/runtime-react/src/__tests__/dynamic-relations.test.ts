import { describe, it, expect } from 'vitest'
import { resolveParentId, buildRelationFilters } from '../dynamic-relations'
import type { RelationMeta } from '../types'

describe('resolveParentId', () => {
    it('lee record.id por defecto', () => {
        expect(resolveParentId({ id: 'c_1' })).toBe('c_1')
        expect(resolveParentId({ id: 7 })).toBe(7)
    })

    it('respeta un parentIdKey custom', () => {
        expect(resolveParentId({ uuid: 'u_1' }, 'uuid')).toBe('u_1')
    })

    it('devuelve undefined cuando falta / es vacío / no es escalar', () => {
        expect(resolveParentId(null)).toBeUndefined()
        expect(resolveParentId(undefined)).toBeUndefined()
        expect(resolveParentId({})).toBeUndefined()
        expect(resolveParentId({ id: '' })).toBeUndefined()
        expect(resolveParentId({ id: null })).toBeUndefined()
        expect(resolveParentId({ id: { nested: true } })).toBeUndefined()
    })
})

describe('buildRelationFilters', () => {
    it('mergea scope estático + foreign_key=parentId (caso polimórfico)', () => {
        const rel: Pick<RelationMeta, 'foreign_key' | 'scope'> = {
            foreign_key: 'owner_id',
            scope: { owner_model: 'Customer' },
        }
        expect(buildRelationFilters(rel, 'c_1')).toEqual({
            owner_model: 'Customer',
            owner_id: 'c_1',
        })
    })

    it('funciona sin scope (one_to_many simple)', () => {
        expect(buildRelationFilters({ foreign_key: 'customer_id' }, 42)).toEqual({
            customer_id: '42',
        })
    })

    it('coerce parentId y valores de scope a string', () => {
        const rel: Pick<RelationMeta, 'foreign_key' | 'scope'> = {
            foreign_key: 'owner_id',
            // @ts-expect-error testing runtime coercion of non-string scope value
            scope: { kind: 5 },
        }
        expect(buildRelationFilters(rel, 9)).toEqual({ kind: '5', owner_id: '9' })
    })

    it('omite entradas de scope null/undefined', () => {
        const rel: Pick<RelationMeta, 'foreign_key' | 'scope'> = {
            foreign_key: 'owner_id',
            // @ts-expect-error testing runtime tolerance
            scope: { a: null, b: undefined, c: 'ok' },
        }
        expect(buildRelationFilters(rel, 'c_1')).toEqual({ c: 'ok', owner_id: 'c_1' })
    })
})
