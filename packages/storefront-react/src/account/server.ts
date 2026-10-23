/**
 * Server side of the account screen (`@asteby/storefront-react/account/server`): `loadAuthCapabilities` for the loader
 * and `createAuthAction` for the action. No React, no router: Web `Request`/`Response` only, so any framework mounts it.
 *
 * The browser never talks to OPS. The action signs the buyer in with the store's `sk_` client and keeps the session
 * token in the store's own cookie, which is passed in (`customerCookie`), so name, flags and signing stay the store's.
 */
import { isStorefrontError, repairPath, type CustomerCapabilities, type CustomerSession, type StorefrontClient } from '@asteby/storefront'
import type { AuthActionData, AuthErrorCode, AuthIntent } from './types.js'

export type { AuthActionData, AuthErrorCode, AuthIntent, AuthStep } from './types.js'

/** What is assumed when the store cannot be asked: password sign-in works, nothing else is offered. */
export const SAFE_AUTH_CAPABILITIES: Readonly<CustomerCapabilities> = Object.freeze({
  password: true,
  email_verification: false,
  otp_channels: Object.freeze([]) as unknown as CustomerCapabilities['otp_channels'],
})

const FAILURE_TTL_MS = 5_000
const LOG_EVERY_MS = 60_000
let lastLogAt = -Infinity

/** Server log (never the buyer's data): says what is missing and where it is repaired. At most once a minute. */
function logMisconfigured(scopes: readonly string[]): void {
  const t = Date.now()
  if (t - lastLogAt < LOG_EVERY_MS) return
  lastLogAt = t
  console.error(
    `[@asteby/storefront-react] La credencial de la tienda no tiene permisos${scopes.length ? ` (${scopes.join(', ')})` : ''}; ` +
      `las cuentas de comprador no funcionan hasta repararlo en ${repairPath()}.`,
  )
}
const cache = new WeakMap<object, { at: number; ok: boolean; value: CustomerCapabilities }>()

export type LoadAuthCapabilitiesOptions = {
  /** How long a good answer is reused per client (default 60 s). `0` disables the cache. */
  ttlMs?: number
  signal?: AbortSignal
  /** Clock, for tests. */
  now?: () => number
}

/**
 * Asks the store which ways of signing in it offers, with a short cache per client. It NEVER throws: when OPS does not
 * answer (older server, outage, token without scope) it returns `SAFE_AUTH_CAPABILITIES` and retries after a few
 * seconds, so the account screen always renders. Use it as the loader: `loader = () => loadAuthCapabilities(storefront)`.
 */
export async function loadAuthCapabilities(sf: StorefrontClient, options: LoadAuthCapabilitiesOptions = {}): Promise<CustomerCapabilities> {
  const now = options.now ?? Date.now
  const ttl = options.ttlMs ?? 60_000
  const hit = cache.get(sf)
  if (hit && now() - hit.at < (hit.ok ? ttl : FAILURE_TTL_MS)) return hit.value
  try {
    const got = await sf.customer.capabilities(options.signal ? { signal: options.signal } : undefined)
    const missing = Array.isArray(got?.missing_scopes) ? got.missing_scopes.filter((x): x is string => typeof x === 'string') : []
    const value: CustomerCapabilities = {
      // `password: false` (including for a missing scope) is respected: the form never offers what the token cannot do.
      password: got?.password !== false,
      email_verification: got?.email_verification === true,
      otp_channels: Array.isArray(got?.otp_channels) ? got.otp_channels : [],
      ...(typeof got?.unavailable_reason === 'string' ? { unavailable_reason: got.unavailable_reason } : {}),
      ...(missing.length ? { missing_scopes: missing } : {}),
    }
    if (value.unavailable_reason === 'missing_scope') logMisconfigured(missing)
    cache.set(sf, { at: now(), ok: true, value })
    return value
  } catch (err) {
    if (isStorefrontError(err) && err.code === 'insufficient_scope') {
      // The token cannot even read capabilities: do not offer password sign-in it could not complete.
      const value: CustomerCapabilities = {
        password: false,
        email_verification: false,
        otp_channels: [],
        unavailable_reason: 'missing_scope',
        missing_scopes: err.requiredScopes,
      }
      logMisconfigured(err.requiredScopes)
      cache.set(sf, { at: now(), ok: false, value })
      return value
    }
    cache.set(sf, { at: now(), ok: false, value: SAFE_AUTH_CAPABILITIES })
    return SAFE_AUTH_CAPABILITIES
  }
}

