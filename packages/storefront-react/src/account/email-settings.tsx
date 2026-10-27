/**
 * «Email address» of the account: the current e-mail with its state (verified / not verified), a code to verify it,
 * and a way to CHANGE it (contract 1.15). Headless: no styles of its own, `data-sf-email*` hooks and `classNames`
 * slots. Every button is a real form submit answered by `createAccountSettingsAction`
 * (`@asteby/storefront-react/account/server`), so it works without JavaScript.
 *
 * The change is two steps, both server-checked:
 *
 *  1. `email-change-request`: the new address plus proof of identity (the current password, or a sign-in code sent
 *     to the CURRENT e-mail with `email-reauth-code`). A code is mailed to the NEW address; nothing changes yet.
 *  2. `email-change-confirm`: the code. Only now the e-mail changes, the other sessions are closed and the page
 *     reloads with the new address.
 *
 * The answer to step 1 is the same whether or not the new address already has an account, so the words here never
 * say «sent»: they say «if that address can be used, we sent a code». Passwords and codes travel once, from the form
 * to the action; they are never put back in the page. Degradation: `capabilities.email_change` absent or false (an
 * older OPS, or a store without mail) shows the e-mail and its state and offers nothing to do.
 */
import { PendingButton } from '../ui/pending-button.js'
import type { Customer, CustomerCapabilities } from '@asteby/storefront'
import { useId, type ComponentType, type ReactNode } from 'react'
import type { AccountFormProps } from './account-auth.js'
import { str } from './orders-ui.js'
import type { SettingsMessages } from './settings-messages.js'
import type { AccountSettingsActionData } from './settings-types.js'
import { errorText, resultFor, useSettingsText, type SettingsTextProps } from './settings-ui.js'

export type EmailSettingsClassNames = Partial<
  Record<
    | 'root'
    | 'title'
    | 'current'
    | 'badge'
    | 'help'
    | 'form'
    | 'field'
    | 'label'
    | 'input'
    | 'submit'
    | 'secondary'
    | 'details'
    | 'summary'
    | 'notice'
    | 'error'
    | 'link',
    string
  >
>

export type EmailSettingsProps = SettingsTextProps & {
  /** The buyer (`loadAccountSettings(...).customer`). `null`: the session is gone; nothing is drawn. */
  customer: Pick<Customer, 'email'> & { email_verified?: boolean | null } | null
  /** From `loadAccountSettings`. `email_change` absent or false: the section only shows the e-mail. */
  capabilities?: Pick<CustomerCapabilities, 'email_change'> | null
  /** What the settings action returned (`useActionData()`). */
  data?: AccountSettingsActionData | null
  /** A submit is in flight: disables the buttons. */
  pending?: boolean
  /** Form component, e.g. React Router's `Form`. Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the forms: the route that mounts `createAccountSettingsAction`. Default: the current URL. */
  action?: string
  headingLevel?: 2 | 3 | 4
  classNames?: EmailSettingsClassNames
  children?: ReactNode
}

const INTENTS = ['email-verify-request', 'email-verify-confirm', 'email-reauth-code', 'email-change-request', 'email-change-confirm'] as const

/** The sentence of an error of these forms: a rejected `email` or `code` field has its own words. */
function emailError(m: SettingsMessages, error: NonNullable<AccountSettingsActionData['error']>): string {
  if (error.code === 'validation' && error.field === 'email') return m['email.error.email']
  if (error.code === 'validation' && error.field === 'code') return m['email.error.code']
  return errorText(m, error)
}

