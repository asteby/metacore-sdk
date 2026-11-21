import { afterEach, describe, expect, it } from 'vitest'
import {
    attenuatePatch,
    clearLoom,
    projectLenses,
    redactMessage,
    registerPart,
    resolveSeam,
    sensitiveClasses,
    type GraftDef,
    type LoomEnv,
    type SeamContract,
} from '../loom'

const C = () => null
const contract: SeamContract = {
    id: 'record.dialog.header',
    version: '1.2.0',
    lenses: { values: 'pii', model: 'public', fiscal: 'pii.fiscal' },
    writable: new Set(['tax_id', 'postal_code', 'fiscal_data.regime']),
}
const env = (over: Partial<LoomEnv> = {}): LoomEnv => ({ can: () => true, model: 'customers.Customer', mode: 'create', ...over })
const g = (over: Partial<GraftDef>): GraftDef => ({ id: 'a.x', seam: 'record.dialog.header', component: C, ...over })

afterEach(clearLoom)

describe('resolveSeam', () => {
    it('ordena por order y conserva el orden de entrada en empates', () => {
        const r = resolveSeam(contract, [g({ id: 'a.b', order: 5 }), g({ id: 'a.c' }), g({ id: 'a.d' })], env())
        expect(r.mounted.map((x) => x.id)).toEqual(['a.c', 'a.d', 'a.b'])
    })

    it('explica cada descarte', () => {
        const r = resolveSeam(
            contract,
            [
                g({ id: 'a.perm', when: { permission: 'customers.csf' } }),
                g({ id: 'a.flag', when: { flag: 'csf' } }),
                g({ id: 'a.set', when: { setting: { key: 'csf.enabled' } } }),
                g({ id: 'a.model', when: { model: ['Supplier'] } }),
                g({ id: 'a.mode', when: { mode: ['edit'] } }),
                g({ id: 'a.ver', requires: '^2' }),
                g({ id: 'a.part', component: undefined, part: 'a.missing' }),
                g({ id: 'a.ok', when: { model: ['Customer'], mode: ['create'] }, requires: '^1.1' }),
            ],
            env({ can: (p) => p !== 'customers.csf' }),
        )
        expect(r.mounted.map((x) => x.id)).toEqual(['a.ok'])
        expect(Object.fromEntries(r.skipped.map((s) => [s.graft.id, s.reason]))).toEqual({
            'a.perm': 'permission',
            'a.flag': 'flag',
            'a.set': 'setting',
            'a.model': 'model',
            'a.mode': 'mode',
            'a.ver': 'version',
            'a.part': 'no_component',
        })
    })

    it('con lista del servidor, lo no autorizado no se monta', () => {
        const r = resolveSeam(contract, [g({ id: 'a.x' }), g({ id: 'a.y' })], env({ granted: new Set(['a.y']) }))
        expect(r.mounted.map((x) => x.id)).toEqual(['a.y'])
        expect(r.skipped[0]).toMatchObject({ reason: 'not_granted' })
    })

    it('resuelve el componente por Part registrado', () => {
        registerPart({ id: 'fiscal.csf', component: C })
        const r = resolveSeam(contract, [g({ id: 'a.p', component: undefined, part: 'fiscal.csf' })], env())
        expect(r.mounted).toHaveLength(1)
    })

    it('ignora injertos de otros seams', () => {
        expect(resolveSeam(contract, [g({ seam: 'otro' })], env()).mounted).toEqual([])
    })
})

describe('capacidades', () => {
    it('writes ∩ writable: lo demás se descarta', () => {
        const r = attenuatePatch(
            { tax_id: 'X', organization_id: 'hack', postal_code: '1', 'fiscal_data.regime': '601' },
            ['tax_id', 'fiscal_data.*', 'organization_id'],
            contract.writable,
        )
        expect(r.allowed).toEqual({ tax_id: 'X', 'fiscal_data.regime': '601' })
        expect(r.dropped.sort()).toEqual(['organization_id', 'postal_code'])
    })

    it('sin writes no escribe nada', () => {
        expect(attenuatePatch({ tax_id: 'X' }, undefined, contract.writable).allowed).toEqual({})
    })

    it('lentes: sólo las declaradas, congeladas y sin tocar el original', () => {
        const values = { name: 'A', nested: { x: 1 } }
        const view = projectLenses({ values, model: 'Customer', fiscal: {} }, ['values'])
        expect(Object.keys(view)).toEqual(['values'])
        expect(Object.isFrozen((view.values as typeof values).nested)).toBe(true)
        expect(Object.isFrozen(values)).toBe(false)
        expect(Object.isFrozen(values.nested)).toBe(false)
    })

    it('redacta errores de injertos que leen datos sensibles', () => {
        expect(sensitiveClasses(contract, ['model'])).toEqual([])
        const cls = sensitiveClasses(contract, ['values', 'fiscal'])
        expect(cls).toEqual(['pii', 'pii.fiscal'])
        expect(redactMessage('RFC XAXX010101000 inválido', cls)).not.toContain('XAXX')
        expect(redactMessage('boom', [])).toBe('boom')
    })
})
