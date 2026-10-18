import { describe, expect, it, vi } from 'vitest'
import { apiErrorMessage, createDataloadApi } from './api'
import { plan, run } from './fixtures'

const ok = (data: unknown) => ({ data: { success: true, data } })
const http = () => ({ get: vi.fn(async (_u: string) => ok([])), post: vi.fn(async (_u: string, _b?: unknown) => ok({})) })
const source = { format: 'csv' as const, name: 'a.csv', content: 'sku\n1' }

describe('createDataloadApi', () => {
  it('builds the REST calls', async () => {
    const h = http()
    const api = createDataloadApi(h, { basePath: '/api/dataload/' })
    await api.listProfiles()
    expect(h.get).toHaveBeenCalledWith('/api/dataload/profiles')
    await api.runs(5)
    expect(h.get).toHaveBeenLastCalledWith('/api/dataload/runs?limit=5')
    await api.cancel('a/b')
    expect(h.post).toHaveBeenLastCalledWith('/api/dataload/runs/a%2Fb/cancel')
    await api.mediaStatus('r 1')
    expect(h.get).toHaveBeenLastCalledWith('/api/dataload/media/status?run_id=r%201')
    await api.mediaManifest()
    expect(h.get).toHaveBeenLastCalledWith('/api/dataload/media/manifest')
  })

  it('posts profiles, dry-run and execute bodies as given', async () => {
    const h = http()
    h.post.mockResolvedValueOnce(ok({ profile: { name: 'p' } }))
    h.post.mockResolvedValueOnce(ok({ plan, run: run({ mode: 'dry_run' }) }))
    h.post.mockResolvedValueOnce(ok(run()))
    const api = createDataloadApi(h)
    await api.saveProfile({ profile: { name: 'p', version: '1', entity: 'e', key: ['sku'], fields: [] } })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/profiles', expect.objectContaining({ profile: expect.objectContaining({ name: 'p' }) }))
    await api.dryRun({ profile: 'p', source })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/dry-run', { profile: 'p', source })
    const r = await api.execute({ profile: 'p', source, force: true })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/runs', { profile: 'p', source, force: true })
    expect(r.id).toBe('r1')
  })

  it('normalizes the kernel nulls into arrays', async () => {
    const h = http()
    h.post.mockResolvedValueOnce(ok({ plan: { ...plan, rows: [{ row: 1, action: 'create', diffs: null, issues: null }], counts: null }, run: { ...run(), issues: null } }))
    h.get.mockResolvedValueOnce(ok(null))
    h.post.mockResolvedValueOnce(ok({ checked: 1, ok: 1, missing: null, corrupt: null }))
    const api = createDataloadApi(h)
    const r = await api.dryRun({ profile: 'p', source })
    expect(r.plan.rows[0]?.diffs).toEqual([])
    expect(r.plan.counts).toEqual({})
    expect(r.run.issues).toEqual([])
    expect(await api.runs()).toEqual([])
    expect((await api.mediaVerify()).missing).toEqual([])
  })

  it('retries media with or without a run', async () => {
    const h = http()
    h.post.mockResolvedValue(ok({ requeued: 3 }))
    const api = createDataloadApi(h)
    expect(await api.mediaRetry()).toBe(3)
    expect(h.post).toHaveBeenLastCalledWith('/dataload/media/retry', {})
    await api.mediaRetry('r1')
    expect(h.post).toHaveBeenLastCalledWith('/dataload/media/retry', { run_id: 'r1' })
  })

  it('extracts server messages', () => {
    expect(apiErrorMessage({ response: { data: { message: 'perfil inválido' } } }, 'x')).toBe('perfil inválido')
    expect(apiErrorMessage(new Error('boom'), 'x')).toBe('x')
  })
})
