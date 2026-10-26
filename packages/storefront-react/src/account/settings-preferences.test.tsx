import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createStorefrontClient } from '@asteby/storefront'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from '@asteby/storefront/mock'
import { LanguagePreference, NotificationPreferences } from './index.js'
import { createAccountSettingsAction, loadAccountSettings, type SettingsCookie } from './settings-server.js'

const cookie: SettingsCookie = {
  serialize: (value) => `sf_customer=${value}; Path=/`,
  parse: (header) => /(?:^|;\s*)sf_customer=([^;]+)/.exec(header ?? '')?.[1] ?? null,
}

describe('<LanguagePreference>', () => {
  it('lists the store languages with readable names and selects the current one', () => {
    const html = renderToString(<LanguagePreference locales={['es-MX', 'en-US']} value="en-US" />)
    expect(html).toContain('data-sf-lang')
    expect(html).toMatch(/<option value="en-US"[^>]*selected|selected=""[^>]*value="en-US"|value="en-US" selected/)
    expect(html).toContain('Español')
    expect(html).toContain('Idioma de tus mensajes')
    expect(html).toContain('El de la tienda')
  })
  it('renders nothing when there is nothing to choose, and ignores junk entries', () => {
    expect(renderToString(<LanguagePreference locales={['es-MX']} />)).toBe('')
    expect(renderToString(<LanguagePreference locales={null} />)).toBe('')
    expect(renderToString(<LanguagePreference locales={['es-MX', '<script>', 'en-US']} />)).not.toContain('script')
  })
  it('shows its own result only', () => {
    expect(renderToString(<LanguagePreference locales={['es-MX', 'en-US']} data={{ ok: true, intent: 'locale', saved: true }} />)).toContain('guardamos tus cambios')
    expect(renderToString(<LanguagePreference locales={['es-MX', 'en-US']} data={{ ok: true, intent: 'notifications', saved: true }} />)).not.toContain('guardamos')
    expect(renderToString(<LanguagePreference locales={['es-MX', 'en-US']} data={{ ok: false, intent: 'locale', error: { code: 'validation', field: 'locale' } }} />)).toContain('role="alert"')
  })
})

