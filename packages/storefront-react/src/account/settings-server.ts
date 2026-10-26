/**
 * Server side of the account settings (`@asteby/storefront-react/account/server`): `loadAccountSessions` for the loader
 * and `createAccountSettingsAction` for the action. No React, no router: Web `Request`/`Response` only.
 *
 * The browser never talks to OPS and never sees the buyer's token: the action reads it from the store's own cookie
 * (passed in), builds a client with it (`withCustomerToken`) and calls the contract. Answers carry codes
 * (`SettingsErrorCode`), never a server message, a value of the buyer or a credential; nothing is logged here.
 */
import { dataExportBytes, isStorefrontError, safeExportFilename, type Customer, type CustomerCapabilities, type CustomerSessionInfo, type StorefrontClient, type StorefrontError } from '@asteby/storefront'
import { safeNextPath, type AuthCookie } from './server.js'
import type { AccountSettingsActionData, SettingsErrorCode, SettingsIntent } from './settings-types.js'

export type { AccountSettingsActionData, SettingsErrorCode, SettingsIntent } from './settings-types.js'

/** The store's cookie for the buyer session token. React Router's `createCookie(...)` and Remix's fit as they are. */
export type SettingsCookie = AuthCookie & {
  parse(header: string | null): unknown | Promise<unknown>
}

/**
 * The buyer's sessions for the loader. NEVER throws: a store whose server is older than contract 1.9, an outage or an
 * expired session is `null`, and `<SessionsList sessions={null}>` degrades while the rest of the page renders.
 */
export async function loadAccountSessions(customer: StorefrontClient, options: { signal?: AbortSignal } = {}): Promise<CustomerSessionInfo[] | null> {
  try {
    return await customer.customer.sessions.list(options.signal ? { signal: options.signal } : undefined)
  } catch {
    return null
  }
}

/** Everything the settings page reads, each part on its own: a part that cannot be read is `null` and its section degrades. */
export type AccountSettingsData = {
  customer: Customer | null
  capabilities: CustomerCapabilities | null
  sessions: CustomerSessionInfo[] | null
}

/**
 * The loader of the whole settings page. NEVER throws and never fails as a whole: the three reads run together and a
 * failed one (older server, outage, expired session) is `null` for that part only. `customer` is `null` also when the
 * buyer's session is dead: the page should then send them to sign in.
 */
export async function loadAccountSettings(customer: StorefrontClient, options: { signal?: AbortSignal } = {}): Promise<AccountSettingsData> {
  const o = options.signal ? { signal: options.signal } : undefined
  const [profile, capabilities, sessions] = await Promise.all([
    customer.customer.get(o).catch(() => null),
    customer.customer.capabilities(o).catch(() => null),
    loadAccountSessions(customer, options),
  ])
  return { customer: profile, capabilities, sessions }
}

/** Largest export served (a person's own data is far below this): anything bigger is refused before it is decoded further. */
export const MAX_EXPORT_BYTES = 20 * 1024 * 1024

export type CreateAccountSettingsActionOptions = {
  /** The store's own client (`sk_` token, no buyer). */
  storefront: StorefrontClient
  /** The store's cookie holding the buyer session token. */
  customerCookie: SettingsCookie
  /** Shopper IP for the per-shopper rate limit (see `clientIp` of the client). */
  clientIp?: (request: Request) => string | null | undefined
  /**
   * Where to go after the account is deleted (default `/`). A path inside the site; anything else is `/`.
   * The buyer's cookie is cleared in the same answer.
   */
  afterDelete?: string
  /**
   * What the buyer must type to confirm a deletion, compared without case or surrounding spaces. Default: the words
   * of the built-in texts (`ELIMINAR`, `DELETE`). If you change `messages['delete.confirmWord']`, list it here.
   */
  confirmWords?: ReadonlyArray<string>
}

export type AccountSettingsActionArgs = { request: Request }

export const fail = (intent: SettingsIntent | undefined, code: SettingsErrorCode, extra: { field?: string; retryAfter?: number } = {}): AccountSettingsActionData => ({
  ok: false,
  ...(intent ? { intent } : {}),
  error: { code, ...(extra.field ? { field: extra.field } : {}), ...(extra.retryAfter ? { retryAfter: extra.retryAfter } : {}) },
})