/** The part of a cookie the action needs. React Router's `createCookie(...)` and Remix's fit as they are. */
export type AuthCookie = {
  serialize(value: string, options?: { expires?: Date; maxAge?: number }): string | Promise<string>
}

/** Allows only a path inside the site (`/account`, `/orders?x=1`); anything else is `fallback`. Blocks `//host` and `/\host`. */
export function safeNextPath(raw: string | null | undefined, fallback = '/account'): string {
  if (typeof raw !== 'string') return fallback
  const v = raw.trim()
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\u0000-\u001f\\]/.test(v)) return fallback
  return v
}

export type CreateAuthActionOptions = {
  storefront: StorefrontClient
  /** The store's cookie for the buyer session token (`createCookie('sf_customer', ...)`). */
  customerCookie: AuthCookie
  /** Validates the `next` field before redirecting (default `safeNextPath`). Return a same-site path. */
  safeNext?: (raw: string | null) => string
  /** Where to go after signing in when there is no `next` (default `/account`). Only used by the default `safeNext`. */
  defaultNext?: string
  /** Shopper IP for the per-shopper rate limit (see `clientIp` of the client). */
  clientIp?: (request: Request) => string | null | undefined
  /** Capabilities source, for tests or a shared cache (default `loadAuthCapabilities`). */
  capabilities?: (sf: StorefrontClient) => Promise<CustomerCapabilities>
}

export type AuthActionArgs = { request: Request }

const fail = (code: AuthErrorCode, extra: Partial<AuthActionData> = {}, field?: string): AuthActionData => ({
  ok: false,
  ...extra,
  error: { code, ...(field ? { field } : {}) },
})

/** Maps what the SDK threw to the error the form shows. `ctx` tells what a 401 means on this step. */
function toFailure(err: unknown, ctx: 'credentials' | 'code' | 'other', extra: Partial<AuthActionData>): AuthActionData {
  if (!isStorefrontError(err)) return fail('unavailable', extra)
  if (err.code === 'insufficient_scope') {
    logMisconfigured(err.requiredScopes)
    return fail('store_misconfigured', extra)
  }
  switch (err.status) {
    case 401:
      return fail(ctx === 'credentials' ? 'invalid_credentials' : ctx === 'code' ? 'invalid_code' : 'unavailable', extra, ctx === 'code' ? 'code' : undefined)
    case 409:
      return fail('email_taken', extra, 'email')
    case 429:
      return fail('rate_limited', extra)
    case 400:
    case 422:
      return fail('validation', extra, err.field)
    case 403:
    case 404:
      return fail('unsupported', extra)
    default:
      return fail('unavailable', extra)
  }
}

/**
 * The account action: one `POST` form with an `intent` field.
 *
 * | intent        | fields                                   | result                                                   |
 * | ------------- | ---------------------------------------- | -------------------------------------------------------- |
 * | `login`       | email, password                          | signs in -> redirect                                     |
 * | `register`    | email, password, first_name?, last_name? | `step: 'verify'` or, without verification, redirect      |
 * | `verify`      | email, code                              | account ready -> redirect                                |
 * | `otp-request` | email                                    | `step: 'otp'` (code sent)                                |
 * | `otp-login`   | email, code                              | signs in -> redirect                                     |
 * | `forgot`      | email                                    | `step: 'reset'` (always, so it never says who has an account) |
 * | `reset`       | email, code, password                    | new password and signed in -> redirect                   |
 *
 * Success is a `303` to `next` (validated by `safeNext`) with `Set-Cookie` holding the session token; anything else is
 * an `AuthActionData` to render with `<AccountAuth data={...}>`. Passwords and codes are never echoed back.
 */
