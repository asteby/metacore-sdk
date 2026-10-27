/**
 * «My items» of one kind («My garage»): a card per saved item with its label, nickname and masked private values, the
 * active badge, and the actions: see compatible parts, make active, edit, delete (inline confirmation, no `confirm()`),
 * plus «Add» with the picker. Every action is a `<form method="post">` with an `intent` (`createSubjectAction` answers), so
 * it all works without JavaScript; with JavaScript pass `onSave` / `onDelete` / `onMakeDefault` and nothing navigates.
 *
 * The section's name is `kind.label_plural` (data). Render it only when `kind` exists: a store that declares no kind has no
 * garage, and a read that failed shows «We could not load this · Try again» instead of the list (`status="error"`).
 */
import { PendingButton } from '../ui/pending-button.js'
import type { Subject, SubjectInput, SubjectKind } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { fill, subjectMessages, type DeepPartial, type SubjectMessages } from './messages.js'
import { SubjectPicker, type SubjectPickerClassNames } from './subject-picker.js'
import type { SubjectActionData } from './types.js'

export type SubjectGarageClassNames = SubjectPickerClassNames &
  Partial<Record<'root' | 'header' | 'title' | 'list' | 'card' | 'cardTitle' | 'nickname' | 'badge' | 'meta' | 'cardActions' | 'button' | 'primary' | 'danger' | 'empty' | 'notice' | 'limit' | 'details' | 'summary', string>>

export type SubjectGarageProps = {
  kind: SubjectKind
  /** The buyer's items (any kind: only this kind's are shown). */
  subjects: Subject[]
  /** `error`: the read failed; the list is replaced by a retry. `ready` (default) shows the list. */
  status?: 'ready' | 'error'
  onRetry?: () => void
  /** `action` of the forms (default: the current URL). */
  action?: string
  /** Where «see compatible parts» goes for an item (e.g. `/productos?para=<fit_key>`); `null`/omitted hides the link. */
  partsHref?: (subject: Subject) => string | null | undefined
  /** What the action answered: errors and refilled values for the form it concerns, a notice after a save. */
  data?: SubjectActionData | null
  /** Id of the item whose edit form is open without JavaScript (after a failed save); `'new'` for the add form. */
  openId?: string | null
  onSave?: (input: SubjectInput, subject?: Subject | null) => void | Promise<void>
  onDelete?: (subject: Subject) => void | Promise<void>
  onMakeDefault?: (subject: Subject) => void | Promise<void>
  pending?: boolean
  headingLevel?: 2 | 3
  locale?: string
  messages?: DeepPartial<SubjectMessages>
  classNames?: SubjectGarageClassNames
}

