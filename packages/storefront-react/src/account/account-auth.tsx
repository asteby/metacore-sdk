/**
 * The account screen: sign in with password, create an account, verify the emailed code, sign in with a code and
 * recover a forgotten password, in one `<form method="post">` driven by `createAuthAction` (`./server`). What the store
 * offers comes from `loadAuthCapabilities`; the form shows only that. Plain HTML: it works without JavaScript for the
 * password sign-in and the steps the action sends back; the view switches (links) need JavaScript.
 *
 * Styling: `data-sf-account-*` attributes and `classNames` slots, fields reuse `CheckoutField` (and `checkout.css`);
 * `account.css` is an optional neutral sheet. Texts are Spanish by default, English with `locale="en"`, any with `messages`.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { CustomerCapabilities } from '@asteby/storefront'
import { CheckoutField, ErrorSummary, useFieldErrors, type CheckoutFieldClassNames } from '../checkout/fields.js'
import type { AuthActionData, AuthErrorCode, AuthStep } from './types.js'

export type AccountAuthView = 'login' | 'register' | 'otp-email' | 'forgot' | AuthStep

export type AccountAuthMessages = {
  titles: Record<AccountAuthView, string>
  email: string
  password: string
  newPassword: string
  passwordHint: string
  firstName: string
  lastName: string
  code: string
  codeSentTo: string
  submit: Record<AccountAuthView, string>
  resend: string
  forgotLink: string
  registerLink: string
  loginLink: string
  otpLink: string
  backToLogin: string
  nothingAvailable: string
  errors: Record<AuthErrorCode, string>
}

const ES: AccountAuthMessages = {
  titles: {
    login: 'Entrar a tu cuenta',
    register: 'Crear una cuenta',
    verify: 'Confirma tu correo',
    'otp-email': 'Entrar con un código',
    otp: 'Escribe tu código',
    forgot: 'Recuperar contraseña',
    reset: 'Elige una contraseña nueva',
  },
  email: 'Correo electrónico',
  password: 'Contraseña',
  newPassword: 'Contraseña nueva',
  passwordHint: 'Entre 10 y 128 caracteres.',
  firstName: 'Nombre',
  lastName: 'Apellido',
  code: 'Código',
  codeSentTo: 'Enviamos un código a {email}. Puede tardar un minuto.',
  submit: {
    login: 'Entrar',
    register: 'Crear cuenta',
    verify: 'Confirmar',
    'otp-email': 'Enviarme el código',
    otp: 'Entrar',
    forgot: 'Enviarme el código',
    reset: 'Guardar y entrar',
  },
  resend: 'Reenviar código',
  forgotLink: '¿Olvidaste tu contraseña?',
  registerLink: 'Crear una cuenta',
  loginLink: 'Ya tengo cuenta',
  otpLink: 'Entrar con un código por correo',
  backToLogin: 'Volver a entrar con contraseña',
  nothingAvailable: 'Esta tienda no admite iniciar sesión por ahora.',
  errors: {
    invalid_credentials: 'El correo o la contraseña no coinciden.',
    invalid_code: 'El código no es válido o ya venció.',
    email_taken: 'Ya existe una cuenta con este correo. Entra o recupera tu contraseña.',
    rate_limited: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    validation: 'Revisa los datos e inténtalo de nuevo.',
    unsupported: 'Esta forma de entrar no está disponible en esta tienda.',
    unavailable: 'No pudimos completar la acción. Inténtalo de nuevo en un momento.',
  },
}

const EN: AccountAuthMessages = {
  titles: {
    login: 'Sign in',
    register: 'Create an account',
    verify: 'Confirm your email',
    'otp-email': 'Sign in with a code',
    otp: 'Enter your code',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  },
  email: 'Email',
  password: 'Password',
  newPassword: 'New password',
  passwordHint: 'Between 10 and 128 characters.',
  firstName: 'First name',
  lastName: 'Last name',
  code: 'Code',
  codeSentTo: 'We sent a code to {email}. It can take a minute.',
  submit: {
    login: 'Sign in',
    register: 'Create account',
    verify: 'Confirm',
    'otp-email': 'Email me the code',
    otp: 'Sign in',
    forgot: 'Email me the code',
    reset: 'Save and sign in',
  },
  resend: 'Resend code',
  forgotLink: 'Forgot your password?',
  registerLink: 'Create an account',
  loginLink: 'I already have an account',
  otpLink: 'Sign in with an emailed code',
  backToLogin: 'Back to password sign-in',
  nothingAvailable: 'This store does not support signing in right now.',
  errors: {
    invalid_credentials: 'The email and password do not match.',
    invalid_code: 'The code is not valid or has expired.',
    email_taken: 'An account with this email already exists. Sign in or reset your password.',
    rate_limited: 'Too many attempts. Wait a few minutes and try again.',
    validation: 'Check the details and try again.',
    unsupported: 'This way of signing in is not available in this store.',
    unavailable: 'We could not complete that. Try again in a moment.',
  },
}

/** Messages for a locale (`es*` default, `en*`), with optional overrides (nested `titles`/`submit`/`errors` merge). */
export function accountAuthMessages(locale?: string | null, overrides?: DeepPartial<AccountAuthMessages> | null): AccountAuthMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  if (!overrides) return base
  return {
    ...base,
    ...(overrides as Partial<AccountAuthMessages>),
    titles: { ...base.titles, ...overrides.titles },
    submit: { ...base.submit, ...overrides.submit },
    errors: { ...base.errors, ...overrides.errors },
  }
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends Record<string, string> ? Partial<T[K]> : T[K] }

