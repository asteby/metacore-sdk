import * as React from 'react'
import type { TFunction } from './i18n'
import type { SourceField } from './schema'
import { suggestSource } from './target-utils'
import {
  GUARD_KINDS,
  DEFAULTS_KINDS,
  MAX_ROWS_KINDS,
  coerceDefault,
  defaultValid,
  guardColumns,
  initialDefault,
  isBoolColumn,
  isGuardField,
  isNumberColumn,
  isTextColumn,
  paramState,
  paramTemplate,
  transitionSources,
  transitionTargets,
  type ParamMode,
} from './policy-utils'
import type { ActionBlock, BlockGuard, IngestTarget, IngestTargetActionParam, IngestTargetColumn } from './types'
import { cx, Field } from './ui'

/** Any `record.*` block. */
export type RecordBlock = Extract<ActionBlock, { model: string }>

export interface ActionPolicyFormProps {
  /** The `record.*` block being edited (unknown fields are preserved). */
  action: RecordBlock
  /** The model the block writes; every choice comes from what it declares. */
  target: IngestTarget
  onChange: (next: RecordBlock) => void
  /** Fields of the example event (paths relative to the payload). */
  fields?: SourceField[]
  t: TFunction
}

/** Returns a copy of the block with `key` set, or removed when `value` is undefined. */
function put(a: RecordBlock, key: string, value: unknown): RecordBlock {
  const o = { ...a } as Record<string, unknown>
  if (value === undefined) delete o[key]
  else o[key] = value
  return o as unknown as RecordBlock
}

const LIKELY = /updated|modified|version|seq|timestamp|changed|at$/i

/**
 * Policy of a `record.*` block against its target: order `guard`, constant
 * `defaults`, `idempotency_field` (create), `max_rows`, and for the state
 * blocks the action + params, `on_ineligible`, the transition `to` and the
 * soft-delete notice. Offers only what the server declares in `IngestTarget`;
 * problems are shown inline and block saving through `inboundProblems`.
 */
export function ActionPolicyForm({ action: a, target, onChange, fields = [], t }: ActionPolicyFormProps) {
  const uid = React.useId()
  return (
    <fieldset className="space-y-3 rounded-md border p-3" data-testid="action-policy" aria-labelledby={`${uid}-t`}>
      <legend id={`${uid}-t`} className="px-1 text-sm font-semibold">
        {t('policy.title')}
      </legend>
      {a.do === 'record.create' ? <IdempotencyField action={a} target={target} onChange={onChange} t={t} /> : null}
      {a.do === 'record.delete' ? (
        <p className={cx.muted} data-testid="soft-delete-note">
          {t('policy.delete.soft')}
        </p>
      ) : null}
      {a.do === 'record.action' ? <ActionPicker action={a} target={target} onChange={onChange} fields={fields} t={t} /> : null}
      {a.do === 'record.transition' ? <TransitionPicker action={a} target={target} onChange={onChange} t={t} /> : null}
      {a.do === 'record.restore' ? (
        <p className={a.do === 'record.restore' && target.restorable === false ? cx.error : cx.muted}>
          {target.restorable === false ? t('policy.restore.unavailable') : t('policy.restore.hint')}
        </p>
      ) : null}
      {DEFAULTS_KINDS.includes(a.do) ? <DefaultsEditor action={a} target={target} onChange={onChange} t={t} /> : null}
      {GUARD_KINDS.includes(a.do) ? (
        <GuardEditor
          guard={(a as { guard?: BlockGuard }).guard}
          target={target}
          fields={fields}
          onChange={(g) => onChange(put(a, 'guard', g))}
          t={t}
        />
      ) : null}
      {MAX_ROWS_KINDS.includes(a.do) ? (
        <MaxRows value={(a as { max_rows?: number }).max_rows} onChange={(n) => onChange(put(a, 'max_rows', n))} t={t} />
      ) : null}
    </fieldset>
  )
}

// ---- max_rows -------------------------------------------------------------

