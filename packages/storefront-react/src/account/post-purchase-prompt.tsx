/**
 * Post-purchase invitation to create an account, for the thank-you page (`/pagar/gracias`). Headless: no styles of its
 * own, `data-sf-ppa-*` hooks and `classNames` slots. It reuses the account action (`createAuthAction`, `./server`):
 * the form posts `register` (or `otp-request` in a store without passwords) with the buyer's email, so the verification,
 * the session cookie and the errors are exactly the ones of `<AccountAuth>`; nothing about addresses or phones is asked.
 *
 * Privacy: the email is the one of the receipt the SERVER read from the buyer's own session (the `email` prop); it is
 * sent as a hidden field and never editable here, so the form cannot be used to probe other addresses. With email
 * verification the action answers the same whether or not the address already has an account (no enumeration); the
 * guest orders of that address show up in the order history once the mailbox is verified (the store's addon scopes by
 * VERIFIED email). Without verification the account is created unverified and its history does not include guest
 * orders: the text then promises nothing about the order.
 *
 * Texts are Spanish by default, English with `locale="en"`, any with `messages`.
 */
import { PendingButton } from '../ui/pending-button.js'
import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import type { CustomerCapabilities } from '@asteby/storefront'
import { CheckoutField, ErrorSummary, useFieldErrors, type CheckoutFieldClassNames } from '../checkout/fields.js'
import type { AccountFormProps } from './account-auth.js'
import { RESEND_COOLDOWN_SECONDS, useCooldown } from './cooldown.js'
import type { AuthActionData, AuthErrorCode } from './types.js'

export type PostPurchaseAccountPromptMessages = {
  title: string
  /** Why, when the email is verified and the guest order will appear in the history. `{email}` is replaced. */
  benefit: string
  /** Why, when it will not (no email verification in the store). */
  benefitBasic: string
  accountFor: string
  password: string
  passwordHint: string
  code: string
  codeSentTo: string
  /** After asking for a new code. `{email}` is replaced. */
  codeResent: string
  /** Under the code field, when the code is late. */
  codeLate: string
  resend: string
  /** Disabled resend button while the cooldown runs. `{s}` is replaced with the seconds left. */
  resendIn: string
  submit: string
  submitOtp: string
  submitCode: string
  skipNote: string
  loginLink: string
  errors: Record<AuthErrorCode, string>
}

const ES: PostPurchaseAccountPromptMessages = {
  title: 'Crea tu cuenta para seguir tu pedido',
  benefit: 'Con {email} verás aquí tu pedido y su envío, y la próxima compra será más rápida. No te pedimos tu dirección ni tu teléfono otra vez.',
  benefitBasic: 'Guarda tus datos para que la próxima compra sea más rápida.',
  accountFor: 'Cuenta para {email}',
  password: 'Contraseña',
  passwordHint: 'Entre 10 y 128 caracteres.',
  code: 'Código',
  codeSentTo: 'Enviamos un código a {email}. Puede tardar un minuto.',
  codeResent: 'Te enviamos un código nuevo a {email}. El anterior ya no sirve.',
  codeLate: 'Si no llega, revisa tu carpeta de correo no deseado. Tu pedido no depende de la cuenta.',
  resend: 'Reenviar código',
  resendIn: 'Reenviar código ({s} s)',
  submit: 'Crear cuenta',
  submitOtp: 'Enviarme un código',
  submitCode: 'Confirmar',
  skipNote: 'Si no quieres cuenta, no pasa nada: te avisaremos por correo de tu pedido.',
  loginLink: 'Ya tengo cuenta',
  errors: {
    invalid_credentials: 'El correo o la contraseña no coinciden.',
    invalid_code: 'El código no es correcto o ya venció. Si fallaste varias veces, pide uno nuevo.',
    email_taken: 'Ya existe una cuenta con este correo. Entra para ver tu pedido.',
    rate_limited: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    validation: 'Revisa los datos e inténtalo de nuevo.',
    unsupported: 'Esta tienda no permite crear cuentas por ahora.',
    store_misconfigured: 'No pudimos crear tu cuenta por un problema de configuración de la tienda. Tu pedido sigue en pie.',
    unavailable: 'No pudimos completar la acción. Inténtalo de nuevo en un momento.',
  },
}