export function EmailSettings({ customer, capabilities, data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: EmailSettingsProps) {
  const { m } = useSettingsText(text)
  const titleId = useId()
  const ids = useId()
  if (!customer) return null
  const Heading = `h${headingLevel}` as 'h3'
  const email = str(customer.email)
  const verified = typeof customer.email_verified === 'boolean' ? customer.email_verified : null
  const canChange = capabilities?.email_change === true
  const formProps = { method: 'post' as const, ...(action ? { action } : {}) }

  const verifyRequest = resultFor(data, 'email-verify-request')
  const verifyConfirm = resultFor(data, 'email-verify-confirm')
  const reauthCode = resultFor(data, 'email-reauth-code')
  const changeRequest = resultFor(data, 'email-change-request')
  const changeConfirm = resultFor(data, 'email-change-confirm')
  const result = resultFor(data, ...INTENTS)

  // Step 2 of the change is drawn while the request was accepted (or its code was refused): the address typed in
  // step 1 rides back in the answer so the form can send it again.
  const pendingEmail = str(changeRequest?.ok ? changeRequest.email : changeConfirm && !changeConfirm.ok ? changeConfirm.email : undefined)
  const showChangeCode = !!pendingEmail && !(changeConfirm?.ok === true)
  const showVerifyCode = verified === false && (verifyRequest?.ok === true || (!!verifyConfirm && !verifyConfirm.ok))

  const notice = (() => {
    if (verifyConfirm?.ok) return m['email.verifiedDone']
    if (changeConfirm?.ok) return m['email.changeDone']
    if (reauthCode?.ok) return m['email.reauthCodeSent']
    if (changeRequest?.ok) return m['email.changeSent']
    if (verifyRequest?.ok) return m['email.verifySent']
    return null
  })()
  const failure = result && !result.ok && result.error ? result.error : null
  const fieldFor = (name: 'email' | 'code') => (failure?.field === name ? { 'aria-invalid': true as const, 'aria-describedby': `${ids}-err` } : {})

  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-email data-verified={verified === null ? 'unknown' : String(verified)}>
      <Heading id={titleId} className={cx.title}>
        {m['email.title']}
      </Heading>
      <p className={cx.current} data-sf-email-current>
        {email ? (
          <>
            <span className="sf-email-value" data-sf-email-value>
              {email}
            </span>
            {verified === null ? null : (
              <span className={cx.badge} data-sf-email-badge={verified ? 'verified' : 'unverified'}>
                {' '}
                {verified ? m['email.verified'] : m['email.unverified']}
              </span>
            )}
          </>
        ) : (
          m['email.none']
        )}
      </p>

      {notice ? (
        <p className={cx.notice} role="status" data-sf-email-notice>
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p id={`${ids}-err`} className={cx.error} role="alert" data-sf-email-error={failure.code}>
          {emailError(m, failure)}
        </p>
      ) : null}

      {canChange && email && verified === false ? (
        <div data-sf-email-verify>
          <p className={cx.help}>{m['email.unverifiedHelp']}</p>
          <FormTag {...formProps} className={cx.form} data-sf-account-form="">
            <PendingButton type="submit" name="intent" value="email-verify-request"  className={cx.secondary} data-sf-email-verify-send pending={pending} shared>
              {showVerifyCode ? m['email.verifyResend'] : m['email.verifySend']}
            </PendingButton>
          </FormTag>
          {showVerifyCode ? (
            <FormTag {...formProps} className={cx.form} data-sf-account-form="">
              <div className={cx.field}>
                <label htmlFor={`${ids}-vcode`} className={cx.label}>
                  {m['email.codeLabel']}
                </label>
                <input id={`${ids}-vcode`} name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} autoComplete="one-time-code" required className={cx.input} {...fieldFor('code')} data-sf-email-code />
              </div>
              <PendingButton type="submit" name="intent" value="email-verify-confirm"  className={cx.submit} data-sf-email-verify-confirm pending={pending} shared>
                {m['email.verifyConfirm']}
              </PendingButton>
            </FormTag>
          ) : null}
        </div>
      ) : null}

      {canChange ? (
        <details className={cx.details} open={!!changeRequest || !!changeConfirm || !!reauthCode || undefined} data-sf-email-change>
          <summary className={cx.summary}>{email ? m['email.change'] : m['email.add']}</summary>
          {showChangeCode ? (
            <FormTag {...formProps} className={cx.form} data-sf-account-form="" data-sf-email-change-step="code">
              <input type="hidden" name="email" value={pendingEmail ?? ''} />
              <p className={cx.help}>{pendingEmail}</p>
              <div className={cx.field}>
                <label htmlFor={`${ids}-ccode`} className={cx.label}>
                  {m['email.codeLabel']}
                </label>
                <input id={`${ids}-ccode`} name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} autoComplete="one-time-code" required className={cx.input} {...fieldFor('code')} data-sf-email-code />
              </div>
              <PendingButton type="submit" name="intent" value="email-change-confirm"  className={cx.submit} data-sf-email-change-confirm pending={pending} shared>
                {m['email.changeConfirm']}
              </PendingButton>
              {/* A plain link to the same page: it drops the pending step without JavaScript. */}
              <a href={action ?? '?'} className={cx.link} data-sf-email-change-reset>
                {m['email.otherAddress']}
              </a>
            </FormTag>
          ) : (
            <>
              <p className={cx.help}>{m['email.changeIntro']}</p>
              {email ? (
                <FormTag {...formProps} className={cx.form} data-sf-account-form="" data-sf-email-reauth-code-form>
                  <p className={cx.help}>{m['email.reauthCodeHelp']}</p>
                  <PendingButton type="submit" name="intent" value="email-reauth-code"  className={cx.secondary} data-sf-email-reauth-code pending={pending} shared>
                    {m['email.reauthCodeSend']}
                  </PendingButton>
                </FormTag>
              ) : null}
              <FormTag {...formProps} className={cx.form} data-sf-account-form="" data-sf-email-change-step="request">
                <div className={cx.field}>
                  <label htmlFor={`${ids}-new`} className={cx.label}>
                    {m['email.newLabel']}
                  </label>
                  <input id={`${ids}-new`} name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required spellCheck={false} autoCapitalize="none" className={cx.input} {...fieldFor('email')} data-sf-email-new />
                </div>
                {email ? (
                  <>
                    <div className={cx.field}>
                      <label htmlFor={`${ids}-pw`} className={cx.label}>
                        {m['email.passwordLabel']}
                      </label>
                      <input id={`${ids}-pw`} name="password" type="password" autoComplete="current-password" maxLength={256} className={cx.input} data-sf-email-password />
                    </div>
                    <div className={cx.field}>
                      <label htmlFor={`${ids}-otp`} className={cx.label}>
                        {m['email.codeOrLabel']}
                      </label>
                      <input id={`${ids}-otp`} name="otp_code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className={cx.input} data-sf-email-otp />
                    </div>
                  </>
                ) : null}
                <PendingButton type="submit" name="intent" value="email-change-request"  className={cx.submit} data-sf-email-change-send pending={pending} shared>
                  {m['email.changeSend']}
                </PendingButton>
              </FormTag>
            </>
          )}
        </details>
      ) : null}
      {children}
    </section>
  )
}
