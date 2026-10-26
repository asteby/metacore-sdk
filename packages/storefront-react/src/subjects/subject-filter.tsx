/**
 * The compatibility filter of a catalog page, and the badge of a product («fits your vehicle»). Presentational: the loader
 * decides what applies (`loadSubjectsContext().active[kind]`) and the page passes `tags_any` (`fitTagsAny`) to the product
 * list; this only says it. Links, not buttons, so it works without JavaScript and keeps the URL shareable.
 */
import type { SubjectKind } from '@asteby/storefront'
import type { ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import { fill, subjectMessages, type DeepPartial, type SubjectMessages } from './messages.js'

export type SubjectFilterClassNames = Partial<Record<'root' | 'label' | 'link' | 'toggle', string>>

export type SubjectFilterProps = {
  kind: SubjectKind
  /** The item that applies, or `null` when the buyer has not chosen one. */
  active: { label: string; fit_key: string } | null
  /** Showing the whole catalog (the buyer asked for it) instead of only what fits. */
  showingAll?: boolean
  /** Where «Change» goes (the garage or the picker). Omit to hide it. */
  changeHref?: string
  /** Where «Choose your …» goes when there is no active item. */
  chooseHref?: string
  /** The same page showing only what fits / everything (e.g. with and without `?todo=1`). */
  onlyFitsHref?: string
  showAllHref?: string
  locale?: string
  messages?: DeepPartial<SubjectMessages>
  classNames?: SubjectFilterClassNames
}

export function SubjectFilter(props: SubjectFilterProps) {
  const { kind, active, showingAll, classNames: cx = {} } = props
  const locale = useResolvedLocale(props.locale)
  const m = subjectMessages(locale, props.messages).filter
  const singular = kind.label.toLowerCase()
  if (!active) {
    return props.chooseHref ? (
      <p className={cx.root} data-sf-subject-filter data-sf-subject-filter-empty>
        <a href={props.chooseHref} className={cx.link}>
          {fill(m.choose, { kind: singular })}
        </a>
      </p>
    ) : null
  }
  return (
    <div className={cx.root} data-sf-subject-filter data-sf-subject-showing={showingAll ? 'all' : 'fits'}>
      <span className={cx.label}>{fill(m.forItem, { name: active.label })}</span>
      {props.changeHref ? (
        <a href={props.changeHref} className={cx.link}>
          {m.change}
        </a>
      ) : null}
      {showingAll && props.onlyFitsHref ? (
        <a href={props.onlyFitsHref} className={cx.toggle ?? cx.link}>
          {m.onlyFits}
        </a>
      ) : null}
      {!showingAll && props.showAllHref ? (
        <a href={props.showAllHref} className={cx.toggle ?? cx.link}>
          {m.showAll}
        </a>
      ) : null}
    </div>
  )
}

export type SubjectFitBadgeProps = {
  kind: SubjectKind
  /** `fitState(product)` of `@asteby/storefront-react/fitment` (the state `withFit` resolved). */
  state: 'fits' | 'universal' | 'no' | 'unknown'
  /** Show the badge for `unknown` too (default: it is hidden: no data, no claim). */
  showUnknown?: boolean
  locale?: string
  messages?: DeepPartial<SubjectMessages>
  className?: string
  children?: ReactNode
}

/** «Fits your vehicle» / «Universal» / «Not for your vehicle». With no compatibility data it says nothing. */
export function SubjectFitBadge(props: SubjectFitBadgeProps) {
  const locale = useResolvedLocale(props.locale)
  const m = subjectMessages(locale, props.messages).fit
  if (props.state === 'unknown' && !props.showUnknown) return null
  return (
    <span className={props.className} data-sf-subject-fit={props.state}>
      {fill(m[props.state], { kind: props.kind.label.toLowerCase() })}
      {props.children}
    </span>
  )
}

