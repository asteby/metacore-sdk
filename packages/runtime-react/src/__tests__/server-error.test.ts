import { describe, it, expect } from 'vitest'
import { extractServerError } from '../server-error'

describe('extractServerError', () => {
  it('surfaces details as description under message headline', () => {
    const err = { response: { data: { success: false, message: 'Error creating record', details: 'ERROR: column "x" does not exist (SQLSTATE 42703)' } } }
    expect(extractServerError(err, 'fallback')).toEqual({ title: 'Error creating record', description: 'ERROR: column "x" does not exist (SQLSTATE 42703)' })
  })
  it('accepts a bare response body', () => {
    expect(extractServerError({ success: false, message: 'm', details: 'd' }, 'fb')).toEqual({ title: 'm', description: 'd' })
  })
  it('uses details as title when no message', () => {
    expect(extractServerError({ response: { data: { details: 'boom' } } }, 'fb')).toEqual({ title: 'boom' })
  })
  it('joins validation errors object', () => {
    const r = extractServerError({ response: { data: { message: 'Validation error', errors: { name: ['required'], sku: 'dup' } } } }, 'fb')
    expect(r.title).toBe('Validation error'); expect(r.description).toContain('name: required'); expect(r.description).toContain('sku: dup')
  })
  it('falls back for a thrown string / network error', () => {
    expect(extractServerError('Network Error', 'fb')).toEqual({ title: 'fb', description: 'Network Error' })
    expect(extractServerError({}, 'fb')).toEqual({ title: 'fb' })
  })
  it('does not duplicate when message equals details', () => {
    expect(extractServerError({ response: { data: { message: 'same', details: 'same' } } }, 'fb')).toEqual({ title: 'same' })
  })
})

import { vi } from 'vitest'
import { toastServerSuccess } from '../server-error'
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { toast } from 'sonner'
describe('toastServerSuccess', () => {
  const t = (k: string, o?: { defaultValue?: string }) => (k === 'common.success' ? 'Registro creado' : (o?.defaultValue ?? k))
  it('drops English prose in favour of localized fallback', () => {
    toastServerSuccess({ message: 'Record created successfully' }, { t })
    expect((toast.success as any).mock.calls.at(-1)[0]).toBe('Registro creado')
  })
  it('translates a dotted i18n key', () => {
    const t2 = (k: string, o?: { defaultValue?: string }) => (k === 'pos.rate.created' ? 'Tasa creada' : (k === 'common.success' ? 'Registro creado' : (o?.defaultValue ?? k)))
    toastServerSuccess({ message: 'pos.rate.created' }, { t: t2 })
    expect((toast.success as any).mock.calls.at(-1)[0]).toBe('Tasa creada')
  })
})
