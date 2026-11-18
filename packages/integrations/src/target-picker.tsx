import * as React from 'react'
import type { TFunction } from './i18n'
import { groupTargets, targetBlockedReason, type BlockedReason } from './target-utils'
import type { IngestTarget } from './types'
import { cx } from './ui'

export interface TargetPickerProps {
  /** What the server declares writable (`api.listTargets()`); nothing else is offered. */
  targets: IngestTarget[]
  /** Selected `model` (`<addon>.<entity>`), or '' for none. */
  value: string
  onChange: (model: string, target: IngestTarget) => void
  /** Block kind the target is for (`record.upsert`, ...): drives the disabled state. */
  kind?: string
  t: TFunction
}

function reasonText(r: BlockedReason, t: TFunction): string {
  return r.code === 'noPermission'
    ? t('targets.noPermission', { ops: r.ops.map((o) => t(`targets.op.${o}`)).join(', ') })
    : t('targets.noAction', { action: r.kind })
}

/**
 * Searchable listbox of the models the server lets an inbound chain write,
 * grouped by addon. Targets the user cannot use for `kind` stay in the list,
 * disabled, with the reason as description. Keyboard: the search box keeps
 * focus; ArrowUp/Down/Home/End move the active option, Enter picks it,
 * Escape clears the search (`aria-activedescendant`).
 */
export function TargetPicker({ targets, value, onChange, kind, t }: TargetPickerProps) {
  const uid = React.useId()
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const groups = React.useMemo(() => groupTargets(targets, query), [targets, query])
  const flat = React.useMemo(() => groups.flatMap((g) => g.targets), [groups])
  const optId = (m: string) => `${uid}-opt-${m}`
  const known = targets.some((x) => x.model === value)
  const activeIdx = Math.min(active, Math.max(flat.length - 1, 0))

  const pick = (tg: IngestTarget) => {
    if (targetBlockedReason(tg, kind)) return
    onChange(tg.model, tg)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query !== '') {
        e.preventDefault()
        setQuery('')
      }
      return
    }
    if (flat.length === 0) return
    const go = (i: number) => {
      e.preventDefault()
      setActive(Math.max(0, Math.min(flat.length - 1, i)))
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(activeIdx + 1)
      case 'ArrowUp':
        return go(activeIdx - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(flat.length - 1)
      case 'Enter': {
        e.preventDefault() // never submit the surrounding form
        const tg = flat[activeIdx]
        if (tg) pick(tg)
        return
      }
    }
  }

  return (
    <div className="space-y-2" data-testid="target-picker">
      <div>
        <label htmlFor={`${uid}-q`} className={cx.label}>
          {t('targets.search')}
        </label>
        <input
          id={`${uid}-q`}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${uid}-list`}
          aria-autocomplete="list"
          aria-activedescendant={flat[activeIdx] ? optId(flat[activeIdx]!.model) : undefined}
          className={cx.input}
          value={query}
          placeholder={t('targets.searchPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className={cx.muted} aria-live="polite">
        {value ? t('targets.selected', { model: value }) : ' '}
      </p>
      {value && !known ? (
        <p role="alert" className={cx.error}>
          {t('targets.unknown', { model: value })}
        </p>
      ) : null}
      {targets.length === 0 ? <p className={cx.muted}>{t('targets.empty')}</p> : null}
      {targets.length > 0 && groups.length === 0 ? <p className={cx.muted}>{t('targets.none')}</p> : null}
      <div id={`${uid}-list`} role="listbox" aria-label={t('targets.legend')} className="space-y-2">
        {groups.map((g) => (
          <div key={g.addon} role="group" aria-labelledby={`${uid}-g-${g.addon}`} className="rounded-md border p-2" data-addon={g.addon}>
            <div id={`${uid}-g-${g.addon}`} className="px-1 text-sm font-semibold">
              {g.addonName}
            </div>
            {g.targets.map((tg) => {
              const why = targetBlockedReason(tg, kind)
              const selected = tg.model === value
              const isActive = flat[activeIdx]?.model === tg.model
              return (
                <div
                  key={tg.model}
                  id={optId(tg.model)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={why ? true : undefined}
                  aria-labelledby={`${optId(tg.model)}-n`}
                  aria-describedby={`${optId(tg.model)}-d`}
                  data-model={tg.model}
                  data-active={isActive ? 'true' : undefined}
                  className={`flex cursor-pointer flex-wrap items-center gap-2 rounded px-2 py-1 text-sm ${why ? 'cursor-not-allowed opacity-60' : ''} ${selected ? 'bg-muted font-medium' : ''} ${isActive ? 'ring-2 ring-ring' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setActive(flat.findIndex((x) => x.model === tg.model))
                    pick(tg)
                  }}
                >
                  <span id={`${optId(tg.model)}-n`}>
                    {tg.label || tg.model} <code>{tg.model}</code>
                  </span>
                  <span id={`${optId(tg.model)}-d`} className="flex flex-wrap items-center gap-1">
                    <Badge>{t('targets.columns', { count: tg.columns.length })}</Badge>
                    {tg.soft_delete ? <Badge>{t('targets.softDelete')}</Badge> : null}
                    {tg.scope.branch ? <Badge>{t('targets.scopeBranch')}</Badge> : null}
                    {tg.scope.entity ? <Badge>{t('targets.scopeEntity')}</Badge> : null}
                    {why ? <span className={cx.error}>{reasonText(why, t)}</span> : null}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-muted px-1 text-xs">{children}</span>
}