function MaxRows({ value, onChange, t }: { value: number | undefined; onChange: (n: number | undefined) => void; t: TFunction }) {
  const [text, setText] = React.useState<string | null>(null)
  const shown = text !== null && (text === '' ? value === undefined : Number(text) === value) ? text : value === undefined ? '' : String(value)
  const n = Number(shown)
  const bad = shown !== '' && (!Number.isInteger(n) || n < 1 || n > 100)
  return (
    <Field label={t('policy.maxRows')} hint={t('policy.maxRowsHint')}>
      {({ id, describedBy }) => (
        <>
          <input
            id={id}
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            className={cx.input}
            placeholder="1"
            value={shown}
            aria-describedby={describedBy}
            aria-invalid={bad ? true : undefined}
            onChange={(e) => {
              setText(e.target.value)
              if (e.target.value === '') onChange(undefined)
              else if (Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value))
            }}
          />
          {bad ? (
            <p role="alert" className={cx.error}>
              {t('policy.maxRowsInvalid')}
            </p>
          ) : null}
        </>
      )}
    </Field>
  )
}

// ---- guard ----------------------------------------------------------------

function GuardEditor({
  guard,
  target,
  fields,
  onChange,
  t,
}: {
  guard: BlockGuard | undefined
  target: IngestTarget
  fields: SourceField[]
  onChange: (g: BlockGuard | undefined) => void
  t: TFunction
}) {
  const uid = React.useId()
  const cols = React.useMemo(() => guardColumns(target), [target])
  const paths = React.useMemo(() => {
    const all = fields.filter((f) => f.type !== 'object' && f.type !== 'array').map((f) => ({ ...f, full: `payload.${f.path}` }))
    const likely = all.filter((f) => f.format === 'date-time' || LIKELY.test(f.path.split('.').pop() ?? ''))
    return [...likely, ...all.filter((f) => !likely.includes(f))]
  }, [fields])
  const [customPath, setCustomPath] = React.useState(false)

  const enable = (on: boolean) => {
    if (!on) return onChange(undefined)
    const field = cols.recommended ?? cols.other[0] ?? ''
    const sug = suggestSource({ name: field }, fields.map((f) => ({ path: f.path, type: f.type })))
    const first = sug ? `payload.${sug}` : (paths[0]?.full ?? '')
    onChange({ field, path: first, op: 'gte' })
  }

  const fieldKnown = !!guard && isGuardField(target, guard.field)
  const pathKnown = !!guard && paths.some((p) => p.full === guard.path)
  const typedPath = customPath || paths.length === 0 || (!!guard && guard.path !== '' && !pathKnown)
  const incomplete = !!guard && (guard.field.trim() === '' || guard.path.trim() === '')

  return (
    <fieldset className="space-y-2 rounded-md border p-2" data-testid="guard-editor">
      <legend className={cx.label}>{t('policy.guard.legend')}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!guard} aria-describedby={`${uid}-help`} onChange={(e) => enable(e.target.checked)} />
        {t('policy.guard.enable')}
      </label>
      <p id={`${uid}-help`} className={cx.muted}>
        {t('policy.guard.help')}
      </p>
      {guard ? (
        <div className="space-y-2">
          <Field label={t('policy.guard.field')}>
            {({ id }) => (
              <select
                id={id}
                className={cx.input}
                value={guard.field}
                aria-invalid={!fieldKnown ? true : undefined}
                onChange={(e) => onChange({ ...guard, field: e.target.value })}
              >
                <option value="">{t('policy.guard.fieldPick')}</option>
                {cols.suggested.length > 0 ? (
                  <optgroup label={t('policy.guard.suggested')}>
                    {cols.suggested.map((c) => (
                      <option key={c} value={c}>
                        {c === cols.recommended ? t('policy.guard.recommended', { column: c }) : c}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {cols.other.length > 0 ? (
                  <optgroup label={t('policy.guard.otherColumns')}>
                    {cols.other.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {guard.field !== '' && !fieldKnown ? <option value={guard.field}>{t('policy.guard.notAllowed', { column: guard.field })}</option> : null}
              </select>
            )}
          </Field>
          {guard.field !== '' && !fieldKnown ? (
            <p role="alert" className={cx.error}>
              {t('in.blocked.guardFieldNotAllowed', { column: guard.field })}
            </p>
          ) : null}
          <Field label={t('policy.guard.path')}>
            {({ id }) =>
              typedPath ? (
                <div className="flex gap-2">
                  <input
                    id={id}
                    className={cx.input}
                    value={guard.path}
                    placeholder="payload.updated_at"
                    aria-invalid={guard.path === '' || !/^payload\./.test(guard.path) ? true : undefined}
                    onChange={(e) => onChange({ ...guard, path: e.target.value })}
                  />
                  {paths.length > 0 ? (
                    <button
                      type="button"
                      className={cx.button}
                      onClick={() => {
                        setCustomPath(false)
                        if (!pathKnown) onChange({ ...guard, path: '' })
                      }}
                    >
                      {t('when.pathPickBack')}
                    </button>
                  ) : null}
                </div>
              ) : (
                <select
                  id={id}
                  className={cx.input}
                  value={pathKnown ? guard.path : ''}
                  onChange={(e) => {
                    if (e.target.value === '\u0000custom') return setCustomPath(true)
                    onChange({ ...guard, path: e.target.value })
                  }}
                >
                  <option value="">{t('policy.guard.pathPick')}</option>
                  {paths.map((p) => (
                    <option key={p.full} value={p.full}>
                      {p.full} ({p.type})
                    </option>
                  ))}
                  <option value={'\u0000custom'}>{t('when.pathCustom')}</option>
                </select>
              )
            }
          </Field>
          {guard.path !== '' && !/^payload\./.test(guard.path) ? (
            <p role="alert" className={cx.error}>
              {t('in.blocked.guardPathInvalid', { path: guard.path })}
            </p>
          ) : null}
          <Field label={t('policy.guard.op')} hint={t(`policy.guard.opHelp.${guard.op}`)}>
            {({ id, describedBy }) => (
              <select id={id} className={cx.input} value={guard.op} aria-describedby={describedBy} onChange={(e) => onChange({ ...guard, op: e.target.value as BlockGuard['op'] })}>
                <option value="gte">{t('policy.guard.op.gte')}</option>
                <option value="gt">{t('policy.guard.op.gt')}</option>
              </select>
            )}
          </Field>
          {incomplete ? (
            <p role="alert" className={cx.error}>
              {t('in.blocked.guardIncomplete')}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}

// ---- defaults -------------------------------------------------------------

function DefaultsEditor({ action: a, target, onChange, t }: { action: RecordBlock; target: IngestTarget; onChange: (a: RecordBlock) => void; t: TFunction }) {
  const defaults = ((a as { defaults?: Record<string, unknown> }).defaults ?? {}) as Record<string, unknown>
  const idem = (a as { idempotency_field?: string }).idempotency_field
  const cols = new Map(target.columns.map((c) => [c.name, c]))
  const set = (next: Record<string, unknown>) => onChange(put(a, 'defaults', Object.keys(next).length === 0 ? undefined : next))
  const free = target.columns.filter((c) => !(c.name in defaults) && !(c.name in a.mapping) && c.name !== idem)
  const addId = React.useId()

  return (
    <fieldset className="space-y-2 rounded-md border p-2" data-testid="defaults-editor">
      <legend className={cx.label}>{t('policy.defaults.legend')}</legend>
      <p className={cx.muted}>{t('policy.defaults.hint')}</p>
      <ul className="space-y-2">
        {Object.entries(defaults).map(([name, value]) => {
          const c = cols.get(name)
          const bad = c ? !defaultValid(c, value) : true
          return (
            <li key={name} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" data-default={name}>
              <span className="self-center text-sm font-medium">{c?.label ? `${c.label} (${name})` : name}</span>
              {c ? (
                <DefaultValue column={c} value={value} invalid={bad} onChange={(v) => set({ ...defaults, [name]: v })} t={t} />
              ) : (
                <span role="alert" className={cx.error}>
                  {t('in.blocked.defaultColumn', { column: name })}
                </span>
              )}
              <button
                type="button"
                className={cx.button}
                aria-label={`${t('common.remove')} · ${name}`}
                onClick={() => {
                  const { [name]: _gone, ...rest } = defaults
                  set(rest)
                }}
              >
                {t('common.remove')}
              </button>
              {c && bad ? (
                <p role="alert" className={`${cx.error} sm:col-span-3`}>
                  {t('in.blocked.defaultType', { column: name })}
                </p>
              ) : null}
              {c && name in a.mapping ? (
                <p role="alert" className={`${cx.error} sm:col-span-3`}>
                  {t('in.blocked.defaultMapped', { column: name })}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      {Object.keys(defaults).length === 0 ? <p className={cx.muted}>{t('policy.defaults.none')}</p> : null}
      <div>
        <label htmlFor={addId} className="sr-only">
          {t('policy.defaults.add')}
        </label>
        <select
          id={addId}
          className={cx.input}
          value=""
          disabled={free.length === 0}
          onChange={(e) => {
            const c = cols.get(e.target.value)
            if (c) set({ ...defaults, [c.name]: initialDefault(c) })
          }}
        >
          <option value="">{free.length === 0 ? t('policy.defaults.noColumns') : t('policy.defaults.add')}</option>
          {free.map((c) => (
            <option key={c.name} value={c.name}>
              {c.label ? `${c.label} (${c.name})` : c.name}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  )
}

function DefaultValue({ column: c, value, invalid, onChange, t }: { column: IngestTargetColumn; value: unknown; invalid: boolean; onChange: (v: unknown) => void; t: TFunction }) {
  const label = `${t('policy.defaults.value')} · ${c.name}`
  const aria = invalid ? true : undefined
  if (c.options && c.options.length > 0) {
    return (
      <select aria-label={label} aria-invalid={aria} className={cx.input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {!c.options.some((o) => o.value === String(value)) ? <option value={String(value)}>{String(value)}</option> : null}
        {c.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        ))}
      </select>
    )
  }
  if (isBoolColumn(c)) {
    return (
      <select aria-label={label} aria-invalid={aria} className={cx.input} value={String(value)} onChange={(e) => onChange(coerceDefault(c, e.target.value))}>
        <option value="true">{t('policy.true')}</option>
        <option value="false">{t('policy.false')}</option>
      </select>
    )
  }
  return (
    <input
      aria-label={label}
      aria-invalid={aria}
      className={cx.input}
      type={isNumberColumn(c) ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(e) => onChange(coerceDefault(c, e.target.value))}
    />
  )
}

// ---- idempotency_field (record.create) -------------------------------------

function IdempotencyField({ action: a, target, onChange, t }: { action: Extract<RecordBlock, { do: 'record.create' }>; target: IngestTarget; onChange: (a: RecordBlock) => void; t: TFunction }) {
  const defaults = (a.defaults ?? {}) as Record<string, unknown>
  const cols = target.columns.filter((c) => isTextColumn(c) && !(c.name in a.mapping) && !(c.name in defaults))
  const current = a.idempotency_field
  const known = current === '' || cols.some((c) => c.name === current)
  return (
    <Field label={t('policy.idem.label')} hint={t('policy.idem.hint')}>
      {({ id, describedBy }) => (
        <>
          <select
            id={id}
            className={cx.input}
            value={current}
            aria-describedby={describedBy}
            aria-invalid={!known ? true : undefined}
            onChange={(e) => onChange({ ...a, idempotency_field: e.target.value })}
          >
            <option value="">{t('policy.idem.pick')}</option>
            {cols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label ? `${c.label} (${c.name})` : c.name}
              </option>
            ))}
            {!known ? <option value={current}>{current}</option> : null}
          </select>
          {!known ? (
            <p role="alert" className={cx.error}>
              {t('in.blocked.idempotencyInvalid', { column: current })}
            </p>
          ) : null}
          {cols.length === 0 && current === '' ? <p className={cx.muted}>{t('policy.idem.none')}</p> : null}
        </>
      )}
    </Field>
  )
}

// ---- record.action ---------------------------------------------------------

function ActionPicker({
  action: a,
  target,
  onChange,
  fields,
  t,
}: {
  action: Extract<RecordBlock, { do: 'record.action' }>
  target: IngestTarget
  onChange: (a: RecordBlock) => void
  fields: SourceField[]
  t: TFunction
}) {
  const available = target.actions_available ?? []
  const def = available.find((x) => x.key === a.action)
  const params = (a.params ?? {}) as Record<string, unknown>
  const [chosen, setChosen] = React.useState<Record<string, ParamMode>>({})
  const setParam = (name: string, v: string | undefined) => {
    const next = { ...params }
    if (v === undefined || v === '') delete next[name]
    else next[name] = v
    onChange(put(a, 'params', Object.keys(next).length === 0 ? undefined : next))
  }
  const unknown = Object.keys(params).filter((k) => k !== 'reason' && !def?.params.some((p) => p.name === k))

  return (
    <div className="space-y-3">
      <Field label={t('policy.action.label')} hint={def?.requires_state?.length ? t('policy.action.requires', { states: def.requires_state.join(', ') }) : undefined}>
        {({ id, describedBy }) => (
          <>
            <select
              id={id}
              className={cx.input}
              value={a.action}
              aria-describedby={describedBy}
              aria-invalid={a.action !== '' && !def ? true : undefined}
              onChange={(e) => {
                setChosen({})
                onChange(put(put(a, 'params', undefined), 'action', e.target.value) as RecordBlock)
              }}
            >
              <option value="">{t('policy.action.pick')}</option>
              {available.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label ? `${x.label} (${x.key})` : x.key}
                </option>
              ))}
              {a.action !== '' && !def ? <option value={a.action}>{t('policy.action.unavailable', { action: a.action })}</option> : null}
            </select>
            {available.length === 0 ? <p className={cx.muted}>{t('policy.action.none')}</p> : null}
            {a.action !== '' && !def ? (
              <p role="alert" className={cx.error}>
                {t('in.blocked.actionUnavailable', { action: a.action })}
              </p>
            ) : null}
          </>
        )}
      </Field>

      {def && def.params.length > 0 ? (
        <fieldset className="space-y-2" data-testid="action-params">
          <legend className={cx.label}>{t('policy.params.legend')}</legend>
          {def.params.map((p) => (
            <ParamRow
              key={p.name}
              param={p}
              value={params[p.name]}
              mode={chosen[p.name]}
              fields={fields}
              onMode={(m) => {
                setChosen((s) => ({ ...s, [p.name]: m }))
                setParam(p.name, undefined)
              }}
              onValue={(m, v) => setParam(p.name, paramTemplate(m, v))}
              t={t}
            />
          ))}
        </fieldset>
      ) : null}
      {unknown.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-destructive p-2">
          <span role="alert" className={cx.error}>
            {t('in.blocked.paramUnknown', { param: k })}
          </span>
          <button type="button" className={cx.button} aria-label={`${t('common.remove')} · ${k}`} onClick={() => setParam(k, undefined)}>
            {t('common.remove')}
          </button>
        </div>
      ))}

      <Field label={t('policy.ineligible.label')} hint={t('policy.ineligible.help')}>
        {({ id, describedBy }) => (
          <select id={id} className={cx.input} value={a.on_ineligible ?? 'noop'} aria-describedby={describedBy} onChange={(e) => onChange({ ...a, on_ineligible: e.target.value as 'noop' | 'fail' })}>
            <option value="noop">{t('policy.ineligible.noop')}</option>
            <option value="fail">{t('policy.ineligible.fail')}</option>
          </select>
        )}
      </Field>
    </div>
  )
}

function ParamRow({
  param: p,
  value,
  mode: chosen,
  fields,
  onMode,
  onValue,
  t,
}: {
  param: IngestTargetActionParam
  value: unknown
  mode: ParamMode | undefined
  fields: SourceField[]
  onMode: (m: ParamMode) => void
  onValue: (m: ParamMode, v: string) => void
  t: TFunction
}) {
  const st = paramState(value)
  const mode = st.value !== '' ? st.mode : (chosen ?? 'unmapped')
  const name = p.label ? `${p.label} (${p.name})` : p.name
  const missing = !!p.required && mode === 'unmapped'
  const type = (p.type ?? 'text').toLowerCase()
  const label = `${t('mapping.fixed')} · ${p.name}`
  return (
    <div className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto_1fr]" data-param={p.name}>
      <div className="text-sm">
        <span className="font-medium">{name}</span>
        <span className="ml-2 inline-flex gap-1 align-middle">
          <span className="rounded bg-muted px-1 text-xs">{p.type ?? 'text'}</span>
          {p.required ? <span className="rounded bg-muted px-1 text-xs">{t('inmap.required')}</span> : null}
        </span>
      </div>
      <select aria-label={`${t('inmap.source')} · ${p.name}`} className={cx.input} value={mode} onChange={(e) => onMode(e.target.value as ParamMode)}>
        <option value="unmapped">{t('inmap.unmapped')}</option>
        <option value="field">{t('mapping.fromField')}</option>
        <option value="literal">{t('mapping.fixed')}</option>
      </select>
      <div>
        {mode === 'field' ? (
          fields.length > 0 ? (
            <select aria-label={`${t('mapping.fromField')} · ${p.name}`} className={cx.input} value={st.mode === 'field' ? st.value : ''} onChange={(e) => onValue('field', e.target.value)}>
              <option value="">{t('mapping.pickField')}</option>
              {fields.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path} ({f.type})
                </option>
              ))}
            </select>
          ) : (
            <input aria-label={`${t('mapping.fromField')} · ${p.name}`} className={cx.input} value={st.mode === 'field' ? st.value : ''} onChange={(e) => onValue('field', e.target.value)} />
          )
        ) : null}
        {mode === 'literal' ? (
          p.options && p.options.length > 0 ? (
            <select aria-label={label} className={cx.input} value={st.value} onChange={(e) => onValue('literal', e.target.value)}>
              <option value="">{t('inmap.pickOption')}</option>
              {p.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label ?? o.value}
                </option>
              ))}
            </select>
          ) : type === 'boolean' || type === 'bool' ? (
            <select aria-label={label} className={cx.input} value={st.value} onChange={(e) => onValue('literal', e.target.value)}>
              <option value="">{t('inmap.pickOption')}</option>
              <option value="true">{t('policy.true')}</option>
              <option value="false">{t('policy.false')}</option>
            </select>
          ) : (
            <input aria-label={label} className={cx.input} type={['number', 'integer', 'decimal'].includes(type) ? 'number' : 'text'} value={st.value} onChange={(e) => onValue('literal', e.target.value)} />
          )
        ) : null}
      </div>
      {missing ? (
        <p role="alert" className={`${cx.error} sm:col-span-3`}>
          {t('in.blocked.paramRequired', { param: p.name })}
        </p>
      ) : null}
    </div>
  )
}

// ---- record.transition -----------------------------------------------------

function TransitionPicker({ action: a, target, onChange, t }: { action: Extract<RecordBlock, { do: 'record.transition' }>; target: IngestTarget; onChange: (a: RecordBlock) => void; t: TFunction }) {
  const stage = target.stage
  const valid = transitionTargets(target)
  const stateKnown = a.to === '' || valid.has(a.to)
  const from = a.to !== '' && stateKnown ? transitionSources(target, a.to) : []
  if (!stage) {
    return (
      <p className={cx.error} role="alert">
        {t('policy.transition.noStage')}
      </p>
    )
  }
  return (
    <Field label={t('policy.transition.to', { field: stage.field })} hint={from.length > 0 ? t('policy.transition.from', { from: from.join(', ') }) : undefined}>
      {({ id, describedBy }) => (
        <>
          <select
            id={id}
            className={cx.input}
            value={a.to}
            aria-describedby={describedBy}
            aria-invalid={!stateKnown ? true : undefined}
            onChange={(e) => onChange({ ...a, to: e.target.value })}
          >
            <option value="">{t('policy.transition.pick')}</option>
            {stage.stages.map((s) => {
              const ok = valid.has(s.key)
              return (
                <option key={s.key} value={s.key} disabled={!ok}>
                  {s.label ? `${s.label} (${s.key})` : s.key}
                  {ok ? '' : ` — ${t('policy.transition.undeclared')}`}
                </option>
              )
            })}
            {!stateKnown ? <option value={a.to}>{t('policy.transition.invalid', { state: a.to })}</option> : null}
          </select>
          {!stateKnown ? (
            <p role="alert" className={cx.error}>
              {t('in.blocked.transitionInvalid', { state: a.to })}
            </p>
          ) : null}
        </>
      )}
    </Field>
  )
}
