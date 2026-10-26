import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createStorefrontClient } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from '@asteby/storefront/mock'
import { AccountSettings, DataExport, DeleteAccount } from './index.js'
import { createAccountSettingsAction, loadAccountSettings, type SettingsCookie } from './settings-server.js'

const cookie: SettingsCookie = {
  serialize: (value, o) => `sf_customer=${value}; Path=/${o?.maxAge === 0 ? '; Max-Age=0' : ''}`,
  parse: (header) => /(?:^|;\s*)sf_customer=([^;]+)/.exec(header ?? '')?.[1] ?? null,
}
const PASSWORD = 'tr0ub4dor&3-horse'

describe('<DataExport> and <DeleteAccount>', () => {
  it('ask for the password or a code with the right field types, and never echo a value', () => {
    for (const html of [renderToString(<DataExport />), renderToString(<DeleteAccount />)]) {
      expect(html).toMatch(/type="password"[^>]*name="password"|name="password"[^>]*type="password"/)
      expect(html).toContain('autoComplete="current-password"')
      expect(html).toContain('data-sf-reauth-send-code')
      expect(html).toMatch(/formNoValidate=""|formnovalidate=""/i)
      expect(html).not.toMatch(/value="[^"]*tr0ub4dor/)
    }
  })
  it('delete says what goes and what stays, asks for the word, and its button is the destructive one', () => {
    const html = renderToString(<DeleteAccount />)
    expect(html).toContain('data-sf-delete-effects')
    expect(html).toContain('Se conservan tus pedidos y facturas')
    expect(html).toContain('Escribe ELIMINAR para confirmar')
    expect(html).toContain('data-sf-destructive')
    expect(renderToString(<DeleteAccount locale="en" />)).toContain('Type DELETE to confirm')
  })
  it('says «code sent» only in the form that asked for it', () => {
    const data = { ok: true, intent: 'reauth-code-request' as const, codeSent: true, for: 'delete' as const }
    expect(renderToString(<DeleteAccount data={data} />)).toContain('data-sf-reauth-code-sent')
    expect(renderToString(<DataExport data={data} />)).not.toContain('data-sf-reauth-code-sent')
  })
  it('writes errors in words, with the wait when there is one, and names a blocked deletion', () => {
    const blocked = renderToString(<DeleteAccount data={{ ok: false, intent: 'delete', error: { code: 'blocked_orders' } }} />)
    expect(blocked).toContain('Tienes un pedido en camino')
    expect(renderToString(<DataExport data={{ ok: false, intent: 'export', error: { code: 'rate_limited', retryAfter: 3600 } }} />)).toContain('60 min')
    expect(renderToString(<DataExport data={{ ok: false, intent: 'export', error: { code: 'invalid_credential' } }} />)).toContain('No pudimos verificarte')
  })
})

