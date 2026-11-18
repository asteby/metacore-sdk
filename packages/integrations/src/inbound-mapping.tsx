import * as React from 'react'
import type { TFunction } from './i18n'
import { buildSamplePayload, flattenSchemaFields, inferSchema, previewBody, type SourceField } from './schema'
import { suggestSource, unmappedRequired, validateRecord } from './target-utils'
import type { IngestTarget, IngestTargetColumn, JSONSchemaLite, MappingRow } from './types'
import { cx } from './ui'

export interface InboundMappingEditorProps {
  /** Model the block writes; only its columns can be mapped. */
  target: IngestTarget
  /**
   * One row per mapped column (`target` = column name). A row with an empty
   * `value` is "not mapped". Rows whose `target` is not a column are shown as
   * not allowed, with a remove button.
   */
  rows: MappingRow[]
  onChange: (rows: MappingRow[]) => void
  /** Schema of the contract the endpoint receives; seeds fields and the sample. */
  contractSchema?: JSONSchemaLite
  t: TFunction
}

type Mode = 'unmapped' | 'field' | 'literal'

function parseSample(text: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  if (text.trim() === '') return { ok: true, value: null }
  try {
    const v: unknown = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, value: v as Record<string, unknown> }
    return { ok: false, error: 'not an object' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Inbound mapping (`MappingEditor direction="in"`): one row per WRITABLE column
 * of the target, each fed from an event field or a fixed value. Required
 * columns without a source are flagged (and block saving in the form). A
 * name-based suggestion is shown but never applied on its own. The preview
 * renders the record the block would write from a sample event (pasted JSON,
 * or built from the contract schema).
 */
export function InboundMappingEditor({ target, rows, onChange, contractSchema, t }: InboundMappingEditorProps) {
  const uid = React.useId()
  const [sampleText, setSampleText] = React.useState('')
  const [chosen, setChosen] = React.useState<Record<string, Mode>>({})
  const parsed = React.useMemo(() => parseSample(sampleText), [sampleText])
  const pasted = parsed.ok ? parsed.value : null

  const fields = React.useMemo(() => {
    const seen = new Map<string, SourceField>()
    for (const f of flattenSchemaFields(contractSchema)) seen.set(f.path, f)
    if (pasted) for (const f of flattenSchemaFields(inferSchema(pasted))) if (!seen.has(f.path)) seen.set(f.path, f)
    return [...seen.values()]
  }, [contractSchema, pasted])
  const sample = React.useMemo(() => pasted ?? buildSamplePayload(contractSchema), [pasted, contractSchema])

  const byTarget = React.useMemo(() => new Map(rows.map((r) => [r.target, r])), [rows])
  const columnNames = React.useMemo(() => new Set(target.columns.map((c) => c.name)), [target])
  const extras = rows.filter((r) => !columnNames.has(r.target))
  const mapped = rows.filter((r) => columnNames.has(r.target) && r.value.trim() !== '')
  const mapping = Object.fromEntries(mapped.map((r) => [r.target, r.value]))
  const missing = unmappedRequired(target, mapping)

  const record = React.useMemo(
    () => (mapped.length === 0 ? {} : (previewBody(mapped, sample, '') as Record<string, unknown>)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sample, target],
  )
  const issues = validateRecord(target, record, mapped.map((r) => r.target))

  const rowOf = (c: IngestTargetColumn): MappingRow => byTarget.get(c.name) ?? { target: c.name, kind: 'field', value: '' }
  const modeOf = (c: IngestTargetColumn): Mode => {
    const r = rowOf(c)
    return r.value !== '' ? r.kind : (chosen[c.name] ?? 'unmapped')
  }
  const write = (c: IngestTargetColumn, next: MappingRow) => {
    const rest = rows.filter((r) => r.target !== c.name)
    // keep column order stable: rebuild from the column list
    const order = new Map(target.columns.map((x, i) => [x.name, i]))
    onChange([...rest, next].sort((a, b) => (order.get(a.target) ?? 1e6) - (order.get(b.target) ?? 1e6)))
  }
  const setMode = (c: IngestTargetColumn, mode: Mode) => {
    setChosen((s) => ({ ...s, [c.name]: mode }))
    write(c, { target: c.name, kind: mode === 'literal' ? 'literal' : 'field', value: '' })
  }

  return (
    <section aria-labelledby={`${uid}-t`} className="space-y-3">
      <div>
        <h3 id={`${uid}-t`} className="text-base font-semibold">
          {t('inmap.title')}
        </h3>
        <p className={cx.muted}>{t('inmap.hint')}</p>
        {fields.length === 0 ? <p className={cx.muted}>{t('inmap.noFields')}</p> : null}
      </div>

      <ul className="space-y-2">
        {target.columns.map((c) => {
          const r = rowOf(c)
          const mode = modeOf(c)
          const suggestion = mode === 'unmapped' ? suggestSource(c, fields) : undefined
          const name = c.label ? `${c.label} (${c.name})` : c.name
          return (
            <li key={c.name} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto_1fr]" data-column={c.name}>
              <div className="text-sm">
                <span className="font-medium">{name}</span>
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {c.type ? <Chip>{c.type}</Chip> : null}
                  {c.required ? <Chip>{t('inmap.required')}</Chip> : null}
                  {c.unique ? <Chip>{t('inmap.unique')}</Chip> : null}
                  {c.ref ? <Chip>{t('inmap.ref', { ref: c.ref })}</Chip> : null}
                </span>
              </div>
              <select aria-label={`${t('inmap.source')} · ${c.name}`} className={cx.input} value={mode} onChange={(e) => setMode(c, e.target.value as Mode)}>
                <option value="unmapped">{t('inmap.unmapped')}</option>
                <option value="field">{t('mapping.fromField')}</option>
                <option value="literal">{t('mapping.fixed')}</option>
              </select>
              <div className="space-y-1">
                {mode === 'field' ? (
                  fields.length > 0 ? (
                    <select
                      aria-label={`${t('mapping.fromField')} · ${c.name}`}
                      className={cx.input}
                      value={r.kind === 'field' ? r.value : ''}
                      onChange={(e) => write(c, { target: c.name, kind: 'field', value: e.target.value })}
                    >
                      <option value="">{t('mapping.pickField')}</option>
                      {fields.map((f) => (
                        <option key={f.path} value={f.path}>
                          {f.path} ({f.type})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={`${t('mapping.fromField')} · ${c.name}`}
                      className={cx.input}
                      value={r.value}
                      onChange={(e) => write(c, { target: c.name, kind: 'field', value: e.target.value })}
                    />
                  )
                ) : null}
                {mode === 'literal' ? (
                  c.options && c.options.length > 0 ? (
                    <select
                      aria-label={`${t('mapping.fixed')} · ${c.name}`}
                      className={cx.input}
                      value={r.value}
                      onChange={(e) => write(c, { target: c.name, kind: 'literal', value: e.target.value })}
                    >
                      <option value="">{t('inmap.pickOption')}</option>
                      {c.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label ?? o.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={`${t('mapping.fixed')} · ${c.name}`}
                      className={cx.input}
                      value={r.value}
                      onChange={(e) => write(c, { target: c.name, kind: 'literal', value: e.target.value })}
                    />
                  )
                ) : null}
                {suggestion ? (
                  <p className={cx.muted}>
                    {t('inmap.suggestion', { field: suggestion })}{' '}
                    <button
                      type="button"
                      className="underline"
                      aria-label={`${t('inmap.useSuggestion', { field: suggestion })} · ${c.name}`}
                      onClick={() => {
                        setChosen((s) => ({ ...s, [c.name]: 'field' }))
                        write(c, { target: c.name, kind: 'field', value: suggestion })
                      }}
                    >
                      {t('inmap.useSuggestion', { field: suggestion })}
                    </button>
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
        {extras.map((r) => (
          <li key={r.target} className="flex items-center justify-between gap-2 rounded-md border border-destructive p-2" data-column={r.target}>
            <span role="alert" className={cx.error}>
              {t('inmap.notAllowed', { column: r.target })}
            </span>
            <button type="button" className={cx.button} aria-label={`${t('common.remove')} · ${r.target}`} onClick={() => onChange(rows.filter((x) => x.target !== r.target))}>
              {t('common.remove')}
            </button>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <p role="alert" className={cx.error} data-testid="missing-required">
          {t('inmap.missingRequired', { columns: missing.join(', ') })}
        </p>
      ) : null}

      <div className={cx.card}>
        <label htmlFor={`${uid}-s`} className={cx.label}>
          {t('inmap.sample')}
        </label>
        <textarea
          id={`${uid}-s`}
          className={`${cx.input} font-mono`}
          rows={5}
          value={sampleText}
          aria-describedby={`${uid}-sh`}
          aria-invalid={parsed.ok ? undefined : true}
          onChange={(e) => setSampleText(e.target.value)}
        />
        <p id={`${uid}-sh`} className={cx.muted}>
          {t('inmap.sampleHint')}
        </p>
        {!parsed.ok ? (
          <p role="alert" className={cx.error}>
            {t('inmap.sampleInvalid', { message: parsed.error })}
          </p>
        ) : null}
      </div>

      <div className={cx.card}>
        <h4 className="mb-2 text-sm font-semibold">{t('inmap.preview')}</h4>
        {mapped.length === 0 ? <p className={cx.muted}>{t('inmap.previewEmpty')}</p> : null}
        <pre aria-label={t('inmap.preview')} className="overflow-auto rounded bg-muted p-3 text-xs" data-testid="record-preview">
          {JSON.stringify(record, null, 2)}
        </pre>
        {mapped.length > 0 ? (
          issues.length === 0 ? (
            <p className={cx.muted}>{t('inmap.noIssues')}</p>
          ) : (
            <ul className={cx.error} data-testid="record-issues">
              {issues.map((i) => (
                <li key={`${i.column}-${i.code}`}>
                  {i.code === 'missing'
                    ? t('inmap.issueMissing', { column: i.column })
                    : i.code === 'type'
                      ? t('inmap.issueType', { column: i.column, expected: i.expected ?? '' })
                      : t('inmap.issueOption', { column: i.column })}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1 text-xs">{children}</span>
}
