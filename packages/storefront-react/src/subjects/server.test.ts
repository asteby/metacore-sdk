import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorefrontClient, type StorefrontClient } from '@asteby/storefront'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL, MOCK_SUBJECT_KINDS } from '@asteby/storefront/mock'
import { subjectFromFitKey } from './fit-key.js'
import { createSubjectAction, hasActiveSubject, loadSubjectsContext, NO_SUBJECTS, parseSubjectForm, readSubjectFitKey, serializeSubjectCookie, subjectCacheHeaders, subjectCookieName } from './server.js'

const garage = MOCK_SUBJECT_KINDS[0]!
const size = MOCK_SUBJECT_KINDS[1]!
const KEY = 'nissan/np300/2012/2.5'
const PLATE = 'ZXQ-9917'
const NP300 = { make: 'nissan', model: 'np300', year: 2012, engine: '2.5' }

function store(opts: Parameters<typeof createMockStorefront>[0] = { subjectKinds: MOCK_SUBJECT_KINDS }) {
  const mock = createMockStorefront(opts)
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  return { mock, sf }
}
async function signIn(sf: StorefrontClient) {
  await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
  return { token: session.token, client: sf.withCustomerToken(session.token) }
}
const post = (fields: Record<string, string>, headers: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields)
  return new Request('https://shop.example/garage', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } })
}

afterEach(() => vi.restoreAllMocks())

describe('fit key ⇄ item', () => {
  it('reads a key back into the item it names, and refuses what does not resolve', () => {
    expect(subjectFromFitKey(garage, KEY)).toMatchObject({ label: 'Nissan NP300 Frontier 2012 2.5 L', fit_key: KEY })
    for (const bad of ['', 'nissan', 'nissan/np300/2012', 'nissan/np300/2007/2.5', 'nissan/np300/2018/2.5', 'tesla/x/2020/y', 'ABC-1234', 'a/b/c/d/e', 'nissan/np300/2012/2.5;drop']) expect(subjectFromFitKey(garage, bad), bad).toBeNull()
    expect(subjectFromFitKey(size, 'camisa/m')).toMatchObject({ fit_key: 'camisa/m' })
    expect(subjectFromFitKey(size, null)).toBeNull()
  })
})

describe('the guest cookie holds a compatibility key and nothing else', () => {
  it('serializes HttpOnly, SameSite=Lax, one year, under sf_subject_<kind>', () => {
    const c = serializeSubjectCookie(garage, KEY, { secure: true })
    expect(c).toBe(`sf_subject_vehicle=${encodeURIComponent(KEY)}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`.replace('HttpOnly', 'HttpOnly; Secure'))
    expect(subjectCookieName(garage)).toBe('sf_subject_vehicle')
    expect(serializeSubjectCookie(garage, null)).toContain('Max-Age=0')
  })

  it('refuses to write anything that is not a key of the kind: a plate can never reach the cookie', () => {
    for (const v of [PLATE, PLATE.toLowerCase(), 'nissan/np300/2012/2.5/zxq-9917', 'x', '']) expect(() => serializeSubjectCookie(garage, v), v).toThrow(TypeError)
    expect(() => subjectCookieName('Bad Kind')).toThrow(TypeError)
  })

  it('reads it back validated: tampered, stale or foreign values are ignored', () => {
    const header = `a=b; sf_subject_vehicle=${encodeURIComponent(KEY)}; c=d`
    expect(readSubjectFitKey(header, garage)).toBe(KEY)
    expect(readSubjectFitKey(`sf_subject_vehicle=${PLATE}`, garage)).toBeNull()
    expect(readSubjectFitKey('sf_subject_vehicle=%E0%A4%A', garage)).toBeNull()
    expect(readSubjectFitKey(`sf_subject_size=${encodeURIComponent(KEY)}`, garage)).toBeNull()
    expect(readSubjectFitKey(null, garage)).toBeNull()
  })
})

describe('cache', () => {
  it('a page that depends on the buyer is private; without an item the public policy applies', () => {
    expect(hasActiveSubject(`sf_subject_vehicle=${encodeURIComponent(KEY)}`)).toBe(true)
    expect(hasActiveSubject('sf_subject_vehicle=')).toBe(false)
    expect(hasActiveSubject('sf_cart=abc')).toBe(false)
    expect(subjectCacheHeaders('sf_cart=abc', 'public, max-age=60')).toEqual({ 'Cache-Control': 'public, max-age=60' })
    expect(subjectCacheHeaders(`sf_subject_vehicle=${encodeURIComponent(KEY)}`, 'public, max-age=60')).toEqual({ 'Cache-Control': 'private, no-store', Vary: 'Cookie' })
    expect(subjectCacheHeaders(null, 'public, max-age=60', { signedIn: true })['Cache-Control']).toBe('private, no-store')
  })
})

