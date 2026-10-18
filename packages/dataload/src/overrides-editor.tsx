import { useId, useMemo, useRef, useState } from 'react'
import { Eye, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@asteby/metacore-ui'
import { apiErrorMessage, type DataloadApi } from './api'
import { useDataloadUi, type DataloadUiProps } from './context'
import { PlanReview } from './plan-review'
import type { DataloadT } from './messages'
import { blockingIssues, compactOverrides, parseDefault, resolveProfile, splitList, validateOverrides, type OverrideIssue } from './overrides'
import { CLEAN_RULES, type CleanRule, type DataloadOverrides, type DataloadPlan, type DataloadProfile, type DataloadSourceInput } from './types'
import { areaCls, checkCls, fieldCls } from './ui'

export interface OverridesEditorProps extends DataloadUiProps {
  /** Base profile the overrides apply to. */
  profile: DataloadProfile
  /** Initial overrides (read on mount; key the editor by profile to reset it). */
  value?: DataloadOverrides
  /** Every edit, already compacted. An empty edit is `{}` (explicitly "no overrides"), never `undefined`. */
  onChange?: (o: DataloadOverrides) => void
  /** Needed for the plan preview and to save. */
  api?: DataloadApi
  /** With a source, "preview plan" runs a dry-run with the edited overrides (writes nothing). */
  source?: DataloadSourceInput
  /** Organization of the session, to flag overrides that belong to another one. */
  org?: string
  disabled?: boolean
  /** Inside another card (the launcher): no card or title of its own. */
  embedded?: boolean
  className?: string
}

type StdRule = (typeof CLEAN_RULES)[number]
const DROP = 'drop_lines:'

interface Draft {
  ignore: string
  rename: Record<string, string>
  cleanAdd: Record<string, string>
  drop: Set<string>
  defaults: { field: string; value: string }[]
  cleanReplace: boolean
  rules: Set<StdRule>
  dropLines: string
}

const show = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

function toDraft(o: DataloadOverrides | undefined, profile: DataloadProfile): Draft {
  const clean = o?.clean
  const base = clean ?? profile.clean ?? []
  return {
    ignore: (o?.ignoreHeaders ?? []).join('\n'),
    rename: Object.fromEntries(Object.entries(o?.rename ?? {}).map(([k, v]) => [k, v.join(', ')])),
    cleanAdd: Object.fromEntries(Object.entries(o?.cleanAdd ?? {}).map(([k, v]) => [k, v.join(', ')])),
    drop: new Set(o?.drop ?? []),
    defaults: Object.entries(o?.defaults ?? {}).map(([field, v]) => ({ field, value: show(v) })),
    cleanReplace: !!clean,
    rules: new Set(base.filter((r): r is StdRule => !r.startsWith(DROP))),
    dropLines: base.filter((r) => r.startsWith(DROP)).map((r) => r.slice(DROP.length)).join('\n'),
  }
}

function fromDraft(d: Draft, profile: DataloadProfile, keep: DataloadOverrides | undefined): DataloadOverrides | undefined {
  const field = (t: string) => profile.fields.find((f) => f.target === t)
  const clean: CleanRule[] | undefined = d.cleanReplace
    ? [...CLEAN_RULES.filter((r) => d.rules.has(r)), ...splitList(d.dropLines, /\n/).map((r) => `${DROP}${r}` as CleanRule)]
    : undefined
  return compactOverrides({
    ...(keep?.org ? { org: keep.org } : {}),
    ignoreHeaders: splitList(d.ignore, /\n/),
    rename: Object.fromEntries(Object.entries(d.rename).map(([k, v]) => [k, splitList(v)])),
    cleanAdd: Object.fromEntries(Object.entries(d.cleanAdd).map(([k, v]) => [k, splitList(v) as CleanRule[]])),
    drop: [...d.drop],
    defaults: Object.fromEntries(d.defaults.filter((x) => x.field.trim()).map((x) => [x.field.trim(), parseDefault(x.value, field(x.field.trim()))])),
    ...(clean ? { clean } : {}),
    // Not edited here, kept as they came (full field replacements, value translations).
    ...(keep?.fields ? { fields: keep.fields } : {}),
    ...(keep?.valuesAdd ? { valuesAdd: keep.valuesAdd } : {}),
  })
}

function issueText(i: OverrideIssue, t: DataloadT): string {
  const section = 'section' in i ? t(`dataload.overrides.section.${i.section}`) : ''
  switch (i.code) {
    case 'unknown_target':
      return t('dataload.overrides.issue.unknown_target', { section, target: i.target })
    case 'unknown_drop':
      return t('dataload.overrides.issue.unknown_drop', { target: i.target })
    case 'drop_key':
      return t('dataload.overrides.issue.drop_key', { target: i.target })
    case 'bad_rule':
      return t('dataload.overrides.issue.bad_rule', { section, rule: i.rule })
    case 'bad_regex':
      return t('dataload.overrides.issue.bad_regex', { section, rule: i.rule })
    case 'org_mismatch':
      return t('dataload.overrides.issue.org_mismatch')
    case 'empty_header':
      return t('dataload.overrides.issue.empty_header', { section })
    case 'empty_default':
      return t('dataload.overrides.issue.empty_default')
  }
}

/**
 * Editor of one organization's overrides over a base profile: ignored columns,
 * extra headers per field, removed fields, default values and cleaning (global
 * and per field). Checked against the kernel rules as you type, with the resolved
 * profile summary and an optional dry-run preview of the plan; saved with the
 * profile (`saveProfile`), never in code.
 */
export function OverridesEditor({ profile, value, onChange, api, source, org, disabled, embedded, className, ...uiProps }: OverridesEditorProps) {
  const ui = useDataloadUi(uiProps)
  const { t, caps, notify, i18n } = ui
  const initial = useRef(value)
  const [draft, setDraft] = useState<Draft>(() => toDraft(value, profile))
  const [preview, setPreview] = useState<DataloadPlan | undefined>()
  const [previewError, setPreviewError] = useState<string | undefined>()
  const [busy, setBusy] = useState<'preview' | 'save' | undefined>()
  const ids = { ignore: useId(), dropLines: useId(), issues: useId(), title: useId(), list: useId() }
  const readOnly = disabled || !caps.editOverrides

  const overrides = useMemo(() => fromDraft(draft, profile, initial.current), [draft, profile])
  const issues = useMemo(() => validateOverrides(profile, overrides, org), [profile, overrides, org])
  const blocking = blockingIssues(issues)
  const resolved = useMemo(() => resolveProfile(profile, overrides), [profile, overrides])
  const kept = (initial.current?.fields?.length ?? 0) + Object.keys(initial.current?.valuesAdd ?? {}).length

  const edit = (fn: (d: Draft) => Draft) => {
    if (readOnly) return
    const next = fn(draft)
    setDraft(next)
    onChange?.(fromDraft(next, profile, initial.current) ?? {})
    setPreview(undefined)
  }

  const runPreview = async () => {
    if (!api || !source || blocking.length) return
    setBusy('preview')
    setPreviewError(undefined)
    try {
      const r = await api.dryRun({ profile: profile.name, overrides: overrides ?? {}, source })
      setPreview(r.plan)
    } catch (e) {
      setPreviewError(apiErrorMessage(e, t('dataload.overrides.preview.error')))
    } finally {
      setBusy(undefined)
    }
  }

  const save = async () => {
    if (!api || blocking.length) return
    setBusy('save')
    try {
      await api.saveProfile({ profile, ...(overrides ? { overrides } : {}) })
      notify?.success(t('dataload.overrides.saved'))
    } catch (e) {
      notify?.error(apiErrorMessage(e, t('dataload.overrides.save.error')))
    } finally {
      setBusy(undefined)
    }
  }

  const reset = () => {
    setDraft(toDraft(initial.current, profile))
    onChange?.(initial.current ?? {})
    setPreview(undefined)
  }

  const targets = profile.fields.map((f) => f.target)
  const profileRules = (profile.clean ?? []).join(', ') || t('dataload.overrides.clean.none')

  const body = (
    <div className={cn('flex flex-col gap-4', embedded && className)}>
      {readOnly && !disabled ? <p className='m-0 text-sm text-muted-foreground'>{t('dataload.overrides.read_only')}</p> : null}

      <div className='flex flex-col gap-1.5'>
        <label htmlFor={ids.ignore} className='text-sm font-medium'>{t('dataload.overrides.ignore')}</label>
        <textarea
          id={ids.ignore}
          className={areaCls}
          rows={3}
          value={draft.ignore}
          disabled={readOnly}
          onChange={(e) => edit((d) => ({ ...d, ignore: e.target.value }))}
          aria-describedby={`${ids.ignore}-hint`}
        />
        <p id={`${ids.ignore}-hint`} className='m-0 text-xs text-muted-foreground'>{t('dataload.overrides.ignore.hint')}</p>
      </div>

      <div className='flex flex-col gap-1.5'>
        <h3 className='m-0 text-sm font-medium'>{t('dataload.overrides.fields')}</h3>
        <div className='max-w-full overflow-x-auto rounded-lg border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50' role='region' aria-label={t('dataload.overrides.fields')} tabIndex={0}>
          <table className='w-full min-w-[36rem] border-collapse text-sm'>
            <caption className='sr-only'>{t('dataload.overrides.fields')}</caption>
            <thead className='bg-muted/50 text-left text-xs text-muted-foreground'>
              <tr>
                <th scope='col' className='p-2 font-medium'>{t('dataload.overrides.col.target')}</th>
                <th scope='col' className='p-2 font-medium'>{t('dataload.overrides.col.from')}</th>
                <th scope='col' className='p-2 font-medium'>{t('dataload.overrides.col.rename')}</th>
                <th scope='col' className='p-2 font-medium'>{t('dataload.overrides.col.clean_add')}</th>
                <th scope='col' className='p-2 font-medium'>{t('dataload.overrides.col.drop')}</th>
              </tr>
            </thead>
            <tbody>
              {profile.fields.map((f) => {
                const isKey = profile.key.includes(f.target)
                const dropped = draft.drop.has(f.target)
                return (
                  <tr key={f.target} className={cn('border-t align-top', dropped && 'opacity-60')}>
                    <th scope='row' className='p-2 text-left font-medium break-all'>
                      {f.target}
                      {isKey ? <Badge variant='outline' className='ml-1'>{t('dataload.overrides.key_field')}</Badge> : null}
                    </th>
                    <td className='max-w-[12rem] break-words p-2 text-xs text-muted-foreground'>{f.from.join(', ') || t('dataload.empty_value')}</td>
                    <td className='p-2'>
                      <input
                        className={fieldCls}
                        aria-label={t('dataload.overrides.rename_for', { field: f.target })}
                        value={draft.rename[f.target] ?? ''}
                        disabled={readOnly || dropped}
                        onChange={(e) => edit((d) => ({ ...d, rename: { ...d.rename, [f.target]: e.target.value } }))}
                      />
                    </td>
                    <td className='p-2'>
                      <input
                        className={fieldCls}
                        list={ids.list}
                        aria-label={t('dataload.overrides.clean_add_for', { field: f.target })}
                        value={draft.cleanAdd[f.target] ?? ''}
                        disabled={readOnly || dropped}
                        onChange={(e) => edit((d) => ({ ...d, cleanAdd: { ...d.cleanAdd, [f.target]: e.target.value } }))}
                      />
                    </td>
                    <td className='p-2'>
                      <input
                        type='checkbox'
                        className={checkCls}
                        aria-label={t('dataload.overrides.drop_for', { field: f.target })}
                        checked={dropped}
                        disabled={readOnly || isKey}
                        onChange={() =>
                          edit((d) => {
                            const drop = new Set(d.drop)
                            if (drop.has(f.target)) drop.delete(f.target)
                            else drop.add(f.target)
                            return { ...d, drop }
                          })
                        }
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <datalist id={ids.list}>
          {CLEAN_RULES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>

      <fieldset className='m-0 flex min-w-0 flex-col gap-2 border-0 p-0'>
        <legend className='mb-1.5 p-0 text-sm font-medium'>{t('dataload.overrides.defaults')}</legend>
        <datalist id={`${ids.list}-targets`}>
          {targets.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
        {draft.defaults.map((row, i) => (
          <div key={i} className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]'>
            <label className='flex min-w-0 flex-col gap-1 text-xs'>
              {t('dataload.overrides.defaults.field')}
              <input
                className={fieldCls}
                list={`${ids.list}-targets`}
                value={row.field}
                disabled={readOnly}
                onChange={(e) => edit((d) => ({ ...d, defaults: d.defaults.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) }))}
              />
            </label>
            <label className='flex min-w-0 flex-col gap-1 text-xs'>
              {t('dataload.overrides.defaults.value')}
              <input
                className={fieldCls}
                value={row.value}
                disabled={readOnly}
                onChange={(e) => edit((d) => ({ ...d, defaults: d.defaults.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))}
              />
            </label>
            <Button
              variant='ghost'
              size='sm'
              className='self-end'
              disabled={readOnly}
              aria-label={t('dataload.overrides.defaults.remove', { field: row.field || String(i + 1) })}
              onClick={() => edit((d) => ({ ...d, defaults: d.defaults.filter((_, j) => j !== i) }))}
            >
              <Trash2 className='size-4' aria-hidden />
            </Button>
          </div>
        ))}
        <Button variant='outline' size='sm' className='self-start' disabled={readOnly} onClick={() => edit((d) => ({ ...d, defaults: [...d.defaults, { field: '', value: '' }] }))}>
          <Plus className='size-4' aria-hidden />
          {t('dataload.overrides.defaults.add')}
        </Button>
      </fieldset>

      <fieldset className='m-0 flex min-w-0 flex-col gap-2 border-0 p-0'>
        <legend className='mb-1.5 p-0 text-sm font-medium'>{t('dataload.overrides.clean')}</legend>
        <p className='m-0 text-xs text-muted-foreground'>{t('dataload.overrides.clean.profile', { rules: profileRules })}</p>
        <label className='flex items-start gap-2 text-sm'>
          <input type='checkbox' className={checkCls} checked={draft.cleanReplace} disabled={readOnly} onChange={(e) => edit((d) => ({ ...d, cleanReplace: e.target.checked }))} />
          {t('dataload.overrides.clean.replace')}
        </label>
        {draft.cleanReplace ? (
          <>
            <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
              {CLEAN_RULES.map((r) => (
                <label key={r} className='flex items-start gap-2 text-sm'>
                  <input
                    type='checkbox'
                    className={checkCls}
                    checked={draft.rules.has(r)}
                    disabled={readOnly}
                    onChange={() =>
                      edit((d) => {
                        const rules = new Set(d.rules)
                        if (rules.has(r)) rules.delete(r)
                        else rules.add(r)
                        return { ...d, rules }
                      })
                    }
                  />
                  <span className='min-w-0'>
                    {t(`dataload.overrides.rule.${r}`)} <code className='text-xs text-muted-foreground'>{r}</code>
                  </span>
                </label>
              ))}
            </div>
            <label htmlFor={ids.dropLines} className='text-sm'>{t('dataload.overrides.clean.drop_lines')}</label>
            <textarea id={ids.dropLines} className={cn(areaCls, 'font-mono')} rows={2} value={draft.dropLines} disabled={readOnly} onChange={(e) => edit((d) => ({ ...d, dropLines: e.target.value }))} />
          </>
        ) : null}
      </fieldset>

      {kept > 0 ? <p className='m-0 text-xs text-muted-foreground'>{t('dataload.overrides.kept', { n: kept })}</p> : null}

      <div id={ids.issues} aria-live='polite' className='flex flex-col gap-1'>
        {issues.length > 0 ? (
          <>
            {blocking.length > 0 ? <p className='m-0 text-sm font-medium text-destructive'>{t('dataload.overrides.issues')}</p> : null}
            <ul className='m-0 flex list-none flex-col gap-1 p-0 text-sm'>
              {issues.map((i, n) => (
                <li key={n} className={cn('break-words', 'warning' in i ? 'text-muted-foreground' : 'text-destructive')}>{issueText(i, t)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className='m-0 text-sm text-muted-foreground'>{t('dataload.overrides.valid')}</p>
        )}
        <p className='m-0 text-xs text-muted-foreground'>
          {t('dataload.overrides.resolved', { fields: resolved.fields.length, ignored: resolved.ignoreHeaders?.length ?? 0, defaults: Object.keys(resolved.defaults ?? {}).length })}
        </p>
      </div>

      <div className='flex flex-wrap gap-2'>
        {api && !embedded ? (
          <Button variant='outline' size='sm' disabled={!source || blocking.length > 0 || !!busy} onClick={runPreview} aria-describedby={!source ? `${ids.issues}-src` : undefined}>
            <Eye className='size-4' aria-hidden />
            {busy === 'preview' ? t('dataload.overrides.previewing') : t('dataload.overrides.preview')}
          </Button>
        ) : null}
        {api && caps.editOverrides ? (
          <Button size='sm' disabled={readOnly || blocking.length > 0 || !!busy} onClick={save}>
            <Save className='size-4' aria-hidden />
            {busy === 'save' ? t('dataload.overrides.saving') : t('dataload.overrides.save')}
          </Button>
        ) : null}
        {!readOnly ? (
          <Button variant='ghost' size='sm' disabled={!!busy} onClick={reset}>
            <RotateCcw className='size-4' aria-hidden />
            {t('dataload.overrides.reset')}
          </Button>
        ) : null}
      </div>
      {api && !embedded && !source ? <p id={`${ids.issues}-src`} className='m-0 text-xs text-muted-foreground'>{t('dataload.overrides.preview.need_source')}</p> : null}
      {previewError ? <p role='alert' className='m-0 break-words text-sm text-destructive'>{previewError}</p> : null}
      {preview ? <PlanReview plan={preview} {...i18n} /> : null}
    </div>
  )

  if (embedded) return body
  return (
    <Card className={cn('py-4', className)} aria-labelledby={ids.title}>
      <CardHeader className='px-4'>
        <CardTitle className='text-base'><h2 id={ids.title} className='m-0 text-base font-semibold'>{t('dataload.overrides.title')}</h2></CardTitle>
        <CardDescription>{t('dataload.overrides.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className='px-4'>{body}</CardContent>
    </Card>
  )
}
