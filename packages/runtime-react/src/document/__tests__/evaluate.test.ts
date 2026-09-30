import { describe, expect, it } from 'vitest'
import { evaluateWhen, interpolate, pruneUnavailableActions, readPath, resolveActions, resolveStatus, resolveTitle } from '../evaluate'
import type { DocumentContext, DocumentSpec } from '../types'

const ctx = (record: Record<string, unknown>, derived: Record<string, unknown> = {}, sources: DocumentContext['sources'] = {}): DocumentContext => ({
    record,
    derived,
    sources,
})

const spec: DocumentSpec = {
    model: 'docs',
    title: '{{series}}{{number}} || {{id}}',
    statuses: [
        {
            id: 'fiscal',
            field: '$.fiscal',
            states: [
                { value: 'draft', label: 'Borrador', tone: 'neutral' },
                { value: 'cancelled', label: 'Cancelada', tone: 'neutral', strike: true },
            ],
        },
    ],
    actions: [
        { key: 'stamp', label: 'Timbrar factura' },
        { key: 'preview', label: 'Vista previa' },
        { key: 'edit', label: 'Editar' },
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'dup', label: 'Duplicar' },
        {
            key: 'cancel',
            label: 'Solicitar cancelación',
            destructive: true,
            blockedWhen: { when: { field: 'sources.reps.length', op: 'gt', value: 0 }, reason: 'Cancela primero los REP' },
        },
        { key: 'secret', label: 'Secreta', hiddenWhen: { field: 'locked', op: 'truthy' } },
    ],
    layouts: [
        { when: { field: '$.fiscal', op: 'eq', value: 'draft' }, layout: { primary: 'stamp', secondary: ['preview', 'edit', 'a', 'b'], more: ['dup', 'secret'] } },
        { when: [{ field: '$.fiscal', op: 'eq', value: 'stamped' }], layout: { primary: 'dup', destructive: ['cancel'] } },
    ],
    tabs: [],
}

describe('readPath', () => {
    it('lee registro, derivados y totales de fuentes', () => {
        const c = ctx({ a: { b: 1 } }, { x: 'y' }, { reps: [{}, {}] })
        expect(readPath(c, 'a.b')).toBe(1)
        expect(readPath(c, 'record.a.b')).toBe(1)
        expect(readPath(c, '$.x')).toBe('y')
        expect(readPath(c, 'sources.reps.length')).toBe(2)
        expect(readPath(c, 'nope.deep')).toBeUndefined()
    })
})

describe('evaluateWhen', () => {
    it('AND de predicados y operadores', () => {
        const c = ctx({ n: 5, s: 'a', e: '' })
        expect(evaluateWhen(undefined, c)).toBe(true)
        expect(evaluateWhen([{ field: 'n', op: 'gt', value: 3 }, { field: 's', op: 'in', value: ['a', 'b'] }], c)).toBe(true)
        expect(evaluateWhen([{ field: 'n', op: 'gt', value: 3 }, { field: 's', op: 'neq', value: 'a' }], c)).toBe(false)
        expect(evaluateWhen({ field: 'e', op: 'falsy' }, c)).toBe(true)
        expect(evaluateWhen({ field: 's', op: 'not_in', value: ['z'] }, c)).toBe(true)
    })
})

describe('resolveStatus', () => {
    it('resuelve del catálogo, cae a neutral con el valor crudo y omite vacío', () => {
        expect(resolveStatus(spec.statuses[0], ctx({}, { fiscal: 'cancelled' }))?.strike).toBe(true)
        expect(resolveStatus(spec.statuses[0], ctx({}, { fiscal: 'raro' }))).toMatchObject({ label: 'raro', tone: 'neutral' })
        expect(resolveStatus(spec.statuses[0], ctx({}, {}))).toBeUndefined()
    })
})

describe('resolveActions', () => {
    it('1 primaria, máx. 3 secundarias y el desborde va a «Más…»', () => {
        const r = resolveActions(spec, ctx({}, { fiscal: 'draft' }))
        expect(r.primary?.def.key).toBe('stamp')
        expect(r.secondary.map((a) => a.def.key)).toEqual(['preview', 'edit', 'a'])
        expect(r.more.map((a) => a.def.key)).toEqual(['b', 'dup', 'secret'])
    })
    it('hiddenWhen omite la acción', () => {
        const r = resolveActions(spec, ctx({ locked: true }, { fiscal: 'draft' }))
        expect(r.more.map((a) => a.def.key)).not.toContain('secret')
    })
    it('blockedWhen deja la destructiva visible pero bloqueada con motivo', () => {
        const blocked = resolveActions(spec, ctx({}, { fiscal: 'stamped' }, { reps: [{ id: 1 }] }))
        expect(blocked.destructive[0].blockedReason).toBe('Cancela primero los REP')
        const free = resolveActions(spec, ctx({}, { fiscal: 'stamped' }, { reps: [] }))
        expect(free.destructive[0].blockedReason).toBeUndefined()
    })
    it('blockedWhen admite varias reglas y muestra el motivo de la primera que aplica', () => {
        const multi: DocumentSpec = {
            ...spec,
            actions: [
                {
                    key: 'cancel',
                    label: 'Cancelar',
                    destructive: true,
                    blockedWhen: [
                        { when: { field: 'sources.reps.length', op: 'gt', value: 0 }, reason: 'REP' },
                        { when: { field: 'sources.notes.length', op: 'gt', value: 0 }, reason: 'NC' },
                    ],
                },
            ],
            layouts: [{ when: { field: '$.fiscal', op: 'eq', value: 'stamped' }, layout: { destructive: ['cancel'] } }],
        }
        expect(resolveActions(multi, ctx({}, { fiscal: 'stamped' }, { reps: [], notes: [{}] })).destructive[0].blockedReason).toBe('NC')
        expect(resolveActions(multi, ctx({}, { fiscal: 'stamped' }, { reps: [{}], notes: [{}] })).destructive[0].blockedReason).toBe('REP')
    })
    it('sin regla que coincida no hay acciones', () => {
        const r = resolveActions(spec, ctx({}, { fiscal: 'otro' }))
        expect(r.primary).toBeUndefined()
        expect(r.secondary).toEqual([])
    })
})

describe('interpolate / resolveTitle', () => {
    it('interpola y prueba alternativas', () => {
        expect(interpolate('{{series}}-{{number}}', ctx({ series: 'A', number: 7 }))).toBe('A-7')
        expect(resolveTitle(spec.title, ctx({ series: 'A', number: 7, id: 'x' }))).toBe('A7')
        expect(resolveTitle(spec.title, ctx({ id: 'x' }))).toBe('x')
    })
})

describe('pruneUnavailableActions', () => {
    it('quita acciones sin acción de modelo, conserva href/openUrl/tab', () => {
        const s: DocumentSpec = {
            ...spec,
            actions: [
                { key: 'a', label: 'A' },
                { key: 'b', label: 'B', modelAction: 'real' },
                { key: 'c', label: 'C', tab: 'fiscal' },
                { key: 'd', label: 'D', openUrl: '{{x}}' },
            ],
        }
        expect(pruneUnavailableActions(s, ['real']).actions.map((a) => a.key)).toEqual(['b', 'c', 'd'])
    })
})