const EN: PostPurchaseAccountPromptMessages = {
  title: 'Create your account to follow your order',
  benefit: 'With {email} you will see your order and its shipment here, and your next purchase will be faster. We will not ask for your address or phone again.',
  benefitBasic: 'Save your details so your next purchase is faster.',
  accountFor: 'Account for {email}',
  password: 'Password',
  passwordHint: 'Between 10 and 128 characters.',
  code: 'Code',
  codeSentTo: 'We sent a code to {email}. It can take a minute.',
  codeResent: 'We sent a new code to {email}. The previous one no longer works.',
  codeLate: 'If it does not arrive, check your spam folder. Your order does not depend on the account.',
  resend: 'Resend code',
  resendIn: 'Resend code ({s} s)',
  submit: 'Create account',
  submitOtp: 'Email me a code',
  submitCode: 'Confirm',
  skipNote: 'If you do not want an account, that is fine: we will email you about your order.',
  loginLink: 'I already have an account',
  errors: {
    invalid_credentials: 'The email and password do not match.',
    invalid_code: 'The code is wrong or has expired. If you missed several times, ask for a new one.',
    email_taken: 'An account with this email already exists. Sign in to see your order.',
    rate_limited: 'Too many attempts. Wait a moment and try again.',
    validation: 'Check the details and try again.',
    unsupported: 'This store does not allow creating accounts right now.',
    store_misconfigured: 'We could not create your account because of a store configuration problem. Your order is safe.',
    unavailable: 'We could not complete that. Try again in a moment.',
  },
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, string> ? Partial<T[K]> : T[K] }

/** Messages for a locale (`es*` default, `en*`), with optional overrides (`errors` merges). */
export function postPurchaseAccountPromptMessages(locale?: string | null, overrides?: DeepPartial<PostPurchaseAccountPromptMessages> | null): PostPurchaseAccountPromptMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  if (!overrides) return base
  return { ...base, ...(overrides as Partial<PostPurchaseAccountPromptMessages>), errors: { ...base.errors, ...overrides.errors } }
}

export type PostPurchaseAccountPromptClassNames = Partial<Record<'root' | 'title' | 'text' | 'email' | 'form' | 'notice' | 'error' | 'actions' | 'submit' | 'note' | 'link', string>> & {
  field?: CheckoutFieldClassNames
}

export type PostPurchaseAccountPromptProps = {
  /** The buyer's email from the receipt of THIS session (read on the server). Without it nothing renders. */
  email?: string | null
  /** From `loadAuthCapabilities`. Without password nor email codes nothing renders. */
  capabilities: CustomerCapabilities
  /** What the account action returned (`useActionData()`); drives the code step and the errors. */
  data?: AuthActionData | null
  /** Where to go after the account is ready (sent as `next`; the server validates it). E.g. the order history. */
  next?: string | null
  /** A submit is in flight: disables the button. */
  pending?: boolean
  /** Form component, e.g. React Router's `Form`. Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the form: the route that mounts `createAuthAction`. Default: the current URL. */
  action?: string
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3 | 4
  /** Where "I already have an account" goes (e.g. `/cuenta/entrar?next=...`). Omitted: no link. */
  loginHref?: string | null
  locale?: string
  messages?: DeepPartial<PostPurchaseAccountPromptMessages>
  classNames?: PostPurchaseAccountPromptClassNames
  /** Extra content under the form. */
  children?: ReactNode
}

const validEmail = (v: string | null | undefined): v is string => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/**
 * `<PostPurchaseAccountPrompt email={receipt.email} capabilities={caps} data={actionData} form={Form} next="/cuenta/pedidos" />`
 */
