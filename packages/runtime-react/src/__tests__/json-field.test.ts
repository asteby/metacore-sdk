// Campos JSON del formulario dinámico: una columna jsonb (p. ej. los atributos de una variante, con el icono del sabor) se edita
// como JSON y se guarda intacta; nunca se pinta «[object Object]» ni se rechaza con «Invalid input».
import { describe, it, expect } from 'vitest'
import { buildZodSchema, resolveWidget } from '../dynamic-form-schema'
import { formatJsonValue, isJsonField, isStructuredValue, parseJsonInput } from '../json-field-model'
import type { ActionFieldDef } from '../types'

const attrs = { flavor: 'Chocolate', flavor_icon: 'cookie', swatch: '#4b2e1e', size: ['5 lb'] }
const field = (over: Partial<ActionFieldDef> = {}): ActionFieldDef => ({ key: 'attributes', label: 'Atributos', type: 'jsonb', ...over })

describe('isJsonField / resolveWidget', () => {
    it('json, jsonb, object o widget json → editor json', () => {
        for (const type of ['json', 'jsonb', 'object']) expect(resolveWidget(field({ type }))).toBe('json')
        expect(resolveWidget(field({ type: 'text', widget: 'json' }))).toBe('json')
        expect(isJsonField(field({ type: 'text' }))).toBe(false)
    })
    it('un campo de texto sigue siendo texto y un ref sigue siendo selector', () => {
        expect(resolveWidget(field({ type: 'text' }))).toBe('text')
        expect(resolveWidget(field({ type: 'jsonb', ref: 'products' } as never))).toBe('dynamic_select')
    })
})

describe('formatJsonValue / parseJsonInput', () => {
    it('objeto → JSON con sangría, nunca «[object Object]»', () => {
        const text = formatJsonValue(attrs)
        expect(text).not.toContain('[object Object]')
        expect(JSON.parse(text)).toEqual(attrs)
        expect(text).toContain('\n')
    })
    it('ida y vuelta sin perder nada (incluido el icono del sabor)', () => {
        const back = parseJsonInput(formatJsonValue(attrs))
        expect(back).toEqual({ ok: true, value: attrs })
    })
    it('vacío = null; texto roto = crudo (no se pierde lo escrito)', () => {
        expect(parseJsonInput('  ')).toEqual({ ok: true, value: null })
        expect(parseJsonInput('{"flavor":')).toEqual({ ok: false, raw: '{"flavor":' })
        expect(formatJsonValue(null)).toBe('')
        expect(isStructuredValue([])).toBe(true)
        expect(isStructuredValue('x')).toBe(false)
    })
})

describe('buildZodSchema con campos JSON', () => {
    const schema = buildZodSchema([field()])
    it('acepta el objeto de atributos tal cual y lo devuelve intacto', () => {
        const r = schema.safeParse({ attributes: attrs })
        expect(r.success).toBe(true)
        expect(r.success && (r.data as { attributes: unknown }).attributes).toEqual(attrs)
    })
    it('acepta vacío, null, arreglos y JSON escrito a mano; rechaza JSON roto', () => {
        for (const v of [undefined, null, '', [1, 2], '{"a":1}']) expect(schema.safeParse({ attributes: v }).success, String(v)).toBe(true)
        const bad = schema.safeParse({ attributes: '{"a":' })
        expect(bad.success).toBe(false)
        expect(JSON.stringify(bad.success ? '' : bad.error.issues)).toContain('JSON inválido')
    })
    it('requerido: no acepta vacío', () => {
        const req = buildZodSchema([field({ required: true })])
        expect(req.safeParse({ attributes: attrs }).success).toBe(true)
        for (const v of [null, '', undefined]) expect(req.safeParse({ attributes: v }).success, String(v)).toBe(false)
    })
})

describe('kernel que sirve jsonb como texto/textarea (caso real de God\'s)', () => {
    for (const type of ['text', 'textarea']) {
        it(`${type}: un objeto ya no falla con «Invalid input» y no se altera`, () => {
            const schema = buildZodSchema([field({ type })])
            const r = schema.safeParse({ attributes: attrs })
            expect(r.success).toBe(true)
            expect(r.success && (r.data as { attributes: unknown }).attributes).toEqual(attrs)
        })
    }
    it('los textos siguen validándose como siempre', () => {
        const schema = buildZodSchema([{ key: 'sku', label: 'SKU', type: 'string', required: true } as ActionFieldDef])
        expect(schema.safeParse({ sku: 'A1' }).success).toBe(true)
        expect(schema.safeParse({ sku: 5 }).success).toBe(false)
        expect(schema.safeParse({ sku: '' }).success).toBe(false)
    })
})
