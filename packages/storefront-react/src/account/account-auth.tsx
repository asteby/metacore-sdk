/**
 * The account screen: sign in with password, create an account, verify the emailed code, sign in with a code and
 * recover a forgotten password, in one `<form method="post">` driven by `createAuthAction` (`./server`). What the store
 * offers comes from `loadAuthCapabilities`; the form shows only that. Plain HTML: it works without JavaScript for the
 * password sign-in and the steps the action sends back; the view switches (links) need JavaScript.
 *
 * Styling: `data-sf-account-*` attributes and `classNames` slots, fields reuse `CheckoutField` (and `checkout.css`);
 * `account.css` is an optional neutral sheet. Texts are Spanish by default, English with `locale="en"`, any with `messages`.
 */
import { PendingButton } from '../ui/pending-button.js'
import { useEffect, useReducer, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { customerTypeOptions, type CustomerCapabilities, type CustomerType, type CustomerTypeChoices } from '@asteby/storefront'
import { CheckoutField, ErrorSummary, useFieldErrors, type CheckoutFieldClassNames } from '../checkout/fields.js'
import { RESEND_COOLDOWN_SECONDS, useCooldown } from './cooldown.js'
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
  /** Label of the customer-type select of the registration (shown only when the store offers types). */
  customerType: string
  /** Under the select when any offered type is validated by the store before it gets anything special. */
  customerTypeReview: string
  code: string
  codeSentTo: string
  /** After asking for a new code. `{email}` is replaced. */
  codeResent: string
  /** Under the code field of a registration, when the code is late. */
  codeLate: string
  /** Label of the disabled resend button while the cooldown runs. `{s}` is replaced with the seconds left. */
  resendIn: string
  /** Back from the code step to the registration form, to correct the email. */
  changeEmail: string
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
  customerType: 'Tipo de cliente',
  customerTypeReview: 'Validaremos tu tipo antes de aplicar precios especiales.',
  code: 'Código',
  codeSentTo: 'Enviamos un código a {email}. Puede tardar un minuto.',
  codeResent: 'Te enviamos un código nuevo a {email}. El anterior ya no sirve.',
  codeLate: 'Si no llega, revisa tu carpeta de correo no deseado o corrige tu correo.',
  resendIn: 'Reenviar código ({s} s)',
  changeEmail: 'Usar otro correo',
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
    invalid_code: 'El código no es correcto o ya venció. Si fallaste varias veces, pide uno nuevo.',
    email_taken: 'Ya existe una cuenta con este correo. Entra o recupera tu contraseña.',
    rate_limited: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
    validation: 'Revisa los datos e inténtalo de nuevo.',
    unsupported: 'Esta forma de entrar no está disponible en esta tienda.',
    store_misconfigured: 'No pudimos crear tu cuenta por un problema de configuración de la tienda. Puedes comprar como invitado; ya avisamos a la tienda.',
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
  customerType: 'Customer type',
  customerTypeReview: 'We will verify your type before applying special prices.',
  code: 'Code',
  codeSentTo: 'We sent a code to {email}. It can take a minute.',
  codeResent: 'We sent a new code to {email}. The previous one no longer works.',
  codeLate: 'If it does not arrive, check your spam folder or correct your email.',
  resendIn: 'Resend code ({s} s)',
  changeEmail: 'Use another email',
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
    invalid_code: 'The code is wrong or has expired. If you missed several times, ask for a new one.',
    email_taken: 'An account with this email already exists. Sign in or reset your password.',
    rate_limited: 'Too many attempts. Wait a moment and try again.',
    validation: 'Check the details and try again.',
    unsupported: 'This way of signing in is not available in this store.',
    store_misconfigured: 'We could not create your account because of a store configuration problem. You can check out as a guest; we have already told the store.',
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
  /**
   * The types a new buyer can say they are, in the store's own vocabulary (`value` is a short slug, `label` is the text).
   * When given it WINS over the organization's own list; omitted, the registration takes it from
   * `capabilities.customer_types` (the organization defines it, not the store). With a list, the registration shows a
   * «Customer type» select (the organization's `default` is selected, else the first) and sends `customer_type`. No
   * list: no select. Declaring a type is a request: it never changes prices by itself.
   */
  customerTypes?: ReadonlyArray<{ value: CustomerType; label: string }>
  classNames?: AccountAuthClassNames
  /** Shown above the form (a logo, a welcome text). */
  header?: ReactNode
}

/**
 * Action results the buyer already walked away from («Usar otro correo», a tab, «Volver a entrar con contraseña»).
 * `useActionData()` keeps returning the same object until the next submit, so a remounted form (a tab that re-keys it)
 * would read the old `step: 'verify'` and jump back to the code screen. Keyed by the object: a new submit brings a new one.
 */
const dismissed = new WeakSet<object>()

const initialOf = (caps: CustomerCapabilities, initialView?: AccountAuthView): AccountAuthView =>
  initialView ?? (caps.password ? 'login' : caps.otp_channels.includes('email') ? 'otp-email' : 'login')

/**
 * The whole account screen. Headless enough to restyle, complete enough to drop in:
 * `export default function Account() { return <AccountAuth capabilities={useLoaderData()} data={useActionData()} form={Form} /> }`.
 */
