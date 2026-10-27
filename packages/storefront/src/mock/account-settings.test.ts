import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, dataExportBytes, isAccountDeleteBlocked, isReauthRequired, safeExportFilename } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })

beforeEach(() => mock.reset())

const PASSWORD = 'tr0ub4dor&3-horse'

async function register(email = 'nueva@example.com') {
  await sf.customer.register({ email, password: PASSWORD })
  await sf.customer.verifyRegistration({ email, code: mock.otpCode })
  const session = await sf.customer.loginWithPassword({ email, password: PASSWORD })
  return { email, session, client: sf.withCustomerToken(session.token) }
}

describe('mock account settings (contract 1.9)', () => {
  it('advertises the sections', async () => {
    expect(await sf.customer.capabilities()).toMatchObject({ notifications: { channels: ['email'] }, data_export: true, account_delete: true })
  })

  it('language and notification preferences: validated, merged, and the mandatory ones refused', async () => {
    const { client } = await register()
    const first = await client.customer.get()
    expect(first.locale).toBeNull()
    expect(first.preferences).toEqual({ notifications: {} })

    const shopLocale = (await sf.shop.get()).locale
    expect((await client.customer.update({ locale: shopLocale })).locale).toBe(shopLocale)
    await expect(client.customer.update({ locale: 'xx-YY' })).rejects.toMatchObject({ status: 400, field: 'locale' })

    await client.customer.update({ preferences: { notifications: { order_updates: { email: true, whatsapp: false } } } })
    const merged = await client.customer.update({ preferences: { notifications: { shipping: { email: false }, order_updates: { whatsapp: true } } } })
    expect(merged.preferences).toEqual({ notifications: { order_updates: { email: true, whatsapp: true }, shipping: { email: false } } })

    await expect(client.customer.update({ preferences: { notifications: { invoice: { email: false } } } })).rejects.toMatchObject({ status: 400, field: 'preferences.notifications.invoice' })
    await expect(client.customer.update({ preferences: { notifications: { shipping: { sms: true } } } })).rejects.toMatchObject({ status: 400, field: 'preferences.notifications.shipping.sms' })
    expect((await client.customer.get()).preferences).toEqual(merged.preferences)
    expect((await client.customer.update({ preferences: null })).preferences).toEqual({ notifications: {} })
  })

  it('sessions: list marks the current one, revoke is scoped to the buyer and idempotent, others spares the caller', async () => {
    const { email, client } = await register()
    const second = sf.withCustomerToken((await sf.customer.loginWithPassword({ email, password: PASSWORD })).token)
    const third = sf.withCustomerToken((await sf.customer.loginWithPassword({ email, password: PASSWORD })).token)

    const list = await client.customer.sessions.list()
    const total = list.length // registering and signing in already opened sessions
    expect(total).toBeGreaterThanOrEqual(3)
    expect(list.filter((s) => s.current)).toHaveLength(1)
    expect(Object.keys(list[0]!).sort()).toEqual(['created_at', 'current', 'device_label', 'id', 'last_used_at', 'login_method'])

    const other = list.find((s) => !s.current)!
    await client.customer.sessions.revoke(other.id)
    await client.customer.sessions.revoke(other.id) // idempotent
    expect(await client.customer.sessions.list()).toHaveLength(total - 1)
    await expect(client.customer.sessions.revoke('ses_nope')).rejects.toMatchObject({ status: 404 })

    // Someone else's session is the same 404.
    const stranger = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: (await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL }), mock.otpCode) })
    const strangerClient = sf.withCustomerToken(stranger.token)
    const strangerSession = (await strangerClient.customer.sessions.list())[0]!
    await expect(client.customer.sessions.revoke(strangerSession.id)).rejects.toMatchObject({ status: 404 })

    await client.customer.sessions.revokeOthers()
    expect(await client.customer.sessions.list()).toHaveLength(1)
    await expect(second.customer.get()).rejects.toMatchObject({ status: 401 })
    await expect(third.customer.get()).rejects.toMatchObject({ status: 401 })
    expect((await strangerClient.customer.get()).id).toBe(stranger.customer.id)
  })

  it('reauth: password or code, one error for any refusal, 429 after five wrong tries', async () => {
    const { client } = await register()
    await expect(client.customer.reauth({ password: 'otra-clave-larga-99' })).rejects.toMatchObject({ status: 400, field: 'password' })
    await expect(client.customer.reauth({ otp_code: '123456' })).rejects.toMatchObject({ status: 400, field: 'otp_code' })
    await expect(client.customer.reauth({} as never)).rejects.toMatchObject({ status: 400 })
    const ok = await client.customer.reauth({ password: PASSWORD })
    expect(ok.valid_for_seconds).toBe(300)
    expect(Date.parse(ok.reauth_at)).not.toBeNaN()

    const second = await register('otra@example.com')
    for (let i = 0; i < 5; i++) await expect(second.client.customer.reauth({ password: `mala-clave-larga-${i}` })).rejects.toMatchObject({ status: 400 })
    await expect(second.client.customer.reauth({ password: PASSWORD })).rejects.toMatchObject({ status: 429 })
  })

  it('reauth with a sign-in code', async () => {
    const { email, client } = await register()
    await sf.customer.requestOtp({ email })
    expect((await client.customer.reauth({ otp_code: mock.otpCode })).reauth_at).toBeTruthy()
  })

  it('export needs a fresh reauth, is only the buyer’s own data, and is limited to three a day', async () => {
    const { email, client } = await register()
    await client.customer.update({ first_name: 'Nora' })
    const refused = await client.customer.exportData().catch((e: unknown) => e)
    expect(isReauthRequired(refused)).toBe(true)

    await client.customer.reauth({ password: PASSWORD })
    const file = await client.customer.exportData()
    expect(file).toMatchObject({ content_type: 'application/json', filename: expect.stringMatching(/^account-data-\d{4}-\d{2}-\d{2}\.json$/) })
    const doc = JSON.parse(new TextDecoder().decode(dataExportBytes(file)))
    expect(doc.account).toMatchObject({ email, first_name: 'Nora' })
    expect(JSON.stringify(doc)).not.toContain(MOCK_CUSTOMER_EMAIL)
    expect(JSON.stringify(doc)).not.toContain(PASSWORD)

    await client.customer.exportData()
    await client.customer.exportData()
    await expect(client.customer.exportData()).rejects.toMatchObject({ status: 429 })
  })

  it('delete: reauth + confirmation, blocked by orders in progress, idempotent, and a new sign-up starts empty', async () => {
    const { email, client } = await register()
    await client.customer.addresses.create({ address1: 'Calle 1', city: 'CDMX', zip: '06600', country_code: 'MX' })
    await client.customer.update({ preferences: { notifications: { shipping: { email: false } } } })

    expect(isReauthRequired(await client.customer.deleteAccount({ confirm: 'BORRAR' }).catch((e: unknown) => e))).toBe(true)
    await client.customer.reauth({ password: PASSWORD })
    await expect(client.customer.deleteAccount({ confirm: '  ' })).rejects.toMatchObject({ status: 400, field: 'confirm' })
    await client.customer.deleteAccount({ confirm: 'BORRAR' })
    await client.customer.deleteAccount({ confirm: 'BORRAR' }) // repeating is fine
    await expect(client.customer.get()).rejects.toMatchObject({ status: 401 })
    await expect(sf.customer.loginWithPassword({ email, password: PASSWORD })).rejects.toMatchObject({ status: 401 })

    // Same e-mail again: nothing from before.
    await sf.customer.register({ email, password: PASSWORD })
    await sf.customer.verifyRegistration({ email, code: mock.otpCode })
    const again = sf.withCustomerToken((await sf.customer.loginWithPassword({ email, password: PASSWORD })).token)
    expect((await again.customer.addresses.list()).nodes).toEqual([])
    expect((await again.customer.get()).preferences).toEqual({ notifications: {} })
  })

  it('delete is refused while an order is on its way', async () => {
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
    const client = sf.withCustomerToken(session.token)
    await client.customer.update({ preferences: null })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    await client.customer.reauth({ otp_code: mock.otpCode })
    const refused = await client.customer.deleteAccount({ confirm: 'BORRAR' }).catch((e: unknown) => e)
    expect(isAccountDeleteBlocked(refused)).toBe(true)
    expect(await client.customer.get()).toMatchObject({ id: session.customer.id })
  })
})

describe('account settings helpers', () => {
  it('safeExportFilename keeps a header-safe name', () => {
    expect(safeExportFilename('../../etc/pass wd"x.json')).toBe('pass_wd_x.json')
    expect(safeExportFilename(undefined)).toBe('account-data.json')
  })
  it('dataExportBytes rejects what is not base64', () => {
    expect(() => dataExportBytes({ content_base64: 'a$b' })).toThrow(TypeError)
    expect(new TextDecoder().decode(dataExportBytes({ content_base64: btoa('hola') }))).toBe('hola')
  })
})
