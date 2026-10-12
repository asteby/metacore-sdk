import { describe, expect, it } from 'vitest'
import { isAbyStillProcessing, isAbyTransportError } from './aby-chat-recover'

describe('isAbyTransportError', () => {
  it('detecta cortes de red / timeout', () => {
    expect(isAbyTransportError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true)
    expect(isAbyTransportError({ code: 'ECONNABORTED', message: 'timeout of 180000ms exceeded' })).toBe(
      true,
    )
    expect(isAbyTransportError({ response: { status: 524 } })).toBe(true)
    expect(isAbyTransportError({ response: { status: 502 } })).toBe(true)
  })

  it('no trata 500 de negocio como transporte', () => {
    expect(isAbyTransportError({ response: { status: 500 }, message: 'AI error' })).toBe(false)
  })
})

describe('isAbyStillProcessing', () => {
  it('detecta 409', () => {
    expect(
      isAbyStillProcessing({
        response: { status: 409, data: { message: 'still_processing' } },
      }),
    ).toBe(true)
  })
})
