import { describe, expect, it } from 'vitest'
import {
  ApiError,
  getApiErrorMessage,
  isAbortError,
  isApiError,
  isEnvelope,
  unwrapEnvelope,
  unwrapList,
  unwrapListResponse,
  unwrapResponse,
} from '../envelope'

describe('unwrapEnvelope', () => {
  it('unwraps {success:true,data}', () => {
    expect(unwrapEnvelope<{ a: number }>({ success: true, data: { a: 1 } })).toEqual({ a: 1 })
  })
  it('unwraps a tolerant {data} body', () => {
    expect(unwrapEnvelope<number[]>({ data: [1, 2] })).toEqual([1, 2])
  })
  it('returns bare payloads untouched', () => {
    const bare = { id: 1, name: 'x' }
    expect(unwrapEnvelope(bare)).toBe(bare)
    expect(unwrapEnvelope([1])).toEqual([1])
    expect(unwrapEnvelope(null)).toBeNull()
  })
  it('does not treat a flat record with a data field as an envelope', () => {
    const rec = { id: 1, data: 'x' }
    expect(isEnvelope(rec)).toBe(false)
    expect(unwrapEnvelope(rec)).toBe(rec)
  })
  it('throws ApiError on success:false', () => {
    expect(() => unwrapEnvelope({ success: false, message: 'nope' })).toThrow(ApiError)
    try {
      unwrapEnvelope({ success: false, error: 'bad' })
    } catch (e) {
      expect(isApiError(e)).toBe(true)
      expect((e as ApiError).message).toBe('bad')
    }
  })
  it('unwrapResponse reads res.data', () => {
    expect(unwrapResponse<string>({ data: { success: true, data: 'ok' } })).toBe('ok')
    expect(unwrapResponse(undefined)).toBeUndefined()
  })
})

describe('unwrapList', () => {
  it('returns items and meta.total', () => {
    const r = unwrapList<number>({ success: true, data: [1, 2], meta: { total: 40, page: 1 } })
    expect(r).toEqual({ items: [1, 2], total: 40, meta: { total: 40, page: 1 } })
  })
  it('falls back to length and tolerates null/bare', () => {
    expect(unwrapList({ success: true, data: null })).toEqual({ items: [], total: 0, meta: {} })
    expect(unwrapList<number>([1, 2, 3]).total).toBe(3)
    expect(unwrapListResponse<number>({ data: { data: [7] } }).items).toEqual([7])
  })
})

describe('getApiErrorMessage', () => {
  it('prefers server message', () => {
    expect(getApiErrorMessage({ response: { data: { message: ' boom ' } }, message: 'x' })).toBe('boom')
    expect(getApiErrorMessage({ response: { data: { data: { message: 'deep' } } } })).toBe('deep')
  })
  it('handles strings, html and fallbacks', () => {
    expect(getApiErrorMessage('plain')).toBe('plain')
    expect(getApiErrorMessage({ response: { data: '<html><title>404: nope</title></html>' } })).toBe('404: nope')
    expect(getApiErrorMessage({ response: { data: '<div>x</div>' } }, 'fb')).toBe('fb')
    expect(getApiErrorMessage(new Error('net'))).toBe('net')
    expect(getApiErrorMessage(null, 'fb')).toBe('fb')
    expect(getApiErrorMessage(new ApiError('api'))).toBe('api')
  })
})

describe('isAbortError', () => {
  it('detects abort/cancel', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isAbortError(new Error('x'))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