describe('<NotificationPreferences>', () => {
  it('draws a box per event and channel, on unless the buyer turned it off, and says what cannot be turned off', () => {
    const html = renderToString(<NotificationPreferences channels={['email', 'whatsapp']} preferences={{ notifications: { shipping: { email: false } } }} />)
    expect(html.match(/name="pref"/g)).toHaveLength(6)
    expect(html.match(/name="pref_shown"/g)).toHaveLength(6)
    expect(html).toMatch(/value="shipping:email"[^>]*>/)
    expect(html).not.toMatch(/checked=""[^>]*value="shipping:email"|value="shipping:email"[^>]*checked=""/)
    expect(html).toMatch(/value="shipping:whatsapp"[^>]*checked=""|checked=""[^>]*value="shipping:whatsapp"/)
    expect(html).toContain('siempre se envían')
    expect(html).not.toMatch(/order_confirmation|invoice"/)
  })
  it('renders nothing without a channel (older server or no connector)', () => {
    expect(renderToString(<NotificationPreferences channels={[]} />)).toBe('')
    expect(renderToString(<NotificationPreferences channels={undefined} />)).toBe('')
  })
  it('keeps unknown channels as plain words and drops malformed ones', () => {
    const html = renderToString(<NotificationPreferences channels={['telegram', '<b>x</b>']} />)
    expect(html).toContain('Otro canal')
    expect(html).not.toContain('<b>x')
    expect(html).not.toMatch(/>[^<]*telegram[^<]*</) // the code is a value, never visible text
  })
  it('English', () => {
    expect(renderToString(<NotificationPreferences locale="en" channels={['email']} />)).toContain('Updates about your order')
  })
})

describe('settings action: language and notifications', () => {
  async function setup() {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const token = (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    const action = createAccountSettingsAction({ storefront: sf, customerCookie: cookie })
    const post = (fields: Array<[string, string]>) => {
      const body = new URLSearchParams()
      for (const [k, v] of fields) body.append(k, v)
      return action({ request: new Request('https://shop.test/cuenta/ajustes', { method: 'POST', headers: { Cookie: `sf_customer=${token}` }, body }) })
    }
    return { sf, mock, token, post, read: () => loadAccountSettings(sf.withCustomerToken(token)) }
  }

  it('saves the language (and the store’s own with an empty value) and refuses one the store does not have', async () => {
    const { post, read, sf } = await setup()
    const shop = await sf.shop.get()
    const other = shop.locales.find((l) => l !== shop.locale) ?? shop.locale
    expect(await post([['intent', 'locale'], ['locale', other]])).toEqual({ ok: true, intent: 'locale', saved: true })
    expect((await read()).customer?.locale).toBe(other)
    expect(await post([['intent', 'locale'], ['locale', 'xx-YY']])).toMatchObject({ ok: false, error: { code: 'validation', field: 'locale' } })
    expect(await post([['intent', 'locale'], ['locale', '']])).toMatchObject({ ok: true })
    expect((await read()).customer?.locale).toBeNull()
  })

  it('saves checked boxes as on and the unchecked ones shown as off', async () => {
    const { post, read } = await setup()
    const res = await post([['intent', 'notifications'], ['pref_shown', 'order_updates:email'], ['pref_shown', 'shipping:email'], ['pref_shown', 'restock:email'], ['pref', 'order_updates:email']])
    expect(res).toEqual({ ok: true, intent: 'notifications', saved: true })
    expect((await read()).customer?.preferences).toEqual({ notifications: { order_updates: { email: true }, shipping: { email: false }, restock: { email: false } } })
    // The page renders what was saved.
    const html = renderToString(<NotificationPreferences channels={['email']} preferences={(await read()).customer?.preferences ?? null} />)
    expect(html.match(/checked=""/g)).toHaveLength(1)
  })

  it('refuses what the server forbids and what the form could not have sent', async () => {
    const { post } = await setup()
    expect(await post([['intent', 'notifications'], ['pref_shown', 'invoice:email']])).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(await post([['intent', 'notifications'], ['pref_shown', 'shipping:sms']])).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(await post([['intent', 'notifications'], ['pref_shown', 'not a pair']])).toMatchObject({ ok: false, error: { code: 'validation', field: 'preferences' } })
    expect(await post([['intent', 'notifications']])).toMatchObject({ ok: false, error: { code: 'validation', field: 'preferences' } })
    expect(await post([['intent', 'notifications'], ...Array.from({ length: 31 }, (_, i): [string, string] => ['pref_shown', `shipping:c${i}`])])).toMatchObject({ ok: false, error: { code: 'validation' } })
  })
})

describe('loadAccountSettings', () => {
  it('reads each part on its own and degrades only the one that failed', async () => {
    const mock = createMockStorefront()
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const token = (await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })).token
    const ok = await loadAccountSettings(sf.withCustomerToken(token))
    expect(ok.customer?.email).toBe(MOCK_CUSTOMER_EMAIL)
    expect(ok.capabilities?.notifications?.channels).toEqual(['email'])
    expect(ok.sessions?.length).toBeGreaterThan(0)

    // A server that does not know the sessions route (older than 1.9): the rest still loads.
    const old = createStorefrontClient({
      baseUrl: 'https://mock.local/api/gw',
      token: 'sk_mock',
      customerToken: token,
      fetch: (input, init) => (String(input).includes('/customer/sessions') ? Promise.resolve(new Response(JSON.stringify({ error: { code: 'not_found', message: 'x' } }), { status: 404 })) : mock.fetch(input, init)),
    })
    const partial = await loadAccountSettings(old)
    expect(partial.sessions).toBeNull()
    expect(partial.customer?.email).toBe(MOCK_CUSTOMER_EMAIL)

    const dead = await loadAccountSettings(sf.withCustomerToken('ct_dead'))
    expect(dead.customer).toBeNull()
    expect(dead.sessions).toBeNull()
  })
})
