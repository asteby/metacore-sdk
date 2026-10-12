import { describe, expect, it, vi } from 'vitest'
import {
  claudeConnectErrorCode,
  claudeConnectErrorKey,
  createClaudeConnectApi,
  createOrgAIApi,
  requestErrorMessage,
} from './api'
import { makeTr } from './i18n'

const http = () => ({
  get: vi.fn(async (_u: string) => ({ data: { data: { mode: 'openai' } } })),
  post: vi.fn(async (_u: string, _b?: unknown) => ({ data: { data: { connected: true, installed: true } } })),
  put: vi.fn(async (u: string, _b?: unknown) => ({ data: { data: u.endsWith('/token') ? { connected: true } : { mode: 'x', user_ai_source: 'local' } } })),
  delete: vi.fn(async (_u: string) => ({ data: {} })),
})

describe('createOrgAIApi', () => {
  it('uses default and custom paths, unwraps the envelope', async () => {
    const h = http()
    const api = createOrgAIApi(h)
    expect(await api.getConfig()).toEqual({ mode: 'openai' })
    await api.updateConfig({ mode: 'openai', model: 'm' })
    expect(h.put).toHaveBeenCalledWith('/organization/ai-config', { mode: 'openai', model: 'm' })
    expect(await api.updateUserSource!('local')).toBe('local')
    const h2 = http()
    await createOrgAIApi(h2, { basePath: '/ai' }).getConfig()
    expect(h2.get).toHaveBeenCalledWith('/ai')
    expect(createOrgAIApi(h2, { userSourcePath: false }).updateUserSource).toBeUndefined()
  })
})

describe('createClaudeConnectApi', () => {
  it('maps every call', async () => {
    const h = http()
    const api = createClaudeConnectApi(h)
    await api.getBinary()
    await api.install()
    await api.start()
    expect(await api.submitCode('a/b', 'c')).toBe(true)
    expect(await api.submitToken('t')).toBe(true)
    await api.cancel('a/b')
    expect(h.post).toHaveBeenCalledWith('/organization/ai-config/claude/connect/a%2Fb/code', { code: 'c' })
    expect(h.put).toHaveBeenCalledWith('/organization/ai-config/claude/token', { token: 't' })
    expect(h.delete).toHaveBeenCalledWith('/organization/ai-config/claude/connect/a%2Fb')
  })
})

describe('error helpers', () => {
  const err = (code: unknown) => ({ response: { data: { error: { code } } } })
  it('maps known codes only', () => {
    expect(claudeConnectErrorCode(err('busy'))).toBe('busy')
    expect(claudeConnectErrorCode(err('weird'))).toBeNull()
    expect(claudeConnectErrorKey(err('expired'))).toBe('org_ai.claude_connect.errors.expired')
    expect(claudeConnectErrorKey(new Error('x'))).toBe('org_ai.claude_connect.errors.generic')
  })
  it('requestErrorMessage', () => {
    expect(requestErrorMessage({ response: { data: { message: 'nope' } } })).toBe('nope')
    expect(requestErrorMessage({})).toBeUndefined()
  })
})

describe('makeTr', () => {
  it('falls back to built-in English and interpolates', () => {
    expect(makeTr()('org_ai.claude_connect.expires_in', { time: '1:00' })).toBe('Expires in 1:00')
  })
  it('prefers host translation, ignores untranslated echo', () => {
    const t = (k: string) => (k === 'org_ai.save' ? 'Guardar' : k)
    expect(makeTr(t)('org_ai.save')).toBe('Guardar')
    expect(makeTr(t)('org_ai.saving')).toBe('Saving...')
  })
})
