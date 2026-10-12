import { describe, expect, it } from 'vitest'
import { matchProposalDecision } from './aby-proposal-intent'

describe('matchProposalDecision', () => {
  it('acepta frases cortas de confirmación', () => {
    expect(matchProposalDecision('aceptar')).toBe('approve')
    expect(matchProposalDecision('Acepto.')).toBe('approve')
    expect(matchProposalDecision('sí')).toBe('approve')
    expect(matchProposalDecision('ok dale')).toBe('approve')
    expect(matchProposalDecision('confirmar por favor')).toBe('approve')
  })

  it('rechaza frases cortas', () => {
    expect(matchProposalDecision('rechazar')).toBe('reject')
    expect(matchProposalDecision('no')).toBe('reject')
    expect(matchProposalDecision('cancelar eso')).toBe('reject')
  })

  it('ignora texto largo o ambiguo', () => {
    expect(matchProposalDecision('')).toBeNull()
    expect(
      matchProposalDecision(
        'quiero que crees otro producto similar pero con otro precio y más stock',
      ),
    ).toBeNull()
  })
})
