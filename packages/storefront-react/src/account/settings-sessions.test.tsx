import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createStorefrontClient, type CustomerSessionInfo } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from '@asteby/storefront/mock'
import { SessionsList } from './index.js'
import { createAccountSettingsAction, loadAccountSessions, type SettingsCookie } from './settings-server.js'

const cookie: SettingsCookie = {
  serialize: (value) => `sf_customer=${value}; Path=/`,
  parse: (header) => /(?:^|;\s*)sf_customer=([^;]+)/.exec(header ?? '')?.[1] ?? null,
}

const session = (s: Partial<CustomerSessionInfo> = {}): CustomerSessionInfo => ({
  id: 'ses_1',
  current: false,
  device_label: 'Chrome · Windows',
  login_method: 'password',
  last_used_at: '2026-10-20T15:00:00Z',
  created_at: '2026-10-01T10:00:00Z',
  ...s,
})

describe('<SessionsList>', () => {
  it('marks the current device without a button, and gives every other one its own', () => {
    const html = renderToString(<SessionsList sessions={[session({ id: 'ses_cur', current: true }), session({ id: 'ses_2', device_label: 'Safari · iPhone' })]} timeZone="UTC" />)
    expect(html).toContain('Este dispositivo')
    expect(html.match(/data-sf-session-revoke(?!-)/g)).toHaveLength(1)
    expect(html).toContain('value="ses_2"')
    expect(html).not.toContain('value="ses_cur"')
    expect(html).toContain('Cerrar las demás sesiones')
    expect(html).toContain('aria-label="Cerrar la sesión de Safari · iPhone"')
    expect(html).toContain('Con contraseña')
  })

  it('says there is nothing else to close, and offers no bulk button', () => {
    const html = renderToString(<SessionsList sessions={[session({ current: true })]} />)
    expect(html).toContain('data-sf-sessions-empty')
    expect(html).not.toContain('data-sf-session-revoke-others')
  })

  it('degrades to a notice when the sessions could not be loaded', () => {
    const html = renderToString(<SessionsList sessions={null} />)
    expect(html).toContain('data-state="degraded"')
    expect(html).toContain('No pudimos cargar tus dispositivos')
    expect(html).not.toContain('<form')
  })

  it('shows text, never markup, from the server, and an unknown login method as plain words', () => {
    const html = renderToString(<SessionsList sessions={[session({ device_label: '<img src=x onerror=alert(1)>', login_method: 'weird-method' })]} />)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('weird-method')
    expect(html).toContain('Inicio de sesión')
  })

  it('writes the result of its own forms only, in the buyer’s language', () => {
    expect(renderToString(<SessionsList sessions={[session()]} data={{ ok: true, intent: 'session-revoke' }} />)).toContain('Cerramos la sesión.')
    expect(renderToString(<SessionsList locale="en" sessions={[session()]} data={{ ok: true, intent: 'session-revoke-others' }} />)).toContain('We signed out the other devices.')
    expect(renderToString(<SessionsList sessions={[session()]} data={{ ok: true, intent: 'locale', saved: true }} />)).not.toContain('role="status"')
    const err = renderToString(<SessionsList sessions={[session()]} data={{ ok: false, intent: 'session-revoke', error: { code: 'rate_limited', retryAfter: 125 } }} />)
    expect(err).toContain('role="alert"')
    expect(err).toContain('3 min')
  })

  it('uses the form component and action it is given', () => {
    const html = renderToString(<SessionsList sessions={[session()]} action="/cuenta/ajustes" />)
    expect(html).toContain('action="/cuenta/ajustes"')
    expect(html).toContain('method="post"')
  })
})

describe('settings action: sessions', () => {
  async function setup() {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const open = async () => {
      await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
      return (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    }
    const here = await open()
    await open()
    await open()
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie })
    const post = (fields: Record<string, string>, token: string | null = here) =>
      action({ request: new Request('https://shop.test/cuenta/ajustes', { method: 'POST', headers: token ? { Cookie: `sf_customer=${token}` } : {}, body: new URLSearchParams(fields) }) })
    return { sf, here, post, list: () => loadAccountSessions(sf.withCustomerToken(here)) }
  }

  it('closes one session, the others, and is idempotent', async () => {
    const { post, list } = await setup()
    const before = (await list())!
    expect(before.length).toBe(3)
    const other = before.find((s) => !s.current)!
    expect(await post({ intent: 'session-revoke', session_id: other.id })).toEqual({ ok: true, intent: 'session-revoke' })
    expect(await post({ intent: 'session-revoke', session_id: other.id })).toEqual({ ok: true, intent: 'session-revoke' })
    expect((await list())!.length).toBe(2)
    expect(await post({ intent: 'session-revoke-others' })).toEqual({ ok: true, intent: 'session-revoke-others' })
    const after = (await list())!
    expect(after).toHaveLength(1)
    expect(after[0]!.current).toBe(true)
  })

  it('refuses a missing id, the word «others» as an id, and a buyer without a session', async () => {
    const { post } = await setup()
    expect(await post({ intent: 'session-revoke' })).toMatchObject({ ok: false, error: { code: 'validation', field: 'session_id' } })
    expect(await post({ intent: 'session-revoke', session_id: 'others' })).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(await post({ intent: 'session-revoke-others' }, null)).toMatchObject({ ok: false, error: { code: 'session_expired' } })
    expect(await post({ intent: 'nope' })).toMatchObject({ ok: false, error: { code: 'validation' } })
  })

  it('a dead session is session_expired, and another buyer’s session id changes nothing (same answer as a closed one)', async () => {
    const { post, here, sf } = await setup()
    await sf.withCustomerToken(here).customer.sessions.revokeOthers()
    expect(await post({ intent: 'session-revoke-others' }, 'ct_dead')).toMatchObject({ ok: false, error: { code: 'session_expired' } })
    expect(await post({ intent: 'session-revoke', session_id: 'ses_not_mine' })).toEqual({ ok: true, intent: 'session-revoke' })
  })

  it('loadAccountSessions never throws: an older server or a dead token is null', async () => {
    const { sf } = await setup()
    expect(await loadAccountSessions(sf.withCustomerToken('ct_dead'))).toBeNull()
    const down = createStorefrontClient({ baseUrl: 'https://down.test', token: 'sk_x', customerToken: 'x', fetch: async () => { throw new Error('boom') } })
    expect(await loadAccountSessions(down)).toBeNull()
  })
})
