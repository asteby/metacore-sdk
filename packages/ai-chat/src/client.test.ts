import { describe, expect, it, vi } from 'vitest'
import { createHttpChatClient, toChatMessage } from './client'

describe('createHttpChatClient', () => {
  it('posts to {base}/send and normalises the reply', async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, session_id: 'S', response: 'hola' } })
    const c = createHttpChatClient({ get: vi.fn(), post }, { basePath: '/api/chat/' })
    const r = await c.send({ message: 'hi', sessionId: null })
    expect(post.mock.calls[0]?.[0]).toBe('/api/chat/send')
    expect(post.mock.calls[0]?.[1]).toMatchObject({ message: 'hi', session_id: null })
    expect(r).toMatchObject({ sessionId: 'S', reply: 'hola' })
  })

  it('throws when the server reports failure', async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: false, error: 'nope' } })
    await expect(createHttpChatClient({ get: vi.fn(), post }).send({ message: 'x', sessionId: 'S' })).rejects.toThrow('nope')
  })

  it('loads history and maps assistant rows to ai', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: [{ id: 1, role: 'assistant', content: 'a' }, { role: 'user', content: 'u' }] } })
    const rows = await createHttpChatClient({ get, post: vi.fn() }).loadHistory!('a/b')
    expect(get.mock.calls[0]?.[0]).toBe('/chat/history/a%2Fb')
    expect(rows.map((m) => m.role)).toEqual(['ai', 'user'])
  })

  it('toChatMessage tolerates junk', () => {
    expect(toChatMessage(null)).toMatchObject({ role: 'ai', content: '' })
  })
})
