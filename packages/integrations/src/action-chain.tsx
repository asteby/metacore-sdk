import * as React from 'react'
import { moveItem, needsAdvanced, newAction, parseActions } from './actions'
import type { TFunction } from './i18n'
import { VISUAL_ACTION_KINDS, type ActionBlock, type ActionKind } from './types'
import { cx } from './ui'

export interface ActionOptions {
  models?: string[]
  commands?: string[]
  templates?: string[]
}

export interface ActionChainProps {
  actions: ActionBlock[]
  onChange: (next: ActionBlock[]) => void
  options?: ActionOptions
  t: TFunction
}

/**
 * Ordered list of action blocks (closed set; the visual editor authors record.upsert, event.emit,
 * notify, command.run). The author fills fields; JSON is only an opt-in
 * "advanced view" that is validated against the same closed set.
 */
export function ActionChain({ actions, onChange, options, t }: ActionChainProps) {
  const [advanced, setAdvanced] = React.useState(false)
  const [kind, setKind] = React.useState<ActionKind>('record.upsert')
  const set = (i: number, a: ActionBlock) => onChange(actions.map((x, idx) => (idx === i ? a : x)))
  const kindId = React.useId()

  return (
    <section className="space-y-3" aria-label={t('actions.title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{t('actions.title')}</h3>
          <p className={cx.muted}>{t('actions.hint')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
          {t('common.advanced')}
        </label>
      </div>

      {advanced ? (
        <AdvancedJson actions={actions} onApply={onChange} t={t} />
      ) : (
        <>
          {actions.length === 0 ? <p className={cx.muted}>{t('actions.empty')}</p> : null}
          <ol className="space-y-3">
            {actions.map((a, i) => (
              <li key={i} className={cx.card} data-action={a.do}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">
                    {t('actions.step', { n: i + 1 })} · {t(`actions.${a.do}`)}
                  </h4>
                  <div className="flex gap-1">
                    <button type="button" className={cx.button} disabled={i === 0} onClick={() => onChange(moveItem(actions, i, i - 1))}>
                      {t('common.moveUp')}
                    </button>
                    <button
                      type="button"
                      className={cx.button}
                      disabled={i === actions.length - 1}
                      onClick={() => onChange(moveItem(actions, i, i + 1))}
                    >
                      {t('common.moveDown')}
                    </button>
                    <button type="button" className={cx.button} onClick={() => onChange(actions.filter((_, idx) => idx !== i))}>
                      {t('common.remove')}
                    </button>
                  </div>
                </div>
                <ActionFields action={a} onChange={(n) => set(i, n)} options={options} t={t} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={kindId} className={cx.label}>
                {t('actions.add')}
              </label>
              <select id={kindId} className={cx.input} value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
                {VISUAL_ACTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`actions.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={cx.button} onClick={() => onChange([...actions, newAction(kind)])}>
              {t('actions.add')}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function TextInput({
  label,
  value,
  onChange,
  list,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  list?: string[]
  placeholder?: string
}) {
  const id = React.useId()
  const listId = list && list.length > 0 ? `${id}-list` : undefined
  return (
    <div>
      <label htmlFor={id} className={cx.label}>
        {label}
      </label>
      <input id={id} className={cx.input} value={value} list={listId} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {listId ? (
        <datalist id={listId}>
          {list!.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
    </div>
  )
}

function KeyValueRows({
  title,
  value,
  onChange,
  t,
}: {
  title: string
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
  t: TFunction
}) {
  // Rows keep their own order/blank keys while editing; the map is derived.
  const [rows, setRows] = React.useState<[string, string][]>(() => Object.entries(value))
  const commit = (next: [string, string][]) => {
    setRows(next)
    const out: Record<string, string> = {}
    for (const [k, v] of next) if (k.trim() !== '') out[k.trim()] = v
    onChange(out)
  }
  return (
    <fieldset className="space-y-2">
      <legend className={cx.label}>{title}</legend>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input aria-label={t('actions.fieldName')} className={cx.input} value={k} onChange={(e) => commit(rows.map((r, idx) => (idx === i ? [e.target.value, r[1]] : r)))} />
          <input aria-label={t('actions.fieldValue')} className={cx.input} value={v} onChange={(e) => commit(rows.map((r, idx) => (idx === i ? [r[0], e.target.value] : r)))} />
          <button type="button" className={cx.button} onClick={() => commit(rows.filter((_, idx) => idx !== i))}>
            {t('common.remove')}
          </button>
        </div>
      ))}
      <button type="button" className={cx.button} onClick={() => commit([...rows, ['', '']])}>
        {t('actions.addField')}
      </button>
    </fieldset>
  )
}

function ActionFields({
  action: a,
  onChange,
  options,
  t,
}: {
  action: ActionBlock
  onChange: (a: ActionBlock) => void
  options?: ActionOptions
  t: TFunction
}) {
  if (needsAdvanced(a)) {
    return (
      <div className="space-y-2">
        <p className={cx.muted}>{t('actions.advancedOnly')}</p>
        <pre className="overflow-x-auto rounded border p-2 text-xs">{JSON.stringify(a, null, 2)}</pre>
      </div>
    )
  }
  switch (a.do) {
    case 'record.upsert':
      return (
        <div className="space-y-2">
          <TextInput label={t('actions.model')} value={a.model} list={options?.models} onChange={(v) => onChange({ ...a, model: v })} />
          <TextInput
            label={t('actions.match')}
            value={a.match.join(', ')}
            onChange={(v) => onChange({ ...a, match: v.split(',').map((s) => s.trim()).filter(Boolean) })}
          />
          <KeyValueRows title={t('actions.fields')} value={a.mapping} onChange={(mapping) => onChange({ ...a, mapping })} t={t} />
        </div>
      )
    case 'event.emit':
      return (
        <div className="space-y-2">
          <TextInput label={t('actions.eventName')} value={a.name} placeholder="dominio.entidad.accion" onChange={(v) => onChange({ ...a, name: v })} />
          <KeyValueRows title={t('actions.fields')} value={a.payload} onChange={(payload) => onChange({ ...a, payload })} t={t} />
        </div>
      )
    case 'notify':
      return (
        <div className="space-y-2">
          <TextInput label={t('actions.template')} value={a.template} list={options?.templates} onChange={(v) => onChange({ ...a, template: v })} />
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className={cx.label}>{t('actions.when')}</legend>
            <input
              aria-label={t('actions.whenPath')}
              placeholder={t('actions.whenPath')}
              className={cx.input}
              value={a.when?.path ?? ''}
              onChange={(e) =>
                onChange(e.target.value === '' && a.when?.eq === undefined ? { do: 'notify', template: a.template } : { ...a, when: { path: e.target.value, eq: a.when?.eq ?? '' } })
              }
            />
            <input
              aria-label={t('actions.whenEq')}
              placeholder={t('actions.whenEq')}
              className={cx.input}
              value={a.when ? String(a.when.eq ?? '') : ''}
              onChange={(e) => onChange({ ...a, when: { path: a.when?.path ?? '', eq: coerceScalar(e.target.value) } })}
            />
          </fieldset>
        </div>
      )
    case 'command.run':
      return (
        <div className="space-y-2">
          <TextInput label={t('actions.command')} value={a.command} list={options?.commands} onChange={(v) => onChange({ ...a, command: v })} />
          <KeyValueRows title={t('actions.args')} value={a.args ?? {}} onChange={(args) => onChange({ ...a, args })} t={t} />
        </div>
      )
    default:
      return null
  }
}

/** `true`/`false`/numbers typed in the "equals" box keep their scalar type. */
function coerceScalar(v: string): string | number | boolean {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return v
}

function AdvancedJson({ actions, onApply, t }: { actions: ActionBlock[]; onApply: (a: ActionBlock[]) => void; t: TFunction }) {
  const [text, setText] = React.useState(() => JSON.stringify(actions, null, 2))
  const [error, setError] = React.useState<string | null>(null)
  const id = React.useId()
  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    const res = parseActions(parsed)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    onApply(res.actions)
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">
        {t('common.advanced')}
      </label>
      <textarea id={id} className={`${cx.input} font-mono`} rows={12} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={error ? true : undefined} />
      {error ? (
        <p role="alert" className={cx.error}>
          {t('common.advancedInvalid', { message: error })}
        </p>
      ) : null}
      <button type="button" className={cx.button} onClick={apply}>
        {t('common.apply')}
      </button>
    </div>
  )
}
