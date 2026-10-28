import { describe, expect, it } from 'vitest'
import { resolveAbyDraftTarget } from './aby-draft-target'

describe('resolveAbyDraftTarget', () => {
  const last = { id: 'ses-1', title: 'Anterior' }

  it('una pregunta con send abre una conversación nueva y la envía, aunque haya una anterior', () => {
    expect(resolveAbyDraftTarget({ message: '  ¿Cómo va Zona Norte?  ', send: true }, last)).toEqual({
      kind: 'send',
      message: '¿Cómo va Zona Norte?',
    })
    expect(resolveAbyDraftTarget({ message: 'hola', send: true }, null)).toEqual({ kind: 'send', message: 'hola' })
  })

  it('send sin texto no envía nada vacío', () => {
    expect(resolveAbyDraftTarget({ message: '   ', send: true }, null)).toEqual({ kind: 'new' })
  })

  it('una sesión pedida explícitamente se abre aunque venga con send', () => {
    expect(resolveAbyDraftTarget({ message: 'sigue', send: true, sessionId: 'ses-9', sessionTitle: 'X' }, last)).toEqual({
      kind: 'open',
      sessionId: 'ses-9',
      title: 'X',
    })
  })

  it('sin send retoma la última conversación con el texto en el compositor', () => {
    expect(resolveAbyDraftTarget({ message: 'hola' }, last)).toEqual({ kind: 'open', sessionId: 'ses-1', title: 'Anterior' })
  })

  it('sin conversación previa abre una nueva en vez de quedarse en la lista', () => {
    expect(resolveAbyDraftTarget({ message: 'hola' }, null)).toEqual({ kind: 'new' })
    expect(resolveAbyDraftTarget({ attachments: [{ url: '/a.pdf', name: 'a.pdf' }] }, undefined)).toEqual({ kind: 'new' })
  })
})
