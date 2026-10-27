import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createStorefrontClient } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from '@asteby/storefront/mock'
import { EmailSettings } from './index.js'
import { createAccountSettingsAction, type SettingsCookie } from './settings-server.js'

const cookie: SettingsCookie = {
  serialize: (value) => `sf_customer=${value}; Path=/`,
  parse: (header) => /(?:^|;\s*)sf_customer=([^;]+)/.exec(header ?? '')?.[1] ?? null,
}
const PASSWORD = 'tr0ub4dor&3-horse'
const can = { email_change: true }

describe('<EmailSettings>', () => {
  it('shows the e-mail with its state, in Spanish by default', () => {
    const verified = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} />)
    expect(verified).toContain('ana@example.mx')
    expect(verified).toContain('data-sf-email-badge="verified"')
    expect(verified).toContain('Verificado')
    expect(verified).not.toContain('data-sf-email-verify-send')
    const unverified = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: false }} capabilities={can} />)
    expect(unverified).toContain('Sin verificar')
    expect(unverified).toContain('data-sf-email-verify-send')
    expect(unverified).toContain('Enviarme un código')
    expect(unverified).not.toContain('data-sf-email-verify-confirm')
  })

  it('says nothing about verification when the server does not (older OPS) and offers no change without the capability', () => {
    const html = renderToString(<EmailSettings customer={{ email: 'ana@example.mx' }} capabilities={null} />)
    expect(html).toContain('ana@example.mx')
    expect(html).not.toContain('data-sf-email-badge')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('data-sf-email-change')
    expect(renderToString(<EmailSettings customer={null} capabilities={can} />)).toBe('')
  })

  it('draws the change form: new e-mail, password or code, separate request for the code', () => {
    const html = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} action="/cuenta/ajustes" />)
    expect(html).toContain('Cambiar mi correo')
    expect(html).toContain('type="email"')
    expect(html).toContain('autoComplete="email"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('value="email-change-request"')
    expect(html).toContain('value="email-reauth-code"')
    expect(html).toContain('action="/cuenta/ajustes"')
    // Every field has a label.
    for (const id of html.match(/<input[^>]*\bid="([^"]+)"/g) ?? []) {
      const m = /id="([^"]+)"/.exec(id)![1]!
      expect(html).toContain(`for="${m}"`)
    }
    // The reauth-code button is its own form: pressing Enter in the fields submits the change, not the code.
    const requestForm = html.slice(html.indexOf('data-sf-email-change-step="request"'))
    expect(requestForm).not.toContain('email-reauth-code')
  })

  it('after a request it draws the code step with the typed address and the words never claim the mail was sent', () => {
    const html = renderToString(
      <EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: true, intent: 'email-change-request', codeSent: true, email: 'nueva@example.mx' }} />,
    )
    expect(html).toContain('data-sf-email-change-step="code"')
    expect(html).toContain('name="email" value="nueva@example.mx"')
    expect(html).toContain('value="email-change-confirm"')
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('Si esa dirección puede usarse')
    expect(html).toContain('<details')
    expect(html).toContain(' open')
    expect(html).toContain('data-sf-email-change-reset')
  })

  it('keeps the code step after a refused code, and writes its own errors', () => {
    const html = renderToString(
      <EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: false, intent: 'email-change-confirm', email: 'nueva@example.mx', error: { code: 'invalid_code' } }} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('El código no es válido o ya venció')
    expect(html).toContain('data-sf-email-change-step="code"')
    const en = renderToString(<EmailSettings locale="en" customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: false, intent: 'email-change-request', error: { code: 'validation', field: 'email' } }} />)
    expect(en).toContain('Enter a valid email that is different from the current one.')
    expect(en).toContain('aria-invalid="true"')
    expect(en).toContain('Email address')
    const reauth = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: false, intent: 'email-change-request', error: { code: 'reauth_required' } }} />)
    expect(reauth).toContain('confirma tu contraseña o un código')
    const limited = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: false, intent: 'email-change-request', error: { code: 'rate_limited', retryAfter: 125 } }} />)
    expect(limited).toContain('3 min')
  })

  it('writes only the result of its own forms, and the success of the change', () => {
    const other = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: true, intent: 'locale', saved: true }} />)
    expect(other).not.toContain('role="status"')
    const done = renderToString(<EmailSettings customer={{ email: 'nueva@example.mx', email_verified: true }} capabilities={can} data={{ ok: true, intent: 'email-change-confirm', saved: true }} />)
    expect(done).toContain('Listo, cambiamos tu correo')
    expect(done).not.toContain('data-sf-email-change-step="code"')
  })

  it('shows an unverified account the code form after asking for a code, and the verified state after confirming', () => {
    const sent = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: false }} capabilities={can} data={{ ok: true, intent: 'email-verify-request', codeSent: true }} />)
    expect(sent).toContain('data-sf-email-verify-confirm')
    expect(sent).toContain('Enviar otro código')
    const done = renderToString(<EmailSettings customer={{ email: 'ana@example.mx', email_verified: true }} capabilities={can} data={{ ok: true, intent: 'email-verify-confirm', saved: true }} />)
    expect(done).toContain('quedó verificado')
  })

  it('renders an e-mail from the server as text, never as markup', () => {
    const html = renderToString(<EmailSettings customer={{ email: '<img src=x onerror=alert(1)>@x.mx', email_verified: true }} capabilities={can} />)
    expect(html).not.toContain('<img')
  })
})

