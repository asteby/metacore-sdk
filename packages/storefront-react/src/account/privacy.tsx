/**
 * Privacy of the account: «Download my data» and «Delete my account». Headless: `data-sf-export*` /
 * `data-sf-delete*` hooks, `classNames` slots, es/en texts. Both are real form submits answered by
 * `createAccountSettingsAction` (`intent` = `export` | `delete`) and both ask the buyer to confirm who they are
 * first: their password, or a code sent to their email / phone (`ReauthFields`).
 *
 * `<DataExport>` must be a plain HTML `<form>` (the default): the answer is a file, and a router `Form` that
 * submits with `fetch` would not download it. `<DeleteAccount>` may use the router's `Form`.
 *
 * Nothing here keeps the password or the code: they are `type=password` / one-time-code fields that the action reads
 * once and the page never echoes back.
 */
import { useId, type ComponentType, type ReactNode } from 'react'
import type { AccountFormProps } from './account-auth.js'
import { fill } from './settings-messages.js'
import type { AccountSettingsActionData } from './settings-types.js'
import { errorText, resultFor, useSettingsText, type SettingsTextProps } from './settings-ui.js'

type SectionProps = SettingsTextProps & {
  data?: AccountSettingsActionData | null
  pending?: boolean
  /** Form component. For `<DataExport>` leave the default HTML `<form>`. */
  form?: 'form' | ComponentType<AccountFormProps>
  /** `action` of the form: the route that mounts `createAccountSettingsAction`. Default: the current URL. */
  action?: string
  headingLevel?: 2 | 3 | 4
  children?: ReactNode
}

export type ReauthFieldsClassNames = Partial<Record<'root' | 'intro' | 'field' | 'label' | 'input' | 'or' | 'hint' | 'sendCode' | 'notice', string>>

export type ReauthFieldsProps = SettingsTextProps & {
  /** Which form these fields belong to (so «code sent» is said only there). */
  purpose: 'export' | 'delete'
  data?: AccountSettingsActionData | null
  pending?: boolean
  classNames?: ReauthFieldsClassNames
}

/** The «confirm it is you» fields: password, or a code the buyer asks for. Used by both sections. */
export function ReauthFields({ purpose, data, pending = false, classNames: cx = {}, ...text }: ReauthFieldsProps) {
  const { m } = useSettingsText(text)
  const pwId = useId()
  const codeId = useId()
  const sent = data?.intent === 'reauth-code-request' && data.for === purpose && data.ok
  const codeError = data?.intent === 'reauth-code-request' && data.for === purpose && data.error ? data.error : null
  return (
    <div className={cx.root} data-sf-reauth>
      <p className={cx.intro}>{m['reauth.intro']}</p>
      <div className={cx.field}>
        <label htmlFor={pwId} className={cx.label}>
          {m['reauth.password']}
        </label>
        <input id={pwId} type="password" name="password" autoComplete="current-password" maxLength={128} className={cx.input} data-sf-reauth-password />
      </div>
      <p className={cx.or}>{m['reauth.or']}</p>
      <div className={cx.field}>
        <label htmlFor={codeId} className={cx.label}>
          {m['reauth.code']}
        </label>
        <input id={codeId} type="text" name="otp_code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" className={cx.input} aria-describedby={`${codeId}-hint`} data-sf-reauth-code />
        <p id={`${codeId}-hint`} className={cx.hint}>
          {m['reauth.codeHint']}
        </p>
        {/* Another submit of the same form: `formNoValidate`, so asking for a code never needs the other fields. */}
        <button type="submit" name="intent" value="reauth-code-request" formNoValidate disabled={pending} className={cx.sendCode} data-sf-reauth-send-code>
          {m['reauth.sendCode']}
        </button>
        <input type="hidden" name="for" value={purpose} />
        {sent ? (
          <p className={cx.notice} role="status" data-sf-reauth-code-sent>
            {m['reauth.codeSent']}
          </p>
        ) : codeError ? (
          <p className={cx.notice} role="alert" data-sf-reauth-code-error={codeError.code}>
            {errorText(m, codeError)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Download my data
// ---------------------------------------------------------------------------

export type DataExportClassNames = Partial<Record<'root' | 'title' | 'text' | 'form' | 'submit' | 'error' | 'reauth', string>> & { reauth?: ReauthFieldsClassNames }

export type DataExportProps = SectionProps & { classNames?: DataExportClassNames }

export function DataExport({ data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: DataExportProps) {
  const { m } = useSettingsText(text)
  const titleId = useId()
  const Heading = `h${headingLevel}` as 'h3'
  const result = resultFor(data, 'export')
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-export>
      <Heading id={titleId} className={cx.title}>
        {m['export.title']}
      </Heading>
      <p className={cx.text}>{m['export.intro']}</p>
      <p className={cx.text}>{m['export.limit']}</p>
      <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-form="">
        {result?.error ? (
          <p className={cx.error} role="alert" data-sf-export-error={result.error.code}>
            {errorText(m, result.error)}
          </p>
        ) : null}
        <ReauthFields purpose="export" {...(data ? { data } : {})} pending={pending} classNames={cx.reauth ?? {}} {...text} />
        <button type="submit" name="intent" value="export" disabled={pending} className={cx.submit} data-sf-export-submit>
          {m['export.submit']}
        </button>
      </FormTag>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Delete my account
// ---------------------------------------------------------------------------

export type DeleteAccountClassNames = Partial<Record<'root' | 'title' | 'text' | 'list' | 'form' | 'field' | 'label' | 'input' | 'submit' | 'error', string>> & { reauth?: ReauthFieldsClassNames }

export type DeleteAccountProps = SectionProps & {
  classNames?: DeleteAccountClassNames
}

export function DeleteAccount({ data, pending = false, form: FormTag = 'form', action, headingLevel = 3, classNames: cx = {}, children, ...text }: DeleteAccountProps) {
  const { m, t } = useSettingsText(text)
  const titleId = useId()
  const confirmId = useId()
  const Heading = `h${headingLevel}` as 'h3'
  const result = resultFor(data, 'delete')
  const word = m['delete.confirmWord']
  const confirmError = result?.error?.field === 'confirm'
  return (
    <section className={cx.root} aria-labelledby={titleId} data-sf-delete>
      <Heading id={titleId} className={cx.title}>
        {m['delete.title']}
      </Heading>
      <p className={cx.text}>{m['delete.intro']}</p>
      <ul className={cx.list} data-sf-delete-effects>
        <li>{m['delete.erased']}</li>
        <li>{m['delete.kept']}</li>
      </ul>
      <FormTag method="post" {...(action ? { action } : {})} className={cx.form} data-sf-account-form="">
        {result?.error ? (
          <p className={cx.error} role="alert" data-sf-delete-error={result.error.code}>
            {errorText(m, result.error)}
          </p>
        ) : null}
        <div className={cx.field}>
          <label htmlFor={confirmId} className={cx.label}>
            {fill(m['delete.confirmLabel'], { word })}
          </label>
          <input id={confirmId} type="text" name="confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={100} className={cx.input} aria-invalid={confirmError ? true : undefined} data-sf-delete-confirm />
        </div>
        <ReauthFields purpose="delete" {...(data ? { data } : {})} pending={pending} classNames={cx.reauth ?? {}} {...text} />
        <button type="submit" name="intent" value="delete" disabled={pending} className={cx.submit} data-sf-delete-submit data-sf-destructive="">
          {t('delete.submit')}
        </button>
      </FormTag>
      {children}
    </section>
  )
}
