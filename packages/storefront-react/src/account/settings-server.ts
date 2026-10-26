/**
 * Server side of the account settings (`@asteby/storefront-react/account/server`): `loadAccountSessions` for the loader
 * and `createAccountSettingsAction` for the action. No React, no router: Web `Request`/`Response` only.
 *
 * The browser never talks to OPS and never sees the buyer's token: the action reads it from the store's own cookie
 * (passed in), builds a client with it (`withCustomerToken`) and calls the contract. Answers carry codes
 * (`SettingsErrorCode`), never a server message, a value of the buyer or a credential; nothing is logged here.
 */
import { isStorefrontError, type CustomerSessionInfo, type StorefrontClient, type StorefrontError } from '@asteby/storefront'
import type { AuthCookie } from './server.js'
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

export type CreateAccountSettingsActionOptions = {
  /** The store's own client (`sk_` token, no buyer). */
  storefront: StorefrontClient
  /** The store's cookie holding the buyer session token. */
  customerCookie: SettingsCookie
  /** Shopper IP for the per-shopper rate limit (see `clientIp` of the client). */
  clientIp?: (request: Request) => string | null | undefined
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
 *
 * It answers `AccountSettingsActionData` to render with the section that sent it. A buyer without a session is
 * `session_expired` (the store redirects to sign-in).
 */
export function createAccountSettingsAction(options: CreateAccountSettingsActionOptions) {
  const { storefront: sf, customerCookie } = options

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