/** Maps what the SDK threw to the code the form shows. `ctx: 'credential'` is a call that checks the buyer's password or code. */
export function toSettingsFailure(err: unknown, intent: SettingsIntent | undefined, ctx: 'credential' | 'other' = 'other'): AccountSettingsActionData {
  if (!isStorefrontError(err)) return fail(intent, 'unavailable')
  const e: StorefrontError = err
  if (e.code === 'insufficient_scope') return fail(intent, 'unsupported')
  switch (e.status) {
    case 401:
      return fail(intent, 'session_expired')
    case 403:
      return fail(intent, e.code === 'reauth_required' ? 'reauth_required' : 'unsupported')
    case 404:
      return fail(intent, 'unsupported')
    case 409:
      return fail(intent, e.field === 'orders' ? 'blocked_orders' : e.field === 'pending_payments' ? 'blocked_pending_payments' : 'validation', e.field ? { field: e.field } : {})
    case 429: {
      const wait = typeof e.retryAfter === 'number' && Number.isFinite(e.retryAfter) && e.retryAfter > 0 ? Math.min(3600, Math.ceil(e.retryAfter)) : undefined
      return fail(intent, 'rate_limited', wait ? { retryAfter: wait } : {})
    }
    case 400:
    case 422:
      return ctx === 'credential' ? fail(intent, 'invalid_credential') : fail(intent, 'validation', e.field ? { field: e.field } : {})
    default:
      return fail(intent, 'unavailable')
  }
}

/**
 * The settings action: one `POST` form with an `intent` field.
 *
 * | intent                  | fields       | result                                   |
 * | ----------------------- | ------------ | ---------------------------------------- |
 * | `session-revoke`        | session_id   | closes that session (idempotent)         |
 * | `session-revoke-others` | -            | closes every session but this one        |
 * | `locale`                | locale       | saves the language (`''` = the store's)   |
 * | `notifications`         | pref, pref_shown | saves the checked / unchecked boxes   |
 * | `reauth-code-request`   | for          | emails / texts a sign-in code to confirm identity |
 * | `export`                | password or otp_code | the data as a JSON download (`Response`) |
 * | `delete`                | confirm, password or otp_code | deletes the account -> 303 to `afterDelete`, cookie cleared |
 *
 * It answers `AccountSettingsActionData` to render with the section that sent it. A buyer without a session is
 * `session_expired` (the store redirects to sign-in).
 */