describe('loadSubjectsContext never throws and degrades to nothing', () => {
  it('a store that declares no kinds has no section', async () => {
    const { sf } = store({})
    expect(await loadSubjectsContext(sf)).toEqual({ kinds: [], subjects: [], active: {}, degraded: { kinds: false, subjects: false } })
  })

  it('an unreachable store is NO_SUBJECTS (no kinds: nothing renders)', async () => {
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: async () => { throw new Error('down') }, retries: 0 } as never)
    expect(await loadSubjectsContext(sf)).toBe(NO_SUBJECTS)
  })

  it('a guest gets the item of the cookie; a signed-in buyer gets the active saved one first', async () => {
    const { sf } = store()
    const guest = await loadSubjectsContext(sf, { cookieHeader: `sf_subject_vehicle=${encodeURIComponent(KEY)}` })
    expect(guest.active.vehicle).toMatchObject({ source: 'cookie', fit_key: KEY, label: 'Nissan NP300 Frontier 2012 2.5 L' })
    expect(guest.subjects).toEqual([])
    const { client } = await signIn(sf)
    const a = await client.customer.subjects.create({ kind: 'vehicle', attributes: { make: 'nissan', model: 'versa', year: 2018, engine: '1.6' } })
    const b = await client.customer.subjects.create({ kind: 'vehicle', attributes: NP300 })
    await client.customer.subjects.update(b.id, { is_default: true })
    const mine = await loadSubjectsContext(sf, { customer: client, cookieHeader: `sf_subject_vehicle=${encodeURIComponent('nissan/versa/2018/1.6')}` })
    expect(mine.active.vehicle).toMatchObject({ source: 'account', fit_key: KEY })
    expect(mine.subjects.map((s) => s.id).sort()).toEqual([a.id, b.id].sort())
    expect(mine.kinds.map((k) => k.key)).toEqual(['vehicle', 'size'])
  })

  it('failing to read the items keeps the kinds and flags it', async () => {
    const { mock, sf } = store()
    const { token } = await signIn(sf)
    const flaky = createStorefrontClient({
      baseUrl: 'https://mock.local/api/gw',
      token: 'sk_mock',
      fetch: (input, init) => (String(input).includes('/customer/subjects') ? Promise.resolve(Response.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 })) : mock.fetch(input, init)),
      retries: 0,
    } as never)
    const ctx = await loadSubjectsContext(flaky, { customer: flaky.withCustomerToken(token) })
    expect(ctx.kinds).toHaveLength(2)
    expect(ctx.degraded).toEqual({ kinds: false, subjects: true })
    expect(ctx.subjects).toEqual([])
  })

  it('a tampered cookie yields no active item', async () => {
    const { sf } = store()
    expect((await loadSubjectsContext(sf, { cookieHeader: `sf_subject_vehicle=${PLATE}` })).active).toEqual({})
  })
})

describe('parseSubjectForm', () => {
  it('reads intent, ids and fields; a private field is never echoed; .clear removes it', () => {
    const form = new URLSearchParams({ intent: 'subject-save', kind: 'vehicle', id: 'x1', 'subject.make': ' nissan ', 'subject.plate': PLATE, 'subject.year': '', nickname: ' El de diario ', is_default: '1' })
    const fd = new FormData()
    for (const [k, v] of form) fd.append(k, v)
    const p = parseSubjectForm(fd, ['plate'])
    expect(p).toMatchObject({ intent: 'subject-save', kind: 'vehicle', id: 'x1', attributes: { make: 'nissan', plate: PLATE }, echo: { make: 'nissan' }, nickname: 'El de diario', isDefault: true })
    expect(JSON.stringify(p.echo)).not.toContain('ZXQ')
    const clear = new FormData()
    clear.append('subject.plate.clear', 'on')
    expect(parseSubjectForm(clear, ['plate']).attributes).toEqual({ plate: null })
    expect(parseSubjectForm(new FormData()).intent).toBeNull()
  })
})

