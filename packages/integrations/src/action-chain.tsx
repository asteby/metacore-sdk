import * as React from 'react'
import { moveItem, needsAdvanced, newAction, parseActions } from './actions'
import type { TFunction } from './i18n'
import { InboundMappingEditor } from './inbound-mapping'
import { ActionPolicyForm, type RecordBlock } from './action-policy'
import { resetPolicy, SELECT_ONLY_KINDS } from './policy-utils'
import { flattenSchemaFields, templateToRow } from './schema'
import { TargetPicker } from './target-picker'
import { ACTION_KINDS, VISUAL_ACTION_KINDS, type ActionBlock, type ActionKind, type IngestTarget, type JSONSchemaLite, type MappingRow } from './types'
import { cx, Field } from './ui'
import { WhenEditor } from './when-editor'

export interface ActionOptions {
  /** Legacy suggestions (free text + datalist). Used when `targets` is absent. */
  models?: string[]
  /** Server catalogue (`listTargets`): when present, `record.*` blocks pick from it. */
  targets?: IngestTarget[]
  commands?: string[]
  templates?: string[]
}

export interface ActionChainProps {
  actions: ActionBlock[]
  onChange: (next: ActionBlock[]) => void
  options?: ActionOptions
  /** Schema of the endpoint contract: feeds the event fields of the inbound mapping. */
  contractSchema?: JSONSchemaLite
  t: TFunction
}

/**
 * Ordered list of action blocks (closed set; the visual editor authors record.upsert, event.emit,
 * notify, command.run). The author fills fields; JSON is only an opt-in
 * "advanced view" that is validated against the same closed set.
 */
