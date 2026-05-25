import { describe, it, expect } from 'vitest'
import { buildZodSchema, resolveWidget, isLineItemsField, getItemFields } from '../dynamic-form-schema'
import type { ActionFieldDef } from '../types'

describe('buildZodSchema', () => {
    it('aplica regex de Validation a strings', () => {
        const fields: ActionFieldDef[] = [
            { key: 'sku', label: 'SKU', type: 'string', required: true, validation: { regex: '^[A-Z]{3}-\\d{3}$' } },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ sku: 'ABC-123' }).success).toBe(true)
        expect(schema.safeParse({ sku: 'abc-123' }).success).toBe(false)
        expect(schema.safeParse({ sku: 'ABCD-123' }).success).toBe(false)
    })

    it('aplica min/max como longitud sobre strings', () => {
        const fields: ActionFieldDef[] = [
            { key: 'name', label: 'Nombre', type: 'string', required: true, validation: { min: 3, max: 8 } },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ name: 'ab' }).success).toBe(false)
        expect(schema.safeParse({ name: 'abc' }).success).toBe(true)
        expect(schema.safeParse({ name: 'abcdefgh' }).success).toBe(true)
        expect(schema.safeParse({ name: 'abcdefghi' }).success).toBe(false)
    })

    it('aplica min/max como bounds sobre números', () => {
        const fields: ActionFieldDef[] = [
            { key: 'age', label: 'Edad', type: 'number', required: true, validation: { min: 18, max: 99 } },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ age: 17 }).success).toBe(false)
        expect(schema.safeParse({ age: 18 }).success).toBe(true)
        expect(schema.safeParse({ age: 99 }).success).toBe(true)
        expect(schema.safeParse({ age: 100 }).success).toBe(false)
    })

    it('marca campos requeridos vacíos como inválidos', () => {
        const fields: ActionFieldDef[] = [
            { key: 'title', label: 'Título', type: 'string', required: true },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ title: '' }).success).toBe(false)
        expect(schema.safeParse({ title: 'ok' }).success).toBe(true)
    })

    it('campos opcionales aceptan vacío o ausente', () => {
        const fields: ActionFieldDef[] = [
            { key: 'note', label: 'Nota', type: 'string' },
            { key: 'qty', label: 'Cantidad', type: 'number' },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ note: '', qty: '' }).success).toBe(true)
        expect(schema.safeParse({}).success).toBe(true)
    })

    it('valida email y url por type', () => {
        const fields: ActionFieldDef[] = [
            { key: 'mail', label: 'Email', type: 'email', required: true },
            { key: 'site', label: 'URL', type: 'url', required: true },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ mail: 'a@b.co', site: 'https://x.test' }).success).toBe(true)
        expect(schema.safeParse({ mail: 'no-email', site: 'https://x.test' }).success).toBe(false)
        expect(schema.safeParse({ mail: 'a@b.co', site: 'no-url' }).success).toBe(false)
    })

    it('regex inválida no rompe el build (silently skipped)', () => {
        const fields: ActionFieldDef[] = [
            { key: 'x', label: 'X', type: 'string', required: true, validation: { regex: '[invalid(' } },
        ]
        expect(() => buildZodSchema(fields)).not.toThrow()
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ x: 'anything' }).success).toBe(true)
    })

    it('booleans requeridos exigen un valor explícito', () => {
        const fields: ActionFieldDef[] = [
            { key: 'agree', label: 'Acepto', type: 'boolean', required: true },
        ]
        const schema = buildZodSchema(fields)
        expect(schema.safeParse({ agree: true }).success).toBe(true)
        expect(schema.safeParse({ agree: false }).success).toBe(true)
        expect(schema.safeParse({}).success).toBe(false)
    })
})

describe('resolveWidget', () => {
    it('respeta widget explícito', () => {
        expect(resolveWidget({ key: 'k', label: 'L', type: 'string', widget: 'textarea' })).toBe('textarea')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'string', widget: 'richtext' })).toBe('richtext')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'string', widget: 'color' })).toBe('color')
    })

    it('cae al inferido por type cuando widget no está', () => {
        expect(resolveWidget({ key: 'k', label: 'L', type: 'textarea' })).toBe('textarea')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'select' })).toBe('select')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'boolean' })).toBe('switch')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'number' })).toBe('number')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'date' })).toBe('date')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'string' })).toBe('text')
        expect(resolveWidget({ key: 'k', label: 'L', type: 'email' })).toBe('text')
    })
})

describe('line-items (repeatable group)', () => {
    const lineItemsField: ActionFieldDef = {
        key: 'lines',
        label: 'Renglones',
        type: 'array',
        itemFields: [
            { key: 'product_id', label: 'Producto', type: 'select', ref: 'product' },
            { key: 'quantity', label: 'Cantidad', type: 'number', required: true },
        ],
    }

    it('detecta un campo line-items por sus itemFields', () => {
        expect(isLineItemsField(lineItemsField)).toBe(true)
        expect(isLineItemsField({ key: 'name', label: 'Nombre', type: 'string' })).toBe(false)
        expect(getItemFields(lineItemsField)).toHaveLength(2)
    })

    it('tolera item_fields snake_case crudo del kernel', () => {
        const raw = {
            key: 'lines',
            label: 'Renglones',
            type: 'array',
            item_fields: [{ key: 'sku', label: 'SKU', type: 'string' }],
        } as unknown as ActionFieldDef
        expect(isLineItemsField(raw)).toBe(true)
        expect(getItemFields(raw)).toHaveLength(1)
    })

    it('valida como array de objetos por renglón', () => {
        const schema = buildZodSchema([lineItemsField])
        const ok = schema.safeParse({ lines: [{ product_id: 'p1', quantity: 3 }] })
        expect(ok.success).toBe(true)
        // No es un array → inválido (el valor del grupo debe ser una lista de renglones)
        expect(schema.safeParse({ lines: 'nope' }).success).toBe(false)
    })

    it('aplica reglas por columna dentro de cada renglón', () => {
        const withBound: ActionFieldDef = {
            key: 'lines',
            label: 'Renglones',
            type: 'array',
            itemFields: [{ key: 'qty', label: 'Cantidad', type: 'number', required: true, validation: { min: 1 } }],
        }
        const schema = buildZodSchema([withBound])
        expect(schema.safeParse({ lines: [{ qty: 5 }] }).success).toBe(true)
        expect(schema.safeParse({ lines: [{ qty: 0 }] }).success).toBe(false)
    })

    it('un grupo requerido exige al menos un renglón', () => {
        const schema = buildZodSchema([{ ...lineItemsField, required: true }])
        expect(schema.safeParse({ lines: [] }).success).toBe(false)
        expect(schema.safeParse({ lines: [{ product_id: 'p1', quantity: 1 }] }).success).toBe(true)
    })
})
