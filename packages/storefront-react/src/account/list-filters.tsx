/**
 * The filters of an account list as a plain GET form: status, delivery, invoice, a date range and an order number.
 * The values live in the URL (`?estado=…&desde=…`), so a filtered list is shareable and works with the back button,
 * and it submits without JavaScript. Submitting always starts at the first page (no cursor in the form). Headless:
 * `data-sf-list-filters`, `classNames`, es/en texts.
 */
import { LIST_URL_ES, isFiltered, type ListQuery, type ListUrlNames } from '@asteby/storefront'
import { useId, type ReactNode } from 'react'
import { useAccountText, type AccountTextProps } from './orders-ui.js'

export type ListFilterField = 'status' | 'delivery' | 'invoice' | 'dates' | 'q'

export type ListFiltersClassNames = Partial<Record<'root' | 'summary' | 'fields' | 'field' | 'label' | 'control' | 'hint' | 'actions' | 'apply' | 'clear', string>>

export type ListFiltersProps = AccountTextProps & {
  /** Current values (`readListQuery`). */
  values: ListQuery
  /** Which controls to show. */
  fields: readonly ListFilterField[]
  /** Options of the status select (`{ value, label }`); the first, «all», is added. */
  statusOptions?: readonly { value: string; label: string }[]
  /** The list's own path: where the form submits (default: the current page). */
  action?: string
  /** «Clear filters» goes here (the list without filters). */
  clearHref: string
  names?: ListUrlNames
  /** Accessible name of the form («Filtrar mis pedidos»). */
  label?: string
  /** Extra content inside the form (e.g. a hidden input). */
  children?: ReactNode
  classNames?: ListFiltersClassNames
}

export function ListFilters({ values, fields, statusOptions = [], action, clearHref, names = LIST_URL_ES, label, children, classNames: cx = {}, ...text }: ListFiltersProps) {
  const { m } = useAccountText(text)
  const id = `sf-lf-${useId().replace(/:/g, '')}`
  const has = (f: ListFilterField) => fields.includes(f)
  const field = (key: string, labelText: string, control: ReactNode, hint?: string) => (
    <div className={cx.field} data-sf-filter={key}>
      <label className={cx.label} htmlFor={`${id}-${key}`}>
        {labelText}
      </label>
      {control}
      {hint ? (
        <p className={cx.hint} id={`${id}-${key}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
  const select = (key: string, name: string, current: string, options: readonly { value: string; label: string }[], all: string) => (
    <select className={cx.control} id={`${id}-${key}`} name={name} defaultValue={current}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  return (
    <form className={cx.root} method="get" action={action} role="search" aria-label={label ?? m['filters.label']} data-sf-list-filters data-state={isFiltered(values) ? 'filtered' : 'plain'} key={JSON.stringify(values)}>
      <div className={cx.fields}>
        {has('q')
          ? field(
              'q',
              m['filters.q'],
              <input className={cx.control} id={`${id}-q`} name={names.q} type="search" inputMode="search" maxLength={64} autoComplete="off" defaultValue={values.q ?? ''} aria-describedby={`${id}-q-hint`} />,
              m['filters.qHint'],
            )
          : null}
        {has('status') && statusOptions.length > 0 ? field('status', m['filters.status'], select('status', names.status, values.status ?? '', statusOptions, m['filters.statusAll'])) : null}
        {has('delivery')
          ? field(
              'delivery',
              m['filters.delivery'],
              select(
                'delivery',
                names.delivery,
                values.delivery ? names.deliveryValues[values.delivery] : '',
                [
                  { value: names.deliveryValues.shipping, label: m['filters.shipping'] },
                  { value: names.deliveryValues.pickup, label: m['filters.pickup'] },
                ],
                m['filters.deliveryAll'],
              ),
            )
          : null}
        {has('invoice')
          ? field(
              'invoice',
              m['filters.invoice'],
              select(
                'invoice',
                names.invoice,
                values.invoice === undefined ? '' : values.invoice ? names.invoiceValues.yes : names.invoiceValues.no,
                [
                  { value: names.invoiceValues.yes, label: m['filters.invoiceYes'] },
                  { value: names.invoiceValues.no, label: m['filters.invoiceNo'] },
                ],
                m['filters.invoiceAll'],
              ),
            )
          : null}
        {has('dates') ? (
          <>
            {field('from', m['filters.from'], <input className={cx.control} id={`${id}-from`} name={names.from} type="date" defaultValue={values.from ?? ''} max={values.to || undefined} />)}
            {field('to', m['filters.to'], <input className={cx.control} id={`${id}-to`} name={names.to} type="date" defaultValue={values.to ?? ''} min={values.from || undefined} />)}
          </>
        ) : null}
      </div>
      {children}
      <p className={cx.actions}>
        <button type="submit" className={cx.apply} data-sf-filters-apply>
          {m['filters.apply']}
        </button>
        {isFiltered(values) ? (
          <a href={clearHref} className={cx.clear} data-sf-filters-clear>
            {m['filters.clear']}
          </a>
        ) : null}
      </p>
    </form>
  )
}