export function SubjectGarage(props: SubjectGarageProps) {
  const { kind, status = 'ready', action, partsHref, data, onSave, onDelete, onMakeDefault, pending, classNames: cx = {} } = props
  const locale = useResolvedLocale(props.locale)
  const msgs = subjectMessages(locale, props.messages)
  const m = msgs.garage
  const Heading = props.headingLevel === 3 ? 'h3' : 'h2'
  const singular = kind.label.toLowerCase()
  const mine = props.subjects.filter((s) => s.kind === kind.key)
  const atLimit = mine.length >= kind.max_per_account
  const openId = props.openId ?? (data && !data.ok && (data.intent === 'subject-save' || data.intent === 'subject-refine') ? (data.id ?? 'new') : null)

  return (
    <section className={cx.root} data-sf-subject-garage data-sf-subject-kind={kind.key} aria-labelledby={`sf-garage-${kind.key}`}>
      <header className={cx.header}>
        <Heading id={`sf-garage-${kind.key}`} className={cx.title}>
          {kind.label_plural}
        </Heading>
      </header>
      {data?.ok && data.intent && data.intent !== 'subject-default' ? (
        <p role="status" className={cx.notice} data-sf-subject-notice>
          {data.intent === 'subject-delete' ? m.removed : m.saved}
        </p>
      ) : null}
      {status === 'error' ? (
        <div role="alert" className={cx.notice} data-sf-subject-degraded>
          <p>{m.loadError}</p>
          {props.onRetry ? (
            <button type="button" className={cx.button} onClick={props.onRetry}>
              {m.retry}
            </button>
          ) : (
            <a href="" className={cx.button}>
              {m.retry}
            </a>
          )}
        </div>
      ) : (
        <>
          {mine.length === 0 ? (
            <p className={cx.empty} data-sf-subject-empty>
              {fill(m.empty, { kind: singular })}
            </p>
          ) : (
            <ul className={cx.list} data-sf-subject-list>
              {mine.map((s) => {
                const parts = partsHref?.(s)
                const privates = kind.fields.filter((f) => f.private && s.attributes[f.key] !== undefined)
                return (
                  <li key={s.id} className={cx.card} data-sf-subject={s.id} data-sf-subject-active={s.is_default ? '' : undefined}>
                    <p className={cx.cardTitle} data-sf-subject-label>
                      {s.label}
                      {s.is_default ? (
                        <span className={cx.badge} data-sf-subject-badge>
                          {m.active}
                        </span>
                      ) : null}
                    </p>
                    {s.nickname ? <p className={cx.nickname}>{s.nickname}</p> : null}
                    {privates.map((f) => (
                      <p key={f.key} className={cx.meta} data-sf-subject-private-value>
                        {fill(m.privateLabel, { field: f.label, value: String(s.attributes[f.key]) })}
                      </p>
                    ))}
                    <div className={cx.cardActions}>
                      {parts ? (
                        <a href={parts} className={`${cx.button ?? ''} ${cx.primary ?? ''}`.trim() || undefined} data-sf-subject-parts>
                          {m.viewParts}
                        </a>
                      ) : null}
                      {!s.is_default ? (
                        <form method="post" action={action} onSubmit={onMakeDefault ? (e) => { e.preventDefault(); void onMakeDefault(s) } : undefined} data-sf-subject-default-form>
                          <input type="hidden" name="intent" value="subject-default" />
                          <input type="hidden" name="id" value={s.id} />
                          <PendingButton type="submit" className={cx.button}  pending={pending} shared>
                            {m.makeActive}
                          </PendingButton>
                        </form>
                      ) : null}
                      <details className={cx.details} open={openId === s.id || undefined} data-sf-subject-edit>
                        <summary className={cx.summary}>{m.edit}</summary>
                        <SubjectPicker
                          kind={kind}
                          subject={s}
                          {...(action ? { action } : {})}
                          data={openId === s.id ? data : null}
                          {...(onSave ? { onSubmit: onSave } : {})}
                          pending={pending}
                          locale={locale}
                          {...(props.messages ? { messages: props.messages } : {})}
                          classNames={cx}
                        />
                      </details>
                      <details className={cx.details} data-sf-subject-remove>
                        <summary className={cx.summary}>{m.remove}</summary>
                        <p className={cx.meta}>{m.removeHint}</p>
                        <form method="post" action={action} onSubmit={onDelete ? (e) => { e.preventDefault(); void onDelete(s) } : undefined}>
                          <input type="hidden" name="intent" value="subject-delete" />
                          <input type="hidden" name="id" value={s.id} />
                          <PendingButton type="submit" className={`${cx.button ?? ''} ${cx.danger ?? ''}`.trim() || undefined}  pending={pending} shared>
                            {fill(m.removeConfirm, { name: s.label })}
                          </PendingButton>
                        </form>
                      </details>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {atLimit ? (
            <p className={cx.limit} data-sf-subject-limit>
              {fill(m.limit, { max: kind.max_per_account })}
            </p>
          ) : (
            <details className={cx.details} open={openId === 'new' || undefined} data-sf-subject-add>
              <summary className={cx.summary}>{fill(m.add, { kind: singular })}</summary>
              <SubjectPicker
                kind={kind}
                {...(action ? { action } : {})}
                data={openId === 'new' ? data : null}
                {...(onSave ? { onSubmit: onSave } : {})}
                offerDefault={mine.length > 0}
                pending={pending}
                locale={locale}
                {...(props.messages ? { messages: props.messages } : {})}
                classNames={cx}
              />
            </details>
          )}
        </>
      )}
    </section>
  )
}