describe('createSubjectAction', () => {
  const setup = async () => {
    const { sf, mock } = store()
    const { token } = await signIn(sf)
    const action = createSubjectAction({ storefront: sf, readCustomerToken: () => token })
    return { sf, mock, token, action }
  }
  const fields = (extra: Record<string, string> = {}) => ({ intent: 'subject-save', kind: 'vehicle', 'subject.make': 'nissan', 'subject.model': 'np300', 'subject.year': '2012', 'subject.engine': '2.5', ...extra })

  it('creates, edits (an empty private field keeps the stored one), makes active and deletes', async () => {
    const { sf, token, action } = await setup()
    const made = await action({ request: post(fields({ 'subject.plate': PLATE, nickname: 'El de diario' })) })
    expect(made).toMatchObject({ ok: true, intent: 'subject-save', subject: { fit_key: KEY, nickname: 'El de diario', is_default: true, attributes: { plate: '••17' } } })
    expect(JSON.stringify(made)).not.toContain(PLATE)
    const id = made.subject!.id
    const edited = await action({ request: post({ ...fields({ 'subject.year': '2013' }), id }) })
    expect(edited).toMatchObject({ ok: true, subject: { fit_key: 'nissan/np300/2013/2.5', attributes: { plate: '••17' } } })
    const other = await action({ request: post(fields({ 'subject.year': '2014' })) })
    expect(other.ok).toBe(true)
    const def = await action({ request: post({ intent: 'subject-default', id: other.subject!.id }) })
    expect(def.subject!.is_default).toBe(true)
    expect(await action({ request: post({ intent: 'subject-delete', id }) })).toEqual({ ok: true, intent: 'subject-delete' })
    expect((await sf.withCustomerToken(token).customer.subjects.list()).map((s) => s.id)).toEqual([other.subject!.id])
    // .clear removes a stored private value
    const withPlate = await action({ request: post(fields({ 'subject.year': '2015', 'subject.plate': PLATE })) })
    const cleared = await action({ request: post({ ...fields({ 'subject.year': '2015', 'subject.plate.clear': 'on' }), id: withPlate.subject!.id }) })
    expect(cleared.subject!.attributes).not.toHaveProperty('plate')
  })

  it('maps the server\'s refusals to the form field, refills the public values and never echoes a private one', async () => {
    const { action } = await setup()
    const r = await action({ request: post(fields({ 'subject.year': '2007', 'subject.plate': PLATE })) })
    expect(r).toMatchObject({ ok: false, intent: 'subject-save', error: { code: 'validation', field: 'year' }, fieldErrors: { year: 'year_range' }, values: { make: 'nissan', year: '2007' } })
    expect(JSON.stringify(r)).not.toContain(PLATE)
    expect(await action({ request: post(fields({ 'subject.make': 'tesla' })) })).toMatchObject({ fieldErrors: { make: 'not_in_catalog' } })
    expect(await action({ request: post(fields({ 'subject.model': '' })) })).toMatchObject({ fieldErrors: { model: 'required' } })
    expect(await action({ request: post(fields({ kind: 'nope' })) })).toMatchObject({ ok: false, error: { code: 'unsupported' } })
  })

  it('duplicates and limits are told apart; other items are 404', async () => {
    const { action } = await setup()
    await action({ request: post(fields()) })
    expect(await action({ request: post(fields()) })).toMatchObject({ ok: false, error: { code: 'duplicate' } })
    await action({ request: post(fields({ 'subject.year': '2013' })) })
    await action({ request: post(fields({ 'subject.year': '2014' })) })
    expect(await action({ request: post(fields({ 'subject.year': '2015' })) })).toMatchObject({ ok: false, error: { code: 'limit' } })
    expect(await action({ request: post({ intent: 'subject-delete', id: 'not-mine' }) })).toMatchObject({ ok: false, error: { code: 'not_found' } })
  })

  it('without a session nothing is sent; a cross-site post is refused; an unknown intent is a validation error', async () => {
    const { sf } = store()
    const anon = createSubjectAction({ storefront: sf, readCustomerToken: () => null })
    expect(await anon({ request: post(fields()) })).toMatchObject({ ok: false, error: { code: 'unauthorized' }, values: { make: 'nissan' } })
    const { token } = await signIn(sf)
    const action = createSubjectAction({ storefront: sf, readCustomerToken: () => token })
    expect(await action({ request: post(fields(), { 'sec-fetch-site': 'cross-site' }) })).toMatchObject({ ok: false, error: { code: 'unsupported' } })
    expect(await action({ request: post(fields(), { origin: 'https://evil.example', host: 'shop.example' }) })).toMatchObject({ ok: false })
    expect(await action({ request: post({ intent: 'drop-table' }) })).toMatchObject({ ok: false, error: { code: 'validation' } })
  })

  it('without JavaScript the cascade advances by posting: refine saves nothing and echoes the public values', async () => {
    const { sf, token, action } = await setup()
    const r = await action({ request: post({ intent: 'subject-refine', kind: 'vehicle', 'subject.make': 'nissan', 'subject.plate': PLATE }) })
    expect(r).toEqual({ ok: false, intent: 'subject-refine', values: { make: 'nissan' } })
    expect(await sf.withCustomerToken(token).customer.subjects.list()).toEqual([])
  })

  it('never logs: not on success, not on failure', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const { action } = await setup()
    await action({ request: post(fields({ 'subject.plate': PLATE })) })
    await action({ request: post(fields({ 'subject.year': '2007', 'subject.plate': PLATE })) })
    await action({ request: post({ intent: 'subject-delete', id: 'x' }) })
    for (const s of spies) expect(s).not.toHaveBeenCalled()
  })
})
