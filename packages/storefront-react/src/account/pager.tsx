/**
 * Previous / Next (or «Load more») for the cursor-paged account lists, and the focus helper that goes with it.
 *
 * Every control is a real link (`<a href>`) to the same page with another cursor, so it works without JavaScript,
 * opens in a new tab, is shareable, and the browser's back / forward buttons move through the list. A router passes
 * `renderLink` to make them client-side navigations (`<Link>`); nothing else changes. The «Showing 11–20 of 300» text
 * is a polite live region: a screen reader hears where it landed after each page. There are no skeletons: while the
 * next page loads the pager is `aria-busy` and keeps its size.
 */
import { nextPageQuery, pageRange, previousPageQuery, type ListQuery, type PageInfo } from '@asteby/storefront'
import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { fill } from './orders-messages.js'
import { useAccountText, type AccountTextProps } from './orders-ui.js'

export type PagerLinkProps = {
  href: string
  rel: 'prev' | 'next' | 'first'
  className: string | undefined
  children: ReactNode
  'aria-label'?: string
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
  'data-sf-pager-link': 'previous' | 'next' | 'first' | 'more'
}

export type PagerClassNames = Partial<Record<'root' | 'status' | 'links' | 'link' | 'disabled' | 'error' | 'retry' | 'note', string>>

export type PagerProps = AccountTextProps & {
  /** The query of the page being shown (`readListQuery`). */
  query: ListQuery
  pageInfo: PageInfo | null | undefined
  /** Nodes on this page. */
  count: number
  /** Total, when the server gave one (`total_count`); then the text says «of 300». */
  total?: number | null | undefined
  /** Page size asked for. */
  first: number
  /** Link to a page: `(q) => listHref('/cuenta/pedidos', q)`. */
  hrefFor: (query: ListQuery) => string
  /** `pages` (default): Previous + Next. `more`: only «Load more» (the next page), for a list that grows. */
  variant?: 'pages' | 'more'
  /** `loading`: a navigation is in flight (`aria-busy`, the links wait). `error`: the page could not load (a retry link, not a dead end). */
  status?: 'ready' | 'loading' | 'error'
  /** Where «Try again» goes (default: this very page). */
  retryHref?: string
  /** Replaces a plain `<a>` (e.g. React Router's `<Link>`). */
  renderLink?: (props: PagerLinkProps) => ReactNode
  /** «Load more» without leaving the page: called instead of following the link (the link stays for no-JS). */
  onLoadMore?: (next: ListQuery) => void
  /** What this pager moves through, for its accessible name («Paginación de pedidos»). */
  label?: string
  /** The page is short because a filter kept looking: say so (the filtered scan returns short pages with a next link). */
  filtered?: boolean
  classNames?: PagerClassNames
}

export function Pager({ query, pageInfo, count, total, first, hrefFor, variant = 'pages', status = 'ready', retryHref, renderLink, onLoadMore, label, filtered = false, classNames: cx = {}, ...text }: PagerProps) {
  const { m } = useAccountText(text)
  const state = { query, pageInfo, count, first }
  const next = nextPageQuery(state)
  const previous = variant === 'more' ? null : previousPageQuery(state)
  const range = pageRange({ ...state, total })
  const loading = status === 'loading'
  const showing = range
    ? range.total !== null && range.total >= range.to
      ? fill(m['pager.showing'], { from: range.from, to: range.to, total: range.total })
      : fill(m['pager.showingNoTotal'], { from: range.from, to: range.to })
    : typeof total === 'number' && total > 0
      ? fill(m['pager.total'], { total })
      : ''
  const link = (kind: 'previous' | 'next' | 'first' | 'more', q: ListQuery, text: string, rel: PagerLinkProps['rel'], handler?: PagerLinkProps['onClick'], href?: string) => {
    const props: PagerLinkProps = { href: href ?? hrefFor(q), rel, className: cx.link, children: text, 'data-sf-pager-link': kind, ...(handler ? { onClick: handler } : {}) }
    return renderLink ? (
      renderLink(props)
    ) : (
      <a key={kind} {...props}>
        {text}
      </a>
    )
  }
  const disabled = (kind: 'previous' | 'next', text: string) => (
    <span key={kind} className={cx.disabled} aria-disabled="true" data-sf-pager-disabled={kind}>
      {text}
    </span>
  )
  const more = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!next || !onLoadMore || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onLoadMore(next)
  }
  const nothingToMove = !next && !previous
  const name = label ? fill(m['pager.labelOf'], { list: label }) : m['pager.label']
  return (
    <nav className={cx.root} aria-label={name} aria-busy={loading || undefined} data-sf-pager data-sf-pager-variant={variant} data-state={status}>
      <p className={cx.status} role="status" aria-live="polite" aria-atomic="true" data-sf-pager-status>
        {loading ? m['pager.loading'] : showing}
      </p>
      {status === 'error' ? (
        <p className={cx.error} role="alert" data-sf-pager-error>
          {m['pager.error']} {link('first', query, m['pager.retry'], 'first', undefined, retryHref)}
        </p>
      ) : null}
      {filtered && next && count < first ? (
        <p className={cx.note} data-sf-pager-note>
          {m['pager.keepLooking']}
        </p>
      ) : null}
      {nothingToMove ? null : (
        <div className={cx.links} data-sf-pager-links>
          {variant === 'more' ? (
            next ? (
              link('more', next, loading ? m['pager.loading'] : m['pager.more'], 'next', more)
            ) : null
          ) : (
            <>
              {previous ? link('previous', previous, m['pager.previous'], 'prev') : disabled('previous', m['pager.previous'])}
              {next ? link('next', next, m['pager.next'], 'next') : disabled('next', m['pager.next'])}
            </>
          )}
        </div>
      )}
    </nav>
  )
}

/**
 * Props for the element that holds the list: it receives focus when the buyer moves to another page (client-side), so a
 * keyboard or screen-reader user lands at the top of the new results and not at the end of the old ones. The first
 * render does not steal focus. Spread them on a heading or wrapper: `<div {...useListFocus(key)}>`.
 */
export function useListFocus<T extends HTMLElement = HTMLDivElement>(key: string): { ref: RefObject<T | null>; tabIndex: -1; 'data-sf-list-focus': '' } {
  const ref = useRef<T | null>(null)
  const first = useRef(true)
  const last = useRef(key)
  useEffect(() => {
    if (first.current) {
      first.current = false
      last.current = key
      return
    }
    if (last.current === key) return
    last.current = key
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.top > (typeof window !== 'undefined' ? window.innerHeight : 0) * 0.6) el.scrollIntoView?.({ block: 'start' })
  }, [key])
  return { ref, tabIndex: -1, 'data-sf-list-focus': '' }
}

