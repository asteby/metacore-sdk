import { describe, expect, it } from 'vitest'
import { abyErrorActionLabel, abyTurnErrorOf } from './aby-chat-error'

describe('abyTurnErrorOf', () => {
  it('lee el error clasificado del servidor', () => {
    const err = abyTurnErrorOf({
      response: {
        status: 503,
        data: {
          success: false,
          message: 'La sesión de Claude venció o no está conectada.',
          error: {
            code: 'auth',
            message: 'La sesión de Claude venció o no está conectada.',
            provider: 'claude_code',
            provider_label: 'Claude',
            actions: ['reconnect', 'switch_provider', 'retry', 'bogus'],
          },
        },
      },
    })
    expect(err?.code).toBe('auth')
    expect(err?.actions).toEqual(['reconnect', 'switch_provider', 'retry'])
    expect(abyErrorActionLabel('reconnect', err!)).toBe('Reconectar Claude')
  })

  it('sin error clasificado devuelve null (corte de red, respuesta vieja)', () => {
    expect(abyTurnErrorOf({ code: 'ERR_NETWORK' })).toBeNull()
    expect(abyTurnErrorOf({ response: { data: { message: 'x', error: 'plain' } } })).toBeNull()
  })

  it('agrega la hora de reset en la zona del navegador', () => {
    const err = abyTurnErrorOf({
      response: {
        data: {
          error: {
            code: 'rate_limit',
            message: 'Llegaste al límite de uso de Claude.',
            reset_at: '2026-09-29T15:00:00Z',
            actions: ['retry', 'switch_provider'],
          },
        },
      },
    })
    expect(err?.message).toMatch(/^Llegaste al límite de uso de Claude\. Se restablece: .+\.$/)
  })

  it('sin acciones conocidas ofrece reintentar', () => {
    const err = abyTurnErrorOf({
      response: { data: { error: { code: 'unknown', message: 'Falló', actions: [] } } },
    })
    expect(err?.actions).toEqual(['retry'])
  })
})

describe('isClaudeProvider', () => {
  it('reconoce el seat actual y el legado', async () => {
    const { isClaudeProvider } = await import('./aby-chat-error')
    expect(isClaudeProvider('claude_code')).toBe(true)
    expect(isClaudeProvider('claude_code_proxy')).toBe(true)
    expect(isClaudeProvider('codex')).toBe(false)
    expect(isClaudeProvider(undefined)).toBe(false)
  })
})
