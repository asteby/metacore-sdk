import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('../host', () => ({ api: { get: (...a: unknown[]) => get(...a) } }))

import { abyTurnErrorOf } from './aby-chat-error'
import {
  AbyHistoryTurnError,
  AbyNetworkDownError,
  pollAbyAssistantReply,
} from './aby-chat-recover'

const netErr = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

beforeEach(() => {
  get.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('pollAbyAssistantReply', () => {
  it('devuelve la respuesta del asistente tras la pregunta', async () => {
    get.mockResolvedValue({
      data: { data: [{ role: 'user', content: 'hola' }, { role: 'assistant', content: 'qué tal' }] },
    })
    const res = await pollAbyAssistantReply({ sessionId: 's', userMessage: 'hola', intervalMs: 1 })
    expect(res?.message).toBe('qué tal')
  })

  it('un aviso turn_error guardado se lanza como error clasificado, no como respuesta', async () => {
    get.mockResolvedValue({
      data: {
        data: [
          { role: 'user', content: 'hola' },
          {
            role: 'assistant',
            content: 'No pude conectarme.',
            metadata: JSON.stringify({
              turn_error: { code: 'unavailable', message: 'No pude conectarme.', actions: ['retry'] },
            }),
          },
        ],
      },
    })
    const err = await pollAbyAssistantReply({
      sessionId: 's',
      userMessage: 'hola',
      intervalMs: 1,
    }).catch((e) => e)
    expect(err).toBeInstanceOf(AbyHistoryTurnError)
    expect(abyTurnErrorOf(err)?.code).toBe('unavailable')
  })

  it('con el navegador sin conexión no sondea', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await expect(
      pollAbyAssistantReply({ sessionId: 's', userMessage: 'hola', timeoutMs: 300_000 }),
    ).rejects.toBeInstanceOf(AbyNetworkDownError)
    expect(get).not.toHaveBeenCalled()
  })

  it('se rinde tras fallos de red consecutivos en lugar de esperar ~5 min', async () => {
    get.mockImplementation(() => Promise.reject(netErr()))
    const started = Date.now()
    const err = await pollAbyAssistantReply({
      sessionId: 's',
      userMessage: 'hola',
      timeoutMs: 300_000,
      intervalMs: 1,
      maxNetworkFailures: 3,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AbyNetworkDownError)
    expect(get).toHaveBeenCalledTimes(3)
    expect(Date.now() - started).toBeLessThan(5_000)
  })

  it('un error con respuesta HTTP (502) no cuenta como red caída', async () => {
    get
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(netErr())
      .mockRejectedValueOnce(Object.assign(new Error('bad gateway'), { response: { status: 502 } }))
      .mockRejectedValueOnce(netErr())
      .mockResolvedValue({
        data: { data: [{ role: 'user', content: 'hola' }, { role: 'ai', content: 'listo' }] },
      })
    const res = await pollAbyAssistantReply({
      sessionId: 's',
      userMessage: 'hola',
      intervalMs: 1,
      maxNetworkFailures: 3,
    })
    expect(res?.message).toBe('listo')
  })
})