export function AccountAuth({ capabilities, data: received, next, pending = false, initialView, form: FormTag = 'form', action, locale, messages, customerTypes, classNames: cx = {}, header }: AccountAuthProps) {
  const m = accountAuthMessages(locale, messages)
  const typeChoices: CustomerTypeChoices | null = customerTypes?.length
    ? { options: customerTypes, defaultValue: customerTypes[0]!.value, hasReview: false }
    : customerTypeOptions(capabilities)
  const passwordOn = capabilities.password
  const otpOn = capabilities.otp_channels.includes('email')
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const data = received && !dismissed.has(received) ? received : null
  const [view, setView] = useState<AccountAuthView>(() => data?.step ?? initialOf(capabilities, initialView))
  const [email, setEmail] = useState(data?.email ?? '')
  // The password typed in the registration, kept in memory only so "resend the code" can repeat the registration (the
  // server keeps just its hash and the form never gets it back). Lost on reload: then only "use another email" is left.
  const [held, setHeld] = useState<{ password: string; first_name: string; last_name: string; customer_type: string } | null>(null)
  const cooldown = useCooldown(data?.ok && (data.step === 'verify' || data.step === 'otp') ? RESEND_COOLDOWN_SECONDS : 0)
  const ref = useRef<HTMLFormElement>(null)
  const serverFields = data?.error?.field ? [data.error.field] : null
  const errorText = data?.error ? m.errors[data.error.code] : null
  const v = useFieldErrors(ref, { ...(locale ? { locale } : {}), serverFields, serverMessages: data?.error?.field && errorText ? { [data.error.field]: errorText } : null })

  // The action decides the next screen; the email it carries survives it.
  useEffect(() => {
    if (data?.step) setView(data.step)
    // Only the code step needs the password held for the resend.
    if (data?.step && data.step !== 'verify') setHeld(null)
    if (data?.email) setEmail(data.email)
    // A code was just sent: the next one can be asked for in a minute. A refusal says how long to wait.
    if (data?.ok && data.step) cooldown.start(RESEND_COOLDOWN_SECONDS)
    else if (data?.error?.code === 'rate_limited' && data.error.retryAfter) cooldown.start(data.error.retryAfter)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `cooldown.start` is stable
  }, [data])

  // Any move by the buyer ends the pending verification: step, error, notice, countdown and the password in memory.
  const go = (to: AccountAuthView) => {
    v.clear()
    if (received) dismissed.add(received)
    setHeld(null)
    cooldown.start(0)
    setView(to)
    refresh()
  }
  // Remember the password of the registration being sent (see `held`); the resend form carries it.
  const remember = (e: FormEvent<HTMLElement>) => {
    const f = e.target as HTMLFormElement
    if (view !== 'register' || typeof f?.elements === 'undefined') return
    const fd = new FormData(f)
    const text = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '')
    if (text('password')) setHeld({ password: text('password'), first_name: text('first_name'), last_name: text('last_name'), customer_type: text('customer_type') })
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
          {typeChoices ? (
            <CheckoutField {...fieldProps} as="select" name="customer_type" label={m.customerType} defaultValue={typeChoices.defaultValue} error={v.errors.customer_type ?? null} hint={typeChoices.hasReview ? m.customerTypeReview : undefined}>
              {typeChoices.options.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </CheckoutField>
          ) : null}
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
          <p className={cx.notice} role="status" data-sf-account-notice>
            {(data?.resent && view === 'verify' ? m.codeResent : m.codeSentTo).replace('{email}', email)}
          </p>
          <input type="hidden" name="email" value={email} />
          {codeField}
          {view === 'verify' ? (
            <p className={cx.notice} data-sf-account-hint>
              {m.codeLate}
            </p>
          ) : null}
        </>
      )
      links = (
        <>
          {view === 'otp' ? (
            <PendingButton type="submit" name="intent" value="otp-request" formNoValidate  className={cx.link} data-sf-account-link="resend" pending={pending} shared disabled={cooldown.remaining > 0}>
              {cooldown.remaining > 0 ? m.resendIn.replace('{s}', String(cooldown.remaining)) : m.resend}
            </PendingButton>
          ) : (
            link('register', m.changeEmail)
          )}
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
          {capabilities.unavailable_reason === 'missing_scope' ? m.errors.store_misconfigured : m.nothingAvailable}
        </p>
      </section>
    )
  }
  return (
    <section className={cx.root} data-sf-account-auth data-sf-account-view={view} aria-labelledby="sf-account-title" onSubmitCapture={remember}>
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
          <PendingButton type="submit" name="intent" value={intent}  className={cx.submit} data-sf-account-submit pending={pending} shared>
            {m.submit[view]}
          </PendingButton>
        </div>
        <div className={cx.links} data-sf-account-links>
          {links}
        </div>
      </FormTag>
      {view === 'verify' && held ? (
        // A second form (not nested): it repeats the registration with the password held in memory, which makes the
        // server send a new code and drop the old one. It cannot ride the code form: that one would post the password
        // on every confirmation.
        <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-resend-form>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={held.password} />
          {held.first_name ? <input type="hidden" name="first_name" value={held.first_name} /> : null}
          {held.last_name ? <input type="hidden" name="last_name" value={held.last_name} /> : null}
          {held.customer_type ? <input type="hidden" name="customer_type" value={held.customer_type} /> : null}
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <div className={cx.links}>
            <PendingButton type="submit" name="intent" value="resend"  className={cx.link} data-sf-account-link="resend" pending={pending} shared disabled={cooldown.remaining > 0}>
              {cooldown.remaining > 0 ? m.resendIn.replace('{s}', String(cooldown.remaining)) : m.resend}
            </PendingButton>
          </div>
        </FormTag>
      ) : null}
    </section>
  )
}