export type AccountAuthClassNames = Partial<Record<'root' | 'title' | 'form' | 'notice' | 'error' | 'actions' | 'submit' | 'links' | 'link', string>> & {
  field?: CheckoutFieldClassNames
}

/** What `<AccountAuth>` passes to its `form` component: the few props a router `Form` and the HTML `<form>` both accept. */
export type AccountFormProps = {
  method?: 'post'
  action?: string
  className?: string
  children?: ReactNode
  /** Loose on purpose: a router `Form` types its ref with its own copy of `@types/react`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref?: any
  'data-sf-account-form'?: boolean | string
}

export type AccountAuthProps = {
  /** From `loadAuthCapabilities` (the loader). */
  capabilities: CustomerCapabilities
  /** What the action returned (`useActionData()`); drives the next screen and the errors. */
  data?: AuthActionData | null
  /** Where to go after signing in (sent as `next`; the server validates it). */
  next?: string | null
  /** A submit is in flight (`navigation.state !== 'idle'`): disables the buttons. */
  pending?: boolean
  /** First screen. Default `login`, or `otp-email` when the store has no password sign-in. */
  initialView?: AccountAuthView
  /** Form component, e.g. React Router's `Form`, to submit without a reload. It must forward `ref` to the `<form>` (React 19: a prop). Default: the HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the form (default: the current URL). */
  action?: string
  locale?: string
  messages?: DeepPartial<AccountAuthMessages>
  classNames?: AccountAuthClassNames
  /** Shown above the form (a logo, a welcome text). */
  header?: ReactNode
}

const initialOf = (caps: CustomerCapabilities, initialView?: AccountAuthView): AccountAuthView =>
  initialView ?? (caps.password ? 'login' : caps.otp_channels.includes('email') ? 'otp-email' : 'login')

/**
 * The whole account screen. Headless enough to restyle, complete enough to drop in:
 * `export default function Account() { return <AccountAuth capabilities={useLoaderData()} data={useActionData()} form={Form} /> }`.
 */