describe('settings action: e-mail', () => {
  async function setup() {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const email = 'nueva@example.com'
    await sf.customer.register({ email, password: PASSWORD })
    await sf.customer.verifyRegistration({ email, code: mock.otpCode })
    const token = (await sf.customer.loginWithPassword({ email, password: PASSWORD })).token
    const second = (await sf.customer.loginWithPassword({ email, password: PASSWORD })).token
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie })
    const post = (fields: Record<string, string>, tok: string | null = token) =>
      action({ request: new Request('https://shop.test/cuenta/ajustes', { method: 'POST', headers: tok ? { Cookie: `sf_customer=${tok}` } : {}, body: new URLSearchParams(fields) }) })
    return { mock, sf, email, token, second, post, me: () => sf.withCustomerToken(token).customer.get() }
  }

  it('changes the e-mail: reauth + request, then the code; the other session ends', async () => {
    const { mock, post, me, second, sf } = await setup()
    const asked = await post({ intent: 'email-change-request', email: ' Otra@Example.com ', password: PASSWORD })
    expect(asked).toEqual({ ok: true, intent: 'email-change-request', codeSent: true, email: 'otra@example.com' })
    expect((await me()).email).toBe('nueva@example.com')

    const wrong = await post({ intent: 'email-change-confirm', email: 'otra@example.com', code: '111111' })
    expect(wrong).toEqual({ ok: false, intent: 'email-change-confirm', error: { code: 'invalid_code' }, email: 'otra@example.com' })
    expect(await post({ intent: 'email-change-confirm', email: 'otra@example.com', code: mock.otpCode })).toEqual({ ok: true, intent: 'email-change-confirm', saved: true })
    expect(await me()).toMatchObject({ email: 'otra@example.com', email_verified: true })
    await expect(sf.withCustomerToken(second).customer.get()).rejects.toMatchObject({ status: 401 })
  })

  it('never hands the password or the code back', async () => {
    const { mock, post } = await setup()
    const all = [
      await post({ intent: 'email-change-request', email: 'otra@example.com', password: PASSWORD }),
      await post({ intent: 'email-change-request', email: 'otra@example.com', password: 'mala-clave-larga-1' }),
      await post({ intent: 'email-change-confirm', email: 'otra@example.com', code: '123456' }),
      await post({ intent: 'email-change-confirm', email: 'otra@example.com', code: mock.otpCode }),
    ]
    const dump = JSON.stringify(all)
    expect(dump).not.toContain(PASSWORD)
    expect(dump).not.toContain('mala-clave-larga-1')
    expect(dump).not.toContain(mock.otpCode)
    expect(dump).not.toContain('123456')
  })

  it('without a recent confirmation it asks for it; a wrong password is invalid_credential; a throttle keeps its wait', async () => {
    const { post } = await setup()
    expect(await post({ intent: 'email-change-request', email: 'otra@example.com' })).toMatchObject({ ok: false, error: { code: 'reauth_required' } })
    expect(await post({ intent: 'email-change-request', email: 'otra@example.com', password: 'mala-clave-larga-1' })).toMatchObject({ ok: false, error: { code: 'invalid_credential' } })
    for (let i = 0; i < 4; i++) await post({ intent: 'email-change-request', email: 'otra@example.com', password: 'mala-clave-larga-1' })
    expect(await post({ intent: 'email-change-request', email: 'otra@example.com', password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'rate_limited' } })
  })

  it('validates before calling the server, and a dead session is session_expired', async () => {
    const { post } = await setup()
    expect(await post({ intent: 'email-change-request', email: 'no-es-correo', password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'validation', field: 'email' } })
    expect(await post({ intent: 'email-change-request', email: 'a@example.com', password: PASSWORD, otp_code: '123456' })).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(await post({ intent: 'email-change-confirm', email: 'a@example.com', code: 'abc' })).toMatchObject({ ok: false, error: { code: 'invalid_code' }, email: 'a@example.com' })
    expect(await post({ intent: 'email-verify-confirm', code: '12' })).toMatchObject({ ok: false, error: { code: 'invalid_code' } })
    expect(await post({ intent: 'email-change-request', email: 'a@example.com', password: PASSWORD }, null)).toMatchObject({ ok: false, error: { code: 'session_expired' } })
    expect(await post({ intent: 'email-change-request', email: 'a@example.com', password: PASSWORD }, 'ct_dead')).toMatchObject({ ok: false, error: { code: 'session_expired' } })
  })

  it('an address that already has an account answers exactly like a free one', async () => {
    const { post } = await setup()
    const free = await post({ intent: 'email-change-request', email: 'libre@example.com', password: PASSWORD })
    const taken = await post({ intent: 'email-change-request', email: MOCK_CUSTOMER_EMAIL, password: PASSWORD })
    expect({ ...taken, email: undefined }).toEqual({ ...free, email: undefined })
  })

  it('reauthenticates with a sign-in code sent to the CURRENT address (taken from the account, not the form)', async () => {
    const { mock, post } = await setup()
    expect(await post({ intent: 'email-reauth-code', email: 'otro@example.com' })).toEqual({ ok: true, intent: 'email-reauth-code', codeSent: true })
    expect(await post({ intent: 'email-change-request', email: 'otra@example.com', otp_code: mock.otpCode })).toMatchObject({ ok: true, codeSent: true })
  })

  it('verifies an unverified e-mail', async () => {
    const mock = createMockStorefront({ customerCapabilities: { email_verification: false } })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const session = (await sf.customer.register({ email: 'sin@example.com', password: PASSWORD })).session!
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie })
    const post = (fields: Record<string, string>) =>
      action({ request: new Request('https://shop.test/x', { method: 'POST', headers: { Cookie: `sf_customer=${session.token}` }, body: new URLSearchParams(fields) }) })
    expect(session.customer.email_verified).toBe(false)
    expect(await post({ intent: 'email-verify-request' })).toEqual({ ok: true, intent: 'email-verify-request', codeSent: true })
    expect(await post({ intent: 'email-verify-confirm', code: '999999' })).toEqual({ ok: false, intent: 'email-verify-confirm', error: { code: 'invalid_code' } })
    expect(await post({ intent: 'email-verify-confirm', code: mock.otpCode })).toEqual({ ok: true, intent: 'email-verify-confirm', saved: true })
    expect((await sf.withCustomerToken(session.token).customer.get()).email_verified).toBe(true)
    expect(await post({ intent: 'email-verify-request' })).toMatchObject({ ok: false })
  })
})