export function createAccountSettingsAction(options: CreateAccountSettingsActionOptions) {
  const { storefront: sf, customerCookie } = options
  const confirmWords = (options.confirmWords ?? ['ELIMINAR', 'DELETE']).map((w) => w.trim().toLowerCase()).filter(Boolean)
  const afterDelete = safeNextPath(options.afterDelete, '/')

  return async function settingsAction({ request }: AccountSettingsActionArgs): Promise<Response | AccountSettingsActionData> {
    const form = await request.formData().catch(() => null)
    if (!form) return fail(undefined, 'validation')
    const text = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' ? v : ''
    }
    const intent = text('intent') as SettingsIntent
    const raw = await customerCookie.parse(request.headers.get('Cookie'))
    const token = typeof raw === 'string' && raw ? raw : null
    if (!token) return fail(intent, 'session_expired')
    const ip = options.clientIp?.(request)
    const w = ip ? { clientIp: ip } : undefined
    const customer = sf.withCustomerToken(token)

    // Confirms the buyer's identity when the form carries a password or a code (the two credentials of `reauth`).
    // A wrong one is always the same answer; with neither, the server decides (a recent reauth may still stand).
    async function confirmIdentity(): Promise<AccountSettingsActionData | null> {
      const password = text('password')
      const otp = text('otp_code').replace(/\s+/g, '')
      if (!password && !otp) return null
      try {
        await customer.customer.reauth(password ? { password } : { otp_code: otp }, w)
        return null
      } catch (err) {
        return toSettingsFailure(err, intent, 'credential')
      }
    }

    try {
      switch (intent) {
        case 'session-revoke': {
          const id = text('session_id').trim()
          if (!id || id.length > 64) return fail(intent, 'validation', { field: 'session_id' })
          // `others` is its own intent: never let the field spell it, so one button cannot do the other's work.
          if (id.toLowerCase() === 'others') return fail(intent, 'validation', { field: 'session_id' })
          await customer.customer.sessions.revoke(id, w)
          return { ok: true, intent }
        }
        case 'session-revoke-others': {
          await customer.customer.sessions.revokeOthers(w)
          return { ok: true, intent }
        }
        case 'locale': {
          const locale = text('locale').trim()
          if (locale.length > 35) return fail(intent, 'validation', { field: 'locale' })
          await customer.customer.update({ locale: locale || null }, w)
          return { ok: true, intent, saved: true }
        }
        case 'notifications': {
          const shown = form.getAll('pref_shown').filter((v): v is string => typeof v === 'string')
          const checked = new Set(form.getAll('pref').filter((v): v is string => typeof v === 'string'))
          if (shown.length === 0 || shown.length > 30) return fail(intent, 'validation', { field: 'preferences' })
          const notifications: Record<string, Record<string, boolean>> = {}
          for (const pair of shown) {
            const m = /^([a-z][a-z0-9_]{0,31}):([a-z][a-z0-9_]{0,31})$/.exec(pair)
            if (!m) return fail(intent, 'validation', { field: 'preferences' })
            ;(notifications[m[1]!] ??= {})[m[2]!] = checked.has(pair)
          }
          await customer.customer.update({ preferences: { notifications } }, w)
          return { ok: true, intent, saved: true }
        }
        case 'reauth-code-request': {
          const purpose = text('for') === 'delete' ? 'delete' : 'export'
          const me = await customer.customer.get(w)
          const target = me.email ? { email: me.email } : me.phone ? { phone: me.phone } : null
          if (!target) return { ...fail(intent, 'unsupported'), for: purpose }
          try {
            await customer.customer.requestOtp(target, w)
          } catch (err) {
            // Only throttling is told; anything else looks like success, as the sign-in code request does.
            if (isStorefrontError(err) && err.status === 429) return { ...toSettingsFailure(err, intent), for: purpose }
          }
          return { ok: true, intent, codeSent: true, for: purpose }
        }
        case 'export': {
          const refused = await confirmIdentity()
          if (refused) return refused
          const file = await customer.customer.exportData(w)
          const bytes = dataExportBytes(file)
          if (bytes.byteLength > MAX_EXPORT_BYTES) return fail(intent, 'unavailable')
          const name = safeExportFilename(file.filename)
          // The type is ours, never what the API says: a file cannot make the browser render HTML under your origin.
          return new Response(bytes as BodyInit, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': String(bytes.byteLength),
              'Content-Disposition': `attachment; filename="${name.toLowerCase().endsWith('.json') ? name : `${name}.json`}"`,
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
              'X-Robots-Tag': 'noindex',
              'Content-Security-Policy': "default-src 'none'; sandbox",
            },
          })
        }
        case 'delete': {
          const typed = text('confirm').trim().toLowerCase()
          if (!typed || !confirmWords.includes(typed)) return fail(intent, 'validation', { field: 'confirm' })
          const refused = await confirmIdentity()
          if (refused) return refused
          await customer.customer.deleteAccount({ confirm: text('confirm').trim() }, w)
          // The token is dead now: clear the store's cookie in the same answer.
          const clear = await customerCookie.serialize('', { maxAge: 0, expires: new Date(0) })
          return new Response(null, { status: 303, headers: { Location: afterDelete, 'Set-Cookie': clear, 'Cache-Control': 'private, no-store' } })
        }
        default:
          return fail(undefined, 'validation')
      }
    } catch (err) {
      // A session that is already gone (404) is what the buyer wanted; a stranger's looks the same, by design.
      if (intent === 'session-revoke' && isStorefrontError(err) && err.status === 404) return { ok: true, intent }
      return toSettingsFailure(err, intent)
    }
  }
}

export type AccountSettingsAction = ReturnType<typeof createAccountSettingsAction>
