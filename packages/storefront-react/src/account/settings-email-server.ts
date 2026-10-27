/**
 * Server side of `EmailSettings`: the five intents of the e-mail section, called by `createAccountSettingsAction`.
 * Kept apart so the action stays readable. Answers carry codes (`SettingsErrorCode`), never a server message; the
 * password and the codes are read from the form, sent once to OPS and never returned. The only value that comes back
 * is the e-mail the buyer typed (`email`), so the code step can be drawn.
 */
import { isStorefrontError, type StorefrontClient } from '@asteby/storefront'
import type { AccountSettingsActionData, SettingsErrorCode, SettingsIntent } from './settings-types.js'

type Fail = (intent: SettingsIntent | undefined, code: SettingsErrorCode, extra?: { field?: string; retryAfter?: number }) => AccountSettingsActionData
type ToFailure = (err: unknown, intent: SettingsIntent | undefined, ctx?: 'credential' | 'other') => AccountSettingsActionData

export type EmailIntentContext = {
  intent: SettingsIntent
  /** A text field of the submitted form (`''` when absent). */
  text: (name: string) => string
  /** The client of THIS buyer (`withCustomerToken`). */
  customer: StorefrontClient
  /** `{ clientIp }` for the per-shopper rate limit, or `undefined`. */
  write: { clientIp: string } | undefined
  fail: Fail
  toFailure: ToFailure
}

export const EMAIL_INTENTS: ReadonlySet<string> = new Set(['email-verify-request', 'email-verify-confirm', 'email-reauth-code', 'email-change-request', 'email-change-confirm'])

const EMAIL_SHAPE = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/
const CODE_SHAPE = /^[0-9]{6}$/

const clean = (s: string) => s.trim().toLowerCase()

/** A rejection of a code (400 on `code`) is `invalid_code`; everything else follows the settings mapping. */
function codeFailure(err: unknown, intent: SettingsIntent, email: string | undefined, { fail, toFailure }: Pick<EmailIntentContext, 'fail' | 'toFailure'>): AccountSettingsActionData {
  const base = isStorefrontError(err) && err.status === 400 && err.field === 'code' ? fail(intent, 'invalid_code') : toFailure(err, intent)
  return email ? { ...base, email } : base
}

/** Runs one of the e-mail intents. Never throws. */
export async function handleEmailIntent(ctx: EmailIntentContext): Promise<AccountSettingsActionData> {
  const { intent, text, customer, write: w, fail, toFailure } = ctx
  try {
    switch (intent) {
      case 'email-verify-request': {
        await customer.customer.email.requestVerification(w)
        return { ok: true, intent, codeSent: true }
      }
      case 'email-verify-confirm': {
        const code = text('code').trim()
        if (!CODE_SHAPE.test(code)) return fail(intent, 'invalid_code')
        await customer.customer.email.confirmVerification({ code }, w)
        return { ok: true, intent, saved: true }
      }
      case 'email-reauth-code': {
        // The address comes from the buyer's own record, never from the form.
        const me = await customer.customer.get()
        if (!me.email) return fail(intent, 'validation')
        try {
          await customer.customer.requestOtp({ email: me.email }, w)
        } catch (err) {
          // Like the sign-in code request: only a throttle is told; any other failure looks like a sent code.
          if (isStorefrontError(err) && err.status === 429) return toFailure(err, intent)
          if (isStorefrontError(err) && err.status === 401) return toFailure(err, intent)
        }
        return { ok: true, intent, codeSent: true }
      }
      case 'email-change-request': {
        const email = clean(text('email'))
        if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) return fail(intent, 'validation', { field: 'email' })
        const password = text('password')
        const otp = text('otp_code').trim()
        if (password && otp) return fail(intent, 'validation')
        if (password || otp) {
          if (otp && !CODE_SHAPE.test(otp)) return fail(intent, 'invalid_credential')
          try {
            await customer.customer.reauth(password ? { password } : { otp_code: otp }, w)
          } catch (err) {
            return toFailure(err, intent, 'credential')
          }
        }
        try {
          await customer.customer.email.requestChange({ email }, w)
        } catch (err) {
          if (isStorefrontError(err) && err.status === 422) return fail(intent, 'unsupported')
          return toFailure(err, intent)
        }
        return { ok: true, intent, codeSent: true, email }
      }
      case 'email-change-confirm': {
        const email = clean(text('email'))
        if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) return fail(intent, 'validation', { field: 'email' })
        const code = text('code').trim()
        if (!CODE_SHAPE.test(code)) return { ...fail(intent, 'invalid_code'), email }
        await customer.customer.email.confirmChange({ email, code }, w)
        return { ok: true, intent, saved: true }
      }
      default:
        return fail(undefined, 'validation')
    }
  } catch (err) {
    if (intent === 'email-verify-confirm') return codeFailure(err, intent, undefined, ctx)
    if (intent === 'email-change-confirm') return codeFailure(err, intent, clean(text('email')) || undefined, ctx)
    return toFailure(err, intent)
  }
}
