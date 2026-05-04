import { describe, it, expect } from 'vitest'
import { buildZodSchema, resolveWidget } from '../dynamic-form-schema'
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
