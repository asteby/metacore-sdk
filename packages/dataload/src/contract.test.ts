import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDataloadApi, isPlanChanged, profileRef } from './api'
import type { PlanAction, ReviewState, RunMode, RunState } from './types'

// Contrato con OPS: las respuestas REALES del handler (ver __fixtures__/ops/README.md)
// pasan por el cliente y deben traer lo que la UI usa, con los valores de types.ts.
const dir = join(__dirname, '__fixtures__', 'ops')
const golden: Record<string, unknown> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
)
const ACTIONS: PlanAction[] = ['create', 'update', 'unchanged', 'invalid', 'duplicate', 'review']
const RUN_STATES: RunState[] = ['queued', 'running', 'succeeded', 'failed', 'canceled']
const MODES: RunMode[] = ['dry_run', 'apply', 'apply_reviewed']
const REVIEW_STATES: ReviewState[] = ['pending', 'approved', 'applying', 'rejected', 'applied', 'superseded']

/** Fake HTTP that answers each URL with the golden response. */
function http() {
  const route = (url: string): unknown => {
    const u = url.split('?')[0]!
    if (u.endsWith('/profiles')) return golden.profiles
    if (u.endsWith('/dry-run')) return golden['dry-run']
    if (/\/runs\/[^/]+\/plan$/.test(u)) return url.includes('action=review') ? golden['run-plan-review'] : golden['run-plan-page']
    if (/\/runs\/[^/]+$/.test(u)) return golden.run
    if (u.endsWith('/runs')) return url.includes('limit') ? golden.runs : golden['runs-start']
    if (u.endsWith('/reviews')) return golden.reviews
    if (u.endsWith('/reviews/decide')) return golden['reviews-decide']
    if (u.endsWith('/reviews/apply')) return golden['reviews-apply']
    if (u.endsWith('/media/status')) return golden['media-status']
    throw new Error(`sin golden para ${url}`)
  }
  return { get: async (url: string) => ({ data: route(url) }), post: async (url: string) => ({ data: route(url) }) }
}

const api = createDataloadApi(http())
const source = { format: 'csv' as const, name: 'catalogo.csv', content: 'x' }

describe('contrato con OPS (respuestas reales del handler)', () => {
  it('hay respuestas de todo el flujo', () => {
    for (const k of ['profiles', 'profiles-publish', 'profiles-publish-derived', 'dry-run', 'runs-start', 'run', 'run-plan-page', 'reviews', 'reviews-decide', 'reviews-apply', 'media-status', 'runs-plan-changed']) {
      expect(golden[k], k).toBeTruthy()
    }
  })

  it('perfiles: lista de versiones (base compartida y de la organización) con su referencia', async () => {
    const ps = await api.listProfiles()
    expect(ps.length).toBeGreaterThan(0)
    for (const p of ps) {
      expect(typeof p.name).toBe('string')
      expect(typeof p.version).toBe('string')
      expect(typeof p.shared).toBe('boolean')
      expect(typeof p.fingerprint).toBe('string')
    }
    const base = ps.find((p) => p.shared)!
    expect(profileRef(base)).toMatch(/^base\//)
    const derived = ps.find((p) => p.base)!
    expect(profileRef(derived)).toBe(`${derived.name}@${derived.version}`)
    const pub = (golden['profiles-publish-derived'] as { data: Record<string, unknown> }).data
    expect(pub.base).toBeTruthy()
    expect(pub.overrides).toBeTruthy()
  })

  it('dry-run: plan con acciones conocidas, filas en revisión y la fuente guardada', async () => {
    const r = await api.dryRun({ profile: 'catalogo@1-org', source })
    expect(typeof r.source).toBe('string')
    expect(typeof r.plan.planHash).toBe('string')
    for (const a of Object.keys(r.plan.counts)) expect(ACTIONS).toContain(a)
    for (const row of r.plan.rows) {
      expect(ACTIONS).toContain(row.action)
      expect(Array.isArray(row.diffs) && Array.isArray(row.issues) && Array.isArray(row.review)).toBe(true)
    }
    const held = r.plan.rows.find((x) => x.action === 'review')!
    expect(ACTIONS).toContain(held.outcome)
    expect(held.review[0]?.code).toBe('duplicate_key')
    expect(held.review[0]?.severity).toBe('revisar')
    expect(r.run.registry?.key.version).toBeTruthy()
    expect(MODES).toContain(r.run.mode)
  })

  it('plan paginado en el servidor: total, offset y limit', async () => {
    const p = await api.runPlan('r', { offset: 0, limit: 2 })
    expect(p.total).toBeGreaterThan(p.rows.length)
    expect(p.limit).toBe(2)
    expect(p.offset).toBe(0)
    const rv = await api.runPlan('r', { action: 'review' })
    expect(rv.rows.every((x) => x.action === 'review')).toBe(true)
  })

  it('corrida: estados, modo, avance con review y avisos con código', async () => {
    const run = await api.run('r')
    expect(RUN_STATES).toContain(run.state)
    expect(MODES).toContain(run.mode)
    expect(typeof run.progress.review).toBe('number')
    expect(run.issues.every((i) => typeof i.code === 'string' && typeof i.row === 'number')).toBe(true)
    expect(run.startedAt === undefined || !run.startedAt.startsWith('0001')).toBe(true)
    const runs = await api.runs(5)
    expect(runs.length).toBeGreaterThan(0)
  })

  it('revisión: página con items, conteos por estado y decisión atada a la huella', async () => {
    const page = await api.reviews({ entity: 'product' })
    expect(page.items.length).toBeGreaterThan(0)
    for (const e of page.items) {
      expect(REVIEW_STATES).toContain(e.state)
      expect(typeof e.hash).toBe('string')
      expect(Array.isArray(e.items)).toBe(true)
    }
    for (const s of Object.keys(page.counts)) expect(REVIEW_STATES).toContain(s)
    const decided = await api.decideReviews([{ entity: 'product', key: 'B2', hash: 'h', approve: true }])
    expect(decided[0]?.state).toBe('approved')
    const applied = await api.applyApproved('product')
    expect(applied.mode).toBe('apply_reviewed')
    expect(applied.progress.done).toBe(1)
  })

  it('medios: cola y manifiesto', async () => {
    const st = await api.mediaStatus()
    expect(typeof st.queue.pending).toBe('number')
    expect(typeof st.manifest.total).toBe('number')
    expect(Array.isArray(st.dead)).toBe(true)
  })

  it('el 409 por plan cambiado se reconoce', () => {
    const body = golden['runs-plan-changed'] as { message: string }
    expect(isPlanChanged({ response: { status: 409, data: body } })).toBe(true)
  })
})