export function AccountAuth({ capabilities, data, next, pending = false, initialView, form: FormTag = 'form', action, locale, messages, classNames: cx = {}, header }: AccountAuthProps) {
  const m = accountAuthMessages(locale, messages)
  const passwordOn = capabilities.password
  const otpOn = capabilities.otp_channels.includes('email')
  const [view, setView] = useState<AccountAuthView>(() => data?.step ?? initialOf(capabilities, initialView))
  const [email, setEmail] = useState(data?.email ?? '')
  const ref = useRef<HTMLFormElement>(null)
  const serverFields = data?.error?.field ? [data.error.field] : null
  const errorText = data?.error ? m.errors[data.error.code] : null
  const v = useFieldErrors(ref, { ...(locale ? { locale } : {}), serverFields, serverMessages: data?.error?.field && errorText ? { [data.error.field]: errorText } : null })

  // The action decides the next screen; the email it carries survives it.
  useEffect(() => {
    if (data?.step) setView(data.step)
    if (data?.email) setEmail(data.email)
  }, [data])

  const go = (to: AccountAuthView) => {
    v.clear()
    setView(to)
  }
  const fieldProps = { classNames: cx.field, ...(locale ? { locale } : {}) }
  const emailField = (
    <CheckoutField {...fieldProps} name="email" type="email" label={m.email} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} error={v.errors.email ?? null} />
  )
  const codeField = (
    <CheckoutField {...fieldProps} name="code" label={m.code} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" error={v.errors.code ?? null} />
  )
  const passwordField = (label: string, autoComplete: string, newPassword: boolean) => (
    <CheckoutField
      {...fieldProps}
      name="password"
      type="password"
      label={label}
      autoComplete={autoComplete}
      error={v.errors.password ?? null}
      {...(newPassword ? { minLength: 10, maxLength: 128, hint: m.passwordHint } : {})}
    />
  )
  const link = (to: AccountAuthView, text: string) => (
    <button type="button" className={cx.link} data-sf-account-link={to} onClick={() => go(to)}>
      {text}
    </button>
  )

  let body: ReactNode
  let links: ReactNode = null
  switch (view) {
    case 'register':
      body = (
        <>
          <CheckoutField {...fieldProps} name="first_name" label={m.firstName} autoComplete="given-name" optional />
          <CheckoutField {...fieldProps} name="last_name" label={m.lastName} autoComplete="family-name" optional />
          {emailField}
          {passwordField(m.password, 'new-password', true)}
        </>
      )
      links = link('login', m.loginLink)
      break
    case 'verify':
    case 'otp':
      body = (
        <>
          <p className={cx.notice} data-sf-account-notice>
            {m.codeSentTo.replace('{email}', email)}
          </p>
          <input type="hidden" name="email" value={email} />
          {codeField}
        </>
      )
      links = (
        <>
          {view === 'otp' ? (
            <button type="submit" name="intent" value="otp-request" formNoValidate className={cx.link} data-sf-account-link="resend">
              {m.resend}
            </button>
          ) : null}
          {link('login', m.backToLogin)}
        </>
      )
      break
    case 'otp-email':
    case 'forgot':
      body = emailField
      links = link('login', m.backToLogin)
      break
    case 'reset':
      body = (
        <>
          <p className={cx.notice} data-sf-account-notice>
            {m.codeSentTo.replace('{email}', email)}
          </p>
          <input type="hidden" name="email" value={email} />
          {codeField}
          {passwordField(m.newPassword, 'new-password', true)}
        </>
      )
      links = link('login', m.backToLogin)
      break
    default:
      body = (
        <>
          {emailField}
          {passwordField(m.password, 'current-password', false)}
        </>
      )
      links = (
        <>
          {otpOn ? link('forgot', m.forgotLink) : null}
          {link('register', m.registerLink)}
          {otpOn ? link('otp-email', m.otpLink) : null}
        </>
      )
  }

  const intent = { login: 'login', register: 'register', verify: 'verify', 'otp-email': 'otp-request', otp: 'otp-login', forgot: 'forgot', reset: 'reset' }[view]
  // Without password accounts the password views do not exist; only the code sign-in does.
  const available = view === 'login' || view === 'register' || view === 'forgot' || view === 'reset' || view === 'verify' ? passwordOn : otpOn
  const showSummary = !data?.error?.field
  const title = m.titles[view]
  if (!available && !passwordOn && !otpOn) {
    return (
      <section className={cx.root} data-sf-account-auth data-sf-account-view="unavailable">
        <p className={cx.notice} role="status">
          {m.nothingAvailable}
        </p>
      </section>
    )
  }
  return (
    <section className={cx.root} data-sf-account-auth data-sf-account-view={view} aria-labelledby="sf-account-title">
      {header}
      <h1 id="sf-account-title" className={cx.title}>
        {title}
      </h1>
      <FormTag ref={ref as never} method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-form>
        <ErrorSummary items={v.summary} focusKey={v.summaryKey} {...(locale ? { locale } : {})} />
        {errorText && showSummary ? (
          <p role="alert" className={cx.error} data-sf-account-error={data!.error!.code}>
            {errorText}
          </p>
        ) : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {body}
        <div className={cx.actions}>
          <button type="submit" name="intent" value={intent} disabled={pending} className={cx.submit} data-sf-account-submit>
            {m.submit[view]}
          </button>
        </div>
        <div className={cx.links} data-sf-account-links>
          {links}
        </div>
      </FormTag>
    </section>
  )
}
