import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState } from './chat-state'

const msg = (id: string, role: 'user' | 'ai', content = id) => ({ id, role, content })

describe('chatReducer', () => {
  it('tracks loading and adopts the session id from the reply', () => {
    let s = chatReducer(initialChatState, { type: 'user', message: msg('1', 'user') })
    expect(s.loading).toBe(true)
    s = chatReducer(s, { type: 'reply', message: msg('2', 'ai'), sessionId: 'S1' })
    expect(s).toMatchObject({ loading: false, sessionId: 'S1' })
    expect(s.messages[1]?.fresh).toBe(true)
  })

  it('marks errors and stops loading', () => {
    const s = chatReducer({ ...initialChatState, loading: true }, { type: 'error', message: msg('e', 'ai', 'boom') })
    expect(s.loading).toBe(false)
    expect(s.messages[0]?.error).toBe(true)
  })

  it('updates a proposal status in place', () => {
    const base = {
      ...initialChatState,
      messages: [{ ...msg('1', 'ai'), proposals: [{ id: 'p1', title: 't', status: 'pending' as const }] }],
    }
    const s = chatReducer(base, { type: 'proposal', id: 'p1', status: 'approved' })
    expect(s.messages[0]?.proposals?.[0]?.status).toBe('approved')
  })

  it('reset clears the thread', () => {
    expect(chatReducer({ sessionId: 'x', messages: [msg('1', 'user')], loading: true }, { type: 'reset' })).toEqual(
      initialChatState,
    )
  })

  it('discardFailed drops the error bubble and the user turn behind it', () => {
    const s = chatReducer(
      { ...initialChatState, messages: [msg('0', 'ai'), msg('1', 'user'), { ...msg('e', 'ai'), error: true }] },
      { type: 'discardFailed' },
    )
    expect(s.messages.map((m) => m.id)).toEqual(['0'])
  })

  it('flags a history error', () => {
    expect(chatReducer(initialChatState, { type: 'historyError' }).historyError).toBe(true)
  })
})
