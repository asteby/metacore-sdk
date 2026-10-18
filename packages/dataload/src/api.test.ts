import { describe, expect, it, vi } from 'vitest'
import { apiErrorMessage, apiErrorStatus, createDataloadApi, isPlanChanged, listAllReviews, planQuery, profileRef, reviewQuery } from './api'
import { plan, run } from './fixtures'

const ok = (data: unknown) => ({ data: { success: true, data } })
const http = () => ({ get: vi.fn(async (_u: string) => ok([])), post: vi.fn(async (_u: string, _b?: unknown, _c?: unknown) => ok({})) })
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
    h.post.mockResolvedValueOnce(ok({ name: 'p', version: '1-org', org: 'o1', base: { name: 'p', version: '1' } }))
    h.post.mockResolvedValueOnce(ok({ plan, run: run({ mode: 'dry_run' }), source: 'sha-1' }))
    h.post.mockResolvedValueOnce(ok(run()))
    const api = createDataloadApi(h)
    const v = await api.publishVersion({ name: 'p', version: '1-org', base: { name: 'p', version: '1' }, overrides: { ignoreHeaders: ['tmp*'] } })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/profiles', { name: 'p', version: '1-org', base: { name: 'p', version: '1' }, overrides: { ignoreHeaders: ['tmp*'] } })
    expect(v.version).toBe('1-org')
    const dr = await api.dryRun({ profile: 'p', source })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/dry-run', { profile: 'p', source })
    expect(dr.source).toBe('sha-1')
    const r = await api.execute({ profile: 'p@1-org', source: { id: 'sha-1' }, force: true, expectPlanHash: 'plh' })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/runs', { profile: 'p@1-org', source: { id: 'sha-1' }, force: true, expectPlanHash: 'plh' })
    expect(r.id).toBe('r1')
    await api.profileVersion({ name: 'woocommerce-csv', version: '1', shared: true })
    expect(h.get).toHaveBeenLastCalledWith('/dataload/profiles/woocommerce-csv/versions/1?base=1')
    await api.profileVersion({ org: 'o1', name: 'p', version: '1-org' })
    expect(h.get).toHaveBeenLastCalledWith('/dataload/profiles/p/versions/1-org')
    expect(profileRef({ name: 'p', version: '1', shared: true })).toBe('base/p@1')
    expect(profileRef({ name: 'p', version: '1-org', org: 'o1' })).toBe('p@1-org')
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

  it('builds the review queue calls', async () => {
    const h = http()
    const api = createDataloadApi(h)
    h.get.mockResolvedValueOnce(ok({ items: [{ key: 'k', items: null, record: null, state: 'pending' }], counts: { pending: 1 }, next: 'c2' }))
    const page = await api.reviews({ entity: 'product', state: 'pending', runId: 'r 1', code: 'value_suspect', limit: 50 })
    expect(h.get).toHaveBeenLastCalledWith('/dataload/reviews?entity=product&state=pending&run_id=r+1&code=value_suspect&limit=50')
    expect(page.items[0]?.items).toEqual([])
    expect(page.items[0]?.record).toEqual({})
    expect(page.next).toBe('c2')
    expect(page.counts.pending).toBe(1)
    h.get.mockResolvedValueOnce(ok({ items: null, counts: null }))
    expect(await api.reviews({ cursor: 'c2' })).toEqual({ items: [], counts: {} })
    expect(h.get).toHaveBeenLastCalledWith('/dataload/reviews?cursor=c2')
    await api.runPlan('r1', { action: 'review', offset: 100, limit: 50 })
    expect(h.get).toHaveBeenLastCalledWith('/dataload/runs/r1/plan?action=review&offset=100&limit=50')
    expect(planQuery({})).toBe('')
    expect(reviewQuery({})).toBe('')

    const decisions = [{ entity: 'product', key: 'k', hash: 'h', approve: true, note: 'ok' }]
    h.post.mockResolvedValueOnce(ok(null))
    expect(await api.decideReviews(decisions)).toEqual([])
    expect(h.post).toHaveBeenLastCalledWith('/dataload/reviews/decide', { decisions })
    h.post.mockResolvedValueOnce(ok({ ...run({ mode: 'apply_reviewed' }), issues: null, review: null }))
    const r = await api.applyApproved('product')
    expect(h.post).toHaveBeenLastCalledWith('/dataload/reviews/apply', { entity: 'product' })
    expect(r.review).toEqual([])
  })

  it('builds the chunked upload calls', async () => {
    const h = http()
    const api = createDataloadApi(h)
    h.post.mockResolvedValueOnce(ok({ id: 'u/1', name: 'a.csv', size: 10, chunkSize: 4, received: null }))
    const s = await api.createUpload({ name: 'a.csv', size: 10, chunkSize: 4 })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/uploads', { name: 'a.csv', size: 10, chunkSize: 4 })
    expect(s.received).toEqual([])
    const blob = new Blob(['abcd'])
    const ctrl = new AbortController()
    await api.uploadPart('u/1', 2, blob, { sha256: 'ff', signal: ctrl.signal })
    expect(h.post).toHaveBeenLastCalledWith('/dataload/uploads/u%2F1/parts/2', blob, {
      headers: { 'Content-Type': 'application/octet-stream', 'X-Content-Sha256': 'ff' },
      signal: ctrl.signal,
    })
    await api.completeUpload('u/1')
    expect(h.post).toHaveBeenLastCalledWith('/dataload/uploads/u%2F1/complete', {})
    await api.abortUpload('u/1')
    expect(h.post).toHaveBeenLastCalledWith('/dataload/uploads/u%2F1/abort')
    h.get.mockResolvedValueOnce(ok({ id: 'u/1', received: [0, 1] }))
    expect((await api.upload('u/1')).received).toEqual([0, 1])
    expect(h.get).toHaveBeenLastCalledWith('/dataload/uploads/u%2F1')
  })

  it('extracts server messages', () => {
    expect(apiErrorMessage({ response: { data: { message: 'perfil inválido' } } }, 'x')).toBe('perfil inválido')
    expect(apiErrorMessage(new Error('boom'), 'x')).toBe('x')
    expect(apiErrorStatus({ response: { status: 409 } })).toBe(409)
    expect(apiErrorStatus(new Error('net'))).toBeUndefined()
    expect(isPlanChanged({ response: { status: 409, data: { message: 'dataload: el plan cambió desde la simulación' } } })).toBe(true)
    expect(isPlanChanged({ response: { status: 409, data: { message: 'ya hay una importación en curso' } } })).toBe(false)
  })

  it('follows the review cursor until the last page', async () => {
    const h = http()
    h.get.mockResolvedValueOnce(ok({ items: [{ key: 'a', state: 'pending' }], counts: { pending: 2 }, next: 'n1' }))
    h.get.mockResolvedValueOnce(ok({ items: [{ key: 'b', state: 'pending' }], counts: { pending: 2 } }))
    const all = await listAllReviews(createDataloadApi(h), { entity: 'product' })
    expect(all.items.map((e) => e.key)).toEqual(['a', 'b'])
    expect(h.get).toHaveBeenNthCalledWith(1, '/dataload/reviews?entity=product&limit=500')
    expect(h.get).toHaveBeenNthCalledWith(2, '/dataload/reviews?entity=product&limit=500&cursor=n1')
  })

  it('turns the kernel unset times (0001-01-01) into absent fields', async () => {
    const zero = '0001-01-01T00:00:00Z'
    const h = http()
    h.get.mockImplementation(async (u: string) =>
      u.includes('/reviews')
        ? ok({ items: [{ key: 'P5', entity: 'product', items: null, record: null, decidedAt: zero, state: 'pending' }], counts: {} })
        : ok({ ...run({ state: 'queued' }), startedAt: zero, finishedAt: zero, createdAt: '2026-10-01T10:00:00Z', issues: null, review: null }),
    )
    const api = createDataloadApi(h)
    const r = await api.run('r1')
    expect(r.startedAt).toBeUndefined()
    expect(r.finishedAt).toBeUndefined()
    expect(r.createdAt).toBe('2026-10-01T10:00:00Z')
    const [e] = (await api.reviews()).items
    expect(e?.decidedAt).toBeUndefined()
    expect(e?.items).toEqual([])
    expect(e?.record).toEqual({})
  })
})