export function createAuthAction(options: CreateAuthActionOptions) {
  const { storefront: sf, customerCookie } = options
  const safeNext = options.safeNext ?? ((raw: string | null) => safeNextPath(raw, options.defaultNext ?? '/account'))
  const loadCaps = options.capabilities ?? ((client: StorefrontClient) => loadAuthCapabilities(client))

  async function signedIn(session: CustomerSession, next: string): Promise<Response> {
    const expires = new Date(session.expires_at)
    const cookie = await customerCookie.serialize(session.token, Number.isNaN(expires.getTime()) ? undefined : { expires })
    return new Response(null, { status: 303, headers: { Location: next, 'Set-Cookie': cookie } })
  }

  return async function authAction({ request }: AuthActionArgs): Promise<Response | AuthActionData> {
    const form = await request.formData().catch(() => null)
    if (!form) return fail('validation')
    const text = (name: string) => {
      const v = form.get(name)
      return typeof v === 'string' ? v : ''
    }
    const intent = text('intent') as AuthIntent
    const email = text('email').trim()
    const password = text('password')
    const code = text('code').replace(/\s+/g, '')
    const next = safeNext(text('next') || null)
    const ip = options.clientIp?.(request)
    const w = ip ? { clientIp: ip } : undefined
    const carry: Partial<AuthActionData> = { email }
    if (!email) return fail('validation', carry, 'email')

    const caps = await loadCaps(sf)
    const passwordOn = caps.password
    // Off because the store's token lacks a scope (not a merchant choice): say so instead of "not available".
    const misconfigured = caps.unavailable_reason === 'missing_scope'
    const off = (): AuthActionData => fail(misconfigured ? 'store_misconfigured' : 'unsupported', carry)
    const otpOn = caps.otp_channels.includes('email')

    try {
      switch (intent) {
        case 'login': {
          if (!passwordOn) return off()
          if (!password) return fail('validation', carry, 'password')
          return await signedIn(await sf.customer.loginWithPassword({ email, password }, w), next)
        }
        case 'register': {
          if (!passwordOn) return off()
          if (!password) return fail('validation', carry, 'password')
          const res = await sf.customer.register(
            { email, password, ...(text('first_name').trim() ? { first_name: text('first_name').trim() } : {}), ...(text('last_name').trim() ? { last_name: text('last_name').trim() } : {}) },
            w,
          )
          return res.status === 'created' ? await signedIn(res.session, next) : { ok: true, step: 'verify', email }
        }
        case 'verify': {
          if (!code) return fail('validation', carry, 'code')
          return await signedIn(await sf.customer.verifyRegistration({ email, code }, w), next)
        }
        case 'otp-request': {
          if (!otpOn) return off()
          await sf.customer.requestOtp({ email }, w)
          return { ok: true, step: 'otp', email }
        }
        case 'otp-login': {
          if (!otpOn) return off()
          if (!code) return fail('validation', carry, 'code')
          return await signedIn(await sf.customer.createSession({ email, code }, w), next)
        }
        case 'forgot': {
          if (!passwordOn || !otpOn) return off()
          try {
            await sf.customer.requestOtp({ email }, w)
          } catch (err) {
            // Only throttling and a bad email are told; anything else looks the same as success (no account enumeration).
            if (isStorefrontError(err) && (err.status === 429 || err.status === 400)) throw err
          }
          return { ok: true, step: 'reset', email }
        }
        case 'reset': {
          if (!passwordOn) return off()
          if (!code) return fail('validation', carry, 'code')
          if (!password) return fail('validation', carry, 'password')
          await sf.customer.resetPassword({ email, code, password }, w)
          return await signedIn(await sf.customer.loginWithPassword({ email, password }, w), next)
        }
        default:
          return fail('validation', carry)
      }
    } catch (err) {
      const step = intent === 'verify' ? 'verify' : intent === 'otp-login' ? 'otp' : intent === 'reset' || intent === 'forgot' ? 'reset' : undefined
      const ctx = intent === 'login' ? 'credentials' : step ? 'code' : 'other'
      return toFailure(err, ctx, step && intent !== 'forgot' ? { ...carry, step } : carry)
    }
  }
}

export type AuthAction = ReturnType<typeof createAuthAction>
