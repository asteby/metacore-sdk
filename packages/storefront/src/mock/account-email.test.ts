import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient, isReauthRequired } from '../index.js'
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

describe('mock e-mail of the account (contract 1.15)', () => {
  it('advertises the section and shows the e-mail as verified', async () => {
    expect((await sf.customer.capabilities()).email_change).toBe(true)
    const { client } = await register()
    expect((await client.customer.get()).email_verified).toBe(true)
  })

  it('changing the e-mail needs a recent reauth, sends the code to the new address and applies only on confirm', async () => {
    const { email, client } = await register()
    const other = sf.withCustomerToken((await sf.customer.loginWithPassword({ email, password: PASSWORD })).token)
    const err = await client.customer.email.requestChange({ email: 'otra@example.com' }).catch((e) => e)
    expect(isReauthRequired(err)).toBe(true)

    await client.customer.reauth({ password: PASSWORD })
    await expect(client.customer.email.requestChange({ email })).rejects.toMatchObject({ status: 400, field: 'email' })
    expect(await client.customer.email.requestChange({ email: 'Otra@Example.com' })).toEqual({ status: 'verification_required' })
    expect((await client.customer.get()).email).toBe(email)

    await expect(client.customer.email.confirmChange({ email: 'otra@example.com', code: '111111' })).rejects.toMatchObject({ status: 400, field: 'code' })
    const done = await client.customer.email.confirmChange({ email: 'otra@example.com', code: mock.otpCode })
    expect(done).toMatchObject({ email: 'otra@example.com', email_verified: true })
    expect((await client.customer.get()).email).toBe('otra@example.com')
    await expect(other.customer.get()).rejects.toMatchObject({ status: 401 })
    // The password followed the e-mail; the old address no longer signs in.
    await expect(sf.customer.loginWithPassword({ email, password: PASSWORD })).rejects.toMatchObject({ status: 401 })
    expect((await sf.customer.loginWithPassword({ email: 'otra@example.com', password: PASSWORD })).customer.email).toBe('otra@example.com')
  })

  it('the answer is the same for an address that already has an account, and its code never works', async () => {
    const { client } = await register()
    await client.customer.reauth({ password: PASSWORD })
    const free = await client.customer.email.requestChange({ email: 'libre@example.com' })
    const taken = await client.customer.email.requestChange({ email: MOCK_CUSTOMER_EMAIL })
    expect(taken).toEqual(free)
    await expect(client.customer.email.confirmChange({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).rejects.toMatchObject({ status: 400, field: 'code' })
  })

  it('verifies the current e-mail of an account registered without verification', async () => {
    const unverified = createMockStorefront({ customerCapabilities: { email_verification: false, email_change: false } })
    const client0 = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: unverified.fetch })
    const { token } = await client0.customer.register({ email: 'sin@example.com', password: PASSWORD }).then((r) => r.session!)
    const client = client0.withCustomerToken(token)
    expect((await client.customer.get()).email_verified).toBe(false)
    await client.customer.email.requestVerification()
    await expect(client.customer.email.confirmVerification({ code: '999999' })).rejects.toMatchObject({ status: 400, field: 'code' })
    expect((await client.customer.email.confirmVerification({ code: unverified.otpCode })).email_verified).toBe(true)
    await expect(client.customer.email.requestVerification()).rejects.toMatchObject({ status: 422 })
  })
})