export function PostPurchaseAccountPrompt({
  email,
  capabilities,
  data,
  next,
  pending = false,
  form: FormTag = 'form',
  action,
  headingLevel = 2,
  loginHref,
  locale,
  messages,
  classNames: cx = {},
  children,
}: PostPurchaseAccountPromptProps) {
  const m = postPurchaseAccountPromptMessages(locale, messages)
  const ref = useRef<HTMLFormElement>(null)
  const passwordOn = capabilities.password
  const otpOn = capabilities.otp_channels.includes('email')
  const errorText = data?.error ? m.errors[data.error.code] : null
  // Password of the registration being sent, in memory only: "resend" repeats the registration with it (the server keeps
  // just its hash). Lost on reload; then the buyer simply registers again.
  const [held, setHeld] = useState('')
  const cooldown = useCooldown(data?.ok && (data.step === 'verify' || data.step === 'otp') ? RESEND_COOLDOWN_SECONDS : 0)
  useEffect(() => {
    if (data?.ok && data.step) cooldown.start(RESEND_COOLDOWN_SECONDS)
    else if (data?.error?.code === 'rate_limited' && data.error.retryAfter) cooldown.start(data.error.retryAfter)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cooldown.start` is stable
  }, [data])
  const v = useFieldErrors(ref, { ...(locale ? { locale } : {}), serverFields: data?.error?.field === 'code' || data?.error?.field === 'password' ? [data.error.field] : null, serverMessages: data?.error?.field && errorText ? { [data.error.field]: errorText } : null })
  if (!validEmail(email) || (!passwordOn && !otpOn)) return null

  const address = email.trim().toLowerCase()
  const step = data?.step === 'verify' || data?.step === 'otp' ? data.step : null
  const view = step ?? (passwordOn ? 'register' : 'otp-request')
  const intent = step === 'verify' ? 'verify' : step === 'otp' ? 'otp-login' : passwordOn ? 'register' : 'otp-request'
  const label = view === 'verify' || view === 'otp' ? m.submitCode : view === 'otp-request' ? m.submitOtp : m.submit
  const remember = (e: FormEvent<HTMLElement>) => {
    const f = e.target as HTMLFormElement
    if (step || !passwordOn || typeof f?.elements === 'undefined') return
    const pw = new FormData(f).get('password')
    if (typeof pw === 'string' && pw) setHeld(pw)
  }
  const wait = cooldown.remaining
  const resendLabel = wait > 0 ? m.resendIn.replace('{s}', String(wait)) : m.resend
  const Heading = `h${headingLevel}` as 'h2'
  const fieldProps = { classNames: cx.field, ...(locale ? { locale } : {}) }
  // Only the errors with no field of their own go in the alert; the others are inline.
  const showAlert = errorText && !(data?.error?.field === 'code' || data?.error?.field === 'password')
  // Only a verified mailbox earns the guest order in the history (storefront_customers scopes by verified email).
  const benefit = (capabilities.email_verification ? m.benefit : m.benefitBasic).replace('{email}', address)

  return (
    <section className={cx.root} data-sf-ppa data-sf-ppa-view={view} aria-labelledby="sf-ppa-title" onSubmitCapture={remember}>
      <Heading id="sf-ppa-title" className={cx.title}>
        {m.title}
      </Heading>
      <p className={cx.text} data-sf-ppa-benefit>
        {benefit}
      </p>
      <FormTag ref={ref as never} method="post" {...(action ? { action } : {})} className={cx.form} data-sf-ppa-form>
        <ErrorSummary items={v.summary} focusKey={v.summaryKey} {...(locale ? { locale } : {})} />
        {showAlert ? (
          <p role="alert" className={cx.error} data-sf-ppa-error={data!.error!.code}>
            {errorText}
          </p>
        ) : null}
        <input type="hidden" name="email" value={address} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <p className={cx.email} data-sf-ppa-email>
          {m.accountFor.replace('{email}', address)}
        </p>
        {step ? (
          <>
            <p className={cx.notice} role="status" data-sf-ppa-notice>
              {(data?.resent ? m.codeResent : m.codeSentTo).replace('{email}', address)}
            </p>
            <CheckoutField {...fieldProps} name="code" label={m.code} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" error={v.errors.code ?? null} />
            <p className={cx.notice} data-sf-ppa-hint>
              {m.codeLate}
            </p>
          </>
        ) : passwordOn ? (
          <CheckoutField {...fieldProps} name="password" type="password" label={m.password} autoComplete="new-password" minLength={10} maxLength={128} hint={m.passwordHint} error={v.errors.password ?? null} />
        ) : null}
        <div className={cx.actions}>
          <PendingButton type="submit" name="intent" value={intent}  className={cx.submit} data-sf-ppa-submit pending={pending} shared>
            {label}
          </PendingButton>
          {view === 'otp' ? (
            <PendingButton type="submit" name="intent" value="otp-request" formNoValidate  className={cx.link} data-sf-ppa-resend pending={pending} shared disabled={wait > 0}>
              {resendLabel}
            </PendingButton>
          ) : null}
        </div>
      </FormTag>
      {view === 'verify' && held ? (
        // A second form (not nested): repeats the registration with the password held in memory, so the server sends a
        // new code and drops the old one. It cannot ride the code form: that would post the password on every confirmation.
        <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-ppa-resend-form>
          <input type="hidden" name="email" value={address} />
          <input type="hidden" name="password" value={held} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className={cx.actions}>
            <PendingButton type="submit" name="intent" value="resend"  className={cx.link} data-sf-ppa-resend pending={pending} shared disabled={wait > 0}>
              {resendLabel}
            </PendingButton>
          </div>
        </FormTag>
      ) : null}
      <p className={cx.note} data-sf-ppa-note>
        {m.skipNote}
        {loginHref ? (
          <>
            {' '}
            <a href={loginHref} className={cx.link} data-sf-ppa-login>
              {m.loginLink}
            </a>
          </>
        ) : null}
      </p>
      {children}
    </section>
  )
}
