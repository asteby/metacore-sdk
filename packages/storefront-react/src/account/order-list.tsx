/**
 * "Mis pedidos": a list of order cards with status in words, a compact progress, the shipment summary, the total and
 * the one next action. Headless (`data-sf-order*`, `classNames`). Every state of the list is a real state of the
 * component: `loading` (fixed-height skeletons, no layout shift), `error` (recoverable, says purchases are safe),
 * `empty` (useful text and your own call to action) and `ready`.
 */
import type { NextAction, Order } from '@asteby/storefront'
import { formatMoney, nextAction as deriveNextAction, orderProgress as deriveProgress, isTestShipment } from '@asteby/storefront'
import type { ReactNode } from 'react'
import { enumText, fill } from './orders-messages.js'
import { Hidden, Time, plural, useAccountText, type AccountTextProps } from './orders-ui.js'
import { NextActionBar, OrderProgress, OrderStatusBadge, type NextActionBarClassNames, type OrderProgressClassNames } from './progress.js'

export type OrderCardClassNames = Partial<Record<'root' | 'header' | 'number' | 'link' | 'meta' | 'badge' | 'summary' | 'shipment' | 'footer' | 'total' | 'actions', string>> & {
  progress?: OrderProgressClassNames
  action?: NextActionBarClassNames
}

export type OrderCardProps = AccountTextProps & {
  order: Order
  /** Where the order detail lives in your store. The whole card is reached through the number's link. */
  orderHref: (order: Order) => string
  /** Where each next action goes (see `NextActionBar.hrefFor`). */
  actionHref?: (action: NextAction, order: Order) => string | null | undefined
  onAction?: (action: NextAction, order: Order) => void
  /** Heading level of the order number (default 3). */
  headingLevel?: 2 | 3 | 4
  classNames?: OrderCardClassNames
}

export function OrderCard({ order, orderHref, actionHref, onAction, headingLevel = 3, classNames: cx = {}, ...text }: OrderCardProps) {
  const { m, date, locale } = useAccountText(text)
  const Heading = `h${headingLevel}` as 'h3'
  const progress = deriveProgress(order)
  const items = (Array.isArray(order.lines) ? order.lines : []).reduce((n, l) => n + (Number.isFinite(l?.quantity) ? l.quantity : 0), 0)
  const summary = order.shipments_summary
  const showShipment = !!summary && summary.count > 0 && !((order.shipments?.length ?? 0) > 0 && order.shipments!.every(isTestShipment)) && !['pending_payment', 'cancelled', 'refunded'].includes(progress.stage)
  const action = deriveNextAction(order)
  return (
    <article className={cx.root} data-sf-order data-sf-order-status={progress.stage} data-sf-order-id={order.id}>
      <header className={cx.header}>
        <Heading className={cx.number} data-sf-order-number>
          <a href={orderHref(order)} className={cx.link} data-sf-order-link>
            {fill(m['order.number'], { number: order.number || order.id.slice(0, 8) })}
          </a>
        </Heading>
        <OrderStatusBadge progress={progress} {...text} {...(cx.badge ? { className: cx.badge } : {})} />
      </header>
      <p className={cx.meta} data-sf-order-meta>
        <Time value={order.created_at} text={date(order.created_at) ? fill(m['order.placed'], { date: date(order.created_at)! }) : null} />
        {items > 0 ? <> · {plural(m, 'order.items', items)}</> : null}
      </p>
      <div className={cx.summary} data-sf-order-summary>
        <OrderProgress progress={progress} variant="compact" {...text} {...(cx.progress ? { classNames: cx.progress } : {})} />
        {showShipment ? (
          <p className={cx.shipment} data-sf-order-shipment>
            {summary!.carrier ? <>{summary!.carrier} · </> : null}
            {enumText(m, 'shipment.status', summary!.status)}
          </p>
        ) : null}
      </div>
      <div className={cx.footer}>
        <p className={cx.total} data-sf-order-total>
          <span>{m['order.total']}: </span>
          <strong>{formatMoney(order.total, locale)}</strong>
        </p>
        <NextActionBar
          action={action}
          {...text}
          hrefFor={(a) => actionHref?.(a, order) ?? undefined}
          {...(onAction ? { onAction: (a: NextAction) => onAction(a, order) } : {})}
          classNames={{ ...(cx.actions ? { root: cx.actions } : {}), ...(cx.action ?? {}) }}
        />
      </div>
    </article>
  )
}

