import { describe, it, expect } from 'vitest'
import { extractFieldErrors, localizeFieldIssue, type FieldIssue } from '../server-error'

// A minimal i18next-like translator: honors defaultValue and does {{var}}
// interpolation, so the tests assert BOTH the resolved Spanish default and that
// the field label / code params are interpolated.
const t = (_key: string, opts?: { defaultValue?: string; [k: string]: unknown }) => {
    let out = opts?.defaultValue ?? _key
    if (opts) {
        for (const [k, v] of Object.entries(opts)) {
            if (k === 'defaultValue') continue
            out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v))
        }
    }
    return out
}

describe('extractFieldErrors', () => {
    it('normalizes object entries {code,params} from an axios error', () => {
        const err = {
            response: {
                data: {
                    success: false,
                    message: 'validation failed',
                    errors: { name: [{ code: 'required', params: {} }], sku: [{ code: 'duplicate' }] },
                },
            },
        }
        expect(extractFieldErrors(err)).toEqual({
            name: [{ code: 'required', params: {} }],
            sku: [{ code: 'duplicate', params: undefined }],
        })
    })

    it('normalizes string entries to {message}', () => {
        const err = { errors: { name: ['El nombre es obligatorio'], sku: 'Duplicado' } }
        expect(extractFieldErrors(err)).toEqual({
            name: [{ message: 'El nombre es obligatorio' }],
            sku: [{ message: 'Duplicado' }],
        })
    })

    it('accepts a bare response body as well as an axios error', () => {
        const bare = { errors: { qty: [{ code: 'invalid_type', params: { expected: 'number' } }] } }
        expect(extractFieldErrors(bare)).toEqual({
            qty: [{ code: 'invalid_type', params: { expected: 'number' } }],
        })
    })

    it('carries code params through (allowed / ref)', () => {
        const err = {
            errors: {
                status: [{ code: 'invalid_option', params: { allowed: ['a', 'b'] } }],
                owner: [{ code: 'not_found', params: { ref: 'users' } }],
            },
        }
        expect(extractFieldErrors(err)).toEqual({
            status: [{ code: 'invalid_option', params: { allowed: ['a', 'b'] } }],
            owner: [{ code: 'not_found', params: { ref: 'users' } }],
        })
    })

    it('returns undefined when there is no usable errors map', () => {
        expect(extractFieldErrors(undefined)).toBeUndefined()
        expect(extractFieldErrors({ response: { data: { message: 'boom' } } })).toBeUndefined()
        expect(extractFieldErrors({ errors: 'oops' })).toBeUndefined() // string, not a map
        expect(extractFieldErrors({ errors: ['a', 'b'] })).toBeUndefined() // array, not a map
        expect(extractFieldErrors({ errors: {} })).toBeUndefined() // empty
        expect(extractFieldErrors({ errors: { x: [null, ''] } })).toBeUndefined() // nothing normalizes
    })
})

describe('localizeFieldIssue', () => {
    it('required → interpolates label', () => {
        expect(localizeFieldIssue({ code: 'required' }, 'Nombre', t)).toBe('El campo Nombre es obligatorio')
    })
    it('invalid_option', () => {
        expect(localizeFieldIssue({ code: 'invalid_option', params: { allowed: ['a'] } }, 'Estado', t)).toBe(
            'El valor de Estado no es válido',
        )
    })
    it('not_found', () => {
        expect(localizeFieldIssue({ code: 'not_found', params: { ref: 'users' } }, 'Responsable', t)).toBe(
            'El Responsable seleccionado no existe',
        )
    })
    it('duplicate', () => {
        expect(localizeFieldIssue({ code: 'duplicate' }, 'SKU', t)).toBe('Ya existe un registro con ese SKU')
    })
    it('invalid_type', () => {
        expect(localizeFieldIssue({ code: 'invalid_type', params: { expected: 'number' } }, 'Cantidad', t)).toBe(
            'El campo Cantidad tiene un formato inválido',
        )
    })
    it('unknown code → generic fallback with label', () => {
        expect(localizeFieldIssue({ code: 'weird_code' }, 'Campo', t)).toBe('Campo: valor inválido')
    })
    it('message passthrough (pre-localized) ignores code/label', () => {
        const issue: FieldIssue = { message: 'Texto ya localizado' }
        expect(localizeFieldIssue(issue, 'Ignorado', t)).toBe('Texto ya localizado')
    })
})
