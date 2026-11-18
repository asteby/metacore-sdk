import * as React from 'react'
import type { TFunction } from './i18n'
import { type SourceField } from './schema'
import { coerceWhenValue, whenIssue, whenOp, WHEN_OPS, type WhenOp } from './policy-utils'
import { MAX_CONDITION_IN, type Condition, type ConditionScalar } from './types'
import { cx } from './ui'

export interface WhenEditorProps {
  /** Current condition of the block; `undefined` = "always". */
  value: Condition | undefined
  onChange: (next: Condition | undefined) => void
  /** Fields of the example event (paths relative to the payload, as `flattenSchemaFields` returns). */
  fields?: SourceField[]
  t: TFunction
}

const CUSTOM = '\u0000custom'
const show = (v: ConditionScalar) => String(v)

/**
 * Visual editor of a block `when`: operator (`eq|ne|in`; never `exists`, OPS
 * rejects it), event path (picked from the example event fields, or typed) and
 * value(s). `in` takes 1 to 50 scalars as a list of chips. Shows the sentence
 * the condition means and the reason it cannot be saved yet.
 */
export function WhenEditor({ value, onChange, fields = [], t }: WhenEditorProps) {
  const uid = React.useId()
  const op = whenOp(value)
  const issue = whenIssue(value)
  const paths = React.useMemo(() => fields.map((f) => ({ path: `payload.${f.path}`, type: f.type })), [fields])
  const path = value?.path ?? ''
  const known = paths.find((p) => p.path === path)
  const [customPath, setCustomPath] = React.useState(false)
  const typed = customPath || paths.length === 0 || (path !== '' && !known)
  const fieldType = known?.type
  const [draft, setDraft] = React.useState('')
  // Raw text of the single-value box, so typing "1." is not rewritten to "1" by the typed value.
  const [text, setText] = React.useState<string | null>(null)

  const build = (nextOp: WhenOp, nextPath: string, scalars: ConditionScalar[]): Condition => {
    if (nextOp === 'in') return { path: nextPath, in: scalars }
    return { path: nextPath, [nextOp]: scalars[0] ?? '' } as Condition
  }
  const scalarsOf = (w: Condition | undefined): ConditionScalar[] => (!w ? [] : w.in !== undefined ? w.in : [(w.eq ?? w.ne ?? '') as ConditionScalar])
  const current = scalarsOf(value)

  const setOp = (next: string) => {
    if (next === '') return onChange(undefined)
    const o = next as WhenOp
    const keep = o === 'in' ? current.filter((v) => v !== '') : current.slice(0, 1)
    onChange(build(o, path, keep))
  }
  const addValue = () => {
    const raw = draft.trim()
    if (raw === '' || op !== 'in' || !value) return
    const v = coerceWhenValue(raw, fieldType)
    if (current.length >= MAX_CONDITION_IN) return
    if (!current.some((x) => x === v)) onChange(build('in', path, [...current, v]))
    setDraft('')
  }

  const phrase = React.useMemo(() => {
    if (!value || issue) return null
    const vals = scalarsOf(value).map(show)
    return t(`when.phrase.${whenOp(value)!}`, { path, value: vals[0] ?? '', values: vals.join(` ${t('when.or')} `) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, issue, t])

  const errId = `${uid}-err`
  return (
    <fieldset className="space-y-2 rounded-md border p-2" data-testid="when-editor" aria-describedby={issue ? errId : undefined}>
      <legend className={cx.label}>{t('actions.when')}</legend>
      <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
        <select aria-label={t('when.operator')} className={cx.input} value={op ?? ''} onChange={(e) => setOp(e.target.value)}>
          <option value="">{t('when.always')}</option>
          {WHEN_OPS.map((o) => (
            <option key={o} value={o}>
              {t(`when.op.${o}`)}
            </option>
          ))}
        </select>
        {value ? (
          <div className="grid gap-2">
            {typed ? (
              <div className="flex gap-2">
                <input
                  aria-label={t('when.pathText')}
                  className={cx.input}
                  value={path}
                  placeholder="payload.action"
                  aria-invalid={issue === 'path' ? true : undefined}
                  onChange={(e) => onChange(build(op!, e.target.value, current))}
                />
                {paths.length > 0 ? (
                  <button
                    type="button"
                    className={cx.button}
                    onClick={() => {
                      setCustomPath(false)
                      if (!known) onChange(build(op!, '', current))
                    }}
                  >
                    {t('when.pathPickBack')}
                  </button>
                ) : null}
              </div>
            ) : (
              <select
                aria-label={t('when.path')}
                className={cx.input}
                value={known ? path : ''}
                aria-invalid={issue === 'path' ? true : undefined}
                onChange={(e) => {
                  if (e.target.value === CUSTOM) {
                    setCustomPath(true)
                    return
                  }
                  onChange(build(op!, e.target.value, current))
                }}
              >
                <option value="">{t('when.pathPick')}</option>
                {paths.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path} ({p.type})
                  </option>
                ))}
                <option value={CUSTOM}>{t('when.pathCustom')}</option>
              </select>
            )}
            {op === 'in' ? (
              <div className="space-y-2">
                <ul className="flex flex-wrap gap-1" aria-label={t('when.values')}>
                  {current.map((v) => (
                    <li key={`${typeof v}:${show(v)}`} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm">
                      <span>{show(v)}</span>
                      <button
                        type="button"
                        className="px-1"
                        aria-label={t('when.removeValue', { value: show(v) })}
                        onClick={() => onChange(build('in', path, current.filter((x) => x !== v)))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input
                    aria-label={t('when.newValue')}
                    className={cx.input}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault() // never submit the surrounding form
                        addValue()
                      }
                    }}
                  />
                  <button type="button" className={cx.button} disabled={draft.trim() === '' || current.length >= MAX_CONDITION_IN} onClick={addValue}>
                    {t('when.addValue')}
                  </button>
                </div>
                <p className={cx.muted}>{t('when.inHint', { count: current.length, max: MAX_CONDITION_IN })}</p>
              </div>
            ) : (
              <input
                aria-label={t('when.value')}
                className={cx.input}
                value={text !== null && coerceWhenValue(text, fieldType) === current[0] ? text : show((current[0] ?? '') as ConditionScalar)}
                aria-invalid={issue === 'value' ? true : undefined}
                onChange={(e) => {
                  setText(e.target.value)
                  onChange(build(op!, path, [coerceWhenValue(e.target.value, fieldType)]))
                }}
              />
            )}
          </div>
        ) : null}
      </div>
      {issue ? (
        <p id={errId} role="alert" className={cx.error}>
          {t(`when.err.${issue}`, { max: MAX_CONDITION_IN })}
        </p>
      ) : null}
      {phrase ? (
        <p className={cx.muted} data-testid="when-phrase">
          {phrase}
        </p>
      ) : null}
    </fieldset>
  )
}
