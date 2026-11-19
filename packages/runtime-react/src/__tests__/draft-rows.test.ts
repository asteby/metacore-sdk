// Núcleo de filas borrador + modelo de relaciones `create_inline` (puro).
import { describe, expect, it } from 'vitest'
import {
    appendDraftRow,
    makeDraftRow,
    newDraftKey,
    removeDraftRow,
    serializeDraftRows,
    updateDraftCell,
    validateDraftRows,
} from '../draft-rows'
import {
    deriveInlineRowFields,
    isCreateInline,
    relationMin,
    splitChildErrors,
    withInlineChildren,
} from '../dialogs/inline-relations'
import { normalizeRefFieldsForSubmit } from '../dialogs/normalize-submit'
import { newLineKey } from '../business/line-items'
import { lineItemErrorsFor } from '../field-validation-ui'

const cols = [
    { key: 'min_amount', label: 'Monto mínimo', required: true, type: 'number' },
    { key: 'discount_value', label: 'Valor', required: true, type: 'number' },
    { key: 'note', label: 'Nota', type: 'text' },
]

describe('draft rows', () => {
    it('claves únicas y compartidas con las partidas de documento', () => {
        expect(newDraftKey()).not.toBe(newDraftKey())
        expect(newLineKey()).toMatch(/^li_/)
        expect(newLineKey()).not.toBe(newLineKey())
    })

    it('agrega al final, quita por clave y edita una celda sin tocar las demás (orden estable)', () => {
        const a = makeDraftRow({ x: 1 }, 'a')
        const b = makeDraftRow({ x: 2 }, 'b')
        let rows = appendDraftRow(appendDraftRow([], a), b)
        rows = updateDraftCell(rows, 'a', 'x', 9)
        expect(rows.map((r) => r.values.x)).toEqual([9, 2])
        expect(removeDraftRow(rows, 'a').map((r) => r.key)).toEqual(['b'])
    })

    it('valida requeridos por celda con ruta "i.campo" y el mínimo de filas', () => {
        const rows = [
            makeDraftRow({ min_amount: '100', discount_value: '' }),
            makeDraftRow({ min_amount: '', discount_value: 5 }),
        ]
        const v = validateDraftRows(rows, cols, { min: 3 })
        expect(v.valid).toBe(false)
        expect(Object.keys(v.errors).sort()).toEqual(['0.discount_value', '1.min_amount'])
        expect(v.form).toMatch(/3/)
        expect(validateDraftRows([], cols, { min: 0 }).valid).toBe(true)
    })

    it('serializa: números reales, opcionales vacíos omitidos, sin claves de UI', () => {
        const out = serializeDraftRows(
            [makeDraftRow({ min_amount: '1000', discount_value: '10,5', note: '  ', extra: 'x' })],
            cols,
        )
        expect(out).toEqual([{ min_amount: 1000, discount_value: 10.5 }])
    })
})

describe('inline relations model', () => {
    it('create_inline solo si es true; min inválido = 0', () => {
        expect(isCreateInline({ create_inline: true })).toBe(true)
        expect(isCreateInline({})).toBe(false)
        expect(relationMin({ min: 2 })).toBe(2)
        expect(relationMin({ min: -1 })).toBe(0)
        expect(relationMin({})).toBe(0)
    })

    it('oculta FK, scope, auditoría, ocultos y solo lectura', () => {
        const fields = [
            { key: 'rule_id', label: 'Regla' },
            { key: 'kind', label: 'Tipo' },
            { key: 'created_at', label: 'Creado' },
            { key: 'created_by.avatar', label: 'Av' },
            { key: 'secret', label: 'S', hidden: true },
            { key: 'sys', label: 'Sys', readonly: true },
            { key: 'min_amount', label: 'Monto' },
        ]
        expect(
            deriveInlineRowFields(fields, { foreign_key: 'rule_id', scope: { kind: 'x' } }).map((f) => f.key),
        ).toEqual(['min_amount'])
    })

    it('sin relaciones inline el cuerpo es el MISMO objeto; con ellas añade _children', () => {
        const payload = { name: 'R' }
        expect(withInlineChildren(payload, [])).toBe(payload)
        const body = withInlineChildren(payload, [
            { relation: 'tiers', rows: [makeDraftRow({ min_amount: '5', discount_value: 1 })], columns: cols },
        ])
        expect(body).toEqual({ name: 'R', _children: { tiers: [{ min_amount: 5, discount_value: 1 }] } })
        expect(payload).toEqual({ name: 'R' })
        expect(normalizeRefFieldsForSubmit({ name: 'R' }, [])).toEqual({ name: 'R' })
    })

    it('reparte errores 422 _children.<rel>.<i>.<campo>, fila y min', () => {
        const t = (k: string, o?: any) =>
            (o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_: string, n: string) => String(o?.[n] ?? ''))
        const map = {
            name: [{ code: 'required' }],
            '_children.tiers.1.min_amount': [{ code: 'invalid_type' }],
            '_children.tiers.0': [{ code: 'invalid_relation' }],
            '_children.tiers': [{ code: 'min', params: { min: 2, count: 1 } }],
        }
        const r = splitChildErrors(map, [{ name: 'tiers', label: 'Escalones' }], (_rel, f) => f, t)
        expect(Object.keys(r.parent)).toEqual(['name'])
        expect(r.children['tiers']).toMatch(/2/)
        expect(r.children['tiers.1.min_amount']).toMatch(/min_amount/)
        expect(r.children['tiers.0']).toBeTruthy()
        expect(lineItemErrorsFor('tiers', r.children)).toHaveProperty('1.min_amount')
    })
})
