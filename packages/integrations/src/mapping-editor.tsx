import * as React from 'react'
import type { TFunction } from './i18n'
import { buildSamplePayload, flattenSchemaFields, previewBody } from './schema'
import { InboundMappingEditor, type InboundMappingEditorProps } from './inbound-mapping'
import type { CatalogEvent, MappingRow } from './types'
import { cx } from './ui'

export interface OutboundMappingEditorProps {
  direction?: 'out'
  /** Selected catalog events; the first one feeds the source fields. */
  events: CatalogEvent[]
  rows: MappingRow[]
  onChange: (rows: MappingRow[]) => void
  t: TFunction
}

/**
 * Visual mapping editor: each row sends an event field (picked from the
 * payload schema) or a fixed text to a destination field. A live preview shows
 * the body built from a sample event. No JSON editing here.
 */
/** `direction: 'in'` maps an event onto the writable columns of an `IngestTarget`. */
export type MappingEditorProps = OutboundMappingEditorProps | ({ direction: 'in' } & InboundMappingEditorProps)

export function MappingEditor(props: MappingEditorProps) {
  return props.direction === 'in' ? <InboundMappingEditor {...props} /> : <OutboundMappingEditor {...props} />
}

function OutboundMappingEditor({ events, rows, onChange, t }: OutboundMappingEditorProps) {
  const [previewName, setPreviewName] = React.useState<string>('')
  const active = events.find((e) => e.name === previewName) ?? events[0]
  const fields = React.useMemo(() => {
    const seen = new Map<string, ReturnType<typeof flattenSchemaFields>[number]>()
    for (const ev of events) for (const f of flattenSchemaFields(ev.payload_schema)) if (!seen.has(f.path)) seen.set(f.path, f)
    return [...seen.values()]
  }, [events])
  const sample = React.useMemo(() => buildSamplePayload(active?.payload_schema), [active])
  const body = React.useMemo(() => previewBody(rows, sample, active?.name ?? ''), [rows, sample, active])
  const listId = React.useId()

  const update = (i: number, patch: Partial<MappingRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <section aria-labelledby={`${listId}-t`} className="space-y-3">
      <div>
        <h3 id={`${listId}-t`} className="text-base font-semibold">
          {t('mapping.title')}
        </h3>
        <p className={cx.muted}>{t('mapping.hint')}</p>
        {events.length > 0 && fields.length === 0 ? <p className={cx.muted}>{t('mapping.noSchema')}</p> : null}
      </div>
      {rows.length === 0 ? <p className={cx.muted}>{t('mapping.empty')}</p> : null}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <input
              aria-label={t('mapping.target')}
              className={cx.input}
              value={r.target}
              onChange={(e) => update(i, { target: e.target.value })}
            />
            <select
              aria-label={t('mapping.source')}
              className={cx.input}
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as MappingRow['kind'], value: '' })}
            >
              <option value="field">{t('mapping.fromField')}</option>
              <option value="literal">{t('mapping.fixed')}</option>
            </select>
            {r.kind === 'field' && fields.length > 0 ? (
              <select
                aria-label={t('mapping.fromField')}
                className={cx.input}
                value={r.value}
                onChange={(e) => update(i, { value: e.target.value })}
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
                aria-label={r.kind === 'field' ? t('mapping.fromField') : t('mapping.fixed')}
                className={cx.input}
                value={r.value}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            )}
            <button type="button" className={cx.button} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
              {t('common.remove')}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={cx.button} onClick={() => onChange([...rows, { target: '', kind: 'field', value: '' }])}>
        {t('mapping.add')}
      </button>

      <div className={cx.card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">{t('mapping.preview')}</h4>
          {events.length > 1 ? (
            <select
              aria-label={t('mapping.previewEvent', { event: '' })}
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={active?.name ?? ''}
              onChange={(e) => setPreviewName(e.target.value)}
            >
              {events.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : active ? (
            <span className={cx.muted}>{t('mapping.previewEvent', { event: active.name })}</span>
          ) : null}
        </div>
        <pre aria-label={t('mapping.preview')} className="overflow-auto rounded bg-muted p-3 text-xs" data-testid="mapping-preview">
          {JSON.stringify(body, null, 2)}
        </pre>
      </div>
    </section>
  )
}