export function ActionChain({ actions, onChange, options, contractSchema, t }: ActionChainProps) {
  const [advanced, setAdvanced] = React.useState(false)
  const [kind, setKind] = React.useState<ActionKind>('record.upsert')
  // With the server catalogue every kind has a visual editor; old hosts keep the legacy four.
  const kinds = options?.targets ? ACTION_KINDS : VISUAL_ACTION_KINDS
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
                <ActionFields action={a} onChange={(n) => set(i, n)} options={options} contractSchema={contractSchema} t={t} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={kindId} className={cx.label}>
                {t('actions.add')}
              </label>
              <select id={kindId} className={cx.input} value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
                {kinds.map((k) => (
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
  contractSchema,
  t,
}: {
  action: ActionBlock
  onChange: (a: ActionBlock) => void
  options?: ActionOptions
  contractSchema?: JSONSchemaLite
  t: TFunction
}) {
  const fields = React.useMemo(() => flattenSchemaFields(contractSchema), [contractSchema])
  if (needsAdvanced(a, { targets: !!options?.targets })) {
    return (
      <div className="space-y-2">
        <p className={cx.muted}>{t('actions.advancedOnly')}</p>
        <pre className="overflow-x-auto rounded border p-2 text-xs">{JSON.stringify(a, null, 2)}</pre>
      </div>
    )
  }
  const body = renderBody(a, onChange, options, contractSchema, fields, t)
  return (
    <div className="space-y-3">
      {body}
      <WhenEditor value={a.when} fields={fields} t={t} onChange={(when) => onChange(setWhen(a, when))} />
      <details>
        <summary className="cursor-pointer text-sm">{t('actions.jsonView')}</summary>
        <pre aria-label={t('actions.jsonView')} className="mt-1 overflow-x-auto rounded border p-2 text-xs" data-testid="block-json">
          {JSON.stringify(a, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function setWhen(a: ActionBlock, when: ActionBlock['when']): ActionBlock {
  const o = { ...a } as Record<string, unknown>
  if (when === undefined) delete o.when
  else o.when = when
  return o as unknown as ActionBlock
}

function renderBody(
  a: ActionBlock,
  onChange: (a: ActionBlock) => void,
  options: ActionOptions | undefined,
  contractSchema: JSONSchemaLite | undefined,
  fields: ReturnType<typeof flattenSchemaFields>,
  t: TFunction,
): React.ReactNode {
  if (options?.targets && a.do.startsWith('record.')) {
    return <TargetBlockFields action={a as RecordBlock} onChange={onChange} targets={options.targets} contractSchema={contractSchema} fields={fields} t={t} />
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

const candidateKey = (c: string[]) => c.join(' ')

/**
 * `record.*` block against the server catalogue: pick addon -> model, how to
 * match the row (only the model's `match_candidates`), map the writable columns
 * from an example event (only the match columns for delete/action/transition/
 * restore, which select rows by match) and set the policy (guard, defaults,
 * idempotency, max_rows, action, transition) in `ActionPolicyForm`. Changing
 * the model clears match, mapping and every model-specific policy field.
 */
function TargetBlockFields({
  action: a,
  onChange,
  targets,
  contractSchema,
  fields,
  t,
}: {
  action: RecordBlock
  onChange: (a: ActionBlock) => void
  targets: IngestTarget[]
  contractSchema?: JSONSchemaLite
  fields: ReturnType<typeof flattenSchemaFields>
  t: TFunction
}) {
  const target = targets.find((x) => x.model === a.model)
  const match = a.match ?? []
  const rows: MappingRow[] = Object.entries(a.mapping).map(([k, v]) => templateToRow(k, v))
  const current = match.length > 0 ? target?.match_candidates.find((c) => candidateKey(c) === candidateKey(match)) : undefined
  const matchInvalid = !!target && match.length > 0 && !current

  // The mapping editor only offers the columns the block may map: match columns
  // for select-only blocks; for writes, not the retry-key column nor a fixed value.
  let mapTarget = target
  if (target) {
    const defaults = ((a as { defaults?: Record<string, unknown> }).defaults ?? {}) as Record<string, unknown>
    const idem = (a as { idempotency_field?: string }).idempotency_field
    mapTarget = {
      ...target,
      columns: target.columns.filter((c) =>
        SELECT_ONLY_KINDS.includes(a.do)
          ? match.includes(c.name)
          : c.name !== idem && !(c.name in defaults && !(c.name in a.mapping)),
      ),
    }
  }

  return (
    <div className="space-y-3">
      <TargetPicker
        targets={targets}
        value={a.model}
        kind={a.do}
        t={t}
        onChange={(model, tg) => {
          if (model === a.model) return
          onChange({ ...resetPolicy(a), model, match: tg.match_candidates.length === 1 ? [...tg.match_candidates[0]!] : [], mapping: {} })
        }}
      />
      {target && mapTarget ? (
        <>
          <Field label={t('targets.matchBy')}>
            {({ id }) => (
              <select
                id={id}
                className={cx.input}
                value={current ? candidateKey(current) : ''}
                aria-invalid={matchInvalid ? true : undefined}
                onChange={(e) => onChange({ ...a, match: target.match_candidates.find((c) => candidateKey(c) === e.target.value) ?? [] })}
              >
                <option value="">{t('targets.matchPick')}</option>
                {target.match_candidates.map((c) => (
                  <option key={candidateKey(c)} value={candidateKey(c)}>
                    {c.join(', ')}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {matchInvalid ? (
            <p role="alert" className={cx.error}>
              {t('targets.matchInvalid')}
            </p>
          ) : null}
          <InboundMappingEditor
            target={mapTarget}
            rows={rows}
            contractSchema={contractSchema}
            t={t}
            onChange={(next) => {
              const mapping: Record<string, string> = {}
              for (const r of next) {
                if (r.target.trim() !== '' && r.value !== '') mapping[r.target.trim()] = r.kind === 'field' ? `{{payload.${r.value}}}` : r.value
              }
              onChange({ ...a, mapping })
            }}
          />
          <ActionPolicyForm action={a} target={target} fields={fields} t={t} onChange={onChange} />
        </>
      ) : null}
    </div>
  )
}