describe('settings action: export and delete', () => {
  async function setup(email = 'nueva@example.com') {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.register({ email, password: PASSWORD })
    await sf.customer.verifyRegistration({ email, code: mock.otpCode })
    const token = (await sf.customer.loginWithPassword({ email, password: PASSWORD })).token
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie })
    const post = (fields: Record<string, string>, tok: string | null = token) =>
      action({ request: new Request('https://shop.test/cuenta/ajustes', { method: 'POST', headers: tok ? { Cookie: `sf_customer=${tok}` } : {}, body: new URLSearchParams(fields) }) })
    return { mock, sf, token, post, email }
  }

  it('export: needs the password or a code, and the file is locked down', async () => {
    const { post, email } = await setup()
    expect(await post({ intent: 'export' })).toMatchObject({ ok: false, error: { code: 'reauth_required' } })
    expect(await post({ intent: 'export', password: 'otra-clave-larga-99' })).toMatchObject({ ok: false, error: { code: 'invalid_credential' } })
    const res = (await post({ intent: 'export', password: PASSWORD })) as Response
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="account-data-\d{4}-\d{2}-\d{2}\.json"$/)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    const doc = JSON.parse(await res.text())
    expect(doc.account.email).toBe(email)
    expect(JSON.stringify(doc)).not.toContain(PASSWORD)
  })

  it('export: a sign-in code works in place of the password, and the limit comes back as a wait', async () => {
    const { post, sf, mock, email } = await setup()
    expect(await post({ intent: 'reauth-code-request', for: 'export' })).toEqual({ ok: true, intent: 'reauth-code-request', codeSent: true, for: 'export' })
    expect(mock.state.otps.get(`email:${email}`)).toBe(mock.otpCode)
    expect(((await post({ intent: 'export', otp_code: mock.otpCode })) as Response).status).toBe(200)
    for (let i = 0; i < 2; i++) expect(((await post({ intent: 'export', password: PASSWORD })) as Response).status).toBe(200)
    expect(await post({ intent: 'export', password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'rate_limited' } })
    void sf
  })

  it('never puts a password or a code in what it answers', async () => {
    const { post } = await setup()
    for (const fields of [{ intent: 'export', password: PASSWORD + 'x' }, { intent: 'delete', confirm: 'ELIMINAR', password: PASSWORD + 'x' }, { intent: 'export', otp_code: '123456' }]) {
      const res = await post(fields)
      expect(JSON.stringify(res)).not.toMatch(/tr0ub4dor|123456/)
    }
  })

  it('delete: the typed word first, then the identity, then it erases, clears the cookie and goes home', async () => {
    const { post, sf, token, email } = await setup()
    expect(await post({ intent: 'delete', password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'validation', field: 'confirm' } })
    expect(await post({ intent: 'delete', confirm: 'borrar ya', password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'validation', field: 'confirm' } })
    expect(await post({ intent: 'delete', confirm: 'ELIMINAR' })).toMatchObject({ ok: false, error: { code: 'reauth_required' } })
    expect(await post({ intent: 'delete', confirm: 'ELIMINAR', password: 'otra-clave-larga-99' })).toMatchObject({ ok: false, error: { code: 'invalid_credential' } })
    // Nothing was deleted by the refusals.
    expect((await sf.withCustomerToken(token).customer.get()).email).toBe(email)

    const res = (await post({ intent: 'delete', confirm: ' eliminar ', password: PASSWORD })) as Response
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('/')
    expect(res.headers.get('Set-Cookie')).toBe('sf_customer=; Path=/; Max-Age=0')
    await expect(sf.withCustomerToken(token).customer.get()).rejects.toMatchObject({ status: 401 })
  })

  it('delete: refused with the reason while an order is on its way, and the account stays', async () => {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const token = (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie, afterDelete: 'https://evil.example/' })
    const post = (fields: Record<string, string>) => action({ request: new Request('https://shop.test/x', { method: 'POST', headers: { Cookie: `sf_customer=${token}` }, body: new URLSearchParams(fields) }) })
    await post({ intent: 'reauth-code-request', for: 'delete' })
    expect(await post({ intent: 'delete', confirm: 'DELETE', otp_code: mock.otpCode })).toMatchObject({ ok: false, error: { code: 'blocked_orders' } })
    expect((await sf.withCustomerToken(token).customer.get()).email).toBe(MOCK_CUSTOMER_EMAIL)
  })

  it('delete: afterDelete can only be a path inside the site', async () => {
    const { sf, token } = await setup()
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie, afterDelete: '//evil.example' })
    const res = (await action({ request: new Request('https://shop.test/x', { method: 'POST', headers: { Cookie: `sf_customer=${token}` }, body: new URLSearchParams({ intent: 'delete', confirm: 'DELETE', password: PASSWORD }) }) })) as Response
    expect(res.headers.get('Location')).toBe('/')
  })

  it('a custom confirmation word is honored', async () => {
    const { sf, token } = await setup()
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie, confirmWords: ['BORRAR'] })
    const call = (confirm: string) => action({ request: new Request('https://shop.test/x', { method: 'POST', headers: { Cookie: `sf_customer=${token}` }, body: new URLSearchParams({ intent: 'delete', confirm, password: PASSWORD }) }) })
    expect(await call('DELETE')).toMatchObject({ ok: false, error: { field: 'confirm' } })
    expect(((await call('borrar')) as Response).status).toBe(303)
  })

  it('without a session cookie nothing is attempted', async () => {
    const { post } = await setup()
    expect(await post({ intent: 'export', password: PASSWORD }, null)).toMatchObject({ ok: false, error: { code: 'session_expired' } })
    expect(await post({ intent: 'delete', confirm: 'DELETE', password: PASSWORD }, null)).toMatchObject({ ok: false, error: { code: 'session_expired' } })
  })
})

describe('<AccountSettings>', () => {
  it('shows every section the store supports, in order', async () => {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const token = (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    const settings = await loadAccountSettings(sf.withCustomerToken(token))
    const html = renderToString(<AccountSettings settings={settings} locales={(await sf.shop.get()).locales} />)
    const order = ['data-sf-lang', 'data-sf-notif', 'data-sf-sessions', 'data-sf-export', 'data-sf-delete'].map((k) => html.indexOf(k + '"') >= 0 ? html.indexOf(k + '"') : html.indexOf(k + '='))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('on an older server shows only what exists, and nothing at all for a dead session', async () => {
    const mock = createMockStorefront({ customerCapabilities: { notifications: undefined as never, data_export: undefined as never, account_delete: undefined as never } })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const token = (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    const settings = await loadAccountSettings(sf.withCustomerToken(token))
    const html = renderToString(<AccountSettings settings={{ ...settings, sessions: null }} locales={['es-MX']} />)
    expect(html).not.toMatch(/data-sf-lang|data-sf-notif|data-sf-export|data-sf-delete/)
    expect(html).toContain('data-state="degraded"')
    expect(renderToString(<AccountSettings settings={await loadAccountSettings(sf.withCustomerToken('ct_dead'))} />)).toBe('')
  })
})