export type OrderListClassNames = Partial<Record<'root' | 'list' | 'item' | 'skeleton' | 'empty' | 'emptyTitle' | 'emptyBody' | 'emptyGuest' | 'error' | 'retry' | 'more', string>> & {
  card?: OrderCardClassNames
}

export type OrderListProps = AccountTextProps &
  Pick<OrderCardProps, 'orderHref' | 'actionHref' | 'onAction' | 'headingLevel'> & {
    orders?: readonly Order[] | null
    status?: 'loading' | 'ready' | 'error'
    /** Skeleton cards while loading (default 3). */
    skeletons?: number
    onRetry?: () => void
    hasMore?: boolean
    loadingMore?: boolean
    onLoadMore?: () => void
    /** Your call to action in the empty state ("Ver catálogo"). */
    emptyAction?: ReactNode
    /** Show "bought as a guest? verify your email" in the empty state (default true). */
    guestHint?: boolean
    classNames?: OrderListClassNames
  }

export function OrderList({ orders, status = 'ready', skeletons = 3, onRetry, hasMore, loadingMore, onLoadMore, emptyAction, guestHint = true, orderHref, actionHref, onAction, headingLevel = 3, classNames: cx = {}, ...text }: OrderListProps) {
  const { m } = useAccountText(text)
  const list = (Array.isArray(orders) ? orders : []).filter((o): o is Order => !!o && typeof o === 'object' && typeof o.id === 'string')

  if (status === 'loading' && list.length === 0) {
    return (
      <div className={cx.root} role="status" aria-busy="true" data-sf-orders data-sf-orders-state="loading">
        <Hidden>{m['order.loading']}</Hidden>
        <ul className={cx.list} aria-hidden="true">
          {Array.from({ length: Math.max(1, skeletons) }, (_, i) => (
            <li key={i} className={cx.skeleton} data-sf-skeleton />
          ))}
        </ul>
      </div>
    )
  }
  if (status === 'error' && list.length === 0) {
    return (
      <div className={cx.root} data-sf-orders data-sf-orders-state="error">
        <div className={cx.error} role="alert" data-sf-orders-error>
          <p>{m['order.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['order.retry']}
            </button>
          ) : null}
        </div>
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <div className={cx.root} data-sf-orders data-sf-orders-state="empty">
        <div className={cx.empty} data-sf-orders-empty>
          <p className={cx.emptyTitle}>
            <strong>{m['order.emptyTitle']}</strong>
          </p>
          <p className={cx.emptyBody}>{m['order.emptyBody']}</p>
          {guestHint ? (
            <p className={cx.emptyGuest} data-sf-orders-guest-hint>
              {m['order.emptyGuest']}
            </p>
          ) : null}
          {emptyAction}
        </div>
      </div>
    )
  }
  return (
    <div className={cx.root} data-sf-orders data-sf-orders-state="ready">
      <ul className={cx.list} aria-label={m['order.listLabel']} data-sf-orders-list>
        {list.map((o) => (
          <li key={o.id} className={cx.item}>
            <OrderCard order={o} orderHref={orderHref} {...(actionHref ? { actionHref } : {})} {...(onAction ? { onAction } : {})} headingLevel={headingLevel} {...text} {...(cx.card ? { classNames: cx.card } : {})} />
          </li>
        ))}
      </ul>
      {status === 'error' ? (
        <div className={cx.error} role="alert" data-sf-orders-error>
          <p>{m['order.error']}</p>
          {onRetry ? (
            <button type="button" className={cx.retry} onClick={onRetry} data-sf-retry>
              {m['order.retry']}
            </button>
          ) : null}
        </div>
      ) : null}
      {hasMore && onLoadMore ? (
        <button type="button" className={cx.more} onClick={onLoadMore} disabled={loadingMore} aria-disabled={loadingMore || undefined} data-sf-orders-more>
          {loadingMore ? m['order.loadingMore'] : m['order.loadMore']}
        </button>
      ) : null}
    </div>
  )
}
