import * as React from 'react'
import type { TFunction } from './i18n'
import { groupEvents } from './schema'
import type { CatalogEvent } from './types'
import { cx } from './ui'

export interface EventPickerProps {
  events: CatalogEvent[]
  selected: string[]
  onChange: (next: string[]) => void
  t: TFunction
}

/**
 * Checklist of catalog events grouped by addon, with search. Each group is a
 * fieldset with a "select all" box (indeterminate when partly selected).
 * Selection is kept even for events hidden by the search.
 */
export function EventPicker({ events, selected, onChange, t }: EventPickerProps) {
  const [query, setQuery] = React.useState('')
  const searchId = React.useId()
  const groups = React.useMemo(() => groupEvents(events, query), [events, query])
  const sel = React.useMemo(() => new Set(selected), [selected])

  const toggle = (name: string) => {
    const next = new Set(sel)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    onChange([...next])
  }
  const toggleGroup = (names: string[], all: boolean) => {
    const next = new Set(sel)
    for (const n of names) all ? next.delete(n) : next.add(n)
    onChange([...next])
  }

  return (
    <fieldset className="space-y-3">
      <legend className={cx.label}>{t('events.legend')}</legend>
      <div>
        <label htmlFor={searchId} className="sr-only">
          {t('events.search')}
        </label>
        <input
          id={searchId}
          type="search"
          className={cx.input}
          value={query}
          placeholder={t('events.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className={cx.muted} aria-live="polite">
        {t('events.selected', { count: selected.length })}
      </p>
      {groups.length === 0 ? <p className={cx.muted}>{t('events.none')}</p> : null}
      {groups.map((g) => {
        const names = g.events.map((e) => e.name)
        const count = names.filter((n) => sel.has(n)).length
        const all = count === names.length
        return (
          <fieldset key={g.addon} className="rounded-md border p-3" data-addon={g.addon}>
            <legend className="px-1 text-sm font-semibold">{g.addonName}</legend>
            <GroupCheckbox
              label={t('events.group', { addon: g.addonName })}
              checked={all}
              indeterminate={count > 0 && !all}
              onChange={() => toggleGroup(names, all)}
            />
            <ul className="mt-2 space-y-1">
              {g.events.map((ev) => (
                <li key={ev.name}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={sel.has(ev.name)} onChange={() => toggle(ev.name)} className="mt-1" />
                    <span>
                      <code>{ev.name}</code>
                      {ev.sensitivity === 'personal' ? (
                        <span className="ml-2 rounded bg-muted px-1 text-xs">{t('events.sensitivity.personal')}</span>
                      ) : null}
                      {ev.description ? <span className={`block ${cx.muted}`}>{ev.description}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )
      })}
    </fieldset>
  )
}

function GroupCheckbox({
  label,
  checked,
  indeterminate,
  onChange,
}: {
  label: string
  checked: boolean
  indeterminate: boolean
  onChange: () => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <label className="flex items-center gap-2 text-sm">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-checked={indeterminate ? 'mixed' : checked} />
      <span>{label}</span>
    </label>
  )
}
